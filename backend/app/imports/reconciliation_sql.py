"""Export guarded historical DML for an authorized connector, never execute it."""

import argparse
import hashlib
import json
from pathlib import Path

from app.imports.reconcile_history import stable_id

REQUEST_FIELDS = (
    "event_date",
    "start_time",
    "end_time",
    "event_purpose",
    "venue_address",
    "contact_full_name",
    "contact_email",
    "contact_phone",
    "organization_name",
    "organization_website",
    "estimated_guests",
    "referral_reference",
    "additional_notes",
    "internal_notes",
    "received_at",
)


def block(payload: dict | list, body: str) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, default=str)
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    outer, inner = f"$block_{digest}$", f"$data_{digest}$"
    if outer in encoded or inner in encoded:
        raise ValueError("Unsafe delimiter in import data")
    return f"""SET LOCAL search_path TO public;
SET LOCAL lock_timeout = '5s';
DO {outer}
DECLARE
    payload jsonb := {inner}{encoded}{inner}::jsonb;
    item jsonb;
    evidence jsonb;
    fields jsonb;
    current_request public.presentation_requests%ROWTYPE;
    current_row public.presentation_import_rows%ROWTYPE;
    key text;
    needs_update boolean;
    target_id uuid;
BEGIN
    IF (SELECT version_num FROM public.alembic_version) IS DISTINCT FROM '0005' THEN
        RAISE EXCEPTION 'Unexpected application schema revision';
    END IF;
    {body}
END;
{outer};
"""


def request_enrichment() -> str:
    assignments = []
    casts = {
        "event_date": "date",
        "start_time": "time",
        "end_time": "time",
        "estimated_guests": "integer",
        "received_at": "timestamptz",
    }
    for field in REQUEST_FIELDS:
        value = f"fields->>'{field}'"
        if field in casts:
            value = f"({value})::{casts[field]}"
            previous = field
        else:
            previous = f"NULLIF({field}, '')"
        assignments.append(f"{field} = COALESCE({previous}, {value})")
    return (
        """
    fields := item->'fields';
    needs_update := false;
    FOR key IN SELECT jsonb_object_keys(fields) LOOP
        IF (to_jsonb(current_request)->key IS NULL
            OR to_jsonb(current_request)->key IN ('null'::jsonb, '\"\"'::jsonb))
            AND fields->key IS NOT NULL AND fields->key <> 'null'::jsonb THEN
            needs_update := true;
        END IF;
    END LOOP;
    IF needs_update THEN
        IF current_request.updated_at IS DISTINCT FROM
            (item->>'expected_updated_at')::timestamptz THEN
            RAISE EXCEPTION 'Historical target changed after review';
        END IF;
        UPDATE public.presentation_requests SET """
        + ", ".join(assignments)
        + """,
            updated_at = now() WHERE id=target_id;
    END IF;
"""
    )


