"""Read positional historical exports without logging their private cells."""

import csv
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from app.modules.presentations.operations_schemas import OperationalValues


@dataclass(frozen=True)
class OperationalRow:
    number: int
    digest: str
    cells: list[str]
    values: OperationalValues


@dataclass(frozen=True)
class OperationalReport:
    filename: str
    digest: str
    headers: list[str]
    rows: list[OperationalRow]
    skipped: int
    source_year: int

    def summary(self) -> dict:
        return {
            "file_sha256": self.digest,
            "event_rows": len(self.rows),
            "skipped_rows": self.skipped,
            "unparsed_dates": sum(row.values.event_date is None for row in self.rows),
            "completion_assumed": sum(
                row.values.status_basis == "user_assumption" for row in self.rows
            ),
            "payment_assumed": sum(
                row.values.payment_basis == "user_assumption" for row in self.rows
            ),
        }


def parse_operational_date(value: str) -> date | None:
    value = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", value.strip(), flags=re.I)
    value = re.sub(
        r"^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+",
        "",
        value,
        flags=re.I,
    )
    for fmt in (
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%Y-%m-%d",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d %Y",
        "%b %d %Y",
        "%m.%d.%Y",
        "%Y/%m/%d",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
    ):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    # These exports use 21st-century, explicit two-digit years, not a rolling century window.
    match = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2})", value)
    if match:
        try:
            month, day, year = map(int, match.groups())
            return date(2000 + year, month, day)
        except ValueError:
            pass
    return None


def parse_amount(value: str) -> Decimal | None:
    value = value.strip()
    if not re.fullmatch(r"\$?\s*(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?", value):
        return None
    amount = Decimal(value.replace("$", "").replace(",", "").strip())
    return amount if amount < Decimal("10000000000") else None


