# Wix presentation webhook API

[API overview](../API.md) · [Presentation input fields](api.md#create-input-newpresentation) · [Wix operational setup](../INTEGRATIONS.md)

Source: `backend/app/integrations/wix.py`.

## Endpoint and authentication

`POST /api/v1/integrations/wix/presentations` accepts the normalized Choose fields payload. It does not accept arbitrary native Wix form payloads.

Authentication is `data.webhook_token`, matched against server setting `WIX_WEBHOOK_TOKEN`. `data.form_id` must match `WIX_FORM_ID`. Both settings must be configured, otherwise the endpoint returns HTTP 503 before processing the body. The internal bearer token is not used for this route.

The receiver reads at most 65,536 bytes, including the envelope, secret, and JSON encoding. It parses the body as JSON. The code does not enforce a Content-Type header, though clients should send `application/json`. Secrets belong in the HTTPS body, never in a URL. The secret is removed before schema validation and persistence.

## Input envelope

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `data` | object | Yes | Contains the fields below |
| `data.webhook_token` | string | Yes | Exact match to configured webhook credential |
| `data.form_id` | string | Yes | Length 1–200; must match configured form ID |
| `data.submission_id` | string | Yes | Length 1–200; stable source submission identity |
| `data.<NewPresentation field>` | As defined in presentation input | Same requirements as manual creation | All form validators apply |

Unknown fields inside `data` are rejected after the credential is removed. Extra top-level envelope keys are ignored. Form and submission IDs inherit string trimming from the model. The webhook credential is compared before field trimming and must match exactly.

A complete synthetic body is:

```json
{
  "data":{
    "webhook_token":"<WIX_WEBHOOK_TOKEN>",
    "form_id":"fictional-form-id",
    "submission_id":"fictional-submission-001",
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
}
```

`WixFields` is included in the [schema catalog](../api/schema-catalog.json). The streaming webhook route has no declared OpenAPI body model, so the OpenAPI snapshot alone does not describe this envelope.

## Outputs and idempotency

| Situation | HTTP status | JSON body |
| --- | --- | --- |
| First accepted submission | 201 | `{"id":"11111111-1111-4111-8111-111111111111","status":"created"}` |
| Identical normalized submission replay | 200 | Same ID, `status=duplicate` |
| Same source identity with different normalized form answers | 409 | Shared error envelope |

The uniqueness key is source `wix` + form ID + submission ID. A replay compares the normalized new-form snapshot. Identical retries create no second inquiry, creation activity, or workflow message. Different submission IDs represent different inquiries even if answers match. The source metadata and credential are not part of `original_fields`; that field contains the normalized form answers.

A first submission creates a new presentation request and recommends `inquiry_received` atomically. Eligible automatic email dispatch then runs synchronously during the request. A duplicate delivery does not call that dispatch step. A webhook success response acknowledges inquiry persistence, not client email delivery. Inspect the [email API](../email/api.md) for message status.

## Errors and retry implications

| HTTP status | Condition | Error code |
| --- | --- | --- |
| 400 | Malformed or undecodable JSON | `http_400` |
| 401 | Missing, non-string, or incorrect body credential | `http_401` |
| 403 | Form ID differs from configured form | `http_403` |
| 409 | Reused submission identity with different normalized content | `http_409` |
| 413 | Body exceeds 65,536 bytes | `http_413` |
| 422 | Missing data object, invalid form fields, or unknown data key | `http_422` |
| 503 | Missing webhook settings | `http_503` |
| 503 | SQLAlchemy failure during initial persistence | `database_unavailable` |
| 500 | Unhandled error, including a database error in post-commit dispatch | `internal_error` |

These webhook validation failures use `http_422`, unlike FastAPI request-model failures on presentation/email routes, which use `validation_error`. Messages use the shared safe reason phrase rather than detailed validation output.

Retries must reuse the same form/submission identity. A response can fail after the inquiry commits; a retry then returns the duplicate acknowledgement. That duplicate acknowledgement does not resume a pending email send. There is no background worker or webhook retry scheduler in this application.

Verification: `backend/tests/test_wix_webhook.py` and presentation database replay tests. Normalized contract tests do not establish that the real Wix Automation uses this mapping; live preview/delivery still require review.
