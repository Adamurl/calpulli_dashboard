# Product requirements

## Product vision

Calpulli Platform is a planned internal management system for Calpulli Tonalehqueh. It will bring presentation requests, communications, and cultural event coordination into one place.

Presentation inquiries currently need a consistent record of who requested a presentation, what they requested, and what happens next. The product should reduce lost inquiries and repeated data entry while preserving communication history.

## Intended users

- Presentation coordinators who review inquiries and arrange bookings.
- Organization leaders who need visibility into current requests and commitments.
- Event coordinators who organize Mexica New Year, Día de Muertos, and future cultural events.
- Authorized members who help with assigned organizational work.

Access policies and specific roles require organizational review before implementation.

## Implemented scope

Phase 1 provides the backend repository foundation. It includes FastAPI health endpoints, typed settings, PostgreSQL access, Alembic, structured logging, request IDs, Docker development configuration, tests, and CI configuration. The current authorized extension adds presentation request models, protected backend routes, import batches, activity history, and a prepared normalized Wix receiver. User accounts, Gmail clients, Events functionality, and frontend screens remain unimplemented. Presentation tables are live in the verified Supabase project and 883 historical requests have been imported and reconciled with the private source CSV.

Operational verification depends on the environment. The repository's final implementation report identifies checks actually executed.

## Presentations requirements

The module stores historical and current requests with status labels and activity history. The reviewed form screenshots define the new request fields. Historical answers remain nullable with their originals preserved. Coordinator assignment, proposal delivery, scheduling conflict rules, and full booking workflows remain planned.

Planned capabilities include:

- Capture client and organization contact details.
- Record presentation dates, locations, needs, and request context.
- Preserve activity and communication history.
- Track the coordinator responsible for a request.
- Receive Wix Forms submissions through authenticated webhooks.
- Send messages and associate replies with the correct request through Gmail threads.
- Provide an internal dashboard for request review and follow-up.

The initial field mapping is documented in [Presentation data reference](presentations/README.md). The actual fictional Wix payload preview must still be reviewed before connecting the automation.

## Planned Events requirements

Events will support Mexica New Year, Día de Muertos, and related cultural activities. Planned work includes vendors, applications, participants, logistics, and coordination tasks. Event requirements and workflows remain open. Events must reuse shared contacts, communications, and authentication where the domains require them.

## Planned shared capabilities

Shared capabilities include contacts, organization records, communication records, authentication, authorization, audit history, and operational reporting. Shared entities need one owning module and documented interfaces. Future member management and task assignments require separate product decisions.

## Presentations MVP

The planned MVP provides reviewed request fields, contact records, status transitions, activity history, reliable Wix ingestion, and Gmail correspondence. Internal access requires authentication and authorization before business records become accessible. The roadmap sequences development work and does not authorize exposure of personal data before security controls exist.

## Non-goals

The current scope excludes Gmail clients, Events functionality, background workers, frontend code, and production deployment. A prepared Wix receiver does not imply live integration or automation activation. The product does not currently target a public customer portal, payments, accounting, a general-purpose CRM, or independent microservices.

## Acceptance criteria

Phase 1 acceptance is measurable through repository checks:

- The API starts with valid configuration and rejects invalid configuration.
- Liveness returns HTTP 200 without connecting to PostgreSQL.
- Readiness returns HTTP 200 when PostgreSQL responds and HTTP 503 when it does not.
- Alembic upgrades a fresh PostgreSQL database to the committed head.
- Ruff lint, Ruff formatting, and pytest pass using the committed lockfile.
- Integration tests use a separate test database.
- Docker Compose defines a database health check, persistent volume, and API readiness dependency.
- No frontend, real secrets, Gmail clients, or Events tables exist. Presentation tables are defined through Alembic and require live migration verification.

Current domain acceptance requires nullable historical values, preserved originals, idempotent imports, strict new submissions, authenticated record access, status activity, and duplicate webhook protection. Planned MVP acceptance also requires linked email threads and individual user access policies. Response-time and follow-up targets require a baseline and agreement with coordinators.

## Future considerations

Define data retention, archival, bilingual needs, timezone handling, scheduling conflicts, and reporting requirements during domain discovery. Assess mailbox ownership, Google Workspace administrator policies, and event data access before integration work begins.
