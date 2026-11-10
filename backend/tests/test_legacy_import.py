import csv
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.imports.legacy_presentations import HEADERS, import_legacy, read_legacy


def write_export(path: Path, rows: list[dict[str, str]]) -> Path:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=sorted(HEADERS))
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in HEADERS})
    return path


def test_missing_fields_and_raw_history_are_preserved(tmp_path: Path) -> None:
    raw = {
        "Timestamp": "4/4/2022 16:28:59",
        "Date of Event": "May 21st",
        "Estimated number of guests at the event.": "50-80",
        "Full Name": "Historical Full Name",
        "What type of event? Occasion": "Unclassified historical occasion",
        "-": "legacy marker",
    }
    report = read_legacy(
        write_export(tmp_path / "old.csv", [raw, {}]), timezone="America/Los_Angeles"
    )
    assert report.row_count == 2
    assert report.blank_count == 1
    values = report.rows[0].values
    assert values["event_date"] is None
    assert values["estimated_guests"] is None
    assert values["contact_first_name"] is None
    assert values["contact_last_name"] is None
    assert values["contact_full_name"] == raw["Full Name"]
    assert values["status"] == "unknown"
    assert values["original_fields"]["Date of Event"] == "May 21st"
    assert values["original_fields"]["-"] == "legacy marker"
    assert values["event_types"] == []
    assert values["event_timezone"] is None
    assert values["received_at"].utcoffset().total_seconds() == -7 * 3600


def test_explicit_date_and_counts_are_parsed(tmp_path: Path) -> None:
    path = write_export(
        tmp_path / "old.csv",
        [{"Date of Event": "05/06/2022", "Estimated number of guests at the event.": "0"}],
    )
    row = read_legacy(path, timezone="America/Los_Angeles").rows[0]
    assert row.values["event_date"] == date(2022, 5, 6)
    assert row.values["estimated_guests"] == 0
    assert row.source_row_number == 2


def test_notes_only_record_preserved_and_duplicate_ids_distinct(tmp_path: Path) -> None:
    raw = {"Timestamp": "4/4/2022 16:28:59"}
    path = write_export(tmp_path / "old.csv", [raw, raw, {"Notes:": "Needs historical review"}])
    rows = read_legacy(path, timezone="America/Los_Angeles").rows
    assert len(rows) == 3
    assert len({row.external_id for row in rows}) == 3
    assert rows[2].values["received_at"] is None
    assert rows[2].values["internal_notes"] == "Needs historical review"


def test_record_identity_survives_export_reordering_and_note_changes(tmp_path: Path) -> None:
    one = {"Timestamp": "4/4/2022 16:28:59", "Notes:": "Original"}
    two = {"Timestamp": "4/5/2022 16:28:59"}
    path = write_export(tmp_path / "old.csv", [one, two])
    first = read_legacy(path, timezone="America/Los_Angeles")
    write_export(path, [two, {**one, "Notes:": "Edited in spreadsheet"}])
    second = read_legacy(path, timezone="America/Los_Angeles")
    assert first.rows[0].external_id == second.rows[1].external_id
    assert first.file_sha256 != second.file_sha256


def test_same_timestamp_rows_keep_identity_after_insertion_and_reordering(tmp_path: Path) -> None:
    one = {"Timestamp": "4/4/2022 16:28:59", "Full Name": "First fictional person"}
    two = {"Timestamp": "4/4/2022 16:28:59", "Full Name": "Second fictional person"}
    three = {"Timestamp": "4/4/2022 16:28:59", "Full Name": "Third fictional person"}
    path = write_export(tmp_path / "old.csv", [one, two])
    original = read_legacy(path, timezone="America/Los_Angeles")
    write_export(path, [three, two, one])
    updated = read_legacy(path, timezone="America/Los_Angeles")
    assert original.rows[0].external_id == updated.rows[2].external_id
    assert original.rows[1].external_id == updated.rows[1].external_id
    assert updated.rows[0].external_id not in {row.external_id for row in original.rows}


def test_wrong_csv_headers_rejected(tmp_path: Path) -> None:
    path = tmp_path / "wrong.csv"
    path.write_text("unexpected\nvalue\n")
    with pytest.raises(ValueError, match="headers"):
        read_legacy(path, timezone="America/Los_Angeles")


@pytest.fixture
def legacy_session(database_url: str) -> Iterator[Session]:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection, connection.begin():
            with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
                yield session
                # Tests roll back only their enclosing transaction in an isolated test database.
                connection.rollback()
    finally:
        engine.dispose()


@pytest.mark.integration
def test_postgres_import_is_idempotent_and_preserves_nulls(
    tmp_path: Path, legacy_session: Session
) -> None:
    from app.modules.presentations.models import PresentationActivity, PresentationRequest

    report = read_legacy(
        write_export(tmp_path / "old.csv", [{"Timestamp": "4/4/2022 16:28:59"}, {}]),
        timezone="America/Los_Angeles",
    )
    source_key = f"test-{uuid4()}"
    first = import_legacy(legacy_session, report, source_key=source_key)
    second = import_legacy(legacy_session, report, source_key=source_key)
    assert first["inserted"] == 1
    assert second["already_imported"] is True
    records = legacy_session.scalars(
        select(PresentationRequest).where(PresentationRequest.source_key == source_key)
    ).all()
    assert len(records) == 1
    assert records[0].contact_email is None
    assert records[0].event_date is None
    assert (
        legacy_session.scalar(
            select(func.count())
            .select_from(PresentationActivity)
            .where(PresentationActivity.request_id == records[0].id)
        )
        == 1
    )
