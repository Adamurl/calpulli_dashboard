# Health API

[Documentation index](../README.md)

[API overview](../API.md) · [OpenAPI snapshot](../api/openapi.json)

Source: `backend/app/modules/health/router.py`. These endpoints are public and accept no request body or query parameters.

| Method | Path | Success body | Database access |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | `{"status":"ok"}` | None |
| GET | `/api/v1/health/ready` | `{"status":"ready"}` | `SELECT 1` through a request-scoped session |

Both successful responses use HTTP 200 and `application/json`. The response contains only `status`. A failed readiness query returns HTTP 503 with code `database_unavailable` and message `Database unavailable`. Unexpected failures return the shared HTTP 500 envelope. Driver errors and credentials are not returned.

```http
GET /api/v1/health HTTP/1.1
Host: localhost:8000
X-Request-ID: 11111111-1111-4111-8111-111111111111
```

```json
{"status":"ok"}
```

Liveness does not establish that PostgreSQL, migrations, Gmail, OAuth, templates, or staff access are configured. Readiness establishes database connectivity only. It does not inspect the schema version or contact Google.

Verification: `backend/tests/test_health.py` covers liveness without PostgreSQL, safe database failure, request correlation, and optional PostgreSQL readiness.
