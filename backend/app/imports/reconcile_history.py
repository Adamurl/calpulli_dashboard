"""Prepare private, deterministic historical reconciliation plans without database writes."""

import argparse
import json
import re
from collections import Counter
from datetime import date
from functools import partial
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from app.imports.legacy_presentations import parse_time, read_legacy
from app.imports.operational_csv import (
    current_signal,
    normalized,
    parse_operational_date,
    read_operations,
)


def stable_id(value: str) -> str:
    return str(uuid5(NAMESPACE_URL, "calpulli:historical:" + value))


def clean(value: str | None) -> str:
    return re.sub(r"[^\w]+", " ", normalized(value or "")).strip()


def phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[-10:] if len(digits) in {10, 11} else ""


def identity(fields: dict) -> dict:
    return {
        "date": fields.get("event_date"),
        "start": fields.get("start_time"),
        "email": normalized(fields.get("contact_email") or ""),
        "phone": phone(fields.get("contact_phone")),
        "name": clean(fields.get("contact_full_name")),
        "address": clean(fields.get("venue_address")),
        "occasion": clean(fields.get("event_purpose")),
        "raw_date": clean(fields.get("raw_date")),
        "received_at": fields.get("received_at"),
    }


def match_score(left: dict, right: dict, *, ignore_time: bool = False) -> int:
    contact = any(left[k] and left[k] == right[k] for k in ("email", "phone"))
    if left.get("received_at") and left.get("received_at") == right.get("received_at"):
        if contact or (left["name"] and left["name"] == right["name"]):
            return 100
    if contact and left["date"] and not right["date"]:
        # Match an incomplete form date only when the sheet independently supplies its year.
        raw = right.get("raw_date") or ""
        event = date.fromisoformat(left["date"])
        month_day = re.fullmatch(r"(\d{1,2}) (\d{1,2})", raw)
        same_month_day = bool(
            month_day and tuple(map(int, month_day.groups())) == (event.month, event.day)
        )
        if not re.search(r"\b\d{4}\b", raw):
            same_month_day = same_month_day or (
                parse_operational_date(f"{raw} {event.year}") == event
            )
        if same_month_day:
            return 15
    if not left["date"] or left["date"] != right["date"]:
        return 0
    if not ignore_time and left["start"] and right["start"] and left["start"] != right["start"]:
        return 0
    score = 10 if contact else 0
    for key, weight in (("address", 4), ("occasion", 3), ("name", 2)):
        if left[key] and left[key] == right[key]:
            score += weight
    return score


def same_event(left: dict, right: dict) -> bool:
    if left["date"] != right["date"]:
        return False
    if not left["date"] and not (
        left.get("raw_date") and left.get("raw_date") == right.get("raw_date")
    ):
        return False
    if left["start"] and right["start"] and left["start"] != right["start"]:
        return False
    if left["occasion"] and right["occasion"] and left["occasion"] != right["occasion"]:
        return False
    occasion = left["occasion"] and left["occasion"] == right["occasion"]
    address = left["address"] and left["address"] == right["address"]
    contact = any(left[k] and left[k] == right[k] for k in ("email", "phone", "name"))
    return bool((occasion and (address or contact)) or (address and contact))


def _get(headers: list[str], cells: list[str], *names: str) -> str | None:
    keys = list(map(normalized, headers))
    for name in names:
        if name in keys:
            value = cells[keys.index(name)].strip()
            if value:
                return value
    return None


