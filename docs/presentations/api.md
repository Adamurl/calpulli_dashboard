# Presentations API

[API overview](../API.md) · [Activity API](activity.md) · [Email API](../email/api.md)

Sources: `backend/app/modules/presentations/router.py`, `schemas.py`, and `services.py`. All endpoints require the [internal bearer credential](../API.md#authentication). Path IDs are UUIDs. JSON bodies reject unknown keys.

## Operations

| Method | Path | Input | Success output |
| --- | --- | --- | --- |
| GET | `/api/v1/presentations` | Query filters and pagination | 200, `PresentationList` |
| POST | `/api/v1/presentations` | `NewPresentation` JSON | 201, `PresentationRead` |
| GET | `/api/v1/presentations/{request_id}` | UUID path parameter | 200, `PresentationRead` |
| PATCH | `/api/v1/presentations/{request_id}` | UUID plus `PresentationPatch` JSON | 200, `PresentationRead` |

There is no delete endpoint or general form-answer editing endpoint. `presentation_id`, `request_id`, and `inquiry_id` refer to the same existing presentation request where those names appear in related APIs.

## List parameters and output

| Query field | Type | Default | Validation |
| --- | --- | --- | --- |
| `limit` | integer | 25 | 1 through 100 |
| `offset` | integer | 0 | At least 0 |
| `source` | string | Omitted | `legacy_csv`, `manual`, or `wix` |
| `status` | string | Omitted | One of the states below |

Both filters apply when supplied. Ordering is `created_at DESC, id DESC`. The response has `items: PresentationSummary[]`, `limit: integer`, and `offset: integer`. There is no total count or cursor. An empty result returns an empty `items` array, not HTTP 404. Concurrent writes can change offset-based page membership.

```http
GET /api/v1/presentations?limit=25&offset=0&source=manual&status=new HTTP/1.1
Authorization: Bearer <INTERNAL_API_TOKEN>
```

An empty successful response is:

```json
{"items":[],"limit":25,"offset":0}
```

## Create input: NewPresentation

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `event_date` | string (date) | Yes | — |
| `start_time` | string (time) | Yes | — |
| `end_time` | string (time) | Yes | — |
| `event_timezone` | string | No | max length `100`; default `"America/Los_Angeles"` |
| `event_access` | `public`, `private` or null | No | default `null` |
| `event_setting` | `indoor`, `outdoor`, `unsure` or null | No | default `null` |
| `event_types` | array of `k12_school`, `college_university`, `nonprofit`, `government`, `corporate`, `cultural_organization`, `funeral`, `grand_opening`, `other` | Yes | min items `1`; max items `9` |
| `event_purpose` | string | Yes | min length `1`; max length `10000` |
| `venue_address` | string | Yes | min length `1`; max length `500` |
| `estimated_guests` | integer | Yes | minimum `1`; maximum `10000000` |
| `audience_distance_12ft` | `yes`, `no`, `unsure` | Yes | — |
| `unavailable_logistics` | string | Yes | min length `1`; max length `10000` |
| `organization_name` | string or null | No | min length `1`; max length `500`; default `null` |
| `contact_first_name` | string | Yes | min length `1`; max length `500` |
| `contact_last_name` | string | Yes | min length `1`; max length `500` |
| `contact_email` | string | Yes | max length `320`; pattern `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| `contact_phone` | string | Yes | min length `3`; max length `100` |
| `organization_website` | string or null | No | min length `1`; max length `500`; default `null` |
| `referral_sources` | array of `website`, `instagram`, `facebook`, `tiktok`, `word_of_mouth`, `mexica_new_year`, `previous_performance`, `referral`, `other` | No | max items `9` |
| `referral_reference` | string or null | No | min length `1`; max length `500`; default `null` |
| `additional_notes` | string or null | No | min length `1`; max length `10000`; default `null` |

Required keys and nullable values are separate concepts. These constraints come from the Pydantic schema; the additional validators below also apply.

- Text is trimmed. `ShortText` permits 1–500 characters, and `LongText` permits 1–10,000 characters.
- `start_time` and `end_time` are local times without UTC offsets. The end must follow the start on the same day. Overnight scheduling is unsupported.
- `event_timezone` must resolve as an IANA timezone. The API does not require the event to be in the future.
- `estimated_guests` requires a JSON integer, not a numeric string or boolean.
- `event_types` has 1–9 unique selections. `referral_sources` defaults to an empty list and permits up to nine unique selections.
- Blank optional organization, website, reference, and additional-note values normalize to null. The website field is text, not a URL-validated type.
- Email uses the schema's shape check. Phone is trimmed text of 3–100 characters, not a verified telephone number.
- Clients cannot set status, source, source identity, original fields, or IDs during creation.

Event categories: `k12_school`, `college_university`, `nonprofit`, `government`, `corporate`, `cultural_organization`, `funeral`, `grand_opening`, `other`.

Referral values: `website`, `instagram`, `facebook`, `tiktok`, `word_of_mouth`, `mexica_new_year`, `previous_performance`, `referral`, `other`.

A valid create body is:

```json
{
  "event_date":"2027-03-20",
  "start_time":"14:00:00",
  "end_time":"15:00:00",
  "event_timezone":"America/Los_Angeles",
  "event_types":["cultural_organization"],
  "event_purpose":"Cultural education",
  "venue_address":"Fictional community center",
  "estimated_guests":50,
  "audience_distance_12ft":"yes",
  "unavailable_logistics":"None",
  "contact_first_name":"Alex",
  "contact_last_name":"Example",
  "contact_email":"alex@example.org",
  "contact_phone":"+1 555 0100"
}
```

Creation persists `source=manual`, `form_version=presentation_v2`, `status=new`, server IDs/timestamps, a normalized answer snapshot, and a creation activity. It recommends `inquiry_received` in the same database transaction. Eligible automatic mail dispatch occurs after that commit during the HTTP request. The response is the presentation record, not an email-delivery acknowledgement. Email failures must be inspected through the email API.

Manual creation has no client idempotency key. Repeating POST creates another inquiry. Wix has a separate [submission identity contract](wix-webhook.md).

## Summary output: PresentationSummary

Every listed key is returned, even when its value is null. Historical records can have null contact and scheduling fields.

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `id` | string (uuid) | Yes | — |
| `source` | `legacy_csv`, `manual`, `wix` | Yes | — |
| `form_version` | string | Yes | — |
| `status` | `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, `cancelled` | Yes | — |
| `received_at` | string (date-time) or null | Yes | — |
| `created_at` | string (date-time) | Yes | — |
| `updated_at` | string (date-time) | Yes | — |
| `event_date` | string (date) or null | Yes | — |
| `start_time` | string (time) or null | Yes | — |
| `end_time` | string (time) or null | Yes | — |
| `event_timezone` | string or null | Yes | — |
| `organization_name` | string or null | Yes | — |
| `contact_full_name` | string or null | Yes | — |
| `contact_email` | string or null | Yes | — |
| `event_types` | array of string | Yes | — |
| `venue_address` | string or null | Yes | — |
| `estimated_guests` | integer or null | Yes | — |

`form_version` is currently `legacy_v1` or `presentation_v2`. Summary output excludes original fields, internal notes, contact phone, and other detail-only fields. It still contains personal contact data and requires authentication.

## Detail output: PresentationRead

Create, detail, and patch return all summary fields plus these fields:

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `source_key` | string or null | Yes | — |
| `external_id` | string or null | Yes | — |
| `import_batch_id` | string (uuid) or null | Yes | — |
| `source_row_number` | integer or null | Yes | — |
| `event_access` | string or null | Yes | — |
| `event_setting` | string or null | Yes | — |
| `event_purpose` | string or null | Yes | — |
| `audience_distance_12ft` | string or null | Yes | — |
| `unavailable_logistics` | string or null | Yes | — |
| `contact_first_name` | string or null | Yes | — |
| `contact_last_name` | string or null | Yes | — |
| `contact_phone` | string or null | Yes | — |
| `organization_website` | string or null | Yes | — |
| `referral_sources` | array of string | Yes | — |
| `referral_reference` | string or null | Yes | — |
| `additional_notes` | string or null | Yes | — |
| `internal_notes` | string or null | Yes | — |
| `original_fields` | object | Yes | — |

`original_fields` is the historical source cell object or the normalized new-form snapshot. `internal_notes` contains the current internal note. Neither is a public-client payload. See [presentation data reference](README.md) for historical mappings and import provenance.

## Patch input: PresentationPatch

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `status` | `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, `cancelled` or null | No | default `null` |
| `expected_current_status` | `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, `cancelled` or null | No | default `null` |
| `internal_notes` | string or null | No | min length `1`; max length `10000`; default `null` |

At least one non-null status or internal note is required. An explicit null status or internal note is invalid. Notes use trimmed, nonblank text of up to 10,000 characters. A note-only patch omits both status fields. A status patch requires `expected_current_status`; supplying that field without a status is invalid.

```json
{"status":"reviewing","expected_current_status":"new","internal_notes":"Staff reviewed the inquiry."}
```

The service locks the inquiry. A stale expected status returns HTTP 409. A real status change appends an activity; setting the current status to itself does not. A note patch replaces the current note and appends its full text to activity history, including when a status changes in the same patch.

Allowed states are `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, and `cancelled`. There is no additional transition graph: any allowed state can replace another when the expected value matches. State labels alone do not prove scheduling, a signed contract, payment, or proposal delivery.

A change to `new`, `declined`, or `completed` recommends the corresponding email once. Other states create no email recommendation. The write route also dispatches any eligible unedited automatic messages for the inquiry. Approval-required and manual messages remain unsent.

## Error contract

Shared authentication and validation errors are defined in the [API overview](../API.md#error-responses).

| Status | Condition |
| --- | --- |
| 404 | Detail or patch inquiry does not exist |
| 409 | Patch expected status does not match the stored value |
| 422 | Invalid UUID, query value, missing required input, unknown body key, or validator failure |
| 500 | Unexpected persistence or dispatch error not handled as a workflow result |

These routes do not convert all database exceptions to HTTP 503. A write can commit before a later dispatch error produces HTTP 500. Automatic retry of manual creation is therefore unsafe without checking whether a record was created.

Verification: `test_presentations.py`, `test_presentations_database.py`, and `test_email_workflow.py` under `backend/tests/`.
