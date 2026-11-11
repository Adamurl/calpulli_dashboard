# Calpulli Platform

An internal management platform for Calpulli Tonalehqueh. This repository contains the backend foundation and the authorized Presentations data model and routes. Presentations will be the first business module; Events will follow later. Historical import support and a normalized Wix receiver are implemented locally. The Calpulli Tonalehqueh Supabase project now contains the presentation tables and imported historical records. Wix activation, Events, and per-user API authorization remain unimplemented. The standalone frontend now includes Supabase sign-in support and a fictional-data preview.

## Current verification status

The foundation and presentation code are implemented locally. `backend/uv.lock` still needs generation before locked CI and Docker builds can run. The Supabase migrations and historical import were verified through MCP. Isolated PostgreSQL integration tests, Docker execution, and deployed Wix delivery remain unverified. See [verification record](docs/VERIFICATION.md) for observed checks and remaining work.

The historical CSV dry run retains 883 nonblank records from 896 data rows and skips 13 blank rows. Missing or ambiguous legacy answers remain nullable while their original text is retained. The authorized MCP import created 883 requests, 883 creation activities, and one import batch; every normalized and original field was compared against the source.

## Architecture and layout

A modular monolith keeps one FastAPI application and one PostgreSQL database. Synchronous SQLAlchemy runs in synchronous endpoints and request dependencies. Application startup creates a connection pool without opening a database connection; shutdown disposes it. Alembic owns schema changes.

```text
backend/
  app/
    api/router.py          # Central /api/v1 router
    core/                  # Settings, JSON logging, errors, request context
    db/                    # Typed declarative base, engine, session dependency
    modules/health/        # Liveness and PostgreSQL readiness
    modules/presentations/ # Models, schemas, services, and protected routes
    imports/               # Historical CSV adapter and dry-run import CLI
    integrations/          # Prepared normalized Wix receiver
    main.py                # Application factory and lifespan
  alembic/                 # Metadata registration and empty baseline revision
  tests/                   # API, configuration, errors, connectivity
  pyproject.toml           # Dependencies, pytest and Ruff configuration
  Dockerfile
.github/workflows/ci.yml
docs/                      # Product, architecture, API, security and roadmap
infra/README.md
compose.yaml
```

The shared infrastructure contains no business rules. Future modules own their models and rules; provider adapters translate Wix and Gmail inputs at explicit boundaries. See [architecture](docs/ARCHITECTURE.md) and [roadmap](docs/ROADMAP.md).

## Prerequisites

- Python 3.12 or newer; CI and Docker use Python 3.12.
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- Docker Engine or Docker Desktop with Docker Compose v2.
- Git and access to `https://github.com/Adamurl/calpulli_dashboard`.

## First checkout setup

From the repository root:

```bash
cp .env.example .env
cd backend
uv lock
uv sync --locked
```

The `uv lock` step is required only while completing this initial foundation. Review and commit the generated `backend/uv.lock`. After it is committed, ordinary checkouts use `uv sync --locked`; use `uv sync` during intentional dependency updates and review lockfile changes.

The root `.env` is used by Compose. For host Python commands, load it into the current shell from `backend/`:

```bash
set -a
source ../.env
set +a
```

Alternatively, create an ignored `backend/.env` for host-only overrides. Typed settings load `.env` from the working directory. Never commit either file. Root environment variables take precedence over dotenv values.

## Local development with Docker

Run these commands from the repository root, after generating the lockfile:

```bash
docker compose config --quiet
docker compose up --build -d
docker compose logs -f api db
docker compose exec api alembic upgrade head
curl http://localhost:8000/api/v1/health
curl http://localhost:8000/api/v1/health/ready
docker compose down
```

The API waits for PostgreSQL's health check and reloads when application source changes. No startup sleeps or automatic schema creation are used. Normal shutdown preserves the named database volume. Ports bind to loopback only. Docker starts uvicorn from the application virtual environment; access logs are disabled to avoid exposing request URLs.

Open `http://localhost:8000/docs` for development OpenAPI UI. `http://localhost:8000/openapi.json` provides the schema. Production documentation defaults to disabled; set `DOCS_ENABLED` explicitly to override.

Connect to PostgreSQL:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

To reset **disposable local data only**, deliberately run the following. This deletes the project's database volume permanently. Back up anything needed first.

```bash
docker compose down --volumes
```

## Run the API on the host

Start PostgreSQL with `docker compose up -d db` from the repository root. From `backend/`, load the root environment as above, then:

```bash
uv sync --locked
uv run alembic upgrade head
uv run uvicorn app.main:create_app --factory --reload --no-access-log
```

Compose overrides `DATABASE_URL` to use its `db` service; the example URL uses `localhost` for host commands. URL-encode reserved characters in host connection credentials. Compose's development URL interpolation expects URL-safe user, database, and password values; use a separately supplied URL and secret management when designing production deployment.

## Configuration

