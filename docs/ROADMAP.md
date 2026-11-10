# Roadmap

The user has authorized the Presentations data model, historical import support, protected backend routes, and a prepared Wix receiver. The authorized Supabase schema and historical import are complete. Hosting remains a later step. No future phase is implied by this scope.

## Phase 1: Foundation

Implemented the repository structure, FastAPI, typed settings, PostgreSQL configuration, Alembic baseline, JSON logs, request IDs, Docker development configuration, tests, CI configuration, and documentation.

Generated `uv.lock`, locked Python 3.12 installation, isolated PostgreSQL integration tests, Docker execution, and observed CI remain acceptance checks. See [verification](VERIFICATION.md).

## Phase 2: Presentations domain

Implemented a shared request schema for historical and new form submissions, import batches, activity history, protected list and detail routes, manual creation, and status or note updates. Historical missing fields remain nullable; originals are retained.

The local CSV dry run preserves 883 nonblank records from 896 rows and skips 13 blank rows. The authorized MCP import has created and verified all 883 retained records and matching creation activities; 13 blanks were skipped. All normalized and original fields match the source, RLS and browser grants were checked, and replaying a chunk added no duplicates. Shared contact deduplication remains a separate future design decision.

## Phase 3: Wix integration

A normalized **Choose fields** receiver is prepared with separate authentication, form verification, validation, payload limits, and submission idempotency.

Real payload preview review, checkbox and numeric mappings, hosted HTTPS delivery, retry testing, and automation activation remain pending. The native **All automation data** payload is not assumed to match the prepared contract.

## Phase 4: Gmail integration

Future work includes approved mailbox connection, OAuth, sending, replies, threading, synchronization, missed-notification recovery, and token protection. No Gmail client or worker exists.

## Phase 5: Internal security and production readiness

Replace bootstrap shared-token access with reviewed organizational identity and role policies before a multiuser frontend. Add operational monitoring, recovery tests, backup ownership, and deployment hardening. Apply the protections needed for personal data before any public hosting step.

## Future: Events module

Review cultural-event requirements for Mexica New Year, Día de Muertos, vendors, applications, participants, and logistics. Reuse shared capabilities only where actual ownership rules justify them. Presentation event details do not implement this module.

Frontend code, member management, and task assignment remain outside the current implementation.
