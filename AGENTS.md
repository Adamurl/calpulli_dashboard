# Calpulli Platform agent instructions

## Scope and architecture

Calpulli Platform is a modular monolith built with Python, FastAPI, PostgreSQL, SQLAlchemy 2.x, and Alembic. Prefer straightforward, maintainable code. Add abstractions or dependencies only when a concrete requirement justifies them.

The current authorized scope includes the foundation, presentation requests, historical CSV import support, activity history, protected routes, and a prepared normalized Wix receiver. Do not add future Gmail, Events, shared contact, or frontend functionality without explicit instruction. Live Supabase writes, real imports, hosting, and Wix activation require the target review and authorization requested by the user. Do not add placeholder modules.

## Module boundaries

Keep module responsibilities clear. Routes own HTTP parsing and response behavior. Business modules own their rules and records. Shared infrastructure must not depend on business modules. Do not couple business rules directly to Wix, Gmail, or other third-party APIs. Put provider translation and calls behind integration boundaries when integration work is authorized.

Do not introduce service or repository layers merely to fill a template. Use synchronous SQLAlchemy consistently unless an approved requirement justifies a change.

## Database changes

Use typed SQLAlchemy 2.x models with `Mapped` and `mapped_column`. Inherit from the shared declarative base. Register future model imports explicitly in Alembic before metadata autogeneration.

Use Alembic for every schema change. Review generated migrations and test them against fresh PostgreSQL. Do not create tables during application startup. Keep transaction ownership explicit and close dependency-managed sessions. Never share a session across requests or background tasks.

## Input and security

Validate external input at the boundary with Pydantic. Use typed settings for environment configuration. Keep secrets, local environment files, tokens, private keys, dumps, and credentials out of source control.

Return consistent, safe API errors. Do not expose database URLs, driver error messages, or stack traces. Do not log authorization headers, cookies, payload bodies, email content, or personal information. Keep CORS restrictive and production documentation exposure intentional.

Presentation routes use a bootstrap internal bearer token, and the Wix receiver uses an independent body secret and form ID. Missing settings must disable those routes. Do not expose personal data through Supabase browser roles or embed server credentials in frontend code. Individual user authentication and role policies are not implemented. Keep TEMP and its private CSV contents out of Git, Docker, logs, and public test fixtures.

## Verification

Run Python commands from `backend/`:

```bash
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Generate and review the still-pending `uv.lock` through uv before claiming locked checks pass. Once present, use the committed lockfile. Explain new dependencies and update the lockfile through `uv`. Add tests for new behavior and important failures. Run PostgreSQL integration tests against a dedicated database ending in `_test`, separate from development and production. Never run destructive tests against application data.

Run Compose commands from the repository root. Validate migrations and Compose configuration when supported by the environment. Report checks that were not run and their reasons. Do not claim CI passed without observing the actual run.

## Documentation and delivery

Update documentation when architecture, APIs, settings, or operation commands change. Keep implemented behavior distinct from planned features. Inspect the diff before committing. Do not publish, push, deploy, change credentials, or modify external resources without user authorization.
