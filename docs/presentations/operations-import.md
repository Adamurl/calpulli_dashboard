# Historical operational data

Implemented locally. Migration `0005` adds `presentation_operations` and `presentation_import_rows`. The authorized Supabase connector applied Alembic-generated revisions `0004` and `0005` on November 11, 2026 and verified the live project at revision `0005`. The local backend cannot resolve the project's database or Auth host, so its database password and password sign-in remain unverified. Connector access does not verify the backend's saved database credentials.

## Local configuration and target

The authorized project is `siaxqqewpiowfrxfdpkl`. Credentials are in ignored `backend/.env`, copied from `backend/.env.example`. Other chats working in this checkout can read that local file without receiving the password in chat. Do not copy it into tracked files, logs, screenshots, or the frontend.

The URL uses `postgresql+psycopg`, port 5432, and `sslmode=require`. Percent-encode password characters, such as `#` as `%23`, `@` as `%40`, and `%` as `%25`. The required credential is the project's database password, not an API key or Supabase account password.

The migration/import helpers read that explicit local file rather than inheriting a potentially unrelated shell `DATABASE_URL`. They verify the named project and reject connection query overrides. Direct connections and session poolers on port 5432 are supported. If direct IPv6 connectivity is unavailable, copy the project's Session pooler connection from Supabase Connect, retain the `postgresql+psycopg` scheme, and append `?sslmode=require`.

From `backend/`, after PostgreSQL integration checks pass against a dedicated `_test` database:

```bash
.venv/bin/python -m app.db.supabase_migrate --project-ref siaxqqewpiowfrxfdpkl
.venv/bin/python -m app.db.supabase_migrate --project-ref siaxqqewpiowfrxfdpkl --check
```

These commands apply/check the application's migrations. They do not import CSVs. RLS is enabled and privileges are revoked from PUBLIC, anon, and authenticated on both new tables. No browser policies are created.

The backend's protected APIs require a verified Supabase user JWT and membership in `STAFF_USER_IDS`. See [staff authentication setup](../../README.md#supabase-staff-authentication). Signing in does not grant direct browser access to private tables.

## Check connectivity without migrating

From `backend/`, start the API using the ignored local `.env`:

```bash
.venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --no-access-log
```

In another terminal, run these read-only checks:

```bash
curl --fail-with-body http://127.0.0.1:8000/api/v1/health
curl --fail-with-body http://127.0.0.1:8000/api/v1/health/ready
```

Liveness returns HTTP 200 with `{"status":"ok"}` without connecting to PostgreSQL. Readiness executes `SELECT 1` using the backend's configured credentials. HTTP 200 with `{"status":"ready"}` confirms connectivity; HTTP 503 means the database is unavailable. Neither endpoint migrates or imports data, and readiness does not verify schema compatibility.

