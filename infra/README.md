# Infrastructure scope

Phase 1 provides a local Docker Compose environment in the repository root. It runs the API and PostgreSQL, waits for the database health check, and stores local database files in a named volume.

The [root README](../README.md) contains startup, logs, migration, test, database connection, and reset commands. A normal Compose shutdown preserves database data. Delete a volume only when intentionally resetting disposable local data.

No cloud infrastructure, production deployment, backup service, external monitoring, Gmail resources, or Wix resources are provisioned here.

Future production infrastructure requires an explicit hosting decision, private database networking, secret management, TLS, restricted credentials, migrations, backup and restore tests, and operational ownership. See [Security requirements](../docs/SECURITY.md) before planning deployment.
