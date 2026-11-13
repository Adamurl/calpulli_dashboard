# Backend API reference

This reference describes the implemented backend in this checkout. It does not establish that the routes are deployed or that Gmail/Wix is activated. JSON routes use `/api/v1`; the staff HTML page uses `/staff/presentations/{inquiry_id}`.

## Feature references

Each feature reference defines its inputs, outputs, validation, side effects, errors, and implementation limits.

| Feature | Technical reference | Operational or domain guide |
| --- | --- | --- |
| Health and database readiness | [Health API](health/README.md) | [Verification](VERIFICATION.md) |
| Presentation inquiry creation, listing, detail, and status/note updates | [Presentations API](presentations/api.md) | [Presentation data](presentations/README.md) |
| Presentation timeline and email activity | [Activity API](presentations/activity.md) | [Email workflow](email/README.md) |
| Email recommendations, drafts, approvals, sends, retries, tasks, and staff panel | [Email workflow API](email/api.md) | [Email setup and staff guide](email/README.md) |
| Reference templates and copy readiness | [Email template API](email/templates.md) | [Template editing](email/README.md#temporary-templates-and-staff-page) |
| Gmail and mock delivery boundary | [Gmail provider interface](email/gmail-provider.md) | [Gmail setup](email/README.md#gmail-setup) |
| Normalized Wix presentation ingestion | [Wix webhook API](presentations/wix-webhook.md) | [Integration setup](INTEGRATIONS.md) |
| Historical CSV parsing and import | [Import CLI and Python interface](presentations/legacy-import.md) | [Historical field mapping](presentations/README.md#historical-field-mapping) |

Historical import and Gmail delivery are internal interfaces, not additional public HTTP endpoints. There is no general CSV upload, provider-send, incoming-reply, or staff-task mutation endpoint.

## Authentication

Presentation, activity, email, template, and capability routes require:

```http
Authorization: Bearer <SUPABASE_USER_ACCESS_TOKEN>
```

The server validates the access token through the configured Supabase Auth `/auth/v1/user` endpoint, rejects anonymous identities, and checks the verified user UUID against `STAFF_USER_IDS`. Missing configuration or an Auth service outage returns HTTP 503. Missing or invalid credentials return HTTP 401 with `WWW-Authenticate: Bearer`; a valid user outside the staff allowlist receives HTTP 403. An empty allowlist grants nobody access. The former shared internal token is no longer accepted.

`GET /api/v1/auth/me` uses the same staff authorization and returns `{ "id": "<user UUID>" }` with `Cache-Control: no-store`. Business responses also disable caching. The frontend calls this route before opening a logged-in workspace. [Setup instructions](../README.md#supabase-staff-authentication) describe the required environment variables.

`/send-again` additionally requires:

```http
X-Email-Resend-Token: <EMAIL_SEND_AGAIN_TOKEN>
```

Missing, invalid, or unconfigured send-again access returns HTTP 403 on that action. The capabilities endpoint instead returns `can_send_again=false`.

Health endpoints and the empty staff HTML shell are public in FastAPI. The Wix webhook uses its own `data.webhook_token` and configured form ID rather than a user JWT. The Vercel rewrites expose `/api/...` but do not expose the staff HTML shell. Gmail OAuth secrets remain server-only and are never API-client inputs.

## Endpoint index

The current application has 25 JSON operations. `{request_id}` and `{inquiry_id}` both identify a presentation request. `{message_id}` identifies a stored email scoped to that inquiry. All three are UUID strings.

| Method | Path | Successful response | Reference |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | 200, health object | [Health](health/README.md) |
| GET | `/api/v1/health/ready` | 200, readiness object | [Health](health/README.md) |
| GET | `/api/v1/presentations` | 200, paginated summaries | [Presentations](presentations/api.md) |
| GET | `/api/v1/presentations/index` | 200, receipt-sorted page and total counts | [Presentation index](presentations/api.md#presentation-index-and-statistics) |
| GET | `/api/v1/presentations/statistics` | 200, bounded receipt-date statistics | [Statistics](presentations/api.md#presentation-index-and-statistics) |
| POST | `/api/v1/presentations` | 201, presentation detail | [Presentations](presentations/api.md) |
| GET | `/api/v1/presentations/{request_id}` | 200, presentation detail | [Presentations](presentations/api.md) |
| PATCH | `/api/v1/presentations/{request_id}` | 200, presentation detail | [Presentations](presentations/api.md) |
| PATCH | `/api/v1/presentations/{request_id}/workspace` | 200, presentation detail without email side effects | [Presentations](presentations/api.md#dashboard-edits) |
| GET | `/api/v1/presentations/{request_id}/operations` | 200, historical operations | [Presentations](presentations/api.md) |
| GET | `/api/v1/presentations/{request_id}/activities` | 200, paginated activities | [Activity](presentations/activity.md) |
| GET | `/api/v1/presentations/email-capabilities` | 200, capability object | [Emails](email/api.md#capability-output) |
| GET | `/api/v1/presentations/email-templates` | 200, template array | [Templates](email/templates.md) |
| PUT | `/api/v1/presentations/email-templates/{key}` | 200, updated template | [Templates](email/templates.md) |
| GET | `/api/v1/presentations/{inquiry_id}/emails` | 200, panel object | [Emails](email/api.md#panel-output) |
| POST | `/api/v1/presentations/{inquiry_id}/email-events` | 200, email record | [Emails](email/api.md#event-input-eventinput) |
| PATCH | `/api/v1/presentations/{inquiry_id}/emails/{message_id}` | 200, email record | [Emails](email/api.md#draft-input-draftedit) |
| POST | `/api/v1/presentations/{inquiry_id}/emails/{message_id}/refresh` | 200, email record | [Emails](email/api.md#action-eligibility-and-side-effects) |
| POST | `/api/v1/presentations/{inquiry_id}/emails/{message_id}/approve` | 200, email record | [Emails](email/api.md#action-eligibility-and-side-effects) |
| POST | `/api/v1/presentations/{inquiry_id}/emails/{message_id}/cancel` | 200, email record | [Emails](email/api.md#action-eligibility-and-side-effects) |
| POST | `/api/v1/presentations/{inquiry_id}/emails/{message_id}/send` | 200, email record, possibly FAILED | [Emails](email/api.md#action-eligibility-and-side-effects) |
| POST | `/api/v1/presentations/{inquiry_id}/emails/{message_id}/retry` | 200, email record, possibly FAILED | [Emails](email/api.md#action-eligibility-and-side-effects) |
| POST | `/api/v1/presentations/{inquiry_id}/emails/{message_id}/send-again` | 200, new review draft | [Emails](email/api.md#action-eligibility-and-side-effects) |
| POST | `/api/v1/integrations/wix/presentations` | 201 created or 200 duplicate | [Wix](presentations/wix-webhook.md) |

`GET /staff/presentations/{inquiry_id}` serves the [staff HTML shell](email/api.md#staff-html-route). It is excluded from OpenAPI and is not counted among JSON operations.

## Input and output conventions

JSON request models reject unknown body fields. The Wix envelope has separate handling described in its reference. No-body actions require no JSON body. Unused query parameters are not generally rejected by FastAPI.

IDs serialize as UUID strings, dates as ISO dates, times as ISO time strings, and timestamps as ISO date-time strings. Nullable output fields are returned as null rather than omitted. An optional request key and a nullable response value are different contracts; the feature tables specify both.

Presentation and activity lists use `items`, `limit`, and `offset`, with default limit 25, maximum 100, and nonnegative offset. There is no total count. Other list responses, including template arrays and the email panel, are currently unpaginated.

Presentation writes can persist before synchronous email dispatch finishes. A successful presentation response is not a mail-delivery acknowledgement. Handled provider failures appear in email records. Retrying manual presentation creation can create a duplicate inquiry; only the Wix and workflow-event interfaces have their documented source/event idempotency keys.

## Error responses

Application errors use this envelope:

```json
{
  "error":{
    "code":"validation_error",
    "message":"Invalid request",
    "request_id":"11111111-1111-4111-8111-111111111111"
  }
}
```

All three fields are strings. `request_id` matches the response's correlation header. Validation responses do not return rejected field values or detailed Pydantic errors.

| Condition | HTTP status | Code | Message |
| --- | --- | --- | --- |
| FastAPI request-model, path, or query validation | 422 | `validation_error` | `Invalid request` |
| Other handled HTTP errors | Corresponding status | `http_<status>` | Standard HTTP reason phrase, such as `Conflict` |
| Handled exception with 503 and detail exactly `Database unavailable` | 503 | `database_unavailable` | `Database unavailable` |
| Unexpected exception before response begins | 500 | `internal_error` | `Internal server error` |

Wix manually validates streamed input, so its validation failures use `http_422`. Disabled route configuration uses `http_503`, not `database_unavailable`. Unhandled database failures elsewhere can return HTTP 500. Feature-specific error tables describe those boundaries.

Domain exception details are sanitized. Clients use status, code, persisted workflow status, and panel data rather than matching internal error text. A provider failure stored as email status `FAILED` is a workflow result and can have HTTP 200.

## Correlation and browser access

Responses include `X-Request-ID`. A valid supplied UUID is accepted and normalized; an invalid or missing value is replaced. This identifier is diagnostic metadata, not identity or authorization.

`CORS_ORIGINS` defaults to `[]` and accepts explicit HTTP(S) origins. Current CORS permits GET, allows Content-Type and X-Request-ID headers, exposes X-Request-ID, and disables credentialed CORS. Authorization and resend headers are not allowlisted. Protected cross-origin browser clients are therefore not supported by the current settings. The staff page calls the API from the same origin.

## Machine-readable schemas and documentation exposure

- [OpenAPI snapshot](api/openapi.json) is generated from `create_app(...).openapi()` without starting the application or connecting to a database.
- [Schema catalog](api/schema-catalog.json) contains Pydantic request and serialized response schemas, including models not declared in OpenAPI routes.
- [Schema generation and limitations](api/README.md) gives regeneration commands and identifies missing automatic declarations.

Swagger UI is `/docs` and runtime OpenAPI is `/openapi.json` when enabled. Documentation defaults to enabled in development only; `DOCS_ENABLED` overrides it. ReDoc is disabled. The public JSON API version prefix remains `/api/v1`.

Generated schemas do not describe every runtime validator, authorization error, workflow refusal, or delivery outcome. The streaming Wix body and dynamic email panel/capability outputs require the feature references. The snapshot is the code's declaration, not proof of deployment or exhaustive runtime behavior.
