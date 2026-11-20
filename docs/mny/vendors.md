# Mexica New Year vendors

The workspace sidebar has Vendors, Assignments, and Outreach under Mexica New Year. Staff can read vendor records through the API. Assignment editing, email delivery, and spreadsheet sync are future work.

## Staff API

Both routes require a Supabase access token for a server-allowlisted staff user and an explicit `event_year`.

| Method | Route | Response |
| --- | --- | --- |
| GET | `/api/v1/mny/vendors?event_year=2027` | Vendor summaries sorted by business name and ID. `limit` defaults to 50 (maximum 100). `offset` defaults to 0. |
| GET | `/api/v1/mny/vendors/{vendor_id}?event_year=2027` | Vendor details and original responses. Returns 404 if the ID does not belong to the requested year. |

CSV detail contains submitted contact and booth preferences. `follower_count` is nullable. `responses.follower_count_kind` indicates an exact count, approximate count, or lower bound. When a response is unclear, `follower_response` holds the original text for review.

Historical detail contains the original vendor row under `responses.legacy_vendor` and original link and spot rows under `responses.linked_spots`. Recorded payments, email dates, notes, spot status, and both assignment representations remain available as stored by the source. The archive reflects what the old database records at import time.

## Import and archive

From `backend/`, preview the private CSV. Use the timezone configured in the source spreadsheet.

```bash
uv run python -m app.imports.mny_vendors csv "../TEMP/application-export.csv" \
  --event-year 2027 --timezone America/Los_Angeles
```

To preview the 2026 source, use `uv run python -m app.imports.mny_vendors archive-2026`. It reads `public.vendors`, `public.vendor_spots`, and `public.spots` in a read-only transaction. Confirm those tables contain the 2026 dataset. Set `MNY_LEGACY_DATABASE_URL` in the local environment when the source differs from the destination.

After reviewing the target and preview totals, apply Alembic revision 0007 with `uv run alembic upgrade head` against the intended destination. Repeat the import commands with `--apply` to write to that database. The commands report counts, and the application keeps legacy tables outside its migration ownership.

Each import is atomic. Reruns skip an application with the same event year, submission timestamp, email, and business name, or a legacy vendor with the same source ID. Keep the same source timezone on reruns. Store private exports in the ignored `TEMP/` directory.
