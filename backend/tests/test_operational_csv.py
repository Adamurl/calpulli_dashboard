import csv
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.imports.operational_csv import normalize_record, parse_operational_date, read_operations
from app.imports.operational_presentations import reviewed_database_url

HEADERS = [
    "Status",
    "Date of event",
    "Occasion",
    "FINDER",
    "Price",
    "Received PAYMENT (Deposited)",
    "Notes",
    "Invoiced",
    "Total Dancers",
]


def values(*, year=2024, **fields):
    cells = [fields.get(header, "") for header in HEADERS]
    return normalize_record(HEADERS, cells, source_year=year, as_of=date(2026, 11, 11))


def test_completed_unpaid_and_assumed_paid_are_distinct():
    assumed = values(**{"Date of event": "03-12-24", "Price": "$1,000.00"})
    assert assumed.proposed_status == "completed"
    assert assumed.status_basis == "user_assumption"
    assert assumed.payment_status == "paid"
    assert assumed.payment_basis == "user_assumption"
    assert assumed.recorded_received_amount is None
    assert assumed.quoted_amount == Decimal("1000")
    unpaid = values(**{"Date of event": "03-12-24", "Price": "1000", "Notes": "Not paid"})
    assert unpaid.proposed_status == "completed"
    assert unpaid.payment_status == "unpaid"
    assert unpaid.payment_basis == "explicit"


def test_missing_price_does_not_invent_a_free_event():
    result = values(**{"Date of event": "03-12-24"})
    assert result.proposed_status == "completed"
    assert result.engagement_type == "unknown"
    assert result.engagement_basis == "unknown"
    assert result.payment_status == "paid"
    assert result.payment_basis == "user_assumption"
    assert result.quoted_amount is None
    assert result.recorded_received_amount is None


@pytest.mark.parametrize(
    "note", ["Not fully paid", "Balance due", "Outstanding amount", "Deposit received"]
)
def test_outstanding_payment_notes_override_historical_paid_default(note):
    result = values(**{"Date of event": "03-12-24", "Price": "1000", "Notes": note})
    assert result.payment_status == "partial"
    assert result.payment_basis == "explicit"
    assert result.recorded_received_amount is None


def test_payment_and_general_notes_are_separate():
    result = values(
        **{
            "Date of event": "03-12-24",
            "Notes": "Paid by check. Bring water. Parking behind venue.",
        }
    )
    assert result.payment_notes == "Paid by check."
    assert result.logistics_notes == "Bring water.\nParking behind venue."


@pytest.mark.parametrize(
    "note", ["Paid in full, no balance due", "Deposit received; balance paid in full"]
)
def test_settled_balance_overrides_old_deposit_description(note):
    result = values(**{"Date of event": "03-12-24", "Price": "1000", "Notes": note})
    assert result.payment_status == "paid"
    assert result.payment_basis == "explicit"


def test_pending_payment_is_not_assumed_paid():
    result = values(**{"Date of event": "03-12-24", "Price": "1000", "Notes": "Payment pending"})
    assert result.payment_status == "unpaid"
    assert result.payment_basis == "explicit"


def test_explicit_zero_received_overrides_settled_default():
    result = values(
        **{
            "Date of event": "03-12-24",
            "Price": "1000",
            "Received PAYMENT (Deposited)": "0",
        }
    )
    assert result.payment_status == "unpaid"
    assert result.payment_basis == "recorded"
    assert result.recorded_received_amount == 0
    assert result.proposed_status == "completed"


def test_cancelled_inside_done_export_is_not_completed():
    result = values(year=2022, **{"Date of event": "03/12/2022", "Status": "Cancelled"})
    assert result.proposed_status == "cancelled"
    assert result.status_basis == "explicit"
    assert result.payment_status == "unknown"


def test_paid_cutoff_uses_event_date_not_sheet_label():
    result = values(year=2025, **{"Date of event": "03-12-26", "Price": "1000"})
    assert result.proposed_status == "completed"
    assert result.payment_status == "unknown"
    assert result.payment_basis == "unknown"


def test_positive_received_without_quote_is_not_volunteer():
    result = values(**{"Date of event": "03-12-24", "Received PAYMENT (Deposited)": "300"})
    assert result.engagement_type == "paid"
    assert result.payment_status == "paid"
    assert result.recorded_received_amount == Decimal("300")
    assert result.quoted_amount is None


def test_zero_price_done_is_no_charge_not_rejected():
    result = values(
        year=2023,
        **{
            "Date of event": "03/12/2023",
            "Status": "Done",
            "Price": "0",
            "Received PAYMENT (Deposited)": "0",
        },
    )
    assert result.proposed_status == "completed"
    assert result.status_basis == "explicit"
    assert result.payment_status == "no_charge"


def test_partial_and_overpayment_keep_recorded_amounts():
    partial = values(
        **{
            "Date of event": "03-12-24",
            "Price": "1000",
            "Received PAYMENT (Deposited)": "200",
        }
    )
    assert partial.payment_status == "partial"
    over = values(
        **{
            "Date of event": "03-12-24",
            "Price": "1000",
            "Received PAYMENT (Deposited)": "1200",
        }
    )
    assert over.recorded_received_amount == Decimal("1200")
    assert "received_exceeds_quote" in over.rule_codes


