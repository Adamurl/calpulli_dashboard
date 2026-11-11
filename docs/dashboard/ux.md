# Dashboard UX and delivery plan

Proposed staff workflows and review criteria. Updated November 10, 2026.

The goal is a testable Calpulli presentation and email workspace that closely follows the refreshed Shopify admin shown in the supplied screenshots. The [style guide](style-guide.md) defines the visual system and its research sources.

This document separates the frontend preview from the production integration. The preview uses fictional records and local state. Supabase sign-in can use an existing configured Auth project. It does not grant production API access, synchronize Gmail, or send client email.

## Work model

A presentation request is the existing backend business record. Its client contact, organization, event details, status, internal notes, email messages, and activity form the staff's working context. Multiple requests from the same email address remain distinct requests. A shared client identity system is not part of this version.

The existing request states are `unknown`, `new`, `reviewing`, `proposal_sent`, `booked`, `completed`, `declined`, and `cancelled`. UI labels can replace underscores with spaces. They must retain the underlying meaning. In particular, **Booked** does not prove that a contract is signed and payment is received.

The existing email lifecycle is `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SENDING`, `SENT`, `FAILED`, and `CANCELLED`. The frontend can use a separate demo-only **Simulated** label, but must never store that as an invented production backend state.

Each compose session belongs to a request. It includes a recipient, subject, editable body, and an optional previous message for a reply. Request status and email status are separate. Sending a message does not silently move the request to another status.

## Navigation and first session

Staff arrive at login. The form accepts credentials for existing Supabase Auth users. Public self-registration is omitted for this internal workspace. Missing Supabase configuration produces a clear setup message. A separately labeled demo entry opens fictional records without pretending to authenticate a staff member.

After sign-in, staff see Home. The sidebar stays consistent across all pages. Its bottom account button shows the current identity and sign-out. Signing out clears the app's authenticated view. Loading authentication state does not briefly reveal a signed-in dashboard.

Home answers three questions in order. What needs attention? Which presentation is next? Where can staff continue their work? Metrics and action counts link to the filtered records they describe.

The recommended initial navigation is Home, Presentations, Inbox, Email templates, Activity, and Settings. Inbox can provide Drafts and Needs approval views without treating them as separate business modules.

## Wireframes

These text wireframes describe information order. They are specifications for the implemented screens and follow-up work, rather than screenshots of completed functionality.

### Application shell and Home

```text
┌──────────────────┬────────────────────────────────────────────────────┐
│ Calpulli      ◧  │ Date / workspace        Operational metric strip   │
│ Search      ⌘K   │                                                    │
│                  │                 Good evening, [name]               │
│ Home             │              Your presentations, in one place      │
│ Presentations  8 │                                                    │
│ Inbox          4 │          ┌──────────────────────────────┐          │
│ Email templates  │          │ Search requests and clients  │          │
│ Activity         │          └──────────────────────────────┘          │
│                  │           [Review drafts] [Follow up]              │
│ WORKSPACE        │                                                    │
│ Connection state │      ┌──────────────┐ ┌──────────────────────┐     │
│                  │      │ Next event   │ │ Needs your attention │     │
│                  │      └──────────────┘ └──────────────────────┘     │
│ Settings         │      ┌──────────────┐ ┌──────────────────────┐     │
│ [AA] Staff    ⌄  │      │ New requests │ │ Recent activity      │     │
└──────────────────┴──────┴──────────────┴─┴──────────────────────┴─────┘
```

### Presentation index

```text
┌ Sidebar ─────────┬────────────────────────────────────────────────────┐
│                 │ Presentations                   [New request]      │
│                 │ New requests  Reviewing  Booked  Needs approval    │
│                 │                                                    │
│                 │ [All] [New] [Reviewing] [Booked]                   │
│                 │ [Search clients or organizations...] [Status ▾]   │
│                 │ ┌────────┬─────────┬──────────┬───────┬─────────┐  │
│                 │ │Request │Client   │Event date│Status │Email    │  │
│                 │ ├────────┼─────────┼──────────┼───────┼─────────┤  │
│                 │ │#CP-... │Name     │Nov 18    │New    │Draft    │  │
│                 │ │#CP-... │Name     │Dec 02    │Booked │Approved │  │
│                 │ └────────┴─────────┴──────────┴───────┴─────────┘  │
│ Account         │ Showing visible result count                       │
└─────────────────┴────────────────────────────────────────────────────┘
```

Opening a request preserves a clear way back to the list. Production paging and sorting preserve filter state in the URL. A demo may filter its complete local dataset without claiming server pagination.

### Request detail

