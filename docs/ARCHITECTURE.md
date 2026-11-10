# Architecture

## Modular monolith

Calpulli Platform has one FastAPI application and one PostgreSQL database. Business capabilities live in modules in the same backend. This keeps transactions and deployment manageable while the organization establishes its workflows.

Microservices would add network failures, distributed transactions, and separate operations without an observed requirement. A module can move later if measured load or ownership makes that useful.

## Implemented ownership

| Path | Responsibility |
| --- | --- |
| `backend/app/main.py` | Application factory, lifespan, and shared error handling. |
| `backend/app/api/router.py` | Central `/api/v1` route registration. |
| `backend/app/core/` | Settings, structured logs, request correlation, errors, and internal token verification. |
| `backend/app/db/` | Typed declarative base, engine, and request sessions. |
| `backend/app/modules/health/` | Liveness and PostgreSQL readiness. |
| `backend/app/modules/presentations/` | Request models, schemas, services, and protected routes. |
| `backend/app/imports/legacy_presentations.py` | Historical CSV translation, dry-run analysis, and explicit import. |
| `backend/app/integrations/wix.py` | Prepared normalized Wix Automation receiver. |
| `backend/alembic/` | Versioned schema changes. |

## Data ownership

A presentation request stores its submitted contact details and organization name as a snapshot. This preserves historical meaning without guessing that two records with a shared mailbox represent the same person. Shared contact identity remains future work.

Import batches own provenance and import counts. Activities own creation, status, and note history. Missing legacy fields remain unknown. The new-submission boundary requires the current form's required values. The database can hold both shapes without forcing old rows through new-form validation.

The form's event date and venue belong to a requested presentation. They do not introduce the future Events module. Events will own cultural-event operations such as vendors, applications, participants, and logistics. Communications and Gmail threading remain unimplemented.

## Dependency boundaries

Routes parse HTTP inputs and translate expected service errors. Presentation services own persistence and transaction decisions. The module's SQLAlchemy models define its records. There is no generic repository framework or dependency container.

The Wix adapter validates its provider-facing contract and calls presentation services. Presentation services do not import Wix APIs. The historical adapter translates CSV cells without embedding legacy assumptions in new-form validation. Shared infrastructure stays independent of business rules.

## Runtime and access

The application uses synchronous SQLAlchemy. Synchronous routes run database work outside the event loop. The asynchronous Wix receiver limits and parses its body, then dispatches persistence to a worker thread. Sessions remain local to each request.

`INTERNAL_API_TOKEN` protects internal presentation routes. `WIX_WEBHOOK_TOKEN` separately protects the ingestion contract. Unset secrets disable their corresponding routes. These are bootstrap server credentials, not user identity, role-based access, or frontend authentication.

The migration enables RLS and removes browser-facing table grants. API authentication still matters when the database connection owns the tables. See [security](SECURITY.md) and [database conventions](DATABASE.md).

## Integration and deployment state

The normalized Wix contract is implemented locally. Real Automation payload validation, live delivery, retry behavior, and activation are pending a fictional **Preview request body** and a deployed HTTPS endpoint. Gmail OAuth, background processing, and external message clients are not implemented.

The Supabase target was reviewed and the presentation migrations and historical import were completed. Existing vendor tables remain outside this application's migration ownership. Hosting is a later step requiring explicit authorization. No Vercel deployment, production URL, or free-plan suitability is claimed.
