"""Read-only CSV analysis and explicitly requested, atomic PostgreSQL import."""

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine

HEADERS = {
    "-",
    "Notes:",
    "Timestamp",
    "Email address",
    "Name of the Company/Organization",
    "Organization Website or Social Media Platforms",
    "Date of Event",
    "What type of event? Occasion",
    "Performance Start time",
    "Full Venue Address",
    "Estimated number of guests at the event.",
    "Additional Notes, please share below",
    "Full Name",
    "Phone Number",
    "Were you referred by someone or an organization? If yes, please share their name below.",
    "Performance End time",
}


@dataclass(frozen=True)
class LegacyRow:
    source_row_number: int
    external_id: str
    values: dict[str, Any]


@dataclass(frozen=True)
class LegacyReport:
    file_sha256: str
    row_count: int
    blank_count: int
    rows: list[LegacyRow]

    def summary(self) -> dict[str, int | str]:
        return {
            "file_sha256": self.file_sha256,
            "row_count": self.row_count,
            "blank_count": self.blank_count,
            "requests_to_consider": len(self.rows),
            "unparsed_event_dates": sum(
                bool(r.values["original_fields"]["Date of Event"])
                and r.values["event_date"] is None
                for r in self.rows
            ),
            "unparsed_guest_counts": sum(
                bool(r.values["original_fields"]["Estimated number of guests at the event."])
                and r.values["estimated_guests"] is None
                for r in self.rows
            ),
        }


def parse_date(value: str) -> date | None:
    # Never infer a missing year from submission time or the current date.
    value = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", value, flags=re.IGNORECASE)
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%B %d, %Y", "%B %d %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def parse_time(value: str) -> time | None:
    for fmt in ("%I:%M:%S %p", "%I:%M %p", "%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    return None


def read_legacy(path: Path, *, timezone: str) -> LegacyReport:
    zone = ZoneInfo(timezone)
    file_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
    requests: list[LegacyRow] = []
    seen: Counter[str] = Counter()
    blank_count = 0
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None or not HEADERS.issubset(reader.fieldnames):
            raise ValueError("CSV headers do not match the supported historical form export")
        if len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("CSV headers must be unique")
        for row_count, raw in enumerate(reader, start=1):
            if None in raw:
                raise ValueError(f"CSV record {row_count} has more cells than headers")
            if not any((value or "").strip() for value in raw.values()):
                blank_count += 1
                continue
            clean = {key: (value or "").strip() for key, value in raw.items()}
            submission_fields = {key: clean[key] for key in sorted(HEADERS - {"-", "Notes:"})}
            identity_fields = submission_fields if any(submission_fields.values()) else raw
            identity = json.dumps(identity_fields, sort_keys=True, ensure_ascii=False)
            digest = hashlib.sha256(identity.encode()).hexdigest()
            seen[digest] += 1
            external_id = f"{digest}:{seen[digest]}"
            try:
                received_at = datetime.strptime(clean["Timestamp"], "%m/%d/%Y %H:%M:%S").replace(
                    tzinfo=zone
                )
            except ValueError:
                received_at = None
            guests = clean["Estimated number of guests at the event."]
            guest_count = int(guests) if re.fullmatch(r"\d{1,9}", guests) else None
            values = {
                "form_version": "legacy_v1",
                "status": "unknown",
                "received_at": received_at,
                "event_date": parse_date(clean["Date of Event"]),
                "start_time": parse_time(clean["Performance Start time"]),
                "end_time": parse_time(clean["Performance End time"]),
                "event_timezone": None,
                "event_types": [],
                "event_purpose": None,
                "venue_address": clean["Full Venue Address"] or None,
                "estimated_guests": guest_count,
                "organization_name": clean["Name of the Company/Organization"] or None,
                "contact_full_name": clean["Full Name"] or None,
                "contact_first_name": None,
                "contact_last_name": None,
                "contact_email": clean["Email address"] or None,
                "contact_phone": clean["Phone Number"] or None,
                "organization_website": clean["Organization Website or Social Media Platforms"]
                or None,
                "referral_sources": [],
                "referral_reference": clean[
                    "Were you referred by someone or an organization? "
                    "If yes, please share their name below."
                ]
                or None,
                "additional_notes": clean["Additional Notes, please share below"] or None,
                "internal_notes": clean["Notes:"] or None,
                "original_fields": raw,
            }
            requests.append(LegacyRow(row_count + 1, external_id, values))
    return LegacyReport(file_sha256, row_count, blank_count, requests)


def import_legacy(session: Session, report: LegacyReport, *, source_key: str) -> dict[str, Any]:
    from app.modules.presentations.models import (
        PresentationActivity,
        PresentationImportBatch,
        PresentationRequest,
    )

    if not source_key.strip() or len(source_key) > 200:
        raise ValueError("source_key must contain 1 to 200 characters")
    with session.begin():
        batch_id = session.scalar(
            insert(PresentationImportBatch)
            .values(
                source_key=source_key,
                file_sha256=report.file_sha256,
                row_count=report.row_count,
                imported_count=0,
                skipped_count=report.blank_count,
            )
            .on_conflict_do_nothing(index_elements=["source_key", "file_sha256"])
            .returning(PresentationImportBatch.id)
        )
        if batch_id is None:
            batch = session.scalar(
                select(PresentationImportBatch).where(
                    PresentationImportBatch.source_key == source_key,
                    PresentationImportBatch.file_sha256 == report.file_sha256,
                )
            )
            return {"batch_id": str(batch.id), "already_imported": True, "inserted": 0}
        inserted = 0
        for row in report.rows:
            request_id = session.scalar(
                insert(PresentationRequest)
                .values(
                    **row.values,
                    source="legacy_csv",
                    source_key=source_key,
                    external_id=row.external_id,
                    import_batch_id=batch_id,
                    source_row_number=row.source_row_number,
                )
                .on_conflict_do_nothing(index_elements=["source", "source_key", "external_id"])
                .returning(PresentationRequest.id)
            )
            if request_id is not None:
                inserted += 1
                session.add(
                    PresentationActivity(
                        request_id=request_id,
                        kind="created",
                        new_status="unknown",
                        note=None,
                    )
                )
        batch = session.get(PresentationImportBatch, batch_id)
        batch.imported_count = inserted
        batch.skipped_count = report.row_count - inserted
        return {"batch_id": str(batch_id), "already_imported": False, "inserted": inserted}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--timezone", required=True, help="IANA timezone of the source spreadsheet")
    parser.add_argument(
        "--source-key", required=True, help="Stable dataset name, reused across exports"
    )
    parser.add_argument("--apply", action="store_true", help="Write to configured DATABASE_URL")
    args = parser.parse_args()
    try:
        report = read_legacy(args.csv_path, timezone=args.timezone)
        print(json.dumps({"dry_run": not args.apply, **report.summary()}))
        if args.apply:
            engine = build_engine(Settings())
            try:
                with Session(engine) as session:
                    print(json.dumps(import_legacy(session, report, source_key=args.source_key)))
            finally:
                engine.dispose()
    except Exception:
        # CSV contents and driver errors can contain personal data or connection secrets.
        parser.exit(
            1, "Import failed. Check local file headers, timezone, settings and migrations.\n"
        )


if __name__ == "__main__":
    main()