def prepare_plan(root: Path, live: list[dict], *, as_of: date) -> dict:
    form_paths = list(root.glob("*Form Responses*.csv"))
    if len(form_paths) != 1:
        raise ValueError("Exactly one original form export is required")
    original = read_legacy(form_paths[0], timezone="America/Los_Angeles")
    by_external = {r["external_id"]: r for r in live}
    if len(by_external) != len(original.rows):
        raise ValueError("Live original form identities must match the private export")
    requests = []
    for source in original.rows:
        stored = by_external[source.external_id]
        fields = source.values.copy()
        raw = fields["original_fields"]
        parsed_date = parse_operational_date(raw.get("Date of Event", ""))
        fields["event_date"] = stored["event_date"] or (str(parsed_date) if parsed_date else None)
        fields["start_time"] = stored["start_time"] or (
            str(fields["start_time"]) if fields["start_time"] else None
        )
        fields["end_time"] = str(fields["end_time"]) if fields["end_time"] else None
        fields["event_purpose"] = raw.get("What type of event? Occasion", "").strip() or None
        fields["raw_date"] = raw.get("Date of Event")
        fields["received_at"] = str(fields["received_at"]) if fields["received_at"] else None
        requests.append(
            {
                "id": stored["id"],
                "expected_status": stored["status"],
                "expected_updated_at": stored["updated_at"],
                "fields": fields,
            }
        )
    reports = []
    groups = []
    for path in sorted(root.glob("*.csv")):
        if path == form_paths[0]:
            continue
        year_match = re.search(r" - (202[2-5])", path.name)
        if not year_match:
            continue
        report = read_operations(path, source_year=int(year_match[1]), as_of=as_of)
        batch = {
            "id": stable_id(report.digest),
            "source_key": f"operations:{report.source_year}:{report.filename}",
            "file_sha256": report.digest,
            "row_count": len(report.rows) + report.skipped,
            "imported_count": len(report.rows),
            "skipped_count": report.skipped,
        }
        reports.append(batch)
        for row in report.rows:
            values = row.values.model_dump(mode="json")
            get = partial(_get, report.headers, row.cells)
            start = parse_time(get("start time") or "")
            end = parse_time(get("end time") or "")
            fields = {
                "event_date": values["event_date"],
                "start_time": str(start) if start else None,
                "end_time": str(end) if end else None,
                "event_purpose": values["occasion"],
                "venue_address": get("location & address", "address"),
                "contact_full_name": get("contact name"),
                "contact_email": values["contact_email"],
                "contact_phone": values["contact_phone"],
                "raw_date": get("date of event"),
            }
            # Older confirmed bookings and the completed snapshot are historical performances.
            if values["event_date"] and values["event_date"] <= str(min(as_of, date(2025, 12, 31))):
                if values["proposed_status"] == "booked" or (
                    "2022 done" in report.filename and values["proposed_status"] is None
                ):
                    values.update(proposed_status="completed", status_basis="user_assumption")
                    values["rule_codes"].append("reviewed_historical_confirmed_or_done")
                    if (
                        values["payment_status"] == "unknown"
                        and "unparsed_money" not in values["rule_codes"]
                    ):
                        values.update(payment_status="paid", payment_basis="user_assumption")
            evidence = {
                "id": stable_id(f"{report.digest}:{row.number}"),
                "batch_id": batch["id"],
                "source_filename": report.filename,
                "source_record_number": row.number,
                "row_sha256": row.digest,
                "original_headers": report.headers,
                "original_cells": row.cells,
                "normalized_fields": values,
                "rule_codes": values["rule_codes"],
                "proposed_status": values["proposed_status"],
                "status_basis": values["status_basis"],
            }
            item = {
                "fields": fields,
                "identity": identity(fields),
                "evidence": evidence,
                "values": values,
                "priority": 0 if "2022 done" in report.filename else 1,
            }
            matches = [
                g
                for g in groups
                if all(same_event(other["identity"], item["identity"]) for other in g)
            ]
            if len(matches) == 1:
                matches[0].append(item)
            else:
                groups.append([item])
    events, exceptions = [], []
    baseline_fields = {request["id"]: request["fields"].copy() for request in requests}
    contested_targets = set()
    used_targets = set()
    for group in groups:
        group.sort(key=lambda item: item["priority"])
        best = group[-1]
        scores = [
            (max(match_score(item["identity"], identity(r["fields"])) for item in group), r)
            for r in requests
        ]
        candidates = [(score, r) for score, r in scores if score >= 7]
        if not candidates:
            scores = [
                (
                    max(
                        match_score(item["identity"], identity(r["fields"]), ignore_time=True)
                        for item in group
                    ),
                    r,
                )
                for r in requests
            ]
            candidates = [(score, r) for score, r in scores if score >= 10]
        candidates.sort(key=lambda pair: pair[0], reverse=True)
        target = None
        if candidates and (len(candidates) == 1 or candidates[0][0] > candidates[1][0]):
            target = candidates[0][1]
        refs = [
            {"file": x["evidence"]["source_filename"], "row": x["evidence"]["source_record_number"]}
            for x in group
        ]
        if any("source_annotation_no_event_date" in x["values"]["rule_codes"] for x in group):
            exceptions.append({"reason": "undated_source_annotation", "sources": refs})
            events.append({"held": True, "rows": [x["evidence"] for x in group]})
            continue
        if candidates and target is None:
            exceptions.append(
                {
                    "reason": "ambiguous_existing_request",
                    "sources": refs,
                    "candidates": [r["id"] for _, r in candidates],
                }
            )
            events.append({"held": True, "rows": [x["evidence"] for x in group]})
            continue
        if target and target["id"] in used_targets:
            contested_targets.add(target["id"])
            exceptions.append(
                {
                    "reason": "distinct_events_share_existing_request",
                    "sources": refs,
                    "candidates": [target["id"]],
                }
            )
            events.append({"held": True, "rows": [x["evidence"] for x in group]})
            continue
        fields = {}
        for item in group:
            fields.update({k: v for k, v in item["fields"].items() if v is not None})
        values = best["values"].copy()
        operation_fields = set(values) - {
            "event_date",
            "start_time",
            "occasion",
            "contact_email",
            "contact_phone",
            "proposed_status",
            "rule_codes",
        }
        ops = {key: values[key] for key in operation_fields}
        for key in operation_fields:
            known = [
                item["values"][key]
                for item in group
                if item["values"][key] is not None
                and item["values"][key] not in {"unknown", "unresolved"}
            ]
            if not known:
                continue
            if key.endswith("notes"):
                ops[key] = "\n".join(dict.fromkeys(known))
            else:
                ops[key] = known[-1]
                if len(set(known)) > 1:
                    exceptions.append(
                        {"reason": "snapshot_value_difference", "field": key, "sources": refs}
                    )
        for status_field, basis_field in (
            ("payment_status", "payment_basis"),
            ("engagement_type", "engagement_basis"),
        ):
            rank = {"unknown": 0, "user_assumption": 1, "recorded": 2, "explicit": 2}
            strongest = max(
                enumerate(group),
                key=lambda pair: (rank[pair[1]["values"][basis_field]], pair[0]),
            )[1]["values"]
            ops[status_field], ops[basis_field] = strongest[status_field], strongest[basis_field]
        # Explicit cancellations always outrank the completion assumption in any snapshot.
        explicit = [x["values"] for x in group if x["values"]["status_basis"] == "explicit"]
        cancellation = [x for x in explicit if x["proposed_status"] in {"cancelled", "declined"}]
        known_statuses = [x["values"] for x in group if x["values"]["proposed_status"]]
        lifecycle = (
            cancellation[-1]
            if cancellation
            else (
                max(
                    enumerate(known_statuses),
                    key=lambda pair: (pair[1]["status_basis"] == "explicit", pair[0]),
                )[1]
                if known_statuses
                else values
            )
        )
        if target:
            staff_notes = normalized(target["fields"].get("internal_notes") or "")
            for pattern, status in (
                (r"\b(?:cancelled|canceled|cancellation)\b", "cancelled"),
                (r"\b(?:rejected|declined|not performed|did not perform)\b", "declined"),
            ):
                if current_signal(staff_notes, pattern):
                    lifecycle = {**lifecycle, "proposed_status": status, "status_basis": "explicit"}
                    exceptions.append(
                        {"reason": "original_staff_status_preserved", "sources": refs}
                    )
                    break
        ops["status_basis"] = lifecycle["status_basis"]
        # Never present an unparsed price as a known receipt or a settled balance.
        rules = sorted({code for x in group for code in x["values"]["rule_codes"]})
        if "unparsed_money" in rules and ops["payment_basis"] == "user_assumption":
            ops.update(payment_status="unknown", payment_basis="unknown")
        for code in rules:
            if code in {
                "unparsed_event_date",
                "unparsed_money",
                "conflicting_status_notes",
                "conflicting_payment_notes",
                "received_exceeds_quote",
            }:
                exceptions.append({"reason": code, "sources": refs})
        if target:
            request_id = target["id"]
            used_targets.add(request_id)
            merged = target["fields"].copy()
            for key, value in fields.items():
                if not merged.get(key):
                    merged[key] = value
                elif value and clean(str(value)) != clean(str(merged[key])):
                    exceptions.append(
                        {"reason": "existing_field_preserved", "field": key, "sources": refs}
                    )
            target["fields"] = merged
        else:
            request_id = stable_id("event:" + min(x["evidence"]["id"] for x in group))
        events.append(
            {
                "held": False,
                "request_id": request_id,
                "existing": target is not None,
                "fields": fields,
                "status": lifecycle["proposed_status"] or "unknown",
                "operations": ops,
                "primary_row_id": best["evidence"]["id"],
                "rows": [x["evidence"] for x in group],
            }
        )
    for event in events:
        if event.get("request_id") in contested_targets:
            event["held"] = True
    for request in requests:
        if request["id"] in contested_targets:
            request["fields"] = baseline_fields[request["id"]]
    return {
        "version": 1,
        "as_of": str(as_of),
        "project_ref": "siaxqqewpiowfrxfdpkl",
        "form_digest": original.file_sha256,
        "batches": reports,
        "requests": requests,
        "events": events,
        "exceptions": exceptions,
    }


def summary(plan: dict) -> dict:
    events = [x for x in plan["events"] if not x["held"]]
    return {
        "source_rows": sum(len(x["rows"]) for x in plan["events"]),
        "distinct_event_groups": len(plan["events"]),
        "matched_existing": sum(x["existing"] for x in events),
        "new_historical_requests": sum(not x["existing"] for x in events),
        "held_groups": sum(x["held"] for x in plan["events"]),
        "statuses": dict(Counter(x["status"] for x in events)),
        "payment_statuses": dict(Counter(x["operations"]["payment_status"] for x in events)),
        "exceptions": dict(Counter(x["reason"] for x in plan["exceptions"])),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--live-snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--as-of", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    try:
        plan = prepare_plan(
            args.source_dir, json.loads(args.live_snapshot.read_text()), as_of=args.as_of
        )
        args.output.write_text(json.dumps(plan, default=str))
        print(json.dumps(summary(plan)))
    except Exception:
        parser.exit(1, "Reconciliation planning failed; inspect private source configuration.\n")


if __name__ == "__main__":
    main()
