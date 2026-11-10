# Architecture

## Modular monolith

Calpulli Platform uses one FastAPI application, one deployable backend, and PostgreSQL. Business capabilities will live in separate Python modules within the same application. This keeps transactions, development, and deployment manageable for the initial internal platform.

Microservices would add network failures, distributed transactions, separate deployments, and more operational work before the project has an established need for them. A module can become a separate service later if measured load or ownership requires that change.

## Current application layout

- `backend/app/main.py` owns application construction and lifespan.
- `backend/app/api/router.py` assembles versioned routes.
- `backend/app/core/` owns settings, logging, and common HTTP behavior.
- `backend/app/db/` owns SQLAlchemy metadata, engine configuration, and session dependencies.
- `backend/app/modules/health/` owns liveness and database readiness routes.
- `backend/alembic/` owns schema history.
- `backend/tests/` owns application and database checks.

Only the health module exists in Phase 1. There are no placeholder business modules.

## Planned module ownership

| Module | Intended responsibility |
| --- | --- |
| Presentations | Presentation requests, request statuses, proposals, bookings, and activity history. |
| Events | Cultural events, vendors, applications, participants, and logistics. |
| Contacts | Shared person and organization identity and contact details. |
| Communications | Messages, thread associations, delivery state, and communication history. |
| Authentication | User identity and access decisions, with roles defined through organizational review. |
| Integrations | Provider-specific adapters and external payload translation. |

These names describe planned boundaries. They are not implemented packages or finalized schemas.

## Dependency boundaries

Routes validate HTTP input and call the module that owns the operation. Add a service or repository abstraction only when behavior justifies it. Business rules must not import Wix or Gmail clients. Integration adapters translate provider payloads into internal operations through explicit interfaces.

Modules should use another module's public functions rather than reaching into its routes or changing its tables directly. Shared infrastructure must remain independent of business modules. Avoid a generic shared module that accumulates unrelated business rules.

## Database approach

The application uses SQLAlchemy 2.x typed ORM patterns and synchronous sessions with psycopg 3. Synchronous route functions allow FastAPI to run database operations outside the event loop. Alembic owns all schema changes. Application startup does not create tables.

The engine belongs to the application lifecycle and releases pooled connections on shutdown. Each dependency-managed session closes at the end of its request. Future write operations own an explicit transaction and commit only after the whole operation succeeds.

## API conventions

The central router exposes `/api/v1`. Success payloads use endpoint-specific Pydantic response models. Errors share an envelope with a stable code, safe message, and request ID. The API returns a correlation ID in `X-Request-ID`.

CORS denies cross-origin access by default. Interactive documentation is available by default only in development. Settings control production documentation exposure.

## Planned integrations and background work

Wix ingestion will validate and authenticate submissions before recording them. Gmail operations will associate messages through provider IDs and internal records. Durable processing, retries, and reconciliation belong in future integration phases. No queue or worker framework is selected in Phase 1.

See [Integration requirements](INTEGRATIONS.md) for delivery and recovery expectations and [Database conventions](DATABASE.md) for model registration.
