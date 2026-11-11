# Presentation activity API

[API overview](../API.md) · [Presentations API](api.md) · [Email API](../email/api.md)

Source: `backend/app/modules/presentations/router.py`, `schemas.py`, and `models.py`.

## Endpoint and input

`GET /api/v1/presentations/{request_id}/activities` requires the internal bearer credential. `request_id` is a UUID. There is no body.

| Query parameter | Type | Default | Bounds |
| --- | --- | --- | --- |
| `limit` | integer | 25 | 1–100 |
| `offset` | integer | 0 | At least 0 |

The service first verifies that the inquiry exists. Missing inquiries return HTTP 404. Invalid IDs or pagination return HTTP 422. Existing inquiries with no activity return an empty array.

## Output

HTTP 200 returns `ActivityList` with `items: ActivityRead[]`, `limit`, and `offset`. Ordering is `created_at DESC, id DESC`. There is no total count or filtering by kind.

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `id` | string (uuid) | Yes | — |
| `request_id` | string (uuid) | Yes | — |
| `inquiry_id` | string (uuid) | Yes | — |
| `kind` | string | Yes | — |
| `email_message_id` | string (uuid) or null | Yes | — |
| `actor_id` | string or null | Yes | — |
| `summary` | string or null | Yes | — |
| `previous_status` | string or null | Yes | — |
| `new_status` | string or null | Yes | — |
| `note` | string or null | Yes | — |
| `created_at` | string (date-time) | Yes | — |

`request_id` and `inquiry_id` contain the same UUID. The second field is a response alias for clients that use inquiry terminology. Both keys appear in serialized output. Nullable keys are present with null when not applicable.

An email activity looks like this:

```json
{
  "id":"33333333-3333-4333-8333-333333333333",
  "request_id":"11111111-1111-4111-8111-111111111111",
  "inquiry_id":"11111111-1111-4111-8111-111111111111",
  "kind":"email_sent",
  "email_message_id":"22222222-2222-4222-8222-222222222222",
  "actor_id":"system",
  "summary":"Email sent",
  "previous_status":null,
  "new_status":null,
  "note":null,
  "created_at":"2027-03-01T18:00:00Z"
}
```

## Activity kinds and side effects

| Kind | Meaning |
| --- | --- |
| `created` | A current or historical inquiry was created |
| `status_changed` | A real state change, with previous and new values |
| `note_added` | Internal note replacement, with full note text |
| `email_recommended` | A workflow selected an email |
| `email_blocked` | Required data or template readiness is missing |
| `email_draft_created` | A workflow or send-again action created a draft |
| `email_approved` | Staff approved the draft |
| `email_cancelled` | Staff cancelled an unsent email |
| `email_send_started` | A durable send claim committed before the provider call |
| `email_sent` | The provider returned message/thread identifiers and success persisted |
| `email_send_failed` | A handled provider error persisted |
| `email_send_retried` | Staff started an eligible retry |

The shared staff token does not establish individual identity. Email actors use `system` or `internal-staff`; pre-email creation, status, and note activities can have null actors. Some workflow-generated activities use the shared staff actor even when the original recommendation used `system`. Actor values must not be interpreted as verified coordinator identities.

This is a read-only HTTP feature. There is no activity creation, edit, or delete endpoint. A crash after the send claim can leave `email_send_started` without a success/failure entry. Such deliveries require mailbox reconciliation, not an assumption that the mail failed.

Verification: presentation database tests and email workflow tests, including serialized inquiry/message identifiers.
