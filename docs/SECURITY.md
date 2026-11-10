# Security requirements

## Current boundary

Phase 1 exposes health endpoints only. There is no application authentication, authorization, user management, business data API, or production deployment. Restrictive defaults reduce accidental exposure but do not make the foundation ready to host personal records.

The local Docker environment is intended for development. Production access requires the controls below and an environment-specific review.

## Secrets and environments

Use environment variables or a secret manager for sensitive values. Keep `.env`, tokens, private keys, database dumps, and local credential files out of Git and container build contexts. `.env.example` contains development configuration only. Its example values must not be reused in production.

Use separate databases, credentials, OAuth applications, and external configuration for development, tests, and production. Never point tests at an application database. Limit database credentials to the actions each environment needs. Production migration credentials may need different privileges from the API account.

Rotate an exposed credential and remove it from active use. Removing a file from the latest commit does not revoke a secret already present in Git history.

## Authentication and authorization plans

Select an organization-controlled identity provider during internal security planning. Verify token issuer, audience, signature, expiry, and permitted algorithms. Define account access and offboarding procedures.

Future role-based access must reflect actual coordinator and leadership responsibilities. Enforce authorization in the backend for every protected operation. Do not rely on frontend visibility, client-supplied role values, or request IDs. Test both permitted and forbidden operations, including access to records owned by another area.

No particular identity provider or token library is selected in Phase 1.

## Webhook verification plans

Verify Wix requests using the authentication mechanism supported by the configured Automation. Validate payload size, shape, and required fields before processing. Use durable idempotency and uniqueness constraints. Restrict webhook privileges and rate-limit public receivers. Verify Google Pub/Sub delivery identity when that endpoint is introduced.

## OAuth token protection plans

Use least-privilege Gmail scopes. Encrypt refresh tokens at rest and manage encryption keys separately. Restrict decryption access and record safe operational audit events. Define revocation, rotation, reconnect, and incident response procedures before using a real mailbox.

## Personal data and logging

Collect only information needed for approved workflows. Define retention, correction, export, and deletion policies with organizational owners. Consider communication contents and vendor applications sensitive even when no formal classification exists yet.

Application logs must not contain credentials, authorization headers, cookies, form bodies, contact details, or email contents. Database exception text can include connection information and must not reach API clients or general request logs. Log safe event names, status codes, and correlation IDs. Configure upstream proxies and platform logs with the same restrictions.

Treat user-provided request IDs as untrusted input. The application accepts UUID values only. Request IDs identify a request, not a person or trusted caller.

## Production requirements

Before exposing business functionality:

- Enable HTTPS and validate trusted proxy configuration.
- Configure exact CORS origins and confirm the authentication transport's CSRF requirements.
- Keep API documentation disabled unless access is intentional and controlled.
- Use restricted network access and TLS for PostgreSQL where required by the hosting environment.
- Use nondevelopment credentials and a least-privilege application database role.
- Apply migrations through a controlled release process.
- Test authorization and failure behavior.
- Configure request limits, operational alerting, and dependency update procedures.
- Document recovery and credential revocation procedures.

## Backups and recovery

A Docker named volume is persistent local storage, not a backup. Production needs scheduled encrypted backups, restricted backup access, retention rules, and restore tests. Agree on recovery point and recovery time targets before launch. Test recovery in a separate environment and include external synchronization state and token key recovery in the plan.