```text
┌ Sidebar ────────┬─────────────────────────────────────────────────────┐
│                │ ← Presentations                    [Write email]    │
│                │ #CP-1042  [Reviewing]                               │
│                │ Cultural presentation · received Nov 10             │
│                │                                                     │
│                │ ┌──────────────────────────┐  Client                │
│                │ │ Event and request details│  Name                  │
│                │ │ Date, venue, audience    │  Organization          │
│                │ └──────────────────────────┘  name@example.org      │
│                │                                                     │
│                │ ┌──────────────────────────┐  Presentation           │
│                │ │ Client email history     │  Date and time zone    │
│                │ │ Sent / draft messages    │  Venue and audience    │
│                │ │ [Compose personal email] │                        │
│                │ └──────────────────────────┘  Source / request ID    │
│                │                                                     │
│                │ ┌──────────────────────────┐                        │
│                │ │ Internal notes           │                        │
│                │ └──────────────────────────┘                        │
│ Account        │ Activity timeline                                   │
└────────────────┴─────────────────────────────────────────────────────┘
```

The client email address is selectable and linked where useful. Internal notes are explicitly private staff content and never included in outgoing email by default.

### Inbox and thread

```text
┌ Sidebar ────────┬────────────────┬───────────────────────┬────────────┐
│                │ Inbox          │ Subject of conversation│ Client     │
│                │ [New email]    │ Client · Request link  │ Name       │
│                │ Search...      ├───────────────────────┤ Email      │
│                │ All / Drafts   │ Message sender / time │ Org        │
│                │                │ Message body          │            │
│                │ Client         │                       │ Request    │
│                │ Subject        │ Staff reply / time    │ Date       │
│                │ Preview · time │ Reply body            │ Status     │
│                │                │                       │            │
│                │ Client         ├───────────────────────┤            │
│                │ Subject        │ Reply / Internal note │            │
│                │ Preview · time │ Editable message      │            │
│                │                │ [Template] [Save]     │            │
│ Account        │                │ [Review email]        │            │
└────────────────┴────────────────┴───────────────────────┴────────────┘
```

On narrower screens, client context moves to a disclosure. On phones, the list and thread are separate views with a visible back button. The editor remains reachable when the keyboard opens.

