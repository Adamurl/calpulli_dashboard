# Presentation request data reference

[Documentation index](../README.md) · [API](api.md) · [Activity](activity.md) · [Historical import](legacy-import.md) · [Operational follow-ups](operations-import.md) · [Wix webhook](wix-webhook.md)

## Historical and current submissions

The same `presentation_requests` table holds historical CSV records and submissions from the new presentation form. Typed columns support filtering. `original_fields` preserves the historical source cells or the normalized new submission snapshot.

A missing historical answer is `NULL`, not a fabricated date, name, guest count, or answer. Empty multiselect arrays mean no structured selection was recorded. `form_version` distinguishes `legacy_v1` from `presentation_v2`.

The inspected export contains 896 data rows. The dry run retains 883 nonblank records, including one record containing notes without a timestamp, and skips 13 blank rows. It leaves 465 nonempty event dates and 289 nonempty guest counts unparsed. Original text remains available in request detail. The authorized Supabase MCP import created 883 requests and matching creation activities. Read-only comparisons confirmed every normalized and original field matches the source. Replaying an imported chunk inserted zero duplicates. The source CSV remains private in `TEMP/`.

## Tables

| Table | Responsibility |
| --- | --- |
| `presentation_requests` | Contact snapshot, request answers, status, source identity, source row, and original fields. |
| `presentation_operations` | Post-request financial and operational details, including inference basis. |
| `presentation_import_rows` | Restricted positional source evidence and reconciliation state. |
| `presentation_import_batches` | Stable dataset key, file digest, row counts, import counts, and import time. |
| `presentation_activities` | Creation, status changes, internal notes, and email timeline entries for a request. |
| `presentation_email_templates` | Editable email copy and readiness. |
| `presentation_email_messages` | Draft, approval, delivery, and provider identity records. |
| `presentation_email_staff_tasks` | Missing-data and failed-delivery staff tasks. |

Each request has a UUID. An imported request references its first import batch. Activities reference their request. Foreign keys restrict deletion. There is no delete route.

Contact details remain a snapshot on the request. The importer does not merge people by email or split a full name into guessed name parts. Shared contact and organization identity can be designed when actual reuse rules are known.

## Historical field mapping

| CSV column | Stored representation |
| --- | --- |
| `Timestamp` | `received_at` when the timestamp parses with the explicitly supplied source timezone; always preserved in `original_fields`. |
| `Email address` | `contact_email`. |
| `Name of the Company/Organization` | `organization_name`. |
| `Organization Website or Social Media Platforms` | `organization_website`. |
| `Date of Event` | `event_date` when the parser recognizes an explicit supported year and date; otherwise `NULL` plus original text. |
| `What type of event? Occasion` | Original free text in `original_fields`; not guessed into the new category list. |
| `Performance Start time` | `start_time` when supported; original text retained. |
| `Performance End time` | `end_time` when supported; original text retained. |
| `Full Venue Address` | `venue_address`. |
| `Estimated number of guests at the event.` | `estimated_guests` for a nonnegative integer of at most nine digits; ranges and other answers stay in `original_fields`. |
| `Additional Notes, please share below` | `additional_notes`. |
| `Full Name` | `contact_full_name`; first and last name remain `NULL`. |
| `Phone Number` | `contact_phone` as text. |
| Referral question | `referral_reference` as text. |
| `Notes:` | `internal_notes` and the original cell. |
| `-` | Original cell only; no status interpretation. |

Historical records start with `status=unknown`. Submission time, event time, and import time have separate meanings. The importer never treats an old event as a new inquiry, booked presentation, or completed performance.

## New form fields

