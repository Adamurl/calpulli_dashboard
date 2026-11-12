# Presentation email workflow API

[API overview](../API.md) · [Templates API](templates.md) · [Gmail adapter](gmail-provider.md) · [Operational guide](README.md)

Sources: `backend/app/modules/presentations/email_router.py`, `email_schemas.py`, `email_registry.py`, and `email_service.py`.

## Authentication and identifiers

All JSON routes require the Supabase user JWT and staff approval. All inquiry and message IDs in paths are UUIDs. A message is selected within its inquiry; using another inquiry's message ID returns HTTP 404. Send-again additionally requires `X-Email-Resend-Token` matching configured `EMAIL_SEND_AGAIN_TOKEN`.

The prefix below is `/api/v1/presentations`. An action root is `/{inquiry_id}/emails/{message_id}`.

## Operations and return types

| Method | Path below prefix | Input | HTTP 200 output |
| --- | --- | --- | --- |
| GET | `/email-capabilities` | Optional resend header | Capability object |
| GET | `/{inquiry_id}/emails` | Inquiry UUID | Panel object |
| POST | `/{inquiry_id}/email-events` | `EventInput` JSON | `EmailRead` |
| PATCH | `/{inquiry_id}/emails/{message_id}` | `DraftEdit` JSON | `EmailRead` |
| POST | Action root + `/refresh` | No body | `EmailRead` |
| POST | Action root + `/approve` | No body | `EmailRead` |
| POST | Action root + `/cancel` | No body | `EmailRead` |
| POST | Action root + `/send` | No body | `EmailRead` |
| POST | Action root + `/retry` | No body | `EmailRead` |
| POST | Action root + `/send-again` | Resend header; no body | New `EmailRead` draft |

No-body actions require neither a JSON object nor `Content-Type`. Email list, tasks, and registry data are unpaginated. The route has no email deletion or staff-task mutation endpoint.

HTTP success does not establish mail delivery. `/send`, `/retry`, and event dispatch can return an email with `status=FAILED` after a handled provider failure. Clients must inspect `status`, `error_code`, `error_message`, `retryable`, and `delivery_unknown`. Unexpected provider or persistence errors can instead return HTTP 500.

## Event input: EventInput

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `event` | EmailEvent | Yes | — |
| `variables` | object with string values | No | max keys `30` |
| `contract_signed` | boolean | No | default `false` |
| `payment_received` | boolean | No | default `false` |
| `call_at` | string (date-time) or null | No | default `null` |

