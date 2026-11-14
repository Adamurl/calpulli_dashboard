# Email template API

[API overview](../API.md) · [Email workflow API](api.md) · [Template editing guide](README.md#temporary-templates-and-staff-page)

Source: `backend/app/modules/presentations/email_router.py`, `email_schemas.py`, and `email_registry.py`. All operations require the Supabase user JWT and staff approval.

| Method | Path | Request | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/presentations/email-templates` | No body or query parameters | 200, array of `TemplateRead` |
| PUT | `/api/v1/presentations/email-templates/{key}` | Template key plus `TemplateEdit` | 200, updated `TemplateRead` |
| GET | `/api/v1/presentations/email-template-variables` | No body or query parameters | 200, supported variables, auto-populated variables, staff-provided variables, and workflow trigger metadata |

The list is unpaginated and sorted by key. PUT updates an existing key; it does not create arbitrary templates. The seventeen seeded keys are in the [workflow registry table](api.md#events-and-template-selection). Migration 0006 updates default copy only when staff have not edited a template (`updated_by` is null); new templates are inserted disabled.

The variable catalog returns `available`, `auto_populated`, and `staff_provided` names, plus each workflow's event, template key, sending rule, reason, and required variables.

## PUT input: TemplateEdit

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `subject` | string | Yes | min length `1`; max length `998` |
| `body_text` | string | Yes | min length `1`; max length `30000` |
| `ready_for_use` | boolean | No | default `false` |

Both subject and body are required on every PUT. Omitting `ready_for_use` resets it to false. This is replacement behavior, not a patch. Unknown keys are rejected.

The subject cannot contain CR, LF, or NUL. Recognized variable placeholders use exact case and spacing, such as `[Name]`. Unknown bracketed variable names fail validation. Text is not automatically trimmed by this model. There is no caller-supplied HTML body; HTML is derived by escaping rendered text and converting line breaks.

```json
{
  "subject":"We received your inquiry, [Name]",
  "body_text":"Hello [Name],\n\nThank you for contacting Calpulli Tonalehqueh.",
  "ready_for_use":false
}
```

This example is reference copy. Setting readiness is an explicit staff review decision.

## Output: TemplateRead

| Field | JSON value | Required key | Constraints or default |
| --- | --- | --- | --- |
| `subject` | string | Yes | min length `1`; max length `998` |
| `body_text` | string | Yes | min length `1`; max length `30000` |
| `ready_for_use` | boolean | No | default `false` |
| `key` | string | Yes | — |
| `updated_by` | string or null | Yes | — |
| `updated_at` | string (date-time) | Yes | — |

`updated_by` becomes `internal-staff` after an API edit. Its value does not identify an individual coordinator. `updated_at` is a server timestamp.

## Variable contract

Supported variable names are:

`[Alternate Date]`, `[Arrival Time]`, `[Balance Amount]`, `[Booking Link]`, `[Calpulli Contact]`, `[Calpulli Phone]`, `[Changing Room Information]`, `[Contract Link]`, `[Day-of Contact]`, `[Deposit Amount]`, `[Details Form Link]`, `[Due Date]`, `[Event Description]`, `[Event Name]`, `[Feedback Form Link]`, `[Google Meet Link]`, `[Invoice Number]`, `[Location]`, `[Logistics Form Link]`, `[Name]`, `[Optional Explanation]`, `[Organization]`, `[Parking Instructions]`, `[Payment Instructions]`, `[Phone Details]`, `[Presentation Details]`, `[Proposed Options]`, `[Quote and Contract Links]`, `[Quoted Amount]`, `[Requested Date]`, `[Reschedule Link]`, `[Time]`, `[Time Zone]`.

Required values are the union of the rule's required variables and placeholders found in the selected subject/body. A recognized variable does not have to be available when saving the template. Availability is checked when a draft is prepared or rendered. Empty or whitespace-only values are missing. Each event or draft variable value permits up to 10,000 characters.

Rendered subjects must be a single line of at most 998 characters. Placeholder values are substituted once. HTML escapes client values. Bracket-like content that remains in a rendered email can block sending as an unrendered variable.

Template readiness is separate from message approval. A ready template does not approve an approval-required message. A non-ready template blocks preparation/sending and creates a staff task. All temporary seeded templates begin non-ready.

The live Templates table displays each template’s sending policy and active status. The editor saves the subject, body, and Active setting. Activating a template registered as `automatic` enables its existing automatic event path. Staff-created manual drafts always require approval and collect variables referenced by their selected copy.

Existing drafts keep their source copy when a template changes. Template updates do not re-render, approve, or send existing messages. The draft `/refresh` action explicitly adopts current copy, resets approval, and recalculates eligibility. Staff edits to an automatic draft make it approval-required.

## Errors and limitations

| Status | Condition |
| --- | --- |
| 404 | The template key does not exist |
| 422 | Missing subject/body, unknown body key or variable, invalid subject, or length violation |
| 500 | Unhandled database error |

The shared 401/503 authentication responses also apply. There is no template version history, delete operation, custom-key creation, or optimistic concurrency version field. Concurrent template updates use the last committed write. Existing drafts retain their own source copy.

Verification: `backend/tests/test_email_workflow.py` covers template editing, readiness, rendering, HTML escaping, unknown variables, and approval reset behavior.
