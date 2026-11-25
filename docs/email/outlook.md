# Outlook staff mailbox

The staff workspace can read one Exchange Online mailbox through Microsoft Graph. **Inbox** shows incoming messages and Sent Items. Open a conversation to read both sides and download file attachments. The Outlook views on presentations and MNY vendor records filter mailbox pages by the record’s current email address. Records that share an email address see the same matching mailbox conversations.

From a record, the composer fills its contact address. From Inbox, staff can choose a presentation or vendor with the contact toggle, or enter an address directly. Ready presentation templates with all required contact fields can serve as editable starting copy. The existing approval and automation flow remains available under **Email workflow**. Microsoft delivery for those existing workflow templates uses their saved copy and approval rules.

Outlook compose supports plain text and formatted Markdown. The formatted review shows the HTML that the backend submits to Graph. Recipient email clients control the final rendering. Attach up to eight PDF, Office, text, CSV, or supported image files, with a combined size of 2.5 MB. Staff can replace files before sending. Files belong to individual messages. The thread lists file attachments and downloads files up to 4 MB as downloads. Open Outlook to access larger files or non-file attachment types.

Live replies use Outlook’s reply draft and its existing conversation. The reply sends to one verified participant from the selected message. Microsoft returns `202 Accepted` after it accepts a submitted draft. Sent Items can take a moment to update. Calpulli saves the attempt before submission and requires staff to check Sent Items or Exchange message trace when delivery is uncertain. Mailbox lists refresh when opened or refreshed by staff. The first Inbox page also refreshes once a minute while the browser tab is visible. Scheduled waves remain a separate implementation milestone.

## Configure a test mailbox

1. Choose a dedicated Microsoft 365 Exchange Online mailbox and a controlled recipient inbox. A personal Outlook.com account requires a different delegated flow.
2. Register a single-tenant app in Microsoft Entra. Capture the Directory ID, Application ID, and Enterprise Application service principal Object ID. The current pilot authenticates with a client secret. Store it in the backend environment or the hosting secret store and track its expiry.
3. In Exchange Online, create the service principal reference and a management scope that matches only the dedicated mailbox. Assign both `Application Mail.ReadWrite` and `Application Mail.Send` within that scope. The former covers reading messages and preparing reply drafts with attachments. Confirm that the mailbox is in scope and a second mailbox is out of scope. Leave broad equivalents out of the Entra API grants because the permissions are additive.
4. Apply the reviewed database migration through `0010` to the authorized target. Enable `EMAIL_PROVIDER=microsoft`, set `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_MAILBOX` on the backend. Use the mailbox UPN when it also identifies the address shown to staff. Keep `EMAIL_TEST_MODE=true` and set `EMAIL_TEST_RECIPIENT` to the controlled inbox. Mock remains the default for unconfigured installations and automated tests.
5. Use the staff workspace to send a formatted test message with a small PDF and image. Confirm the files and formatting in the controlled inbox and Sent Items. Start a new message to the configured mailbox and verify that it appears under Incoming. Test a real threaded reply using an isolated test mailbox and test contacts with live routing explicitly enabled in that environment. Test mode redirects all sends and detaches replies from the original conversation.

References are [Exchange Application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac), [reply drafts](https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0), [immutable message IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id), and [message trace](https://learn.microsoft.com/en-us/exchange/monitoring/trace-an-email-message/message-trace-modern-eac).

## Staff API

All routes under `/api/v1/outlook` require an approved staff account. The backend scopes Graph calls to its configured mailbox. Responses use a private, no-store cache policy. Graph credentials never reach the browser.

| Method and route | Purpose |
| --- | --- |
| `GET /capabilities` | Check whether a mailbox is configured and whether test routing is on |
| `GET /statistics?days=30` | Count incoming messages over two equal Pacific calendar periods and return the current period's `daily_received` series. `days` accepts 1 through 92 and defaults to 30. The reply count always covers the last 30 days of inbox threads with no later message in Sent Items. |
| `GET /messages` | Page through `folder=inbox` or `folder=sentitems`, optionally filtering each page by `contact` |
| `GET /conversations/{id}` | Read mailbox messages in an Outlook conversation |
| `GET /messages/{id}/attachments` | List the file attachments on a message |
| `GET /messages/{id}/attachments/{attachment_id}` | Download one file |
| `POST /preview` | Render the supplied `body_text` and `format` to HTML |
| `POST /send` | Review and submit a message with a caller-generated `request_id`, recipient, subject, body, format, and optional files or reply target |

Home uses the statistics endpoint for its email metric and reply shortcut. The reply count covers inbox conversations that received a message in the last 30 days. It estimates follow-up from Inbox and Sent Items, so automated mail can count and moving mail out of those folders can change the total.

Reuse the same request ID when repeating an unchanged submission. A confirmed repeat returns the original receipt. A conflict indicates that the existing attempt needs reconciliation or the same ID was used with changed inputs.
