# Security requirements

## Current access boundary

Health endpoints are public. Presentation, activity, email, template, and capability routes require a Supabase user access token and staff authorization. The backend sends the bearer token to the configured HTTPS Supabase Auth `/auth/v1/user` endpoint with the project's publishable key. Supabase validates it; FastAPI rejects anonymous identities and checks the verified UUID against `STAFF_USER_IDS`. An empty allowlist denies all users. The Wix receiver retains its independent body secret and configured form ID.

Missing Auth configuration and provider outages fail closed with HTTP 503. Invalid credentials receive HTTP 401, and valid users without staff approval receive HTTP 403. Auth calls have a five-second timeout and do not follow redirects. The old shared token is not an access path. The frontend sends the current Supabase session JWT only to same-origin API paths and refuses redirects. The legacy email staff page accepts a user JWT held in memory. Neither page supplies server database credentials.

All approved staff currently share access to all presentation and email business routes. There are no per-record ownership rules or distinct coordinator/admin roles. Dashboard status and note changes persist the verified user UUID in activity `actor_id`. Older activities and other email/workflow actions can still use generic staff/system actors. Do not interpret these records as individual approval attribution.

## Secrets and environments

Use environment variables or a secret manager. Keep `.env`, private keys, tokens, database dumps, source exports, and local credentials out of Git and container contexts. `TEMP/` contains private historical source data and must remain excluded. The public repository must contain only synthetic test and example data.

Use separate random values for `WIX_WEBHOOK_TOKEN` and `EMAIL_SEND_AGAIN_TOKEN`, each at least 32 characters. Generate them locally and store them securely. Supabase validation needs the project URL and publishable key, not a JWT signing secret, service-role key, or secret API key. Never put webhook secrets or user access tokens in URLs, commit messages, logs, or shared screenshots.

Separate development, test, and production databases and credentials. Database owner credentials belong only in trusted server or migration environments. Rotate exposed credentials; removing a secret from the latest commit does not revoke it.

## Supabase row security

Revision `0002` enables RLS on the three presentation tables. It grants no browser policies and revokes table access from PUBLIC, `anon`, and `authenticated` when those roles exist. Revision `0003` also protects the Alembic metadata table. Live checks confirmed RLS on these tables and no read/write privileges for the `anon` and `authenticated` browser roles. Recheck privileges when access policies change.

A table owner can bypass RLS. The FastAPI authorization boundary therefore remains mandatory for owner connections. Do not fix access failures by granting public table access or placing service credentials in a browser. A dedicated production database role and tested policies require an environment-specific design.

## Webhook handling

The prepared Wix receiver checks a separate secret, validates the form ID, limits the JSON body to 64 KiB, and validates normalized fields before persistence. It removes the secret before building a presentation snapshot. A database uniqueness constraint protects provider identity, and changed content under an existing submission ID produces a conflict.

The real Wix Automation preview remains unverified. Configure the receiver only after confirming mapping, stable submission IDs, and authentication behavior. Hosting must provide HTTPS, request controls, and safe upstream logs. Rate limiting and operational alerts are deployment requirements, not controls claimed by the current code.

## Personal information and logs

Historical records contain personal contact details and notes. Define retention, correction, export, and deletion policies with organizational owners. The importer preserves source answers for historical review; that increases the need to restrict backups and administrative access.

Do not log authorization headers, cookies, body secrets, full form bodies, contact details, or message contents. Use safe event names, status codes, and UUID request IDs. Database exceptions and validation errors must not disclose input values or connection details. Apply the same restrictions to hosting and proxy logs.

## Remaining identity and Gmail controls

Supabase Auth supplies verified user identity, and backend configuration supplies staff membership. Define finer coordinator roles and offboarding ownership before expanding access. Never infer staff membership from user-editable metadata or request IDs. Changes to the server allowlist take effect after process restart or deployment.

Gmail remains planned. Use least-privilege scopes, encrypt refresh tokens with separately managed keys, restrict decryption, and document revocation and reconnect procedures. Verify Pub/Sub identity and reconcile mailbox history before relying on notifications.

## Production and recovery

Before handling real records in a deployed service, verify HTTPS, trusted proxies, exact CORS rules, database TLS, restricted credentials, authentication, migration recovery, request limits, alerts, and backup ownership. API documentation defaults off outside development.

A Docker volume is not a backup. Review the actual Supabase plan's backup facilities, retention, and restore process before importing data. Test restores in a separate environment. Agree on acceptable recovery point and recovery time. No backup service or recovery test is provisioned by this repository.

## Email sending boundary

Email APIs require Supabase staff authorization. Preparing send-again drafts additionally requires a separate `EMAIL_SEND_AGAIN_TOKEN`. Gmail credentials remain server-only. Reference templates start unready, approvals reset on draft edits, test mode redirects recipients, and uncertain deliveries block retries. See [Email workflow](email/README.md) for the shared-actor limitation and production requirements.