| Variable | Default / requirement |
| --- | --- |
| `DATABASE_URL` | Required `postgresql+psycopg://` URL with host and database; never logged. |
| `APP_ENV` | `development`, `test`, or `production`; default `development`. |
| `INTERNAL_API_TOKEN` | Optional secret, at least 32 characters; unset disables presentation routes. |
| `WIX_WEBHOOK_TOKEN` | Separate optional secret, at least 32 characters; unset disables Wix ingestion. |
| `WIX_FORM_ID` | Expected form ID; required with the webhook secret to enable the receiver. |
| `DOCS_ENABLED` | Optional boolean; defaults to enabled only in development. |
| `LOG_LEVEL` | `INFO`; supports DEBUG, INFO, WARNING, ERROR, CRITICAL. |
| `CORS_ORIGINS` | JSON array, default `[]`; exact HTTP(S) origins only. |
| `DB_POOL_SIZE` / `DB_MAX_OVERFLOW` | `5` / `5` per process. |
| `DB_POOL_TIMEOUT` | `5` seconds waiting for a pooled connection. |
| `DB_CONNECT_TIMEOUT` | `3` seconds per PostgreSQL connection attempt. |
| `DB_STATEMENT_TIMEOUT_MS` | `3000` milliseconds per database statement. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Required by Compose; development values in `.env.example`. |
| `POSTGRES_PORT` | Host port `5432`. |
| `TEST_DATABASE_URL` | Optional for local tests; distinct database ending in `_test`. Required for integration verification. |

The example password is local-only and rejected when `APP_ENV=production`. Supply real production credentials externally. Generate independent random internal and Wix secrets locally; do not reuse a documented example or put them in frontend code. Gmail OAuth, individual user authentication, background processing, and synchronization remain future work.

## Migrations

From `backend/`, with the intended environment loaded:

```bash
uv run alembic upgrade head
uv run alembic current
uv run alembic check
uv run alembic revision --autogenerate -m "Describe schema change"
```

Revision `0001` is an empty baseline. Revision `0002` creates the three presentation tables with RLS enabled. Revision `0003` protects Alembic metadata. Autogeneration checks only registered application tables, preserving unrelated tables in the shared database. Review generated migrations before applying or committing them. Inspect existing tables and migration history before targeting Supabase. Import future SQLAlchemy models explicitly in `alembic/env.py` before metadata is used. See [database conventions](docs/DATABASE.md).

## Tests and quality checks

From `backend/`:

```bash
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

The unit suite needs no live database. Without `TEST_DATABASE_URL`, PostgreSQL integration tests are skipped. A configured but unavailable test database fails the integration test.

Create a separate local test database from the repository root:

```bash
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" calpulli_test'
```

Then, from `backend/`, after loading `.env`:

```bash
export TEST_DATABASE_URL='postgresql+psycopg://calpulli:calpulli_dev_only@localhost:5432/calpulli_test'
DATABASE_URL="$TEST_DATABASE_URL" uv run alembic upgrade head
DATABASE_URL="$TEST_DATABASE_URL" uv run alembic check
uv run pytest
```

Adjust the test URL if development credentials differ. Tests reject database names without `_test` and databases matching the development database name. Fixtures close request sessions; they do not drop schemas, truncate tables, or reset application data. CI provisions and migrates a dedicated PostgreSQL test database before running all tests.

To run checks inside the development API container, from the repository root:

```bash
docker compose exec api uv sync --locked --group dev
docker compose exec api uv run ruff check .
docker compose exec api uv run ruff format --check .
docker compose exec api uv run pytest
```

Container tests skip PostgreSQL integration unless `TEST_DATABASE_URL` is explicitly supplied with hostname `db`. Installed development dependencies survive container restarts but are recreated after a rebuild.

## Documentation and next phase

- [Product requirements](docs/PRD.md).
- [Architecture](docs/ARCHITECTURE.md).
- [Database](docs/DATABASE.md).
- [API conventions](docs/API.md).
- [Presentation data and historical import](docs/PRESENTATIONS.md).
- [Wix contract and planned Gmail integration](docs/INTEGRATIONS.md).
- [Roadmap](docs/ROADMAP.md).
- [Security](docs/SECURITY.md).

The request schema supports both historical CSV answers and the new form. List, detail, create, status or note patch, and activity routes are under `/api/v1/presentations`. They require a server-side bearer credential matching `INTERNAL_API_TOKEN`; unset configuration disables access. See [API reference](docs/API.md).

The presentation schema is applied to the verified Calpulli Tonalehqueh Supabase project. Store server connection settings only in ignored environment files; see [database conventions](docs/DATABASE.md). The historical import defaults to a dry run; `--apply` is an explicit write operation. `TEMP/` stays out of Git and Docker.

The future Wix target is `https://<your-api-host>/api/v1/integrations/wix/presentations`. This is not a deployed URL. Review a fictional request preview and map **Choose fields** before activation. Hosting, live Gmail activation, Events, shared contact identity, and production API authorization remain separate work. The frontend preview is documented below.

## Dashboard preview

The Shopify-inspired staff frontend is in [`frontend/`](frontend/README.md). Run `npm ci` and `npm run dev` from that directory, then open http://127.0.0.1:5173. It includes an email/password login and a fictional-data demo for reviewing presentations, client conversations, editable personal drafts, templates, notes, and account navigation. Production API access and live mail are not connected.

Read the [dashboard style guide](docs/DASHBOARD_STYLE_GUIDE.md) and [UX wireframes and integration plan](docs/DASHBOARD_UX.md). The frontend README documents Vercel configuration and observed verification.