With development documentation enabled, open [Swagger UI](http://127.0.0.1:8000/docs). The runtime schema is [OpenAPI](http://127.0.0.1:8000/openapi.json). Configure the Supabase Auth settings and staff UUID allowlist in ignored `backend/.env` and restart before testing protected routes. In Swagger, select **Authorize** and enter a current approved staff user access token, then use `GET /api/v1/presentations` for a read-only API test. Missing Auth configuration returns HTTP 503, invalid credentials return 401, and nonstaff users receive 403. Do not use a database password, user password, or project API key as the bearer token.

The official [FastAPI testing guide](https://fastapi.tiangolo.com/tutorial/testing/) describes `TestClient`; [testing lifespan](https://fastapi.tiangolo.com/advanced/testing-events/) explains why these tests use a context manager. Local references are [Health API](../health/README.md) and [Backend API overview](../API.md).

## Supabase users and roles

The live project already contains `auth.users` and `public.user_roles`. Do not recreate them to repair a login. `user_roles.user_id` references `auth.users.id`, and its current role constraint permits `admin`. Preserve an existing account's ID when updating its profile or role.

Create genuinely missing accounts through the Supabase Auth admin API or dashboard, which manages password hashing and identities. The [Auth admin create-user reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser) requires server-side administrative credentials. Keep these credentials out of the frontend. Never store plaintext passwords in a profile or roles table.

The current frontend checks for a Supabase session and displays preview data. It does not check `user_roles`, and the backend does not accept Supabase access tokens. An admin row therefore does not enable private FastAPI access. Supabase login, database connectivity, and backend API authorization need separate verification.

## Data model

`presentation_operations` holds one row per request: quoted and recorded-received amounts, currency where known, finder name, payment status/basis/method, engagement type/basis, invoice/COI status, attendance/roster counts, operational notes, and primary import evidence.

`presentation_import_rows` preserves ordered source headers and cells, digest, record number, normalized proposal, candidate request, review state, rules, and timestamps. Ordered cells retain blank and repeated CSV headers. A composite foreign key prevents an operations record from pointing to another request's evidence. Several evidence rows may support the same presentation; ordinary responses expose only the primary CSV filename.

A missing amount remains NULL. A recorded zero remains zero. Assumed paid does not create a receipt amount or payment date. Payment methods remain unknown without explicit evidence. No finder fee is invented.

The 2024/2025 operational datasets default past events to completed, unless explicit cancellation/rejection/nonperformance evidence contradicts that assumption. Completed events dated through December 31, 2025 can be assumed paid when payment evidence is absent. Explicit unpaid/partial/refunded evidence or a recorded zero against a positive price overrides that default. Missing price can imply volunteer work; it does not become a recorded zero. The cutoff uses event dates, not the file's year label. The 2022 done-named sheet does not override cancellation evidence.

## Dry-run and staging

No database is contacted during dry-run:

```bash
.venv/bin/python -m app.imports.operational_presentations ../TEMP/your-export.csv --year 2024
```

The supplied filename is an example; use the actual private source file. Supported dataset years are 2022 through 2025. Explicit date formats include slash dates, dash dates, named months, and two-digit years interpreted as 2000 through 2099. Missing years and date ranges remain unresolved. The original form importer is unchanged.

To store restricted evidence without changing presentation statuses or creating operational facts:

```bash
.venv/bin/python -m app.imports.operational_presentations ../TEMP/your-export.csv --year 2024 --stage --project-ref siaxqqewpiowfrxfdpkl
```

Staging matches only a unique candidate with agreeing event date and a usable email or phone. A candidate still requires review; no unmatched request is automatically created. Duplicate file staging is a no-op. The batch's imported count means staged evidence rows for operations datasets. Cross-sheet overlap, changed dates, duplicate sessions, unparseable amounts, and unresolved identities need private review before application.

All CLI output is counts or fixed safe messages. Original cells, contacts, and database exceptions are not printed.

## Reviewed application

Prepare a private JSON review file under ignored TEMP. It must contain:

- `row_id`: staged evidence UUID.
- `request_id`: reviewed target request UUID.
- `row_sha256`: staged row digest.
- `expected_updated_at`: current request timestamp from the protected request API, including timezone.
- `expected_status`: current lifecycle status.
- `accept_conflicts`: optional boolean, true only after reviewing differing existing operational values.

```bash
.venv/bin/python -m app.imports.operational_presentations --apply-review ../TEMP/review.json --project-ref siaxqqewpiowfrxfdpkl
```

Application locks the request and evidence, checks the row digest and expected target state, and writes operations, evidence linkage, and any status activity atomically. It never calls email recommendations, staff email tasks, or dispatch. Replays do not add duplicate activities. Incoming NULL/unknown values do not clear existing facts.

For a later snapshot of the same request, re-review using the current request timestamp/status. The explicitly reviewed target state replaces the old staging baseline; stale approvals still fail. Record conflicts are rejected unless the private review explicitly accepts them. Missing methods and receipt amounts are never fabricated.

## Protected read API

`GET /api/v1/presentations/{request_id}/operations` requires a verified Supabase user JWT and staff UUID approval. It returns operational business fields and `imported_from` as a CSV basename, without raw cells, import-row IDs, batch IDs, or row hashes. Missing operations return 404.

The React preview remains fictional and is not connected to private backend records. Its Source list/detail display was removed. Connecting real business data remains separate backend-authorized integration work.

## Verification

### Authorized live migration on November 11, 2026

- Applied Alembic-generated upgrade SQL sequentially through the Supabase migration connector, with a locked expected-revision check for each step. The project now reports revision `0005`.
- Before applying `0004`, corrected its activity-check constraint reference with `op.f` so the naming convention does not expand an already complete name. Offline upgrade and downgrade regression tests failed before the fix and pass afterward.
- Verified all five new tables, the three new activity columns, and the composite operations/evidence foreign key. All five tables have RLS enabled, no browser policies, and no SELECT/INSERT/UPDATE/DELETE privileges for `anon` or `authenticated`.
- Existing counts remain 883 requests, 883 activities, three Auth accounts, and three admin-role rows. The migration seeded 14 templates, all disabled for use. Messages, tasks, import rows, and operations remain empty. No CSV import or email delivery occurred.
- Backend checks report 157 tests passed and 33 PostgreSQL integration tests skipped. Ruff lint and formatting pass. Fresh local PostgreSQL validation remains blocked by initdb's unresolved OS user ID. Full Alembic schema-drift validation and local backend connectivity remain unverified.
- Post-migration security advisories add only the expected no-policy information for the private new tables. Existing function-access and password-protection warnings remain.

### Connection checks before migration

Rechecked November 11, 2026 before the authorized migration:

- The authorized Supabase connector reached the healthy project and read revision `0003`, 883 requests, and 883 activities. Both user tables exist. No migration or CSV import was performed.
- Direct PostgreSQL and Supabase Auth HTTPS checks failed at DNS resolution, including outside the shell sandbox. The saved database password and account password remain unverified.
- FastAPI `TestClient` with the reviewed database URL returned HTTP 200 for liveness, `/docs`, and `/openapi.json`. Readiness returned HTTP 503. Before the Supabase JWT migration, protected presentation reads returned HTTP 503 because the local bootstrap token was unset.
- `env -u TEST_DATABASE_URL .venv/bin/python -m pytest -q --tb=short` passed 155 tests and skipped 33 database tests. The inherited test URL points to an unrelated unavailable local database; the initial run had one failure and 32 setup errors. No integration tests ran against the live project.
- Ruff lint and format checks passed using the existing virtual environment. uv and Docker remain unavailable, so locked dependency synchronization, Compose validation, and fresh PostgreSQL migration tests were not run. A Starlette warning reports that the installed TestClient/httpx combination is deprecated.
- Supabase security advisories report browser-callable `public.is_admin` and disabled leaked-password protection. See [function access advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The no-policy notices on presentation tables match their intentional private access model. These settings were not changed.

### Earlier implementation checks

Recorded during the earlier implementation session:

- 155 backend tests passed; 33 PostgreSQL integration tests skipped with TEST_DATABASE_URL unset.
- Ruff lint and formatting passed. No dependency changes were required.
- Alembic offline SQL through 0005 generated successfully. This is not a PostgreSQL execution or schema-drift pass.
- Dry-run parsing of the five private operational exports retained 361 source event rows, including overlaps, without writing to a database or printing private rows. Four source records have unresolved dates across the two overlapping 2022 exports.
- Local PostgreSQL startup failed because initdb cannot resolve OS user ID 501. Supabase connection tests failed at DNS resolution, including outside the shell sandbox. Neither database password validity nor live migration execution was established.
- uv and Docker are unavailable here. Existing virtual-environment commands were used; uv sync --locked and Compose checks were not run. No database migration or real CSV import was performed.
