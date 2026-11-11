"""Private CSV staging and explicitly reviewed reconciliation. No email dispatch."""

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from uuid import UUID

from dotenv import dotenv_values
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine
from app.imports.operational_csv import OperationalReport, normalized, read_operations
from app.modules.presentations.models import PresentationImportBatch, PresentationRequest
from app.modules.presentations.operations_models import PresentationImportRow
from app.modules.presentations.operations_service import apply_import_row


def reviewed_database_url(env_file: Path, project_ref: str) -> URL:
    if not re.fullmatch(r"[a-z]{20}", project_ref):
        raise ValueError("Invalid project reference")
    raw = dotenv_values(env_file).get("DATABASE_URL")
    if not raw:
        raise ValueError("Missing local database URL")
    url = make_url(raw)
    direct = url.host == f"db.{project_ref}.supabase.co" and url.username == "postgres"
    pooler = (
        bool(url.host and url.host.endswith(".pooler.supabase.com"))
        and url.username == f"postgres.{project_ref}"
    )
    if not (direct or pooler) or url.drivername != "postgresql+psycopg":
        raise ValueError("Database URL does not match the explicitly reviewed project")
    if url.port != 5432:
        raise ValueError("Use direct or session-pooler PostgreSQL on port 5432")
    if set(url.query) != {"sslmode"}:
        raise ValueError("Only sslmode is allowed in a reviewed connection URL")
    if not url.password or "YOUR_" in url.password or url.query.get("sslmode") != "require":
        raise ValueError("Database password and required TLS must be configured locally")
    return url


def candidate_request(
    requests: list[PresentationRequest],
    row,
) -> PresentationRequest | None:
    values = row.values
    if values.event_date is None:
        return None
    candidates = set()
    for record in requests:
        if record.event_date != values.event_date:
            continue
        source_email = normalized(values.contact_email or "")
        email = bool(
            re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", source_email)
            and record.contact_email
            and source_email == normalized(record.contact_email)
        )
        source_phone = re.sub(r"\D", "", values.contact_phone or "")
        phone = bool(
            7 <= len(source_phone) <= 15
            and record.contact_phone
            and source_phone == re.sub(r"\D", "", record.contact_phone)
        )
        if email or phone:
            candidates.add(record.id)
    if len(candidates) != 1:
        return None
    return next(record for record in requests if record.id in candidates)


def stage_operations(session: Session, report: OperationalReport) -> dict:
    with session.begin():
        source_key = f"operations:{report.source_year}:{report.filename}"
        if len(source_key) > 200:
            raise ValueError("Operations source identity is too long")
        batch_id = session.scalar(
            insert(PresentationImportBatch)
            .values(
                source_key=source_key,
                file_sha256=report.digest,
                row_count=len(report.rows) + report.skipped,
                imported_count=len(report.rows),
                skipped_count=report.skipped,
            )
            .on_conflict_do_nothing(index_elements=["source_key", "file_sha256"])
            .returning(PresentationImportBatch.id)
        )
        if batch_id is None:
            return {"already_staged": True, "staged": 0, "candidates": 0}
        requests = list(session.scalars(select(PresentationRequest)))
        matched = 0
        for row in report.rows:
            candidate = candidate_request(requests, row)
            matched += candidate is not None
            session.add(
                PresentationImportRow(
                    batch_id=batch_id,
                    source_filename=report.filename,
                    source_record_number=row.number,
                    row_sha256=row.digest,
                    original_headers=report.headers,
                    original_cells=row.cells,
                    normalized_fields=row.values.model_dump(mode="json"),
                    request_id=candidate.id if candidate else None,
                    observed_request_updated_at=candidate.updated_at if candidate else None,
                    rule_codes=row.values.rule_codes,
                    proposed_status=row.values.proposed_status,
                    status_basis=row.values.status_basis,
                )
            )
        return {"already_staged": False, "staged": len(report.rows), "candidates": matched}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Dry-run, stage, or apply reviewed historical data"
    )
    parser.add_argument("path", type=Path, nargs="?")
    parser.add_argument("--year", type=int, choices=[2022, 2023, 2024, 2025])
    parser.add_argument("--stage", action="store_true")
    parser.add_argument(
        "--apply-review",
        type=Path,
        help="Private JSON with row_id, request_id, digest and expected target state",
    )
    parser.add_argument(
        "--env-file", type=Path, default=Path(__file__).resolve().parents[2] / ".env"
    )
    parser.add_argument("--project-ref")
    args = parser.parse_args()
    if args.apply_review and (args.stage or args.path):
        parser.error("Reviewed apply cannot be combined with CSV staging")
    if not args.apply_review and (not args.path or not args.year):
        parser.error("CSV analysis requires a path and --year")
    if (args.stage or args.apply_review) and not args.project_ref:
        parser.error("Writes require --project-ref and the local --env-file")
    try:
        if args.apply_review:
            review = json.loads(args.apply_review.read_text())
            url = reviewed_database_url(args.env_file, args.project_ref)
            engine = build_engine(
                Settings(_env_file=None, database_url=url.render_as_string(hide_password=False))
            )
            try:
                with Session(engine) as session:
                    apply_import_row(
                        session,
                        row_id=UUID(review["row_id"]),
                        request_id=UUID(review["request_id"]),
                        expected_updated_at=datetime.fromisoformat(review["expected_updated_at"]),
                        expected_status=review["expected_status"],
                        row_digest=review["row_sha256"],
                        accept_conflicts=review.get("accept_conflicts") is True,
                    )
                    print(json.dumps({"applied": True}))
            finally:
                engine.dispose()
        else:
            report = read_operations(args.path, source_year=args.year, as_of=date.today())
            print(json.dumps({"dry_run": not args.stage, **report.summary()}))
            if args.stage:
                url = reviewed_database_url(args.env_file, args.project_ref)
                engine = build_engine(
                    Settings(_env_file=None, database_url=url.render_as_string(hide_password=False))
                )
                try:
                    with Session(engine) as session:
                        print(json.dumps(stage_operations(session, report)))
                finally:
                    engine.dispose()
        return 0
    except Exception:
        # Source rows, URLs, and driver exceptions can contain private information.
        print(
            "Historical import failed. Check local configuration and private review data.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
