"""Preview or import Mexica New Year applications and 2026 vendor history."""

import argparse
import csv
import json
import os
import re
from datetime import datetime
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import Connection, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine
from app.modules.mny.models import VendorApplication
from app.modules.mny.spot_inventory import ArchivedSpot, Spot, SpotInventory, VendorSpot

FORM_COLUMNS = {
    "Timestamp": "timestamp",
    "Email Address": "email",
    "CAT": "category",
    "Contact Person:": "contact_name",
    "Phone:": "phone",
    "Business Name": "business_name",
    "Mailing Address:": "mailing_address",
    "What is your tribal affiliation?": "tribal_affiliation",
    "Please describe the type of merchandise do you sell?": "merchandise",
    "size?": "booth_size_requested",
    "What is your website?": "website",
    "What is your Facebook?": "facebook",
    "What is your Instagram handle?": "instagram",
    "How many followers do you have on your Across all Social Media Platforms?": "followers",
}
FOLLOWERS = re.compile(
    r"(?P<qualifier>over|about|around|approximately|approx\.?|~)?\s*"
    r"(?P<number>[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?P<decimal>\.[0-9]+)?"
    r"\s*(?P<unit>[km])?\s*(?P<plus>\+)?(?:\s+followers)?",
    re.IGNORECASE,
)
LEGACY_SNAPSHOT = text("""
    SELECT to_jsonb(v) AS vendor, COALESCE(booths.records, '[]'::jsonb) AS linked_spots
    FROM public.vendors AS v
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object('link', to_jsonb(vs), 'spot', to_jsonb(s))
            ORDER BY vs.spot_id
        ) AS records
        FROM public.vendor_spots AS vs
        LEFT JOIN public.spots AS s ON s.id = vs.spot_id
        WHERE vs.vendor_id = v.id
    ) AS booths ON true
""")
LEGACY_SPOT_INVENTORY = text("""
    SELECT
        s.id::text AS id,
        s.label::text AS label,
        COALESCE(s.status::text, 'free') AS status,
        s.price,
        ARRAY(
            SELECT DISTINCT vs.vendor_id::text
            FROM public.vendor_spots AS vs
            WHERE vs.spot_id = s.id AND vs.vendor_id IS NOT NULL
            ORDER BY vs.vendor_id::text
        ) AS vendor_source_keys
    FROM public.spots AS s
    ORDER BY s.label::text, s.id
""")


def parse_followers(value: str | None) -> tuple[int | None, str | None]:
    match = FOLLOWERS.fullmatch(value) if value else None
    if not match:
        return None, None
    unit = (match["unit"] or "").lower()
    if match["decimal"] and not unit:
        return None, None
    amount = Decimal(match["number"].replace(",", "") + (match["decimal"] or ""))
    amount *= {"": 1, "k": 1000, "m": 1000000}[unit]
    if amount > 2147483647 or amount != amount.to_integral_value():
        return None, None
    qualifier = (match["qualifier"] or "").lower()
    if match["plus"] or qualifier == "over":
        return int(amount), "lower_bound"
    return int(amount), "approximate" if unit or qualifier else "exact"


def normalize_phone(value: str | None) -> str | None:
    if value is None or not re.fullmatch(r"[+0-9().\s-]+", value):
        return value
    digits = re.sub(r"[^0-9]", "", value)
    if len(digits) == 10 and not value.startswith("+"):
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return value


def read_csv(path: Path, *, event_year: int, timezone: str) -> list[dict[str, Any]]:
    zone = ZoneInfo(timezone)
    records = []
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, strict=True)
        if not reader.fieldnames or sorted(reader.fieldnames) != sorted(FORM_COLUMNS):
            raise ValueError("Unexpected application CSV headers")
        for row in reader:
            if None in row or None in row.values():
                raise ValueError("Unexpected application CSV row width")
            fields = {key: row[header].strip() or None for header, key in FORM_COLUMNS.items()}
            if all(value is None for value in fields.values()):
                continue
            stamp = fields.pop("timestamp")
            email = fields.pop("email")
            business = fields.pop("business_name")
            if (
                not stamp
                or not business
                or not email
                or not re.fullmatch(r"[^@\s]+@[^@\s]+", email)
            ):
                raise ValueError("Missing application identity")
            submitted = datetime.strptime(stamp, "%m/%d/%Y %H:%M:%S").replace(tzinfo=zone)
            identity = json.dumps([submitted.isoformat(), email.casefold(), business.casefold()])
            phone = fields.pop("phone")
            raw = fields.pop("followers")
            count, kind = parse_followers(raw)
            records.append(
                dict(
                    event_year=event_year,
                    source="form_csv",
                    source_key=sha256(identity.encode()).hexdigest(),
                    business_name=business,
                    email=email,
                    phone=normalize_phone(phone),
                    category=fields.pop("category"),
                    contact_name=fields.pop("contact_name"),
                    submitted_at=submitted,
                    follower_response=raw,
                    follower_count=count,
                    responses={**fields, "follower_count_kind": kind, "phone_response": phone},
                )
            )
    return records


