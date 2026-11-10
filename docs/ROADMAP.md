# Roadmap

Only Phase 1 is authorized in the current foundation work. Later phases require explicit direction. The order below describes development dependencies, not permission to expose an unsecured application.

## Phase 1: Foundation

Create the repository, FastAPI application, PostgreSQL configuration, migration environment, Docker setup, tests, CI, and documentation. Establish restrictive CORS, safe errors, correlation IDs, secret exclusions, and isolated test configuration now.

Completion requires successful lint, formatting, tests, fresh-database migrations, and supported environment checks. Report any checks that cannot run. Docker configuration alone does not prove a container started, and a workflow file alone does not prove a GitHub Actions run passed.

## Phase 2: Presentations domain

Review the actual Wix presentation request form and sample submissions. Agree on required fields, statuses, transition rules, and coordinator workflows. Design the database schema after that review.

Implement contacts, presentation requests, status tracking, and activity history with migrations and tests. Keep development data separate from real personal records until access controls exist.

## Phase 3: Wix integration

Implement authenticated webhook ingestion, payload validation, idempotency, durable persistence, duplicate handling, and error recovery. Verify the real Automation payload and delivery behavior. Keep the public receiver's privileges limited to the operation it serves.

## Phase 4: Gmail integration

Connect the approved organizational mailbox. Implement OAuth, sending, reply ingestion, thread association, durable synchronization, and recovery from missed notifications. Protect tokens and define reconnect procedures.

## Phase 5: Internal security and production readiness

Implement and verify authentication, authorization, role policies, operational monitoring, backups, recovery, and deployment hardening. Security defaults begin in Phase 1. Any earlier deployment that handles real personal data requires the relevant access controls and operational protections before exposure.

## Future: Events module

Review workflows for Mexica New Year, Día de Muertos, vendors, applications, logistics, participants, and organizational coordination. Reuse shared contacts, communications, and authentication through documented boundaries. Define event-specific requirements before selecting schemas.

Future member management and task assignment remain outside the current implementation.
