import csv
from datetime import date
from pathlib import Path

from app.imports.legacy_presentations import HEADERS, read_legacy
from app.imports.reconcile_history import identity, match_score, prepare_plan, same_event
from app.imports.reconciliation_sql import block, export_plan


def write_csv(path: Path, headers: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def test_matching_preserves_separate_sessions_and_can_reconcile_an_explicit_year():
    left = identity(
        {
            "event_date": "2024-03-12",
            "start_time": "10:00:00",
            "contact_email": "fictional@example.org",
            "event_purpose": "School visit",
        }
    )
    later = {**left, "start": "14:00:00"}
    assert not same_event(left, later)
    assert match_score(left, later) == 0
    no_time = {**left, "start": None, "address": "same venue"}
    assert not same_event(no_time, {**no_time, "occasion": "different session"})
    undated = identity({"raw_date": "March 12th", "contact_email": "fictional@example.org"})
    assert match_score(left, undated) > 0
    undated["email"] = "someone-else@example.org"
    assert match_score(left, undated) == 0


def test_overlapping_sources_enrich_one_request_without_inventing_receipts(tmp_path):
    form_path = tmp_path / "Fictional Form Responses.csv"
    form = {key: "" for key in HEADERS}
    form.update(
        {
            "Date of Event": "03/12/2022",
            "Email address": "fictional@example.org",
            "What type of event? Occasion": "School visit",
        }
    )
    write_csv(form_path, sorted(HEADERS), [form])
    source = read_legacy(form_path, timezone="America/Los_Angeles").rows[0]
    headers = [
        "Status",
        "Date of event",
        "Occasion",
        "FINDER",
        "Price",
        "Received PAYMENT (Deposited)",
        "Contact Email",
        "Notes",
    ]
    old = {key: "" for key in headers}
    old.update(
        {
            "Status": "Confirmed",
            "Date of event": "03/12/2022",
            "Occasion": "School visit",
            "Contact Email": "fictional@example.org",
            "Price": "1000",
            "Notes": "Not fully paid. Bring water.",
        }
    )
    write_csv(tmp_path / "Fictional - 2022 done.csv", headers, [old])
    write_csv(
        tmp_path / "Fictional - 2022 Presentations.csv",
        headers,
        [{**old, "Status": "", "Notes": "Parking behind venue."}],
    )
    live = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "external_id": source.external_id,
            "status": "unknown",
            "updated_at": "2026-11-11T00:00:00+00:00",
            "event_date": "2022-03-12",
            "start_time": None,
        }
    ]
    plan = prepare_plan(tmp_path, live, as_of=date(2026, 11, 11))
    assert len(plan["events"]) == 1
    event = plan["events"][0]
    assert event["existing"] and event["request_id"] == live[0]["id"]
    assert len(event["rows"]) == 2
    assert event["status"] == "completed"
    assert event["operations"]["quoted_amount"] == "1000"
    assert event["operations"]["recorded_received_amount"] is None
    assert event["operations"]["payment_status"] == "partial"
    assert event["operations"]["payment_basis"] == "explicit"
    assert event["operations"]["payment_notes"] == "Not fully paid."
    assert "Parking behind venue." in event["operations"]["logistics_notes"]
    result = export_plan(plan, tmp_path / "private-sql")
    assert result["events"] == 1
    assert result["evidence_rows"] == 2


def test_source_text_is_contained_by_distinct_sql_delimiters():
    payload = {"notes": "A quote ' and $$ and a semicolon; remain source text."}
    sql = block(payload, "NULL;")
    assert sql.count("A quote '") == 1
    assert "Unexpected application schema revision" in sql