### Login

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Calpulli                                                             │
│                                                                      │
│               ┌────────────────────────────────────┐                 │
│               │ Welcome back                       │                 │
│               │ Sign in to your staff workspace    │                 │
│               │                                    │                 │
│               │ Email                              │                 │
│               │ [you@example.org                 ] │                 │
│               │ Password                           │                 │
│               │ [••••••••                  Show ] │                 │
│               │                                    │                 │
│               │ [             Sign in            ] │                 │
│               │                                    │                 │
│               │ Explore the fictional demo          │                 │
│               └────────────────────────────────────┘                 │
│                                                                      │
│                    Calpulli Tonalehqueh                               │
└──────────────────────────────────────────────────────────────────────┘
```

The demo path is labeled with its limits. A demo entry does not grant access to private records or external actions.

## Personal email workflow

1. Staff open a request or select **New email** and choose a request.
2. The composer shows the client recipient and an editable subject and body.
3. Staff write their own message or insert a reviewed template.
4. Saving preserves the draft and its request association.
5. Review displays the exact recipient, subject, body, and delivery mode.
6. Staff confirm the permitted action. The demo uses **Simulate send**. Production uses the backend's approval and send rules.
7. The message appears in the request's history with its actual resulting state.

A personal email maps to the existing `special_situation` event and `custom_follow_up` template policy. The backend requires editing, approval, and explicit send for this route. Do not represent a personal email as an automatic milestone event. See [Email workflow](../email/README.md).

A reply retains a link to its prior message. The existing backend accepts `reply_to_id` for a previously sent message in the same inquiry and recipient. Production Gmail threading requires the provider thread ID and RFC message headers. A visual grouping by client email is insufficient to establish a real Gmail thread.

Starting another subject creates another conversation within that request context. Requests from the same client stay identifiable, and staff can choose which request a message concerns. A later mailbox integration can map incoming messages using provider IDs with explicit handling for unmatched messages.

The current backend implements outbound delivery and reply metadata, but does not ingest incoming mail. Any incoming messages shown in the prototype are fictional fixtures. Production two-way conversations require a separately designed inbound adapter and mailbox authorization.

## Draft and approval behavior

| Situation | Staff feedback | Permitted next action |
| --- | --- | --- |
| Missing recipient, subject, or body | Field error beside the incomplete input. | Complete the draft. |
| Unsaved draft changes | Visible unsaved state. | Save, continue editing, or explicitly discard. |
| Missing template variables | List the missing values. | Enter the values and regenerate the preview. |
| Template not reviewed | Explain that reference copy is disabled. | Review the template through its authorized workflow. |
| Pending approval | Written badge and approval context. | Authorized staff approve or edit. |
| Edit after approval | Explain that approval has reset. | Review and approve again. |
| Sending | Prevent a second send while the request is pending. | Wait for the result. |
| Confirmed sent result | Timestamp and delivery state. | View history or compose a new reply. |
| Known safe retryable failure | Safe fixed error with retry availability. | Explicit bounded retry when the backend allows it. |
| Delivery uncertain | State that delivery needs reconciliation. | Inspect the mailbox through an authorized process. No blind retry. |
| Demo simulation | Persistent **Demo** context and **Simulated** message label. | Continue testing with fictional data. |

Template refresh must not overwrite staff edits without a deliberate action. Editing always invalidates prior approval in the existing backend. Saving, viewing, refreshing, or changing tabs must never send an email.

## Supabase identity boundary

Supabase Auth supports password sign-in for an email identity. The login form can use `signInWithPassword`, restore the active session, subscribe to auth changes, and sign out through the SDK. Login errors stay useful without exposing server details. Existing users authenticate; the dashboard does not create users or alter project auth settings. [Password-based Auth](https://supabase.com/docs/guides/auth/passwords).

The frontend receives only the Supabase project URL and a publishable API key. Supabase distinguishes the application key from the signed-in user's identity. Secret and service-role keys remain server-only. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

The existing presentation API accepts a shared `INTERNAL_API_TOKEN`. It does not yet accept individual Supabase user JWTs. Never place that internal token in a `VITE_` or `NEXT_PUBLIC_` environment variable. Do not forward any signed-in user's actions through an unrestricted shared-token proxy.

Before private records can appear in this dashboard, the server must validate the user token, verify the staff access policy, and attach verified individual identity to audit records. The frontend route guard only controls what the browser displays. Server authorization must protect every private read and mutation.

Production business requests stay behind FastAPI. Existing Supabase tables retain their restrictive browser-role permissions. Sign-in does not require opening browser access to presentation or email tables.

## Backend integration map

These are the existing application contracts or explicit gaps. Prefix the API paths with `/api/v1/presentations`.

| UI feature | Existing contract | Integration note |
| --- | --- | --- |
| Presentation index | `GET /` | Use backend limit/offset and supported filters. |
| Request detail | `GET /{inquiry_id}` | Preserve nullable historical fields. |
| Request status and notes | `PATCH /{inquiry_id}` | Status changes require `expected_current_status`. |
| Request timeline | `GET /{inquiry_id}/activities` | Display actual actors and timestamps. |
| Request email history | `GET /{inquiry_id}/emails` | Includes recommendations and unresolved tasks. |
| Prepare custom email | `POST /{inquiry_id}/email-events` | Use `special_situation`; follow custom approval rules. |
| Edit a draft | `PATCH /{inquiry_id}/emails/{message_id}` | Resets approval. |
| Approve a draft | `POST /{inquiry_id}/emails/{message_id}/approve` | Backend decides eligibility. |
| Send an approved message | `POST /{inquiry_id}/emails/{message_id}/send` | No send on page load. |
| Review templates | `GET /email-templates` and `PUT /email-templates/{key}` | Readiness is an explicit staff decision. |
| Delivery environment | `GET /email-capabilities` | Present mock, test, or live accurately. |
| Cross-request inbox | No aggregate mailbox endpoint. | Demo derives from fixtures. Production needs a scoped server query. |
| Incoming client replies | Not implemented. | Requires inbox read permissions, ingestion, matching, and recovery design. |
| Individual API user identity | Not implemented. | Required before connecting private business data. |

Read the generated [API documentation](../presentations/api.md) and [Email workflow](../email/README.md) for request bodies and errors. The table is an integration plan, not a claim that the frontend already calls these routes.

## Preview and deployment boundaries

The reviewable milestone is a running frontend with Home, sidebar/account menu, presentation list/detail, inbox/thread editor, templates, and login. Search, filters, draft edits, template insertion, simulation, and sign-out need observable results. Any unfinished control must explain its current state rather than silently doing nothing.

Vercel preparation includes a locked frontend dependency file, a successful production build, documented environment variables, and SPA route handling if the selected frontend uses client routing. The backend remains a separate service. A static frontend deployment does not host PostgreSQL, FastAPI, Gmail credentials, or background work.

No deployment is implied by build readiness. The target project, environment variables, allowed origins, and authentication redirect settings need review before publication. Private business data and real mail remain disconnected until their authorization and integration checks pass.

## Acceptance checks

The preview review uses fictional records and confirms the following behavior:

- Login has labeled controls, validation, pending feedback, a password visibility control, and a distinct demo path.
- With configuration missing, sign-in reports the setup requirement without crashing.
- Unauthenticated visitors cannot see the authenticated app view without choosing the fictional demo.
- A configured Supabase user can sign in and sign out. If real credentials are unavailable, report that live verification as not run.
- The sidebar shows the current page, and the account menu remains reachable at the bottom.
- Home actions open the relevant view or record.
- Search and filters change the visible result set and show an empty state when appropriate.
- A request opens with its client, event, status, and email history.
- Staff can write a personal email, save it, reopen it, and insert editable template copy.
- Review shows the exact current recipient, subject, and body.
- Demo send creates a visibly simulated result and makes no mail-provider request.
- Private internal notes do not appear in the client email preview.
- Keyboard navigation reaches the editor and all required actions. Dialog dismissal returns focus correctly.
- A narrow viewport has no page-level horizontal overflow, and staff can return from a thread to its list.
- Build and type checks pass. Browser checks report what ran and any unverified production behavior.

Production acceptance adds verified staff authorization, safe request scoping, concurrent draft handling, approved template copy, isolated PostgreSQL migration checks, and an explicitly authorized redirected email test. These checks are not established by passing a frontend demo.