def read_archive(connection: Connection) -> list[dict[str, Any]]:
    records = []
    for row in connection.execute(LEGACY_SNAPSHOT).mappings():
        vendor = row["vendor"]
        records.append(
            dict(
                event_year=2026,
                source="legacy_vendor",
                source_key=str(vendor["id"]),
                business_name=vendor.get("business_name"),
                contact_name=vendor.get("contact_name"),
                email=vendor.get("email"),
                phone=vendor.get("phone"),
                category=vendor.get("vendor_type"),
                responses={"legacy_vendor": vendor, "linked_spots": row["linked_spots"]},
            )
        )
    return records


def read_spot_inventory(connection: Connection) -> list[ArchivedSpot]:
    return [
        ArchivedSpot.model_validate(row)
        for row in connection.execute(LEGACY_SPOT_INVENTORY).mappings()
    ]


def apply_import(
    session: Session,
    records: list[dict[str, Any]],
    *,
    legacy_spots: list[ArchivedSpot] | None = None,
) -> int:
    inserted = 0
    with session.begin():
        for record in records:
            new_id = session.scalar(
                insert(VendorApplication)
                .values(**record)
                .on_conflict_do_nothing(index_elements=["event_year", "source", "source_key"])
                .returning(VendorApplication.id)
            )
            inserted += new_id is not None
        if legacy_spots is not None:
            archive_spots(session, legacy_spots)
    return inserted


def archive_spots(session: Session, spots: list[ArchivedSpot]) -> None:
    year = 2026
    inventory = session.scalar(
        insert(SpotInventory)
        .values(event_year=year, spots=[spot.model_dump() for spot in spots])
        .on_conflict_do_nothing(index_elements=["event_year"])
        .returning(SpotInventory.event_year)
    )
    if inventory is None or not spots:
        return
    vendor_ids = {
        key: vendor_id
        for key, vendor_id in session.execute(
            select(VendorApplication.source_key, VendorApplication.id).where(
                VendorApplication.event_year == year, VendorApplication.source == "legacy_vendor"
            )
        )
    }
    session.execute(
        insert(Spot),
        [spot.model_dump(exclude={"vendor_source_keys"}) | {"event_year": year} for spot in spots],
    )
    links = [
        {"event_year": year, "spot_id": spot.id, "vendor_id": vendor_ids[key]}
        for spot in spots
        for key in spot.vendor_source_keys
        if key in vendor_ids
    ]
    if links:
        session.execute(insert(VendorSpot), links)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(required=True, dest="command")
    form = commands.add_parser("csv")
    form.add_argument("path", type=Path)
    form.add_argument("--event-year", type=int, required=True)
    form.add_argument("--timezone", required=True)
    archive = commands.add_parser("archive-2026")
    for command in (form, archive):
        command.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    legacy_spots = None
    try:
        if args.command == "csv":
            if not 2027 <= args.event_year <= 9999:
                parser.error("--event-year must be 2027 or later")
            records = read_csv(args.path, event_year=args.event_year, timezone=args.timezone)
        else:
            legacy_url = os.getenv("MNY_LEGACY_DATABASE_URL")
            source = Settings(database_url=legacy_url) if legacy_url else Settings()
            engine = build_engine(source)
            try:
                with engine.connect() as connection:
                    connection.exec_driver_sql(
                        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                    )
                    records = read_archive(connection)
                    legacy_spots = read_spot_inventory(connection)
            finally:
                engine.dispose()
        summary = {"rows": len(records), "dry_run": not args.apply}
        if args.command == "csv":
            summary["normalized_followers"] = sum(r["follower_count"] is not None for r in records)
            summary["unresolved_followers"] = sum(
                r["follower_response"] is not None and r["follower_count"] is None for r in records
            )
            summary["blank_followers"] = sum(r["follower_response"] is None for r in records)
        elif legacy_spots is not None:
            summary["spot_inventory_rows"] = len(legacy_spots)
            summary["vendors_with_linked_spots"] = sum(
                bool(r["responses"]["linked_spots"]) for r in records
            )
        if args.apply:
            engine = build_engine(Settings())
            try:
                with Session(engine) as session:
                    summary["inserted"] = apply_import(session, records, legacy_spots=legacy_spots)
            finally:
                engine.dispose()
        print(json.dumps(summary))
    except Exception:
        parser.exit(1, "Import failed. Check source, settings, CSV format and migration state.\n")


if __name__ == "__main__":
    main()
