# Gmail provider technical reference

[API overview](../API.md) · [Email workflow API](api.md) · [Gmail setup guide](README.md#gmail-setup)

Source: `backend/app/integrations/gmail.py`. This is an internal Python provider interface, not a public HTTP endpoint. Staff clients call the application email API and never call Google with server credentials.

## Provider interface

| Function or method | Input | Output |
| --- | --- | --- |
| `make_provider(settings)` | `GmailSettings` settings interface | `EmailProvider` implementation |
| `send_email(message)` | `OutgoingEmail` | `SendResult`, or raises `ProviderError` |
| `send_reply(message)` | `OutgoingEmail` with thread and parent identity | `SendResult`, or raises `ProviderError` |
| `build_mime(message, sender_email, sender_name)` | Message and sender identity | MIME bytes |

`make_provider` chooses the mock when `APP_ENV=test` or `EMAIL_PROVIDER=mock`. Otherwise `EMAIL_PROVIDER=gmail` selects the real adapter. A directly constructed real `GmailProvider` also refuses delivery under `APP_ENV=test`. Selecting a provider does not test credentials or contact Google.

## OutgoingEmail input

This immutable dataclass has these fields:

| Field | Python type | Default | Contract |
| --- | --- | --- | --- |
| `recipient_email` | `str` | Required | Valid single address; no CR/LF/NUL |
| `recipient_name` | `str` | Required | Display name; no header line breaks |
| `subject` | `str` | Required | Application-rendered subject, unchanged for replies |
| `body_text` | `str` | Required | Rendered plain text |
| `body_html` | `str` or `None` | Required | Application-escaped HTML, or no HTML alternative |
| `message_id` | `str` | Required | RFC Message-ID such as `<uuid@calpulli.invalid>` |
| `thread_id` | `str` or `None` | None | Gmail conversation ID for replies |
| `in_reply_to` | `str` or `None` | None | Parent RFC Message-ID, not Gmail message ID |
| `references` | `str` or `None` | None | Space-separated RFC Message-IDs |
| `original_recipient` | `str` or `None` | None | Internal test-redirection header value |

`send_email` rejects thread/reply headers. `send_reply` requires both a thread ID and parent RFC identity. The application verifies same-inquiry parent ownership, same recipient, and identical subject before calling the provider. The provider has no database access and does not verify staff approval.

## SendResult output

The immutable result has `message_id: str` and `thread_id: str`. These are Gmail provider identifiers, distinct from the RFC Message-ID. The application persists them as `provider_message_id` and `provider_thread_id` after success.

Mock results use a `mock-` message ID and a `mock-thread-` thread ID for a new conversation. Non-redirected mock replies preserve the supplied thread ID. The mock holds prepared outgoing messages in its in-memory `messages` list for tests; there is no SMTP or Google call.

## Configuration boundary

| Setting | Default | Use |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `mock` | `mock` or `gmail` |
| `EMAIL_TEST_MODE` | true | Redirect outgoing recipients when enabled |
| `EMAIL_TEST_RECIPIENT` | None | Required at delivery time when test mode is enabled |
| `GOOGLE_CLIENT_ID` | None | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | None | Server-only `SecretStr` |
| `GOOGLE_REFRESH_TOKEN` | None | Server-only `SecretStr` |
| `GOOGLE_REDIRECT_URI` | None | OAuth setup metadata; refresh delivery does not consume it |
| `GMAIL_SENDER_EMAIL` | None | Organizational sender address |
| `GMAIL_SENDER_NAME` | `Calpulli Tonalehqueh` | Sender display name |

Settings use the existing typed environment configuration. Real delivery requires client ID, client secret, refresh token, and sender email. Missing test-recipient configuration fails closed. The adapter does not implement an OAuth consent callback or initial authorization-code exchange.

## Gmail request and MIME format

The real adapter performs these network calls:

| HTTP method and URL | Request | Success data consumed |
| --- | --- | --- |
| POST `https://oauth2.googleapis.com/token` | Form fields `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`, `scope=https://www.googleapis.com/auth/gmail.send` | Nonempty `access_token` |
| POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` | JSON `raw` plus optional `threadId`; bearer access token | Nonempty string `id` and `threadId` |

Each call has a 15-second transport timeout and reads at most 1,000,000 response bytes. There is no access-token cache, automatic retry, background work, Gmail draft creation, or incoming-message read capability. A send request can wait for both token refresh and message submission.

`raw` is base64url-encoded MIME produced with SMTP policy. It includes To, From, Subject, Message-ID, Date, a plain-text part, and an HTML alternative when supplied. Replies set `threadId` in the Google request and `In-Reply-To` plus `References` in MIME. The application retains the parent subject to satisfy Gmail conversation grouping.

The only requested OAuth scope is `https://www.googleapis.com/auth/gmail.send`. Mailbox ingestion or Gmail-side drafts are outside this capability.

## Test-recipient redirection

Immediately before MIME construction, test mode validates the original recipient and redirects delivery to `EMAIL_TEST_RECIPIENT`. It sets display name `Email test recipient` and header `X-Calpulli-Original-Recipient` to the original address. The original recipient is not logged.

Test mode clears thread ID, In-Reply-To, and References, so a test cannot add its recipient to a real client conversation. This intentionally prevents tests from preserving the live client thread. The mock constructed through application settings uses the same redirection boundary.

## ProviderError output

`ProviderError` contains `code`, `safe_message`, `retryable`, and `delivery_unknown`. Provider response bodies, credentials, and raw exceptions are not exposed in these fields.

| Code or condition | Retryable at provider boundary | Delivery uncertainty |
| --- | --- | --- |
| `email_configuration` | false | No submission |
| `real_email_disabled` | false | No submission |
| `test_recipient_required` | false | No submission |
| `invalid_recipient`, `invalid_headers`, `invalid_reply` | false | No submission |
| `gmail_rate_limited` for HTTP 429 | true | Known rejection |
| `gmail_permission_denied` for HTTP 401/403 | false | Staff review required |
| `gmail_rejected` for other unsuccessful non-5xx responses | false | Staff review required |
| `gmail_unavailable` for HTTP 5xx during refresh | true | Before mail submission |
| `gmail_unavailable` for HTTP 5xx during message submission | true | `delivery_unknown=true` |
| `gmail_transport_error` during refresh | true | Before mail submission |
| `gmail_transport_error` during message submission | false | `delivery_unknown=true` |
| `gmail_invalid_response` | false | Unknown when response follows submission |

The application suppresses retry eligibility whenever delivery is unknown, even if the provider marks an underlying error transient. Gmail send has no transactional application idempotency key. A timeout or crash after submission requires reconciliation before another send.

Verification: `backend/tests/test_gmail.py` tests MIME, redirection, thread headers, configuration, response/error classification, and mock behavior without real Google calls. Live OAuth and redirected Gmail delivery have not been verified in this environment.
