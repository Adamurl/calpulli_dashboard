# Phase 1 verification record

This record describes checks observed during initial implementation. It does not substitute for a successful locked CI run.

## Passed

- Compose and GitHub Actions YAML parsed successfully; Python syntax and local documentation links checked.
- Alembic offline upgrade SQL generated successfully for the empty baseline. This does not verify execution against PostgreSQL.
- Ruff lint and formatting, using preinstalled Ruff 0.15.21.
- API/configuration/error tests, using preinstalled Python 3.14.2 and compatible dependencies: 20 passed, one PostgreSQL integration test skipped.
- The unit suite exercises application lifespan startup/shutdown, liveness without PostgreSQL, unavailable readiness, request IDs, validation, safe unexpected errors, documentation settings, CORS defaults, and logging restrictions.

## Remaining acceptance checks

- Install uv and generate `backend/uv.lock`; verify `uv sync --locked` on Python 3.12. Package installation failed because shell network/DNS was unavailable; escalation requests are disabled by environment policy. No lockfile was fabricated.
- Run PostgreSQL integration tests and apply migrations to fresh PostgreSQL. Initial integration test failed with HTTP 503 because the configured database was unavailable. Local `initdb` could not resolve effective UID 501.
- Run `docker compose config --quiet`, build, start PostgreSQL/API, and verify health/readiness over HTTP. Docker is absent here.
- Observe GitHub Actions against the generated lockfile and live PostgreSQL. YAML parsing alone does not prove a workflow passes.
- Push the focused commit sequence to the public personal repository `Adamurl/calpulli_dashboard`. The workspace `.git` path is protected in this session, the CLI cannot connect, and the connected GitHub integration returned HTTP 403 for a write. A separate temporary checkout is used to prepare commits and a portable Git bundle without changing protected metadata.

The source contains no implemented business features or frontend. Phase 2 schema design remains gated on review of the actual Wix form.
