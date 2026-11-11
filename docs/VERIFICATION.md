# Verification record

## Completed local checks

The current suite passed **61 tests**, with **five isolated PostgreSQL integration tests skipped**. Ruff lint and formatting passed across 40 Python files. These checks used preinstalled Python packages, not a locked installation. Local PostgreSQL initialization remains unavailable because `initdb` cannot resolve the process user.

Tests cover historical parsing and stable identities, strict new-form validation, protected routes, Wix normalization and safe errors, migration ownership, and PostgreSQL behavior when a separate test database is supplied. Independent review confirmed the historical identity-collision fix and found no additional issues in the final schema ownership, authentication, and import code review.

## Completed live Supabase work

On 2026-11-10, the authorized MCP operations targeted the verified **Calpulli Tonalehqueh** project. Existing presentation table names and Alembic history were absent before application.

- Applied the repository-generated schema SQL through Supabase migration history. Alembic revision is `0003`.
- Created `presentation_requests`, `presentation_import_batches`, and `presentation_activities`.
- Enabled RLS and revoked browser-role table privileges on those three tables and `alembic_version`. Live checks found no SELECT, INSERT, UPDATE, or DELETE privileges for `anon` or `authenticated`.
- Imported **883 historical requests**, **883 creation activities**, and **one import batch** from 896 CSV rows, skipping 13 blank rows. The source CSV remains private and unchanged.
- Compared every normalized field, source identity, source row number, and original JSON field of all 883 imported records against the source; all matched.
- Replayed the first import chunk and observed zero inserted requests and activities. Database source-identity uniqueness remains enforced.
- Confirmed one creation activity per imported request and `status=unknown` on all historical requests. Unknown event timezones remain NULL. Unsupported dates and guest counts retain their exact source text.
- Existing vendor tables retained their before/after counts: 148 vendors, 192 spots, 180 vendor-spot assignments, and three user-role records. None was modified by these migrations or imports.

The direct Python importer is an atomic whole-file operation. The authorized MCP import used resumable chunks of at most 40 records. Each SQL statement atomically inserted its requests and matching activities and updated counters. Final batch counters are 896 rows, 883 imported, and 13 skipped.

Alembic autogeneration now reflects only registered application tables. This prevents proposing removal of unrelated vendor tables in the shared project while retaining drift checks for owned columns and constraints.

## Existing project advisories

Before and after these changes, Supabase reported public and authenticated execution of the existing `is_admin` SECURITY DEFINER function and disabled leaked-password protection. These findings were not introduced or changed by this work:

- [Anonymous function execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- [Authenticated function execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- [Password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The four new RLS-without-policy informational notices are intentional. Browser access is disabled; the trusted backend uses its protected routes. No permissive policy was added to silence a notice.

## Remaining acceptance checks

- Generate and review `backend/uv.lock`, then verify locked dependency installation on Python 3.12. No lockfile was fabricated.
- Run the five PostgreSQL integration tests against a separate `_test` database, including fresh migrations and schema drift checks. Do not point the test suite at real application data.
- Run Docker Compose validation, build, startup, health, and readiness checks; Docker is unavailable in this environment.
- Observe GitHub Actions with the generated lockfile and test PostgreSQL.
- Review a fictional Wix request preview, verify typed field mapping and stable provider IDs, configure a hosted HTTPS endpoint, and test delivery before activation.
- Review hosting, database pool mode, secrets, and the selected plan before any deployment.

No Vercel deployment, Wix activation, Gmail integration, Events module, or frontend is part of this delivery. Local Git metadata writes and shell network access are restricted; the GitHub connector also returned HTTP 403 for repository writes during packaging. Prepared commits and a Git bundle preserve the work if publishing remains blocked.


## Email workflow local verification

The email workflow was implemented on `feature/presentations-history`, the existing presentations branch, rather than the foundation-only `main`. No remote code, production database, mailbox, Wix configuration, or credentials were changed.

Observed checks for this change:

- Ruff lint and formatting pass.
- The final pytest run reports **128 passed, 5 skipped** with `TEST_DATABASE_URL` unset. The skipped tests require PostgreSQL. This includes 67 workflow and Gmail adapter tests.
- Focused mypy inspection of the seven new email Python modules passes. Whole-app mypy reports six existing errors in the legacy importer and environment-loaded Settings construction. A clean archive of the branch baseline reproduces the same six errors. Mypy is not a configured CI dependency.
- Alembic offline upgrade SQL generation through 0004 passes. This does not prove migration execution or metadata parity on PostgreSQL.
- JavaScript syntax checks pass for the staff panel and browser runner.
- Fresh PostgreSQL execution is unavailable: local `initdb` cannot resolve effective user ID 501, including after escalation. No application or external database was used as a substitute.
- `uv sync --locked` is unavailable because uv is absent. A temporary uv installation attempt failed because package DNS resolution is unavailable. The branch still has no `backend/uv.lock`; locked CI and Docker builds remain blocked.
- Docker/Compose is unavailable because Docker is not installed.
- Browser execution was attempted. The Playwright connector reports its Chrome extension missing. Direct Playwright launch of local Chrome exits with SIGABRT, including after escalation. Computer use reports no available browser. The repeatable runner is `backend/tests/browser/email_workflow.mjs`; it has not passed in this environment.

Tests ran under the available Python 3.14 runtime. CI targets Python 3.12. Gmail provider tests mock all HTTP and do not send real mail. Workflow service tests use SQLite and do not verify PostgreSQL row locking or migration execution. Live Gmail OAuth and redirected delivery still require an authorized smoke test.
