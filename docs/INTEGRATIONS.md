# Planned integrations

All capabilities in this document are future requirements. Phase 1 has no integration clients, webhook routes, OAuth flows, tokens, or background workers. No Google or Wix configuration is required to start the foundation.

## Wix presentation requests

The intended flow is Wix Forms, then a Wix Automation webhook, then a FastAPI webhook receiver. Phase 2 must inspect the actual form fields and example payloads before defining the domain schema. Phase 3 implements the receiver.

The receiver must:

1. Authenticate the sender using a mechanism supported by the actual Wix configuration.
2. Enforce body-size and content-type limits.
3. Validate the external payload through a provider-specific Pydantic model.
4. Translate validated fields into presentation operations.
5. Persist the submission and its stable external identity atomically.
6. Return a documented acknowledgement after durable acceptance.

Confirm Wix's authentication capabilities during implementation. Do not assume Wix signs every Automation payload. If the configured webhook supports a shared secret, keep it outside source control and verify it before persistence. Avoid secrets in URLs because proxies and access logs can record them.

Use a durable idempotency key and a database uniqueness constraint. Prefer a stable provider submission identifier once payload review confirms it exists. Define duplicate behavior, retry handling, and recovery for failed submissions. A repeated delivery must not create a second request.

Log safe delivery identifiers and outcomes. Do not log full form bodies or personal contact details. Store only fields needed for the approved workflow and retention policy.

## Google Workspace and Gmail

The intended integration uses an organizational Google Workspace mailbox with OAuth authorization. Confirm mailbox ownership, administrator policies, consent requirements, and allowed scopes before implementation. Scope access to the operations the product needs.

Planned behavior includes:

- Send presentation messages through the connected mailbox.
- Store Gmail message IDs and thread IDs alongside internal communication records.
- Associate replies with the correct request using persisted identifiers and reviewed matching rules.
- Receive mailbox change notifications through Google Cloud Pub/Sub.
- Synchronize mailbox changes in background work.
- Renew subscriptions and handle revoked credentials.

Notifications indicate that mailbox state changed. They are not the sole source of message history. Persist synchronization progress, process changes idempotently, and retry transient errors with bounded backoff. Reconcile periodically to recover from delayed or missed notifications. Define a full resynchronization path when incremental history is no longer available.

Encrypt refresh tokens at rest with keys managed separately from the database. Restrict token access to the integration process. Never include tokens, authorization codes, message bodies, or mailbox credentials in logs. Define revocation and reconnect procedures before connecting a real mailbox.

## Integration boundaries

Provider-specific payloads and API calls belong in integration adapters. Presentations and Communications own internal operations and data rules. Keep provider IDs explicit instead of using them as internal authorization decisions.

Choose durable background processing when delivery requirements are known. Do not rely on in-process background tasks for work that must survive an API restart. No background processing dependency is selected in Phase 1.