def test_explicit_payment_method_is_separate_from_engagement_type():
    result = values(
        **{
            "Date of event": "03-12-24",
            "Price": "1000",
            "Notes": "Paid by check",
        }
    )
    assert result.payment_method == "check"
    unknown = values(
        **{"Date of event": "03-12-24", "Price": "1000", "Notes": "Check availability"}
    )
    assert unknown.payment_method == "unknown"
    internal = values(**{"Date of event": "03-12-24", "Notes": "Calpulli internal volunteer"})
    assert internal.engagement_type == "calpulli_internal"
    assert internal.payment_method == "unknown"


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("02-29-24", date(2024, 2, 29)),
        ("03/12/2022", date(2022, 3, 12)),
        ("March 12th, 2024", date(2024, 3, 12)),
        ("May 21st", None),
        ("02-30-24", None),
        ("05/3-4/2022", None),
    ],
)
def test_dates_require_an_explicit_valid_year(raw, expected):
    assert parse_operational_date(raw) == expected


def test_positional_headers_and_originals_survive(tmp_path: Path):
    path = tmp_path / "fictional.csv"
    headers = [*HEADERS, "", ""]
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Summary"])
        writer.writerow(headers)
        writer.writerow(
            ["", "03-12-24", "Fictional event", "Staff", "100", "", "", "", "0", "Y", "1"]
        )
        writer.writerow([""] * len(headers))
    report = read_operations(path, source_year=2024, as_of=date(2026, 11, 11))
    assert report.rows[0].number == 3
    assert report.headers[-2:] == ["", ""]
    assert report.rows[0].cells[-2:] == ["Y", "1"]
    assert report.skipped == 1
    assert "Fictional event" not in str(report.summary())
    assert "Staff" not in str(report.summary())
    assert "100" not in str(report.summary().get("event_rows"))


def test_undated_annotations_are_preserved_without_implying_a_completed_event(tmp_path):
    path = tmp_path / "fictional.csv"
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADERS)
        writer.writerow(["", "", "Source annotation", "", "", "", "", "", ""])
    report = read_operations(path, source_year=2024, as_of=date(2026, 11, 11))
    assert len(report.rows) == 1
    assert report.rows[0].values.proposed_status is None
    assert "source_annotation_no_event_date" in report.rows[0].values.rule_codes


def test_unparseable_price_is_flagged_not_converted_to_free():
    result = values(**{"Date of event": "03-12-24", "Price": "Negotiating"})
    assert result.quoted_amount is None
    assert result.engagement_type == "unknown"
    assert "unparsed_money" in result.rule_codes


def test_project_guard_uses_explicit_file_not_inherited_database(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://other:secret@wrong.example/postgres")
    ref = "a" * 20
    env = tmp_path / ".env"
    env.write_text(
        f"DATABASE_URL=postgresql+psycopg://postgres:fake%23pass@db.{ref}.supabase.co:5432/postgres?sslmode=require\n"
    )
    result = reviewed_database_url(env, ref)
    assert result.password == "fake#pass"
    assert result.host == f"db.{ref}.supabase.co"
    with pytest.raises(ValueError):
        reviewed_database_url(env, "b" * 20)
    env.write_text(
        f"DATABASE_URL=postgresql+psycopg://postgres:fake@db.{ref}.supabase.co/postgres\n"
    )
    with pytest.raises(ValueError):
        reviewed_database_url(env, ref)


def test_negated_and_previous_note_signals_do_not_override_current_evidence():
    result = values(
        year=2023,
        **{
            "Date of event": "03/12/2023",
            "Status": "Done",
            "Notes": "This event was not cancelled; performance completed.",
        },
    )
    assert result.proposed_status == "completed"
    refund = values(
        **{
            "Date of event": "03-12-24",
            "Price": "1000",
            "Notes": "Previously awaiting payment. Refunded.",
        }
    )
    assert refund.payment_status == "refunded"


def test_project_guard_rejects_query_target_override(tmp_path):
    env = tmp_path / ".env"
    ref = "a" * 20
    env.write_text(
        f"DATABASE_URL=postgresql+psycopg://postgres:fake@db.{ref}.supabase.co:5432/postgres?sslmode=require&host=db.wrong.supabase.co\n"
    )
    with pytest.raises(ValueError):
        reviewed_database_url(env, ref)


def test_unknown_phone_labels_do_not_match():
    from types import SimpleNamespace

    from app.imports.operational_presentations import candidate_request

    row = SimpleNamespace(
        values=values(
            **{
                "Date of event": "03-12-24",
                "Price": "1000",
            }
        ).model_copy(update={"contact_phone": "N/A"})
    )
    stored = SimpleNamespace(
        id=1, event_date=date(2024, 3, 12), contact_phone="Unknown", contact_email=None
    )
    assert candidate_request([stored], row) is None


def test_negated_volunteer_and_payment_method_do_not_create_free_event_or_check():
    result = values(
        **{
            "Date of event": "03-12-24",
            "Price": "100",
            "Notes": "Not volunteer; this is a paid event.",
        }
    )
    assert result.engagement_type == "paid"
    assert result.payment_status != "no_charge"
    result = values(
        **{
            "Date of event": "03-12-24",
            "Price": "100",
            "Notes": "Not paid by check; payment still pending.",
        }
    )
    assert result.payment_method == "unknown"
