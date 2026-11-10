# Database conventions

## Current schema

PostgreSQL is the supported database. SQLAlchemy 2.x typed models use synchronous sessions and psycopg 3. SQLite does not substitute for PostgreSQL connectivity, JSONB, uniqueness, or row-security tests.

Revision `0001` establishes an empty baseline. Revision `0002` defines `presentation_import_batches`, `presentation_requests`, and `presentation_activities`. Revision `0003` protects the Alembic version table. Both revisions are applied to the verified Calpulli Tonalehqueh Supabase project, with Alembic reporting `0003`. The authorized MCP import created 883 historical requests, 883 creation activities, and one batch from 896 CSV rows; 13 blank rows were skipped.

[Presentation data reference](PRESENTATIONS.md) describes fields and source mappings. Contact data is a snapshot on each request. There are no shared contacts, organizations, Events, or Communications tables yet.

## Model and naming conventions

Models inherit from `backend/app/db/base.py`. Use `Mapped[T]` and `mapped_column`. Put models in the module that owns their records. Table and column names use `snake_case`; metadata defines explicit names for constraints and indexes.

The presentation tables use UUID primary keys. Timestamps such as receipt, creation, and activity time include timezone information. Event date and local times are separate from the IANA `event_timezone` field. Imported unknown values remain nullable and retain their original text.

PostgreSQL constraints enforce allowed source, form version, status, event access, event setting, and audience-distance values. Guest counts cannot be negative. JSONB columns preserve selections and source fields. Uniqueness on source, source key, and external ID prevents duplicate provider ingestion.

## Model registration

`backend/alembic/env.py` imports presentation models before using `Base.metadata`. A model enters metadata only after its declaration is imported. Register future models explicitly and review that import with the migration. Creating a Python model file alone does not register it.

## Migration workflow

Run commands from `backend/` with the intended `DATABASE_URL` loaded:

```bash
uv run alembic current
uv run alembic upgrade head
uv run alembic check
uv run alembic revision --autogenerate -m "Describe schema change"
```

Review each generated revision. Autogeneration cannot infer safe renames or data transformations. Commit the reviewed migration with its model changes. Test a fresh PostgreSQL upgrade and check schema drift. Never alter an applied revision to rewrite a shared environment's history.

Migration settings read the database URL from typed application configuration. Do not place credentials in `alembic.ini`, migration files, or generated SQL committed to Git. Application startup does not create tables.

Before targeting an existing Supabase project, inspect its tables, policies, and Alembic history. Do not stamp or recreate an existing schema to make migration errors disappear. The configured project is shared with existing vendor tables. Autogeneration uses `include_owned_name` to reflect only registered application tables, so unrelated tables are not proposed for removal. Keep direct or session-pooler PostgreSQL credentials in ignored environment configuration; do not expose them to a browser.

## Session and transaction ownership

The application lifespan owns the engine. A request obtains a dependency-managed session that closes after use and returns connections to the pool. Unfinished work rolls back during cleanup.

The presentation services commit a request and its creation activity together. Status changes lock the request, check the expected status, and persist the activity in the same operation. The direct legacy importer owns one transaction for its batch and records. A failure rolls back that batch. The authorized MCP import used resumable chunks, each atomically inserting requests, activities, and updating batch counters; duplicate source identities are skipped. No session is shared by concurrent requests or background workers.

## Supabase access

Revision `0002` enables row-level security on each new table, creates no browser-access policies, and revokes table privileges from PUBLIC. It also revokes privileges from `anon` and `authenticated` when those roles exist. Revision `0003` applies the same protection to `alembic_version`. Live checks confirmed RLS is enabled and both browser roles lack SELECT, INSERT, UPDATE, and DELETE on all four tables. No public policies were added.

The backend uses a trusted server-side PostgreSQL connection with suitable privileges. Table owners normally bypass RLS, so the protected FastAPI routes remain an essential access boundary. The migration does not grant a general application role or implement individual user policies. Never expose owner credentials in a browser or grant broad public privileges to bypass an access error.

## Integration tests

`TEST_DATABASE_URL` must name a separate database ending in `_test` and must differ from the development database. Apply migrations before running database tests. Use separate credentials for development, tests, and production. A name check is an additional guard, not a substitute for restricted credentials.

Test fixtures use isolated transactions for their records. They must not drop application schemas, truncate real tables, or reset development data. Live migration, import integrity, duplicate protection, and browser-role privileges were checked on the authorized Supabase project. The isolated Python database integration suite still requires a separate `_test` database; never run it against the real project.