def export_plan(plan: dict, output: Path, *, chunk_size: int = 15) -> dict:
    if plan["project_ref"] != "siaxqqewpiowfrxfdpkl" or plan["version"] != 1:
        raise ValueError("Unexpected reviewed project or plan")
    output.mkdir(parents=True, exist_ok=True)
    manifest = []

    def emit(phase: str, payload: list, body: str) -> None:
        for offset in range(0, len(payload), chunk_size):
            path = output / f"{len(manifest):03d}-{phase}.sql"
            query = block(payload[offset : offset + chunk_size], body)
            path.write_text(query)
            manifest.append(
                {
                    "file": path.name,
                    "phase": phase,
                    "sha256": hashlib.sha256(query.encode()).hexdigest(),
                }
            )

    emit(
        "batches",
        plan["batches"],
        """
    FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
        INSERT INTO public.presentation_import_batches
            (id,source_key,file_sha256,row_count,imported_count,skipped_count)
        VALUES ((item->>'id')::uuid,item->>'source_key',item->>'file_sha256',
                (item->>'row_count')::integer,(item->>'imported_count')::integer,
                (item->>'skipped_count')::integer)
        ON CONFLICT(source_key,file_sha256) DO NOTHING;
        IF NOT EXISTS (SELECT 1 FROM public.presentation_import_batches
            WHERE id=(item->>'id')::uuid AND file_sha256=item->>'file_sha256') THEN
            RAISE EXCEPTION 'Import batch identity conflict';
        END IF;
    END LOOP;
    """,
    )
    emit(
        "evidence",
        [row for event in plan["events"] for row in event["rows"]],
        """
    FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
        INSERT INTO public.presentation_import_rows
        SELECT (jsonb_populate_record(NULL::public.presentation_import_rows,
            item || jsonb_build_object('review_state','pending','created_at',now()))).*
        ON CONFLICT(batch_id,source_record_number) DO NOTHING;
        SELECT * INTO current_row FROM public.presentation_import_rows
            WHERE id=(item->>'id')::uuid;
        IF NOT FOUND OR current_row.row_sha256 IS DISTINCT FROM item->>'row_sha256'
            OR current_row.normalized_fields IS DISTINCT FROM item->'normalized_fields' THEN
            RAISE EXCEPTION 'Staged evidence identity conflict';
        END IF;
    END LOOP;
    """,
    )
    by_id = {r["id"]: r for r in plan["requests"]}
    targets = {e["request_id"] for e in plan["events"] if not e["held"] and e["existing"]}

    def enrichment(request: dict) -> dict:
        return {
            "id": request["id"],
            "expected_updated_at": request["expected_updated_at"],
            "fields": {
                k: v for k, v in request["fields"].items() if k in REQUEST_FIELDS and v is not None
            },
        }

    emit(
        "form-enrichment",
        [enrichment(r) for r in plan["requests"] if r["id"] not in targets],
        """FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
             target_id := (item->>'id')::uuid;
             SELECT * INTO current_request FROM public.presentation_requests
                 WHERE id=target_id FOR UPDATE;
             IF NOT FOUND THEN RAISE EXCEPTION 'Historical target missing'; END IF;
         """
        + request_enrichment()
        + "END LOOP;",
    )

    events = []
    for event in plan["events"]:
        if event["held"]:
            continue
        entry = {**event, "row_ids": [r["id"] for r in event["rows"]]}
        entry.pop("rows")
        entry["activity_id"] = stable_id("activity:" + entry["request_id"])
        if event["existing"]:
            request = by_id[event["request_id"]]
            entry.update(enrichment(request), expected_status=request["expected_status"])
        else:
            entry["fields"] = {
                k: v for k, v in entry["fields"].items() if k in REQUEST_FIELDS and v is not None
            }
            entry["new_identity"] = "operations:" + entry["request_id"]
        events.append(entry)
    new_columns = ",".join(REQUEST_FIELDS)
    new_values = []
    for key in REQUEST_FIELDS:
        cast = {
            "event_date": "date",
            "start_time": "time",
            "end_time": "time",
            "estimated_guests": "integer",
            "received_at": "timestamptz",
        }.get(key)
        expression = f"fields->>'{key}'"
        new_values.append(f"({expression})::{cast}" if cast else expression)
    event_body = (
        """
    FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
        target_id := (item->>'request_id')::uuid;
        PERFORM id FROM public.presentation_import_rows
            WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(item->'row_ids'))
            ORDER BY id FOR UPDATE;
        IF (SELECT count(*) FROM public.presentation_import_rows
             WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(item->'row_ids')))
             <> jsonb_array_length(item->'row_ids') THEN
            RAISE EXCEPTION 'Historical evidence missing';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.presentation_import_rows
            WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(item->'row_ids'))
            AND (review_state <> 'applied' OR request_id IS DISTINCT FROM target_id)) THEN
            IF NOT EXISTS (SELECT 1 FROM public.presentation_operations
                WHERE request_id=target_id) THEN
                RAISE EXCEPTION 'Applied historical evidence has no operational record';
            END IF;
            CONTINUE;
        END IF;
        fields := item->'fields';
        IF (item->>'existing')::boolean THEN
            SELECT * INTO current_request FROM public.presentation_requests
                WHERE id=target_id FOR UPDATE;
            IF NOT FOUND OR current_request.status IS DISTINCT FROM item->>'expected_status'
                OR current_request.updated_at IS DISTINCT FROM
                    (item->>'expected_updated_at')::timestamptz THEN
                RAISE EXCEPTION 'Historical target changed after review';
            END IF;
    """
        + request_enrichment()
        + """
        ELSE
            INSERT INTO public.presentation_requests
                (id,source,source_key,external_id,form_version,status,event_types,referral_sources,
                 original_fields,"""
        + new_columns
        + """)
            VALUES (target_id,'legacy_csv','historical-operations',item->>'new_identity',
                'legacy_v1',item->>'status','[]'::jsonb,'[]'::jsonb,
                jsonb_build_object('historical_primary_row',item->>'primary_row_id'),
                """
        + ",".join(new_values)
        + """)
            ON CONFLICT(id) DO NOTHING;
            SELECT * INTO current_request FROM public.presentation_requests
                WHERE id=target_id FOR UPDATE;
            IF current_request.source_key IS DISTINCT FROM 'historical-operations'
                OR current_request.external_id IS DISTINCT FROM item->>'new_identity' THEN
                RAISE EXCEPTION 'Historical request identity conflict';
            END IF;
        END IF;
        IF NOT (item->>'existing')::boolean OR current_request.status <> item->>'status' THEN
            INSERT INTO public.presentation_activities
                (id,request_id,kind,previous_status,new_status,actor_id,summary)
            VALUES ((item->>'activity_id')::uuid,target_id,
                CASE WHEN (item->>'existing')::boolean THEN 'status_changed' ELSE 'created' END,
                CASE WHEN (item->>'existing')::boolean THEN current_request.status ELSE NULL END,
                item->>'status','historical_import','Historical CSV reconciliation')
            ON CONFLICT(id) DO NOTHING;
        END IF;
        UPDATE public.presentation_requests SET status=item->>'status',updated_at=now()
            WHERE id=target_id;
        INSERT INTO public.presentation_operations
        SELECT (jsonb_populate_record(NULL::public.presentation_operations,
            item->'operations' || jsonb_build_object('request_id',target_id,
                'import_row_id',item->>'primary_row_id','updated_at',now()))).*
        ON CONFLICT(request_id) DO NOTHING;
        IF NOT EXISTS (SELECT 1 FROM public.presentation_operations
            WHERE request_id=target_id
            AND to_jsonb(presentation_operations)-'updated_at'-'request_id'-'import_row_id'
                = to_jsonb(jsonb_populate_record(NULL::public.presentation_operations,
                    item->'operations'))-'updated_at'-'request_id'-'import_row_id') THEN
            RAISE EXCEPTION 'Existing operational facts conflict with reviewed import';
        END IF;
        UPDATE public.presentation_import_rows SET request_id=target_id,
            observed_request_updated_at=(item->>'expected_updated_at')::timestamptz,
            review_state='applied',applied_at=now()
            WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(item->'row_ids'));
    END LOOP;
    """
    )
    # Evidence foreign keys require the request link before inserting operations.
    event_body = event_body.replace(
        "        INSERT INTO public.presentation_operations",
        """        UPDATE public.presentation_import_rows SET request_id=target_id
            WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(item->'row_ids'));
        INSERT INTO public.presentation_operations""",
    )
    emit("events", events, event_body)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return {
        "sql_units": len(manifest),
        "events": len(events),
        "evidence_rows": sum(len(e["rows"]) for e in plan["events"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(export_plan(json.loads(args.plan.read_text()), args.output_dir)))
    except Exception:
        parser.exit(1, "SQL export failed; inspect the private review plan.\n")


if __name__ == "__main__":
    main()
