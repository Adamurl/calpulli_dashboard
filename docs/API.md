# API reference

## Versioning

Current application endpoints use `/api/v1`. A future incompatible public contract requires an explicit versioning decision. Internal refactors do not require a new API version.

## Success responses

Endpoints return typed JSON objects. Phase 1 has only health operations and no list or write endpoints.

| Method | Path | Success | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | `200`, `{"status":"ok"}` | Confirms that the application can respond without a database connection. |
| GET | `/api/v1/health/ready` | `200`, `{"status":"ready"}` | Confirms that PostgreSQL responds to a lightweight query. |

Readiness returns HTTP 503 when PostgreSQL is unavailable. Database failures do not reveal connection strings, credentials, or driver exception messages. Liveness remains independent of database readiness.

## Error responses

Application errors use this envelope:

```json
{
  "error": {
    "code": "database_unavailable",
    "message": "Database unavailable",
    "request_id": "4fba681d-70af-43c4-b477-98ebeeef4939"
  }
}
```

The code is machine-readable. The message is safe for clients. The request ID associates a response with application logs. Error messages and codes for each condition are defined in the implementation. Clients must use status and code instead of parsing message text.

HTTP 422 indicates invalid request input. HTTP 404 indicates an unknown route. Unexpected failures return HTTP 500 with a generic message. Validation responses do not echo submitted values. Stack traces and internal database errors are not part of the API contract.

## Request correlation

Responses include `X-Request-ID`. A valid UUID supplied through `X-Request-ID` is accepted. Invalid values are replaced with a generated UUID. Treat this identifier as diagnostic metadata, not authentication or proof of identity.

## Documentation and browser access

In development, Swagger UI is at `/docs` and the OpenAPI document is at `/openapi.json`. ReDoc is disabled. `DOCS_ENABLED` controls exposure explicitly. Outside development, documentation defaults to disabled.

`CORS_ORIGINS` is a JSON array of allowed origins and defaults to an empty array. Add only the exact browser origins needed by an authorized client. Phase 1 has no frontend.

## Planned pagination

Future list endpoints should use a consistent, documented pagination contract. The initial convention is a bounded `limit`, a nonnegative `offset`, deterministic ordering, and an `items` collection. Define defaults and maximum limits with the first real list endpoint. A total count is optional if its cost is justified. Consider cursor pagination when records change frequently or offsets become expensive.

Pagination is a planned convention. No pagination parameters or response models are implemented in Phase 1.
