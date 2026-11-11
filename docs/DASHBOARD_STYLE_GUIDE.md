# Calpulli dashboard style guide

Design reference and component specification. Researched November 10, 2026.

This guide defines a Shopify-inspired staff workspace for presentation requests and client email. The three screenshots supplied by the user establish the visual target. Calpulli retains its own name, content, and organizational identity.

The first dashboard is a frontend demo with fictional business records. Supabase sign-in uses a configured project URL and public publishable key. Production business data, individual backend authorization, mailbox synchronization, and live delivery remain separate integration work. A signed-in frontend alone does not secure business APIs.

## Research findings

### Refreshed admin layout

Shopify documents a gradual rollout of its refreshed admin. In the refreshed layout, search, the store switcher, and alerts move into the sidebar. Earlier screenshots with a horizontal global search bar represent another layout. The user’s screenshots establish the target placement. Shopify also documents `Ctrl+K` and `Cmd+K` for search. [Navigating the Shopify admin](https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview).

Shopify Home combines operational metrics, actions that need attention, and a card feed. Its content varies with store maturity and permissions. Calpulli adapts that structure to inquiries, approvals, upcoming presentations, and recent conversations. The greeting, card grid, and measurements below come from the supplied screenshots and this design, rather than a claim that every Shopify account has identical Home content. [Shopify Home page](https://help.shopify.com/en/manual/shopify-admin/shopify-home).

### Current Polaris guidance

The latest App Home documentation resolved to Polaris v2.0 during research. It describes web components and App Bridge for applications embedded inside Shopify admin. Calpulli is a standalone FastAPI application. Its frontend can use native React components and CSS that follow the observed design without importing Shopify’s embedded shell. [App Home](https://shopify.dev/docs/api/app-home/latest).

Shopify’s pattern catalog includes homepage, index, details, and settings templates. Its smaller compositions include index tables, metrics, resource lists, callouts, account connections, and setup guides. These provide a useful vocabulary for Calpulli’s component inventory. [Page patterns](https://shopify.dev/docs/api/app-home/latest/patterns).

The component reference groups actions, feedback, forms, layout, and media. Buttons, badges, banners, search fields, text areas, menus, tables, grids, and sections all have direct uses here. This specification names equivalent Calpulli components, rather than requiring Shopify package imports. [Polaris web components](https://shopify.dev/docs/api/app-home/latest/web-components).

The Polaris migration guide concerns iframe applications and App Bridge. It maps older React components to newer components and patterns. Articles about `@shopify/polaris` remain useful historical context but do not establish the current visual shell. [Polaris React migration guide](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react).

### Inbox behavior

Shopify Inbox supports conversation search, staff assignment, conversation details, and customer context. Staff open a conversation and compose a reply. Calpulli adapts that context beside an email history and draft editor. A preview inbox must not imply that real client replies have synchronized. [Managing customer conversations](https://help.shopify.com/en/manual/inbox/conversations).

Shopify’s inbox settings cover quick replies, notifications, availability, and message preferences. Reviewed Calpulli templates support repeated staff communication. Autonomous replies, availability automation, and notification delivery are outside this prototype. [Configuring Shopify Inbox](https://help.shopify.com/en/manual/inbox/configure-inbox).

## Screenshot observations

The following observations come from the supplied images. Measurements are approximate visual estimates, not extracted Shopify tokens.

| Reference | Observed structure | Calpulli adaptation |
| --- | --- | --- |
| Image 1, Home | Near-black sidebar, white rounded workspace, compact metrics, centered greeting, large input card, action pills, card feed. | Home with request metrics, task search, follow-up shortcuts, and operational cards. |
| Image 2, Orders | Persistent shell, compact title and actions, horizontal metrics, search/filter toolbar, dense table, understated badges. | Presentation index with client, organization, event date, request status, and email state. |
| Image 3, detail | Back navigation, identifier and badges, broad main column, narrow context column, stacked cards, timeline. | Request detail with email work in the main column and client/event context on the right. |
| All images | Settings and workspace/account controls remain at the bottom. | Staff identity and sign-out remain reachable independently of page scrolling. |

The screenshots use very small text at their captured scale. Calpulli preserves the hierarchy and density with readable text and larger interactive targets.

## Visual tokens

These are proposed Calpulli values. They approximate the screenshots and can change after feedback.

| Token | Value | Use |
| --- | --- | --- |
| `sidebar-bg` | `#101010` | Persistent navigation. |
| `sidebar-hover` | `#242424` | Navigation hover. |
| `sidebar-active` | `#303030` | Current page. |
| `sidebar-text` | `#d4d4d4` | Navigation labels. |
| `sidebar-muted` | `#a3a3a3` | Group labels and secondary copy. |
| `canvas` | `#f7f7f5` | Quiet background around sections. |
| `surface` | `#ffffff` | Main workspace and cards. |
| `surface-subdued` | `#f5f5f5` | Table headers and secondary areas. |
| `text` | `#202223` | Primary copy. |
| `text-muted` | `#616161` | Descriptions and metadata. |
| `border` | `#e7e7e7` | Cards, dividers, inputs. |
| `primary` | `#303030` | Primary buttons. |
| `link` | `#005bd3` | Record links. |
| `success-bg` / `success-text` | `#cdf5d6` / `#0c5132` | Completed and confirmed states. |
| `attention-bg` / `attention-text` | `#fff0a8` / `#684900` | Missing information or approval. |
| `info-bg` / `info-text` | `#d8efff` / `#00527c` | Informational states. |
| `danger-bg` / `danger-text` | `#fee9e8` / `#8e1f0b` | Failures and destructive actions. |
| `focus` | `#005bd3` | Visible keyboard focus. |
| `accent` | Muted forest green | Small Calpulli illustrations and avatars. |

Color accompanies written states. A yellow badge says **Needs approval**. A green badge says **Booked**. A colored dot alone cannot communicate a critical state.

### Typography and spacing

Use a system sans-serif stack such as `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. A remote font is optional.

| Element | Size | Weight | Notes |
| --- | --- | --- | --- |
| Page title | 22px | 650 | Operational pages. |
| Home greeting | 28px | 600 | Restrained line length. |
| Card title | 14px | 600 | One line where practical. |
| Body and controls | 13px | 400 to 500 | Default working density. |
| Table body | 12px to 13px | 400 | Important identifiers use 550. |
| Metadata | 12px | 400 | Preserve contrast. |
| Metric value | 22px to 26px | 600 | Tabular numerals. |

Spacing follows a 4px scale. Common values are 4, 8, 12, 16, 20, 24, and 32px. Cards use 16 to 20px padding. Table cells use 8 to 12px vertical padding. Keep clickable areas at least 32px on desktop and 44px on touch layouts.

### Shape and elevation

| Element | Radius | Treatment |
| --- | --- | --- |
| Main workspace | 16px at desktop edge | White against dark shell. |
| Cards | 12px to 16px | Thin border and subtle shadow. |
| Buttons and inputs | 8px | Small shadow on raised buttons. |
| Navigation item | 8px | Active state within sidebar padding. |
| Status badge | 5px to 7px | Compact text with optional icon. |
| Action chip | Full pill | Shortcuts and counts. |
| Dialog | 16px | Clear edge and dimmed backdrop. |

A suitable card shadow is `0 1px 3px rgb(0 0 0 / 4%), 0 5px 16px rgb(0 0 0 / 3%)`. Reserve stronger elevation for menus, dialogs, and the composer. Avoid decorative shadows behind tables.

## Shell and navigation

Desktop sidebar width is approximately 216 to 232px at normal browser zoom. The supplied capture appears narrower because of its display scale. The sidebar fills the viewport and scrolls independently when needed. The content fills the remaining space without forcing page-level horizontal overflow.

The recommended navigation follows the staff’s work:

1. Workspace identity and sidebar control.
2. Search with a `Cmd+K` or `Ctrl+K` hint.
3. Home.
4. Presentations, with contextual views when active.
5. Inbox, with an actionable count.
6. Email templates.
7. Activity.
8. A small Workspace group for configuration and connection status.
9. Settings and account controls at the bottom.

Client context belongs within a request or conversation. Do not imply a separate shared-contact system exists. Event management stays out of active navigation until implemented.

The bottom account button contains an initials avatar, signed-in email or display name, workspace name, and chevron. Its menu contains identity information and sign-out. The demo account says **Demo workspace**. An unverified role must not appear as an authorization guarantee.

## Component inventory

This inventory is a reusable design specification. It does not mean every proposed component is implemented.

| Component | Content and behavior | Primary screens |
| --- | --- | --- |
| `AppShell` | Sidebar, content, responsive navigation, skip link. | All authenticated views. |
| `WorkspaceIdentity` | Calpulli mark and workspace name. | Sidebar, login. |
| `NavItem` | Icon, label, active state, count, current-page semantics. | Sidebar. |
| `AccountMenu` | Avatar, identity, environment label, sign-out. | Sidebar bottom. |
| `SearchDialog` | Query, keyboard dismissal, grouped record/navigation results. | Global. |
| `PageHeader` | Back link, title, status, primary action. | Index, detail. |
| `MetricStrip` | Dated operational values with clear scope. | Home, index. |
| `MetricCard` | Label, value, contextual note or real trend. | Home. |
| `SectionCard` | Heading, description, content, optional action. | All pages. |
| `ActionCard` | One task and a clear destination. | Home. |
| `ActionChip` | Compact shortcut and optional count. | Home. |
| `StatusBadge` | Written state and semantic color. | Requests, messages. |
| `FilterTabs` | View selection and data-derived counts. | Index, inbox. |
| `SearchField` | Label, query, clear action, empty result handling. | Index, inbox. |
| `RequestTable` | Semantic headers, sorting, record links, status/date. | Presentations. |
| `SelectionToolbar` | Selected count and implemented bulk actions. | Index, when supported. |
| `EmptyState` | Specific reason and recovery action. | Lists, search. |
| `ClientSummary` | Name, organization, email, request links. | Detail, inbox. |
| `EventSummary` | Date, time zone, venue, audience, status. | Detail context. |
| `ConversationList` | Sender, subject, excerpt, time, unread/selected state. | Inbox. |
| `ConversationHeader` | Subject, client, request link, lifecycle state. | Thread. |
| `MessageCard` | Sender, recipient, time, body, delivery label. | Thread. |
| `EmailComposer` | Recipient, subject, body, template choice, draft controls. | Inbox, detail. |
| `ReviewDialog` | Exact recipient, subject, body, environment, confirmation. | Email review. |
| `TemplateEditor` | Subject, body, readiness, variable guidance. | Templates. |
| `ActivityTimeline` | Time, actor, action, related request/message. | Detail, activity. |
| `InternalNote` | Private staff note distinct from outgoing email. | Detail. |
| `ConnectionStatus` | Configured, unavailable, demo, or verified state. | Settings. |
| `NoticeBanner` | Demo context, blocked delivery, connection issue. | Contextual. |
| `Toast` | Brief result announcement with persistent error elsewhere. | Mutations. |
| `LoginForm` | Email, password, visibility control, pending/error state. | Login. |
| `Skeleton` | Stable loading geometry. | Auth and data views. |

Use native controls where possible. Extract components when multiple views share behavior or state needs independent ownership.

## Screen composition

Home is calm and centered, like Image 1. An operational metric strip sits above the greeting. A large search card points to real navigation and tasks. Action chips lead to approvals and follow-ups. Cards show upcoming presentations, recent inquiries, and email work. Avoid invented revenue, growth percentages, or live visitor counts.

The presentation index follows Image 2. Keep its title and primary action small. Place views, search, and filters immediately above the table. Use light dividers and a subdued header. Avoid wrapping every desktop row in a separate rounded card.

Request detail follows Image 3. Its main column contains event details, email work, internal notes, and activity. Its right column contains the client, contact details, source, and event summary. Target about 660 to 760px for main content and 260 to 300px for context.

Inbox uses a conversation list and selected thread. Client context appears on the right when space permits. Email bodies use paragraph spacing and selectable text. Staff messages appear as email cards rather than consumer chat bubbles.

Login uses a centered form and Calpulli identity. A secondary panel may use a quiet geometric motif and one sentence about the staff workspace. Avoid a marketing carousel or fake testimonials.

## Responsive and accessible behavior

| Width | Layout target |
| --- | --- |
| At least 1280px | Full sidebar, wide table, detail context beside content. |
| 900px to 1279px | Full or compact sidebar, detail context can move below, two-column inbox. |
| Below 900px | Drawer navigation and single-column cards. |
| Below 640px | List or thread at one time with explicit back control. Tables scroll in a labeled region or use equivalent compact rows. |

Keyboard users can reach navigation, filters, links, menus, editors, and actions. Dialogs trap focus, close with Escape, and return focus to their trigger. Focus rings remain visible on dark and light backgrounds. A skip link bypasses the sidebar.

Inputs have persistent labels. Login supports password managers with `autocomplete="username"` and `autocomplete="current-password"`. Errors describe the field and recovery action. A visibility button’s accessible name changes with its state.

Unread, selected, pending, failed, and disabled states have text or accessible names. Use `aria-live` for action results and errors without announcing each keystroke. Respect reduced-motion preferences. Avoid shifting table rows during interaction.

Normal text targets at least 4.5:1 contrast. Verify muted sidebar copy, badges, placeholders, and focus indicators. Hover cannot be the only way to reveal a required action.

## Content and trust

Use Presentation request, Client, Draft, Needs approval, Approved, and Sent consistently. Production **Sent** requires confirmed provider delivery state. The current demo uses **Save for review** and does not simulate delivery. Browser-local drafts identify their storage scope.

Use fictional names and reserved example email addresses in fixtures and screenshots. Private CSV records stay outside the frontend bundle. Imported counts must not appear as live frontend data.

Every action needs a result. Search opens a working search experience. Template insertion produces editable text. Connection badges distinguish configuration from verified connection. Omit unfinished controls or explain why they are unavailable.

See [Dashboard UX and delivery plan](DASHBOARD_UX.md) for wireframes, workflow rules, and production integration boundaries.