| Form answer | API field | Required for new submissions |
| --- | --- | --- |
| Event date | `event_date` | Yes, ISO date. |
| Start and end time | `start_time`, `end_time` | Yes, local times on the same day; end must follow start. |
| Event timezone | `event_timezone` | Defaults to `America/Los_Angeles`; accepts an IANA timezone. |
| Public or private | `event_access` | Optional, `public` or `private`. |
| Indoor, outdoor, or not sure | `event_setting` | Optional, `indoor`, `outdoor`, or `unsure`. |
| Event categories | `event_types` | At least one unique category. |
| Purpose of the presentation | `event_purpose` | Yes. |
| Venue address | `venue_address` | Yes. |
| Estimated guests | `estimated_guests` | Yes, integer from 1 through 10,000,000. |
| At least 12 feet from audience | `audience_distance_12ft` | Yes, `yes`, `no`, or `unsure`. |
| Unavailable logistics | `unavailable_logistics` | Yes; use an explicit answer such as `None` when all are available. |
| Company or organization | `organization_name` | Optional. |
| First and last name | `contact_first_name`, `contact_last_name` | Yes. |
| Email and phone | `contact_email`, `contact_phone` | Yes. |
| Website or social media | `organization_website` | Optional text. |
| How the requester found Calpulli | `referral_sources` | Optional unique selections. |
| Reference | `referral_reference` | Optional. |
| Additional notes | `additional_notes` | Optional. |

Event category values are `k12_school`, `college_university`, `nonprofit`, `government`, `corporate`, `cultural_organization`, `funeral`, `grand_opening`, and `other`.

Referral values are `website`, `instagram`, `facebook`, `tiktok`, `word_of_mouth`, `mexica_new_year`, `previous_performance`, `referral`, and `other`.

The logistics list and final disclaimer are form copy, not additional submitted answer fields. This schema does not claim to capture consent acknowledgement or a versioned copy of the disclaimer. Add those fields only after reviewing the actual submission contract and the organization's requirements. The disclaimer does not record an acceptance checkbox, confirm a booking, or create payment records. Those workflows and tables are outside this scope.

New input rejects unknown keys, blank required text, duplicate selections, invalid email shape, and timezone-bearing time values. An overnight presentation is not supported by this form contract. Add an explicit end date before accepting overnight scheduling. New records start with `status=new`.

## Status and activity

Allowed statuses are `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, and `cancelled`. These are record labels. The email workflow maps selected labels to recommendations; scheduling, contract signing, and payment verification are not implemented by the state model. See the [presentations API](api.md) and [email API](../email/api.md).

A status patch includes both `status` and `expected_current_status`. The service locks the row and rejects a stale expected status with HTTP 409. A successful change records the previous and new status. Internal note changes update the current note and append an activity. There is no user identity attribution yet because the bootstrap token does not identify individual coordinators.

## Historical import

Run from `backend/`. The default operation reads the file and prints counts, not contact values. It does not require a database connection.

```bash
uv run python -m app.imports.legacy_presentations \
  '../TEMP/CT Presentation Request (Responses) - Form Responses 1 (1).csv' \
  --timezone America/Los_Angeles \
  --source-key google-presentation-history
```

Confirm the timezone of the original spreadsheet before applying. `--timezone` interprets only the source submission timestamp. Historical `event_timezone` remains `NULL` because the venue timezone is not established. Explicit `--apply` writes to the configured `DATABASE_URL` after migrations. Apply only after confirming the target database and reviewing the dry run.

The direct database import is atomic. The completed MCP import used atomic, resumable chunks with per-chunk counters and duplicate protection. Batch identity is the stable `source_key` and the file SHA-256 digest. Repeating the same file produces no new requests. Row identity hashes the known submitted form fields, excluding mutable administrative columns `-` and `Notes:`. An occurrence suffix preserves distinct identical submissions. Notes-only rows use the complete original row for identity. Two different submissions with the same timestamp retain separate identities.

Reuse the same dataset key across exports. A later export skips known row identities and imports new rows. Administrative note or marker edits do not overwrite the imported original. Editing a submitted form field changes row identity and can create a new historical record. The importer does not reconcile spreadsheet edits automatically. Corrections require an explicit future correction process. Changing the dataset key treats the file as a different source and can duplicate requests.

`TEMP/` is ignored by Git and excluded from Docker builds. Keep source files and any local import reports out of the public repository.

## HTTP contracts

The [presentations API reference](api.md) defines request and response fields, filters, pagination, status updates, and errors. [Activity](activity.md), [email workflow](../email/api.md), and [historical import](legacy-import.md) have separate technical contracts.
