# Database conventions

## Current schema

Phase 1 has no business tables. The initial Alembic revision establishes a migration baseline without creating presentation, event, contact, or communication records. Alembic creates its own version table when migrations run.

PostgreSQL is the supported database. SQLite is not a substitute for connectivity or migration integration tests.

## SQLAlchemy models

Future models inherit from the declarative base in `backend/app/db/base.py`. Use SQLAlchemy 2.x `Mapped[T]` annotations and `mapped_column`. Put models in the module that owns their data.

Use explicit foreign keys, nullability, and database constraints. Keep table and column names in `snake_case`. Name tables consistently with the domain vocabulary. Use the base metadata naming convention for indexes and constraints so migrations can address them reliably.

Store timestamps with timezone information. Define ID types, status representations, and delete behavior during Phase 2 design rather than selecting business schemas now.

## Model registration

Alembic reads `Base.metadata` in `backend/alembic/env.py`. A model enters that metadata only after Python imports its declaration. When adding a model, import its module into the migration environment before assigning or using `target_metadata`. Keep that registration explicit and review it alongside the migration. Merely creating a model file does not register it.

## Migration workflow

Run commands from `backend/` with the target environment's `DATABASE_URL` set. For local environment setup and Compose commands, see the [README](../README.md).

```bash
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "Describe the schema change"
uv run alembic upgrade head
uv run alembic check
```

Review every generated revision. Autogeneration cannot infer safe renames or data transformations. Commit model changes and the reviewed migration together. Test upgrades against a fresh isolated PostgreSQL database. Plan rollback or forward recovery for changes that can lose data. Never edit an applied migration to change a shared environment's history.

The migration environment reads the URL from typed application settings. Do not place credentials in `alembic.ini` or revision files.

## Session and transaction ownership

A request obtains a session through the database dependency. The dependency closes the session after use. Session cleanup rolls back unfinished transactions and returns the connection to the pool. Readiness executes `SELECT 1` without changing schema or data.

Future writes use an explicit transaction around the complete business operation. Do not commit independently in helpers when a caller needs atomic changes. Do not share a session between requests or background tasks. A background task must obtain and close its own session.

## Integration test isolation

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database whose name ends in `_test`. It must differ from the development database. Tests must reject unsafe targets before database work. Fixtures manage session cleanup without dropping development schemas or resetting application data. CI must migrate the test database before running connectivity tests.

Use separate credentials and databases for development, tests, and production. A database name convention is an additional guard, not a replacement for restricted credentials.

## Planned shared entities and business boundaries

Contacts may own people and organizations used by several modules. Communications may own message identity and thread associations. Presentation requests and their activity history belong to Presentations. Events owns event-specific applications, logistics, and participation records.

Cross-module foreign keys may be appropriate within one PostgreSQL database, but ownership and deletion behavior require explicit review. Avoid copying mutable contact details into multiple modules unless preserving a historical snapshot is intentional.

The actual Wix presentation form must be reviewed before Phase 2 finalizes fields, required values, uniqueness rules, statuses, or relationships.
