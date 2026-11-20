# Mexica New Year vendors

Open **Mexica New Year → Vendors** in the staff workspace. Select 2027 for new applications or 2026 for the historical archive. The cards summarize the full year. Search narrows the table by business, contact, or category. Filter by workflow stage, sort from the Columns menu, and choose 5, 10, 20, or 50 rows per page. Select a vendor name to open their record. The arrows move through the selected year in business-name order. The stage badge uses recorded spot assignments, paid status, acceptance, or a submitted application. Staff can edit profile details and post private comments in Activity. Earlier notes appear in Activity without a date. The detail page calculates requested spots when both booth dimensions are multiples of 10 feet. Amount due appears once acceptance or paid status is recorded.

The Assignments and Outreach links are reserved for future workflows. The spots API provides recorded booth inventory for a future map.

## Staff API

Each route requires a Supabase access token for a server-allowlisted staff user and an explicit `event_year`. The workspace uses the same-origin `/api/v1` API.

| Method | Route | Response |
| --- | --- | --- |
| GET | `/api/v1/mny/vendors?event_year=2027` | Vendor summaries sorted by business name and ID. Returns `items`, `total`, `limit`, and `offset`. `limit` defaults to 50 and caps at 100. `offset` defaults to 0. Optional `q` matches business name, contact name, or category. Use `stage` to filter and `sort` (`name`, `received`, `contact`, `category`, `stage`) with `direction` (`asc` or `desc`) to order the full result before pagination. |
| GET | `/api/v1/mny/vendors/{vendor_id}?event_year=2027` | Vendor details and original responses, with nullable `previous_id` and `next_id`. Returns 404 if the ID does not belong to the requested year. |
| PATCH | `/api/v1/mny/vendors/{vendor_id}?event_year=2027` | Updates the supplied profile or note fields and returns the vendor detail. Returns 404 for a different year. |
| POST | `/api/v1/mny/vendors/{vendor_id}/comments?event_year=2027` | Appends a staff comment. Returns 201 with its ID, body, and creation timestamp. |
| GET | `/api/v1/mny/vendors/statistics?event_year=2027` | Full-year `total_vendors`, `total_paid`, `requested_spots`, and `assigned_spots`. |
| GET | `/api/v1/mny/spots?event_year=2026` | `event_year`, `inventory_available`, and `spots`. Each spot includes its label as text when recorded, spot status, optional price, and linked vendor summaries. Includes free booths if the source inventory has them. |

Vendor summaries include `stage`, `contact_name`, `requested_spot_count`, `assigned_spot_labels`, and `paid_before_deadline`. The table shows the recorded requested count when available. Historical labels come from the legacy vendor record where present and fall back to linked spot labels. The detail response preserves the original source records for both.

Statistics sum recorded payments and booth counts. The requested-spot total uses the assigned-label count when a requested count is absent. A form booth-size preference does not establish a count. Metrics with no recorded data return `null`. An explicit recorded zero counts as data.

CSV detail contains submitted contact and booth preferences. `follower_count` is nullable. `responses.follower_count_kind` indicates an exact count, approximate count, or lower bound. `follower_response` holds the original text for review.

Historical detail contains the original vendor under `responses.legacy_vendor` and original link and spot rows under `responses.linked_spots`. Recorded payments, email dates, notes, spot status, and both assignment representations remain available as stored by the source. The archive reflects what the old database records at import time.

Profile edits accept `business_name`, `category`, `contact_name`, `email`, `phone`, `requested_space`, `website`, `instagram`, and `facebook`. The `staff_note` field remains available for editing the previous single-note format. An omitted field keeps its value. A null or blank value clears the field. Requested space, links, and the note are stored under `responses.staff_details` alongside the imported responses.

Post a comment with a nonblank `body` of at most 10,000 characters. Vendor detail includes saved comments in `responses.comments`.

## Data tables

`mny_vendors` is the central table for every event year. Vendor IDs and the original form or legacy payload are preserved. `mny_spots` holds individual booths by year. `mny_vendor_spots` links vendors to booths, with database constraints that require both records to belong to the same year.

Revision 0009 moves vendor reads to the central table and backfills booth and link rows from the archived inventory. The original inventory snapshot remains available for audit, and a restricted compatibility view serves older vendor API instances during rollout.

## Import and archive

From `backend/`, preview the private CSV. Use the timezone configured in the source spreadsheet.

```bash
uv run python -m app.imports.mny_vendors csv "../TEMP/application-export.csv" \
  --event-year 2027 --timezone America/Los_Angeles
```

To preview the 2026 source, use `uv run python -m app.imports.mny_vendors archive-2026`. It reads `public.vendors`, `public.vendor_spots`, and `public.spots` in a read-only transaction. Confirm those tables contain the 2026 dataset. Set `MNY_LEGACY_DATABASE_URL` in the local environment when the source differs from the destination.

After reviewing the target and preview totals, run `uv run alembic upgrade head` against the intended destination. Repeat the import commands with `--apply` to write to that database. The commands report counts, and the application keeps legacy tables outside its migration ownership.

Each import is atomic. Reruns skip an application with the same event year, submission timestamp, email, and business name, or a legacy vendor with the same source ID. Keep the same source timezone on reruns. Store private exports in the ignored `TEMP/` directory.

Revision 0008 adds year-scoped booth inventory. Rerun the 2026 archive after upgrading to capture inventory for an earlier vendor-only archive. The backfill records the inventory at the time of the rerun. Existing vendor detail snapshots retain their original archive dates. Until a year's inventory is loaded, the API returns `inventory_available: false`. The 2027 application CSV supplies no booth inventory.
