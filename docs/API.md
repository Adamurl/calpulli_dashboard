# API reference

## Versioning and documentation

Application routes use `/api/v1`. Swagger UI is at `/docs` and the OpenAPI schema is at `/openapi.json` when documentation is enabled. Documentation defaults to enabled only in development. `DOCS_ENABLED` overrides that setting. ReDoc is disabled.

## Health

| Method | Path | Success |
| --- | --- | --- |
| GET | `/api/v1/health` | HTTP 200 with `{"status":"ok"}` without connecting to PostgreSQL. |
| GET | `/api/v1/health/ready` | HTTP 200 with `{"status":"ready"}` after a lightweight PostgreSQL query. |

Readiness returns HTTP 503 when the database is unavailable. It never returns connection strings or driver exception messages.

## Presentation routes

All presentation routes require `Authorization: Bearer <INTERNAL_API_TOKEN>`. An unset token disables the routes with HTTP 503. An absent or incorrect credential returns HTTP 401. This is a bootstrap internal credential, not individual user login or role-based authorization.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/v1/presentations` | Paginated summaries, including historical records with nullable fields. |
| POST | `/api/v1/presentations` | Validate a complete new form and create a manual request, HTTP 201. |
| GET | `/api/v1/presentations/{id}` | Detail including original fields and internal notes; HTTP 404 when absent. |
| PATCH | `/api/v1/presentations/{id}` | Change status or internal notes and record activity. |
| GET | `/api/v1/presentations/{id}/activities` | Paginated request activity. |

List parameters are `limit` with default 25 and maximum 100, and nonnegative `offset` with default 0. Requests also accept `source` and `status` filters. Sources are `legacy_csv`, `manual`, and `wix`. Request ordering is descending creation time, then descending UUID. Activity ordering follows the same rule. Responses contain `items`, `limit`, and `offset`; there is no total count.

Summary responses omit `original_fields` and `internal_notes`. Detail responses contain historical originals only after authentication. [Presentation data reference](PRESENTATIONS.md) defines fields, validation, and status values.

A status change includes the current value to detect a concurrent update:

```json
{
  "status": "reviewing",
  "expected_current_status": "new"
}
```

A stale value returns HTTP 409. A note patch supplies nonblank `internal_notes`. There is no delete route or general request-answer editing route.

## Wix receiver

`POST /api/v1/integrations/wix/presentations` accepts the explicit normalized **Choose fields** contract in [Wix setup](INTEGRATIONS.md). It uses a separate body secret and checks the configured form ID. An unset secret or form ID disables the receiver with HTTP 503.

Successful first ingestion returns HTTP 201 with `{"id":"<uuid>","status":"created"}`. An identical retry returns HTTP 200 with `status=duplicate`. Reusing a form and submission ID with different normalized content returns HTTP 409. Payloads larger than 64 KiB return HTTP 413. The real Wix preview and live delivery remain unverified.

## Error responses

Errors use this envelope:

```json
{
  "error": {
    "code": "database_unavailable",
    "message": "Database unavailable",
    "request_id": "4fba681d-70af-43c4-b477-98ebeeef4939"
  }
}
```

Other HTTP errors use codes such as `http_401`, `http_404`, `http_409`, or `http_503`. Request validation uses `validation_error`; malformed webhook payloads use their HTTP error code. Unexpected failures use `internal_error`. Disabled authentication or webhook settings are service-unavailable conditions, not a database failure.

Messages are safe for clients. Validation responses do not echo submitted values. Clients use status and code rather than parsing message text.

## Correlation and CORS

Responses include `X-Request-ID`. Valid client-supplied UUIDs are accepted; other values are replaced. A request ID is diagnostic metadata, not identity or authentication.

`CORS_ORIGINS` defaults to `[]` and accepts exact HTTP(S) origins. The current CORS methods allow GET only. No frontend exists. Review CORS and user authentication before adding a browser client; never embed the bootstrap API token in public frontend code.