Unknown body keys are rejected. `variables` defaults to `{}`. Keys must be among the [supported template variables](templates.md#variable-contract), with up to 30 keys and 10,000 characters per value. Omitted proof flags default to false. The schema accepts booleans with Pydantic's normal coercion; clients should send JSON booleans.

`call_booked` and `call_reminder_due` require timezone-aware `call_at`. Their date, time, and timezone variables derive from that timestamp and override caller values for those three fields. Reminder eligibility requires `now < call_at <= now + 24 hours`. Outside that window the service returns HTTP 409. `signed_and_paid` requires both proof flags true, otherwise HTTP 422. These flags are staff attestations, not verified third-party payment or signature events.

A call event body is:

```json
{
  "event":"call_booked",
  "call_at":"2027-03-01T10:30:00-08:00",
  "variables":{
    "Google Meet Link":"https://meet.google.com/example",
    "Reschedule Link":"https://example.org/reschedule"
  }
}
```

A contract/payment milestone body is:

```json
{"event":"signed_and_paid","contract_signed":true,"payment_received":true}
```

## Events and template selection

| Event | Template key | Sending policy | Required variables before rendering |
| --- | --- | --- | --- |
| `inquiry_created` | `inquiry_received` | `automatic` | `[Name]` |
| `missing_information` | `more_information_needed` | `approval_required` | `[Name]`, `[Presentation Details]`, `[Details Form Link]` |
| `approved_for_call` | `schedule_call` | `approval_required` | `[Name]`, `[Booking Link]` |
| `call_booked` | `meeting_confirmation` | `automatic` | `[Name]`, `[Requested Date]`, `[Time]`, `[Time Zone]`, `[Google Meet Link]`, `[Reschedule Link]` |
| `call_reminder_due` | `meeting_reminder` | `automatic` | `[Name]`, `[Requested Date]`, `[Time]`, `[Time Zone]`, `[Google Meet Link]` |
| `call_completed` | `conversation_follow_up` | `approval_required` | `[Name]`, `[Presentation Details]` |
| `contract_ready` | `contract_and_payment` | `approval_required` | `[Name]`, `[Contract Link]`, `[Deposit Amount]`, `[Payment Instructions]`, `[Due Date]` |
| `signed_and_paid` | `booking_confirmed` | `automatic` | `[Name]`, `[Requested Date]`, `[Location]` |
| `final_logistics_needed` | `final_logistics_request` | `automatic` | `[Name]`, `[Logistics Form Link]`, `[Due Date]` |
| `event_details_complete` | `final_confirmation` | `approval_required` | `[Name]`, `[Requested Date]`, `[Time]`, `[Time Zone]`, `[Location]`, `[Arrival Time]`, `[Parking Instructions]`, `[Changing Room Information]`, `[Day-of Contact]`, `[Calpulli Contact]`, `[Calpulli Phone]` |
| `presentation_completed` | `thank_you_feedback` | `automatic` | `[Name]`, `[Feedback Form Link]` |
| `balance_overdue` | `payment_reminder` | `approval_required` | `[Name]`, `[Balance Amount]`, `[Due Date]`, `[Payment Instructions]` |
| `inquiry_declined` | `decline_or_referral` | `approval_required` | `[Name]` |
| `special_situation` | `custom_follow_up` | `manual_only` | `[Name]`, `[Presentation Details]` |

Recipient email and template readiness are required in addition to the variables above. Placeholders present in template or staff-edited copy add required variables.

Creation and transitions to `new` map to `inquiry_created`; `declined` maps to `inquiry_declined`; `completed` maps to `presentation_completed`. Other inquiry states have no mapped event. Explicit events do not change inquiry state and are not restricted by the current state. Clients are responsible for recording the correct staff milestone.

Inquiry-derived defaults are `Name` from first/full name, `Organization`, `Event Description`, `Requested Date`, `Time`, `Time Zone`, and `Location`. Caller variables override them, except the three call timestamp variables. Other values such as links, balances, deposit amounts, and logistics require explicit staff input. The registry does not calculate money, create contracts, book meetings, or infer dates from external services.

## Draft input: DraftEdit

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `variables` | object with string values | No | max keys `30` |
| `subject` | string or null | No | min length `1`; max length `998`; default `null` |
| `body_text` | string or null | No | min length `1`; max length `30000`; default `null` |
| `recipient_email` | string or null | No | max length `320`; default `null` |
| `reply_to_id` | string (uuid) or null | No | default `null` |

Unknown body keys and variable names are rejected. Omitted variables default to `{}` and merge with stored variables. Existing variable keys are not removed by omission. Null subject, body, recipient, or reply target is treated as no replacement, not a request to clear it. An empty object is accepted and still resets approval.

Edits require an unattempted message in `DRAFT`, `PENDING_APPROVAL`, or `APPROVED`. Every edit clears approval and makes the message approval-required. Missing values leave it `DRAFT`; otherwise it becomes `PENDING_APPROVAL`.

```json
{
  "variables":{"Name":"Alex","Booking Link":"https://example.org/book"},
  "subject":"Schedule a conversation with Calpulli",
  "body_text":"Hello [Name],\nPlease choose a time: [Booking Link]."
}
```

Recipient replacements must pass the provider-compatible email shape check. `reply_to_id` selects a sent message from the same inquiry with a stored thread ID and the same recipient. The parent subject overrides the supplied subject. Later edits retain that subject for the reply. There is no supported API action to clear an established reply target.

## Action eligibility and side effects

| Action | Eligibility | Result |
| --- | --- | --- |
| `refresh` | No send attempts; draft, pending, or approved | Adopts current template source, clears approval, renders, and recalculates status |
| `approve` | Complete `PENDING_APPROVAL`; template ready | `APPROVED`, staff actor/time, timeline entry; no delivery |
| `cancel` | Not sent, sending, cancelled, or delivery-unknown | `CANCELLED`, related tasks resolved, timeline entry |
| `send` | Complete `APPROVED`; required approval recorded; template ready | Durable send claim, provider call, then `SENT` or handled `FAILED` |
| `retry` | `FAILED`, retryable, delivery known, fewer than three attempts; approval/readiness retained | Another send attempt and retry timeline entry |
| `send-again` | Original `SENT`; separate capability; no active or uncertain equivalent delivery | New approval-required draft; no immediate delivery |

`send` and `retry` on an already `SENT` record return that record without another provider call. Approval and cancellation are not generally repeatable: an ineligible repeated action returns HTTP 409.

The uniqueness key is inquiry ID + template key + triggering event. Repeating an event returns its original message without merging new variables or replacing edits. The event route still dispatches eligible automatic messages for the inquiry, so a replay can dispatch a previously prepared eligible message. Missing data creates a `DRAFT`, open staff task, and blocked timeline entry instead of sending. Resolving values requires editing or refreshing that existing draft, rather than replaying the event with different values.

Senders lock the inquiry and refresh message state before claiming delivery. A claim persists `SENDING` before contacting the provider. Concurrent equivalent deliveries, uncertain outcomes, and crashes left in `SENDING` block further sending. Known temporary failures allow explicit retries, with at most three attempts per message. There is no queue, scheduler, automatic retry job, or API reconciliation action. Send-again deliberately creates a new event identity and requires new approval.

## Standard output: EmailRead

Every key below appears in action responses, including nullable keys:

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `id` | string (uuid) | Yes | — |
| `inquiry_id` | string (uuid) | Yes | — |
| `presentation_id` | string (uuid) | Yes | — |
| `template_key` | string | Yes | — |
| `state_trigger` | string | Yes | — |
| `triggering_event` | string | Yes | — |
| `recipient_email` | string or null | Yes | — |
| `recipient_name` | string or null | Yes | — |
| `subject` | string | Yes | — |
| `body_text` | string | Yes | — |
| `body_html` | string | Yes | — |
| `variables` | object with string values | Yes | — |
| `missing_variables` | array of string | Yes | — |
| `status` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED` | Yes | — |
| `requires_approval` | boolean | Yes | — |
| `approved_by` | string or null | Yes | — |
| `approved_at` | string (date-time) or null | Yes | — |
| `sent_by` | string or null | Yes | — |
| `sent_at` | string (date-time) or null | Yes | — |
| `provider_message_id` | string or null | Yes | — |
| `provider_thread_id` | string or null | Yes | — |
| `error_code` | string or null | Yes | — |
| `error_message` | string or null | Yes | — |
| `retryable` | boolean | Yes | — |
| `delivery_unknown` | boolean | Yes | — |
| `attempts` | integer | Yes | — |
| `created_at` | string (date-time) | Yes | — |
| `updated_at` | string (date-time) | Yes | — |

A complete review draft response is:

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "inquiry_id": "11111111-1111-4111-8111-111111111111",
  "presentation_id": "11111111-1111-4111-8111-111111111111",
  "template_key": "schedule_call",
  "state_trigger": "approved_for_call",
  "triggering_event": "approved_for_call",
  "recipient_email": "alex@example.org",
  "recipient_name": "Alex Example",
  "subject": "Schedule a conversation with Calpulli",
  "body_text": "Hello Alex,\nChoose a time: https://example.org/book.",
  "body_html": "<p>Hello Alex,<br>\nChoose a time: https://example.org/book.</p>",
  "variables": {
    "Name": "Alex",
    "Booking Link": "https://example.org/book"
  },
  "missing_variables": [],
  "status": "PENDING_APPROVAL",
  "requires_approval": true,
  "approved_by": null,
  "approved_at": null,
  "sent_by": null,
  "sent_at": null,
  "provider_message_id": null,
  "provider_thread_id": null,
  "error_code": null,
  "error_message": null,
  "retryable": false,
  "delivery_unknown": false,
  "attempts": 0,
  "created_at": "2027-03-01T18:00:00Z",
  "updated_at": "2027-03-01T18:00:00Z"
}
```

`state_trigger` is the workflow event name, not an inquiry-state enum. Normal `triggering_event` equals that event name; send-again uses a server-generated `resend:<uuid>`. `presentation_id` equals `inquiry_id` in this application. The standard output does not expose the stored RFC Message-ID or resend-parent ID.

| Status | Meaning |
| --- | --- |
| `DRAFT` | Required data or template review is missing |
| `PENDING_APPROVAL` | Complete copy needs staff approval, including manual-only copy |
| `APPROVED` | Eligible automatic copy or staff-approved draft |
| `SENDING` | Durable send claim exists; completion may require reconciliation |
| `SENT` | Provider success persisted; mock IDs start with `mock-` |
| `FAILED` | Handled provider failure; retry flags determine eligibility |
| `CANCELLED` | Staff cancelled the message |

`requires_approval=false` does not mean a message has sent. Automatic drafts may have null `approved_by` and `approved_at`. Actors are shared `internal-staff` or `system`, not individual user IDs. `sent_by` is assigned when an attempt begins, so it can be non-null on a failed message. `sent_at` is set after provider success.

## Panel output

`GET /{inquiry_id}/emails` returns the following object. It only reads data and does not create recommendations, dispatch mail, or contact Gmail.

| Field | Value |
| --- | --- |
| `state` | Current inquiry state string |
| `recommended_email` | Template key from state mapping, or null |
| `reason` | State recommendation reason, or no-rule explanation |
| `events` | All registry entries with `event`, `template_key`, `sending_rule`, `reason` |
| `messages` | All inquiry email records, newest `created_at` first |
| `tasks` | Unresolved `TaskRead` objects; no specified ordering |

Each panel message contains all `EmailRead` keys plus `source_subject: string or null`, `source_body: string or null`, `reply_to_id: UUID or null`, and `reason: string`. Use source fields for editing and rendered fields for preview. Ties in message creation timestamps have no secondary sort.

The recommendation is derived from current state; it does not necessarily identify the newest event or draft. There is no pagination or total count for messages/tasks.

### Staff task output: TaskRead

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `id` | string (uuid) | Yes | — |
| `inquiry_id` | string (uuid) | Yes | — |
| `email_message_id` | string (uuid) | Yes | — |
| `code` | string | Yes | — |
| `summary` | string | Yes | — |
| `resolved` | boolean | Yes | — |
| `created_at` | string (date-time) | Yes | — |

Task codes are `missing_data` and `delivery_failure`. Tasks are created or reopened once per email/code. Repairing missing data resolves its missing-data task; a successful send or cancellation resolves related tasks. Tasks are visible through the panel rather than through a separate tasks API.

## Capability output

`GET /email-capabilities` returns `can_send_again: boolean` and `delivery_mode: string`. Missing, incorrect, or unconfigured resend credentials return `can_send_again=false` with HTTP 200, rather than HTTP 403. The separate `/send-again` action rejects those credentials with HTTP 403.

Delivery mode is one of these exact strings:

- `Mock delivery: no real email is sent`
- `Test delivery: mail is redirected to the test recipient`
- `Live Gmail delivery`

These values describe selected settings. They do not test credentials, mailbox health, or whether a test recipient is configured.

## Errors

Shared 401/503 authentication responses apply to every JSON route.

| Status | Condition |
| --- | --- |
| 403 | Send-again credential absent, invalid, or unconfigured |
| 404 | Inquiry, message within inquiry, reply target, or template not found where handled |
| 409 | Ineligible action, invalid recipient replacement, render conflict, reminder outside its window, duplicate/concurrent send, or uncertain delivery |
| 422 | Invalid UUID/event/body, unknown variable, field constraints, or missing call/payment evidence |
| 500 | Unhandled database/provider exception |

HTTP error details are sanitized to reason phrases. Domain-specific exception text is not returned. The panel supplies missing fields and persisted provider errors; some action refusals only expose a generic HTTP 409 envelope.

## Staff HTML route

`GET /staff/presentations/{inquiry_id}` returns HTTP 200 `text/html` for a valid UUID, outside `/api/v1`. It is public and contains no inquiry data. It returns the shell even when that inquiry does not exist; authenticated data retrieval then returns HTTP 404. Invalid UUIDs return HTTP 422.

The shell sets `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Runtime staff tokens remain in page memory. All client data and write actions use the protected JSON endpoints above. The shell is omitted from OpenAPI.

Verification: `backend/tests/test_email_workflow.py`, `test_gmail.py`, and the browser runner in `backend/tests/browser/`. See the [verification record](../VERIFICATION.md) for unavailable environment checks.