def normalized(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def _count(value: str) -> int | None:
    return int(value) if re.fullmatch(r"\d{1,7}", value) else None


def current_signal(text: str, pattern: str) -> bool:
    for match in re.finditer(pattern, text):
        prefix = text[max(0, match.start() - 30) : match.start()]
        if not re.search(r"\b(?:not|no|never|previously|formerly|no longer)\b[^.;]{0,20}$", prefix):
            return True
    return False


def normalize_record(
    headers: list[str], cells: list[str], *, source_year: int, as_of: date
) -> OperationalValues:
    keys = [normalized(header) for header in headers]

    def get(key: str) -> str:
        return cells[keys.index(key)].strip() if key in keys else ""

    price = parse_amount(get("price"))
    received = parse_amount(get("received payment (deposited)"))
    notes = "\n".join(value for key in ["notes", "other notes"] if (value := get(key)))
    status_text = normalized(get("status"))
    combined = normalized(" ".join([status_text, notes]))
    free_price_markers = {"volunteer", "complimentary", "no charge", "pro bono", "free"}
    event_date = parse_operational_date(get("date of event"))
    values = OperationalValues(
        event_date=event_date,
        start_time=get("start time") or None,
        occasion=get("occasion") or None,
        contact_email=get("contact email") or None,
        contact_phone=get("contact tel") or None,
        quoted_amount=price,
        recorded_received_amount=received,
        finder_name=get("finder") or None,
        attendance_count=_count(get("attendence")),
        attendance_notes=get("attendence") or None,
        roster_count=_count(get("total dancers")),
        parking_notes=get("parking") or None,
        dressing_room_notes=get("dressing room") or None,
        logistics_notes=notes or None,
    )
    for key in ["price", "received payment (deposited)"]:
        if (
            get(key)
            and parse_amount(get(key)) is None
            and not (key == "price" and normalized(get(key)) in free_price_markers)
        ):
            values.rule_codes.append("unparsed_money")
    if event_date is None:
        values.rule_codes.append("unparsed_event_date")
    if current_signal(combined, r"\b(?:cancelled|canceled|cancellation)\b"):
        values.proposed_status, values.status_basis = "cancelled", "explicit"
    elif current_signal(
        combined, r"\b(?:rejected|declined|not accepted|not performed|did not perform)\b"
    ):
        values.proposed_status, values.status_basis = "declined", "explicit"
    elif status_text in {"done", "completed", "complete"}:
        values.proposed_status, values.status_basis = "completed", "explicit"
    elif source_year in {2024, 2025} and event_date and event_date <= as_of:
        values.proposed_status, values.status_basis = "completed", "user_assumption"
        values.rule_codes.append("historical_operational_sheet_completed")
    elif status_text in {"confirmed", "confimed", "confrimed"}:
        values.proposed_status, values.status_basis = "booked", "explicit"
    if status_text in {"done", "completed", "complete"} and values.proposed_status != "completed":
        values.rule_codes.append("conflicting_status_notes")
    if current_signal(combined, r"\bcalpulli internal\b"):
        values.engagement_type, values.engagement_basis = "calpulli_internal", "explicit"
    elif current_signal(combined, r"\b(?:volunteer|complimentary|no charge|pro bono)\b") or (
        normalized(get("price")) in free_price_markers
    ):
        values.engagement_type, values.engagement_basis = "volunteer", "explicit"
    elif (price is not None and price > 0) or (received is not None and received > 0):
        values.engagement_type, values.engagement_basis = "paid", "recorded"
    elif price == 0:
        values.engagement_type, values.engagement_basis = "volunteer", "recorded"
    unpaid_pattern = (
        r"\b(?:unpaid|not paid|payment not received|no payment received|awaiting payment|"
        r"payment pending|pending payment|payment outstanding|payment due)\b"
    )
    fully_paid = current_signal(
        combined,
        r"\b(?:paid in full|fully paid|balance (?:is )?(?:paid|settled)(?: in full)?|"
        r"no (?:remaining |outstanding )?balance(?: due)?)\b",
    )
    if current_signal(combined, unpaid_pattern):
        values.payment_status, values.payment_basis = "unpaid", "explicit"
    elif current_signal(combined, r"\b(?:refunded|refund issued)\b"):
        values.payment_status, values.payment_basis = "refunded", "explicit"
    elif fully_paid:
        values.payment_status, values.payment_basis = "paid", "explicit"
    elif current_signal(
        combined,
        r"\b(?:partial payment|partially paid|not fully paid|balance (?:due|owing|outstanding)|"
        r"outstanding (?:balance|amount)|deposit (?:received|paid)|still owes?)\b",
    ):
        values.payment_status, values.payment_basis = "partial", "explicit"
    elif received is not None:
        values.payment_basis = "recorded"
        if price is not None and received < price:
            values.payment_status = "partial" if received else "unpaid"
        elif received > 0:
            values.payment_status = "paid"
        elif price == 0:
            values.payment_status = "no_charge"
        else:
            values.payment_basis = "unknown"
    elif values.engagement_type in {"volunteer", "calpulli_internal"}:
        values.payment_status = "no_charge"
        values.payment_basis = values.engagement_basis
    elif values.proposed_status == "completed" and event_date and event_date <= date(2025, 12, 31):
        values.payment_status, values.payment_basis = "paid", "user_assumption"
        values.rule_codes.append("historical_through_2025_paid")
    payment_signals = [
        current_signal(combined, unpaid_pattern),
        current_signal(combined, r"\b(?:refunded|refund issued)\b"),
        not fully_paid
        and current_signal(
            combined,
            r"\b(?:partial payment|partially paid|not fully paid|balance (?:due|owing|outstanding)|"
            r"outstanding (?:balance|amount)|deposit (?:received|paid)|still owes?)\b",
        ),
    ]
    if sum(payment_signals) > 1:
        values.rule_codes.append("conflicting_payment_notes")
    if fully_paid and payment_signals[0]:
        values.rule_codes.append("conflicting_payment_notes")
    if price is not None and received is not None and received > price:
        values.rule_codes.append("received_exceeds_quote")
    for method, pattern in {
        "check": r"\b(?:paid (?:by|with) (?:check|cheque)|payment method: check)\b",
        "cash": r"\b(?:paid (?:by|with|in) cash|cash payment)\b",
        "bank_transfer": r"\b(?:paid by (?:bank transfer|ach)|payment method: bank transfer)\b",
    }.items():
        if current_signal(combined, pattern):
            values.payment_method = method
    payment_notes = []
    general_notes = []
    for part in re.split(r"[\n;]+|(?<=[.!?])\s+", notes):
        if not part.strip():
            continue
        if re.search(
            r"\b(?:pay(?:ment|ments|ing)?|paid|unpaid|deposit|balance|refund\w*|invoice\w*|"
            r"check|cheque|cash|ach|price|fee|cost|owe\w*)\b|\$",
            part,
            re.I,
        ):
            payment_notes.append(part.strip())
        else:
            general_notes.append(part.strip())
    values.payment_notes = "\n".join(payment_notes) or None
    values.logistics_notes = "\n".join(general_notes) or None
    for field, column in [("invoice_status", "invoiced"), ("coi_status", "coi")]:
        marker = normalized(get(column))
        if marker in {"done", "yes", "y", "1", "completed"}:
            setattr(values, field, "done")
        elif marker in {"no", "n", "not done"}:
            setattr(values, field, "not_done")
    if source_year == 2022 and "total dancers" not in keys:
        # The newer 2022 snapshot stores a numeric roster total in the unlabeled column 23.
        if len(keys) > 22 and not keys[22] and _count(cells[22].strip()) is not None:
            values.roster_count = _count(cells[22].strip())
    return values


def read_operations(path: Path, *, source_year: int, as_of: date) -> OperationalReport:
    if source_year not in {2022, 2023, 2024, 2025}:
        raise ValueError("Unsupported operations dataset year")
    data = path.read_bytes()
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))
    header_index = next(
        (
            index
            for index, row in enumerate(rows[:5])
            if {"date of event", "price", "finder", "occasion"} <= set(map(normalized, row))
        ),
        None,
    )
    if header_index is None:
        raise ValueError("Unsupported operational export headers")
    headers = rows[header_index]
    if len(path.name) > 255:
        raise ValueError("Source filename is too long")
    records = []
    skipped = 0
    date_index = list(map(normalized, headers)).index("date of event")
    for number, cells in enumerate(rows[header_index + 1 :], header_index + 2):
        if len(cells) != len(headers):
            raise ValueError("Operational export has inconsistent cell counts")
        if not any(cell.strip() for cell in cells):
            skipped += 1
            continue
        values = normalize_record(headers, cells, source_year=source_year, as_of=as_of)
        if not cells[date_index].strip():
            values.rule_codes.append("source_annotation_no_event_date")
        digest = hashlib.sha256(json.dumps(cells, ensure_ascii=False).encode()).hexdigest()
        records.append(OperationalRow(number, digest, cells, values))
    return OperationalReport(
        path.name, hashlib.sha256(data).hexdigest(), headers, records, skipped, source_year
    )
