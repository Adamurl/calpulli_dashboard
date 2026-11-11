# Dashboard UX and delivery plan

Proposed staff workflows and review criteria. Updated November 10, 2026.

The goal is a testable Calpulli presentation and email workspace that follows the refreshed Shopify admin in the supplied screenshots. The [style guide](DASHBOARD_STYLE_GUIDE.md) defines the visual system and research sources.

The frontend preview uses fictional records and local state. Supabase sign-in can use an existing configured Auth project. It does not grant production API access, synchronize Gmail, or send client email.

## Work model

A presentation request is the existing backend business record. Its contact, organization, event details, status, internal notes, email messages, and activity provide the staff context. Multiple requests from one email address remain distinct requests. A shared client identity system is outside this version.

The request states are `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, and `cancelled`. UI labels can replace underscores with spaces while retaining the meaning. **Booked** does not prove a contract signature and received payment.

The email lifecycle is `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SENDING`, `SENT`, `FAILED`, and `CANCELLED`. A demo-only **Simulated** label must not become an invented backend state.

A compose session belongs to a request. It includes a recipient, subject, editable body, and optional prior message for a reply. Request status and email status remain separate. Sending does not silently change request status.

## Navigation and first session

Staff arrive at login and enter existing Supabase Auth credentials. Public self-registration is omitted for this internal workspace. Missing configuration produces a setup message. A separate demo entry opens fictional records without pretending to authenticate a staff member.

After sign-in, staff see Home. The sidebar remains consistent. Its bottom account button shows identity and sign-out. Signing out clears the authenticated view. Loading authentication must not briefly reveal a signed-in dashboard.

Home answers what needs attention, which presentation is next, and where staff can continue. Metrics and action counts link to the relevant records.

Recommended navigation is Home, Presentations, Inbox, Email templates, Activity, and Settings. Drafts and Needs approval can be inbox views instead of business modules.

## Wireframes

These wireframes describe information order. They are specifications for the screens and follow-up work, rather than screenshots of completed functionality.

### Shell and Home

```text
+------------------+---------------------------------------------------+
| Calpulli      <> | Date / workspace          Operational metrics     |
| Search      CmdK |                                                   |
|                  |               Good evening, [name]                |
| Home             |          Your presentations, in one place          |
| Presentations  8 |                                                   |
| Inbox          4 |       +---------------------------------+         |
| Email templates  |       | Search requests and clients     |         |
| Activity         |       +---------------------------------+         |
|                  |          [Review drafts] [Follow up]               |
| WORKSPACE        |                                                   |
| Connection state |       +--------------+ +------------------+       |
|                  |       | Next event   | | Needs attention  |       |
|                  |       +--------------+ +------------------+       |
| Settings         |       | New requests | | Recent activity  |       |
| [AA] Staff     v |       +--------------+ +------------------+       |
+------------------+---------------------------------------------------+
```

### Presentation index

```text
+------------------+---------------------------------------------------+
| Sidebar          | Presentations                     [New request]   |
|                  | New requests  Reviewing  Booked  Needs approval   |
|                  |                                                   |
|                  | [All] [New] [Reviewing] [Booked]                   |
|                  | [Search clients or organizations...] [Status v]   |
|                  | +---------+--------+----------+--------+--------+ |
|                  | | Request | Client |Event date| Status | Email  | |
|                  | +---------+--------+----------+--------+--------+ |
|                  | | CP-1042 | Name   | Nov 18   | New    | Draft  | |
|                  | | CP-1043 | Name   | Dec 02   | Booked |Approved| |
|                  | +---------+--------+----------+--------+--------+ |
| Account          | Showing visible result count                       |
+------------------+---------------------------------------------------+
```

Opening a request preserves a way back to the list. Production paging and sorting preserve filters in the URL. A demo may filter its local dataset without implying server pagination.

### Request detail

```text
+------------------+---------------------------------------------------+
| Sidebar          | < Presentations                    [Write email]   |
|                  | CP-1042  [Reviewing]                               |
|                  | Cultural presentation / received Nov 10            |
|                  |                                                   |
|                  | +---------------------------+  Client              |
|                  | | Event and request details |  Name                |
|                  | | Date, venue, audience     |  Organization        |
|                  | +---------------------------+  name@example.org    |
|                  |                                                   |
|                  | +---------------------------+  Presentation        |
|                  | | Client email history      |  Date and time zone  |
|                  | | Sent and draft messages   |  Venue and audience  |
|                  | | [Compose personal email]  |                       |
|                  | +---------------------------+  Source / request ID |
|                  |                                                   |
|                  | +---------------------------+                       |
|                  | | Internal notes            |                       |
|                  | +---------------------------+                       |
| Account          | Activity timeline                                  |
+------------------+---------------------------------------------------+
```

Contact text is selectable. Internal notes are explicitly private and never enter outgoing email by default.

### Inbox and thread

```text
+--------------+----------------+------------------------+-------------+
| Sidebar      | Inbox          | Subject                | Client      |
|              | [New email]    | Client / Request link  | Name        |
|              | Search...      +------------------------+ Email       |
|              | All / Drafts   | Sender / time          | Organization|
|              |                | Message body           |             |
|              | Client         |                        | Request     |
|              | Subject        | Staff reply / time     | Date        |
|              | Preview / time | Reply body             | Status      |
|              |                |                        |             |
|              | Client         +------------------------+             |
|              | Subject        | Reply / Internal note  |             |
|              | Preview / time | Editable message       |             |
|              |                | [Template] [Save]      |             |
| Account      |                | [Review email]         |             |
+--------------+----------------+------------------------+-------------+
```

On narrower screens, context moves into a disclosure. On phones, list and thread are separate views with a back button. The editor remains reachable when the keyboard opens.

### Login

```text
+----------------------------------------------------------------------+
| Calpulli                                                             |
|                                                                      |
|              +----------------------------------------+              |
|              | Welcome back                           |              |
|              | Sign in to your staff workspace        |              |
|              |                                        |              |
|              | Email                                  |              |
|              | [you@example.org                     ] |              |
|              | Password                               |              |
|              | [password                       Show ] |              |
|              |                                        |              |
|              | [              Sign in               ] |              |
|              |                                        |              |
|              | Explore the fictional demo              |              |
|              +----------------------------------------+              |
|                                                                      |
|                        Calpulli Tonalehqueh                            |
+----------------------------------------------------------------------+
```

The demo path states its limits and grants no private-data access.

## Personal email workflow

1. Staff open a request, or select **New email** and choose a request.
2. The composer shows the client recipient and editable subject/body.
3. Staff write a personal message or insert reviewed template copy.
4. Saving preserves the draft and request association.
5. Review shows the exact recipient, subject, body, and delivery mode.
6. Staff confirm the permitted action. The current demo uses **Save for review** and does not simulate delivery. Production follows backend approval/send rules.
7. History displays the actual resulting message state.

A personal email maps to the existing `special_situation` event and `custom_follow_up` policy. The backend requires editing, approval, and explicit send. Personal email must not masquerade as an automatic milestone event. See the [API overview](API.md) and [integrations overview](INTEGRATIONS.md).

A reply links to a prior message. The backend accepts `reply_to_id` for a previously sent message in the same inquiry and recipient. Gmail threading requires provider thread IDs and RFC message headers. Visual grouping by email address is insufficient.

A new subject starts another conversation within the request context. Requests from the same client stay identifiable. A later mailbox integration can match incoming messages using provider IDs and handle unmatched mail explicitly.

The backend implements outbound delivery and reply metadata, but does not ingest incoming mail. Incoming prototype messages are fictional fixtures. Production two-way conversations require an inbound adapter and mailbox authorization.

## Draft and approval behavior

| Situation | Staff feedback | Next action |
| --- | --- | --- |
| Missing recipient, subject, or body | Field error beside incomplete input. | Complete the draft. |
| Unsaved changes | Visible unsaved state. | Save, continue, or discard explicitly. |
| Missing template values | List missing values. | Complete values and refresh preview. |
| Template not reviewed | Explain reference copy is disabled. | Review through the authorized workflow. |
| Pending approval | Written badge and context. | Authorized staff approve or edit. |
| Edit after approval | Explain approval has reset. | Review and approve again. |
| Sending | Prevent duplicate action while pending. | Wait for result. |
| Confirmed sent result | Timestamp and delivery state. | View history or compose a reply. |
| Known retryable failure | Safe fixed error and eligibility. | Explicit bounded retry when allowed. |
| Delivery uncertain | Reconciliation required. | Inspect mailbox through authorized process. No blind retry. |
| Demo review | Persistent sample context and review label. | Save without provider delivery. |

Template refresh must not overwrite staff edits silently. Editing invalidates prior approval. Saving, viewing, refreshing, and changing tabs never send mail.

## Supabase identity boundary

Supabase supports password sign-in for email identities. The form can use `signInWithPassword`, restore the session, subscribe to auth changes, and sign out through the SDK. Existing users authenticate; this dashboard does not create users or modify project auth settings. [Password-based Auth](https://supabase.com/docs/guides/auth/passwords).

The browser receives only the project URL and publishable key. Supabase distinguishes application keys from signed-in user identity. Secret and service-role keys stay server-only. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

The existing API accepts a shared `INTERNAL_API_TOKEN`, not individual Supabase user JWTs. Never place that token in a `VITE_` or `NEXT_PUBLIC_` variable. An unrestricted proxy using the shared token would also bypass individual authorization.

Before private records connect, the server must verify user tokens, check staff access, and attach verified identity to audit records. Frontend route guards control display. Server authorization protects every private read and mutation.

Business requests remain behind FastAPI. Existing Supabase tables retain restrictive browser-role permissions. Sign-in does not require opening browser access to presentation or email tables.

## Backend integration map

These are existing contracts and explicit gaps. All paths use the `/api/v1/presentations` prefix.

| UI feature | Contract | Integration note |
| --- | --- | --- |
| Presentation index | `GET` collection root | Respect limit/offset and supported filters. |
| Request detail | `GET /{inquiry_id}` | Preserve nullable historical fields. |
| Status and notes | `PATCH /{inquiry_id}` | Status requires `expected_current_status`. |
| Timeline | `GET /{inquiry_id}/activities` | Show actual actors and timestamps. |
| Email history | `GET /{inquiry_id}/emails` | Includes recommendation and unresolved tasks. |
| Prepare custom email | `POST /{inquiry_id}/email-events` | Use `special_situation` and custom approval rules. |
| Edit draft | `PATCH /{inquiry_id}/emails/{message_id}` | Resets approval. |
| Approve | `POST /{inquiry_id}/emails/{message_id}/approve` | Backend determines eligibility. |
| Send | `POST /{inquiry_id}/emails/{message_id}/send` | Never on page load. |
| Templates | `GET /email-templates` and `PUT /email-templates/{key}` | Readiness is explicit. |
| Delivery environment | `GET /email-capabilities` | Present mock, test, or live accurately. |
| Aggregate inbox | No mailbox aggregate endpoint. | Demo uses fixtures. Production needs a scoped query. |
| Incoming replies | Not implemented. | Needs read permissions, ingestion, matching, recovery. |
| Individual API identity | Not implemented. | Required before private data connects. |

See the [API overview](API.md) and [integrations overview](INTEGRATIONS.md) for existing route contracts and integration status. This is an integration plan, not a claim that the frontend calls every route.

## Preview and deployment boundaries

The reviewable milestone is a running frontend with Home, sidebar/account, list/detail, inbox/thread editor, templates, and login. Search, filters, draft edits, template insertion, review, and sign-out need observable results. Unfinished controls explain their state instead of silently doing nothing.

Vercel readiness includes a locked dependency file, passing build, environment documentation, and SPA route handling when needed. FastAPI remains a separate service. A static frontend deployment does not host PostgreSQL, Gmail credentials, or background work.

Build readiness does not imply deployment. Review the target project, environment, allowed origins, and auth redirect settings before publication. Private data and real mail remain disconnected until their authorization and integration checks pass.

## Acceptance checks

Preview checks use fictional records:

- Login has persistent labels, validation, pending feedback, password visibility, and a distinct demo path.
- Missing Supabase configuration reports setup requirements without a crash.
- Unauthenticated visitors see login unless they choose the fictional demo.
- Configured Supabase users can sign in and out. Without credentials, report live verification as not run.
- Sidebar current-page indication and bottom account menu work.
- Home actions open relevant views or records.
- Search and filters change results and show an empty state.
- A request displays its client, event, status, and history.
- A personal draft can be written, saved, reopened, and populated with editable template copy.
- Review shows the exact current recipient, subject, and body.
- Save for review stores a draft without provider requests.
- Internal notes stay out of client email previews.
- Keyboard navigation reaches required actions. Dialog dismissal returns focus.
- Narrow viewports avoid page-level horizontal overflow and provide a way back from thread to list.
- Build and type checks pass. Browser verification reports what ran and what remains unverified.

Production acceptance adds verified staff authorization, request scoping, concurrent draft handling, approved copy, isolated PostgreSQL migration checks, and an explicitly authorized redirected delivery test. A passing frontend demo does not establish those controls.
