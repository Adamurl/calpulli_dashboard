# Calpulli dashboard style guide

Design reference and component specification. Researched November 10, 2026.

This guide defines a Shopify-inspired staff workspace for presentation requests and client email. The supplied screenshots are the visual reference. Calpulli keeps its own name, content, and organizational identity.

The first dashboard is a frontend demo with fictional business records. Supabase sign-in uses the configured project URL and public publishable key. Production presentation data, individual backend authorization, mailbox synchronization, and live delivery are separate integration work. A signed-in frontend alone does not secure business APIs.

## Research findings

### The refreshed admin is the relevant reference

Shopify documents a gradual rollout of its refreshed admin. In the refreshed layout, search, the store switcher, and alerts move into the sidebar. Earlier screenshots with a horizontal global search bar represent another layout. Use the user's screenshots as the target for placement. Shopify also documents `Ctrl+K` and `Cmd+K` for search. [Navigating the Shopify admin](https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview).

Shopify Home combines operational metrics, actions that need attention, and a card feed. Its content differs with store maturity and permissions. Calpulli adapts that structure to inquiries, approvals, upcoming presentations, and recent conversations. The precise greeting, grid, and spacing below come from the supplied screenshots and this design, rather than a claim that every Shopify account has the same Home page. [Shopify Home page](https://help.shopify.com/en/manual/shopify-admin/shopify-home).

### Current Polaris guidance is useful without its embedded runtime

The latest App Home documentation resolved to Polaris v2.0 during research. It describes web components and App Bridge for applications embedded inside Shopify admin. That environment differs from this standalone FastAPI application. Calpulli uses its own React components and CSS rather than importing an embedded Shopify shell. [App Home](https://shopify.dev/docs/api/app-home/latest).

Shopify's pattern catalog includes homepage, index, details, and settings templates. Its smaller compositions cover index tables, metrics, resource lists, callouts, account connections, and setup guides. These provide a useful vocabulary for Calpulli's component inventory. [Page patterns](https://shopify.dev/docs/api/app-home/latest/patterns).

The current component reference groups actions, feedback, forms, layout, and media. Buttons, badges, banners, search fields, text areas, menus, tables, grids, and sections all have direct uses here. This inventory describes equivalent Calpulli components; the names do not promise Shopify package imports. [Polaris web components](https://shopify.dev/docs/api/app-home/latest/web-components).

The Polaris migration guide concerns iframe applications and their integration with App Bridge. It maps older React components to newer components and patterns. Existing articles about `@shopify/polaris` remain useful historical context, but they do not establish the current visual shell. [Polaris React migration guide](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react).

### Inbox provides a behavior reference

Shopify Inbox supports conversation search, staff assignment, conversation details, and customer context. Staff open a conversation and compose a reply. Calpulli adapts that context beside an email history and draft editor. A preview inbox must not imply that real client replies have been synchronized. [Managing customer conversations](https://help.shopify.com/en/manual/inbox/conversations).

Shopify's inbox settings cover quick replies, notifications, availability, and message preferences. Calpulli's reviewed email templates play a similar role for repeated staff communication. Autonomous replies, availability automation, and notification delivery are outside this prototype. [Configuring Shopify Inbox](https://help.shopify.com/en/manual/inbox/configure-inbox).

## Screenshot observations

The following observations come from the three images supplied by the user. Measurements are approximate visual estimates, not extracted Shopify tokens.

| Reference | Observed structure | Calpulli adaptation |
| --- | --- | --- |
| Image 1, Home | Near-black narrow sidebar, white rounded workspace, compact metric strip, centered greeting, large input card, small action pills, card feed. | Home with request metrics, a task prompt, follow-up shortcuts, and operational cards. |
| Image 2, Orders | Same persistent shell, compact title/actions, horizontal metrics, search/filter toolbar, dense table, understated status badges. | Presentation index with client, organization, date, request status, and email state. |
| Image 3, order detail | Back navigation, identifier and badges, broad main column, narrow context column, stacked cards, timeline. | Client request detail with email history and editor in the main column; client and event context on the right. |
| All images | Sidebar settings and workspace/account controls stay at the bottom. | Staff identity and sign-out remain reachable independent of the main page's scroll. |

The screenshots use very small text at their captured scale. Calpulli preserves the density and hierarchy while using readable text and larger interactive targets.

## Visual tokens

These are Calpulli design values. They approximate the screenshots and can change after feedback.

| Token | Value | Use |
| --- | --- | --- |
| `sidebar-bg` | `#101010` | Persistent navigation. |
| `sidebar-hover` | `#242424` | Hovered navigation item. |
| `sidebar-active` | `#303030` | Current page. |
| `sidebar-text` | `#d4d4d4` | Navigation labels. |
| `sidebar-muted` | `#a3a3a3` | Group labels and secondary copy. |
| `canvas` | `#f7f7f5` | Quiet background around sections. |
| `surface` | `#ffffff` | Main workspace and cards. |
| `surface-subdued` | `#f5f5f5` | Table headers and secondary areas. |
| `text` | `#202223` | Primary copy. |
| `text-muted` | `#616161` | Descriptions and metadata. |
| `border` | `#e7e7e7` | Cards, dividers, and inputs. |
| `primary` | `#303030` | Primary buttons. |
| `link` | `#005bd3` | Client links and secondary navigation. |
| `success-bg` / `success-text` | `#cdf5d6` / `#0c5132` | Confirmed and completed states. |
| `attention-bg` / `attention-text` | `#fff0a8` / `#684900` | Waiting for approval or missing information. |
| `info-bg` / `info-text` | `#d8efff` / `#00527c` | Reviewing and informational notices. |
| `danger-bg` / `danger-text` | `#fee9e8` / `#8e1f0b` | Failures and destructive actions. |
| `focus` | `#005bd3` | Visible keyboard focus. |
| `accent` | Muted forest green | Calpulli identity in small illustrations and avatars. |

Use color with a written state. A yellow badge says **Needs approval**. A green badge says **Booked**. A colored dot alone cannot communicate a critical state.

### Typography and spacing

Use a system sans-serif stack such as `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Do not require a remote font for the app to render.

| Element | Size | Weight | Notes |
| --- | --- | --- | --- |
| Page title | 22px | 650 | Compact operational pages. |
| Home greeting | 28px | 600 | Centered with restrained line length. |
| Card title | 14px | 600 | One line where practical. |
| Body and controls | 13px | 400 to 500 | Default working density. |
| Table body | 12px to 13px | 400 | Important identifiers use 550. |
| Metadata | 12px | 400 | Preserve contrast. |
| Metric value | 22px to 26px | 600 | Tabular numerals. |

Spacing follows a 4px scale. Common values are 4, 8, 12, 16, 20, 24, and 32px. Cards use 16 to 20px padding. Table cells use 8 to 12px vertical padding. Keep operational controls compact without reducing their clickable area below 32px on desktop or 44px on touch layouts.

### Shape and elevation

| Element | Radius | Treatment |
| --- | --- | --- |
| Main workspace | 16px at desktop edge | White against the dark shell. |
| Cards | 12px to 16px | Thin border and subtle shadow. |
| Buttons and inputs | 8px | Small shadow on raised buttons. |
| Navigation item | 8px | Active state stays inside sidebar padding. |
| Status badge | 5px to 7px | Compact text with optional icon. |
| Action chip | Full pill | Used for shortcuts and counts. |
| Dialog | 16px | Clear edge and dimmed backdrop. |

A suitable card shadow is `0 1px 3px rgb(0 0 0 / 4%), 0 5px 16px rgb(0 0 0 / 3%)`. Reserve stronger elevation for menus, dialogs, and the composer. Large gradients and decorative shadows do not belong behind tables.

## Shell and navigation

Desktop sidebar target width is 216 to 232px at normal browser zoom. The user's capture appears narrower because of its display scale. The sidebar fills the viewport and has its own scroll region if necessary. The content column fills the remaining space without forcing the page wider than the viewport.

Navigation order follows the staff's work:

1. Workspace identity and sidebar control.
2. Search with `Cmd+K` or `Ctrl+K` hint.
3. Home.
4. Presentations, with contextual views when active.
5. Inbox, with unread or actionable count.
6. Email templates.
7. Activity.
8. A small **Workspace** group for configuration and connection status.
9. Settings and account controls pinned at the bottom.

Client context belongs within a request or conversation. Do not imply that a separate shared-contact system exists. Future event management stays out of the active navigation until implemented.

The bottom account button contains an initials avatar, the signed-in email or display name, the workspace name, and a chevron. Its menu contains account information and sign-out. The demo account says **Demo workspace**. Do not present an unverified role as an authorization guarantee.

## Component inventory

The inventory is a reusable design specification. It does not mean every proposed component is already implemented.

| Component | Content and behavior | Primary screens |
| --- | --- | --- |
| `AppShell` | Sidebar, content area, responsive navigation, skip link. | All signed-in screens. |
| `WorkspaceIdentity` | Calpulli mark, workspace name, compact visual identifier. | Sidebar and login. |
| `NavItem` | Icon, label, active state, optional count, accessible current-page state. | Sidebar. |
| `AccountMenu` | Avatar, signed-in identity, environment label, sign-out. | Sidebar bottom. |
| `SearchDialog` | Search text, keyboard dismissal, grouped navigation and record results. | Global. |
| `PageHeader` | Breadcrumb or back link, title, optional status, primary action. | Index and detail. |
| `MetricStrip` | Small set of dated operational values with clear scope. | Home and index. |
| `MetricCard` | Label, value, optional contextual note or real trend. | Home. |
| `SectionCard` | Border, heading, description, content, optional footer action. | All pages. |
| `ActionCard` | One staff task and a clear destination. | Home. |
| `ActionChip` | Compact shortcut with optional count. | Home. |
| `StatusBadge` | Written state and semantic color. | Requests and messages. |
| `FilterTabs` | View selection and counts derived from current data. | Index and inbox. |
| `SearchField` | Label, query, clear action, empty-results handling. | Index and inbox. |
| `RequestTable` | Semantic headers, sortable fields, client links, status and date. | Presentations. |
| `SelectionToolbar` | Selected count and only implemented bulk actions. | Index, when supported. |
| `EmptyState` | Specific reason, clear recovery action, no decorative filler. | Lists and search. |
| `ClientSummary` | Name, organization, email, and relevant request links. | Detail and inbox. |
| `EventSummary` | Date, time zone, venue, audience, request status. | Detail context. |
| `ConversationList` | Sender, subject, excerpt, time, unread state, selection. | Inbox. |
| `ConversationHeader` | Subject, client, request link, lifecycle state. | Thread. |
| `MessageCard` | Sender, recipient, timestamp, body, delivery label. | Thread. |
| `EmailComposer` | Recipient, subject, body, template choice, draft controls. | Inbox and request detail. |
| `ReviewDialog` | Exact recipient, subject, body preview, delivery environment, confirmation. | Email review. |
| `TemplateEditor` | Name, subject, body, readiness state, variable guidance. | Templates. |
| `ActivityTimeline` | Timestamp, actor, action, related request or message. | Detail and activity. |
| `InternalNote` | Private staff note clearly distinguished from client email. | Request detail. |
| `ConnectionStatus` | Configured, unavailable, demo, or connected state with explanation. | Settings. |
| `NoticeBanner` | Demo mode, blocked delivery, or recoverable connection issue. | Contextual. |
| `Toast` | Brief result announcement without hiding persistent errors. | Mutations. |
| `LoginForm` | Email, password, visibility control, pending state, error, sign-in. | Login. |
| `Skeleton` | Stable loading geometry while authentication or records load. | Data screens. |

Use native controls where possible. A component earns a separate module when multiple screens share its behavior or its state needs independent ownership.

## Screen composition

Home is calm and centered, like Image 1. An operational metric strip sits above the greeting. A large command/search card points to real navigation and tasks. Below it, action chips lead to approvals and follow-ups. Cards show upcoming presentations, recent inquiries, and the email workflow. Avoid invented revenue, growth percentages, or live visitor counts.

The presentation index follows Image 2. Keep its title and primary action small. Place views, search, and filters directly above the table. Use light dividers and a subdued header. Show status badges at a consistent size. Avoid wrapping every row in a separate rounded card on desktop.

Request detail follows Image 3. Its main column contains event details, email work, internal notes, and the activity timeline. Its right column contains the client, contact details, request source, and event summary. The detail column remains readable at about 660 to 760px. The context column is about 260 to 300px.

Inbox uses a conversation list and a selected thread. Client context appears in a right column when space permits. The email body uses normal paragraph spacing and selectable text. Staff replies are email cards, rather than consumer chat bubbles.

Login uses a centered, restrained form with the Calpulli workspace identity. A secondary panel may show a quiet geometric motif and one sentence about the staff workspace. Keep this page visually related to the app, with no marketing carousel or fake testimonials.

## Responsive and accessible behavior

| Width | Layout target |
| --- | --- |
| At least 1280px | Full sidebar, wide tables, detail context beside content, inbox context when available. |
| 900px to 1279px | Full or compact sidebar; detail context can move below content; inbox uses two columns. |
| Below 900px | Drawer navigation, full-width workspace, single-column cards. |
| Below 640px | Show conversation list or thread at one time, with an explicit back control. Tables scroll inside a labeled region or use equivalent compact rows. |

Keyboard users can reach all navigation, filters, row links, menus, editors, and actions. Dialogs trap focus, close with Escape, and return focus to their trigger. The first content heading receives focus after full-page navigation when appropriate. Focus rings remain visible on dark and light backgrounds.

Inputs have persistent labels. Login supports password managers and `autocomplete="username"` and `autocomplete="current-password"`. Errors describe the field and recovery action. A password visibility button has an accessible label that changes with its state.

Unread, selected, pending, failed, and disabled states have text or accessible names. Use `aria-live` for action results and loading errors. Do not announce every keystroke. Respect reduced-motion preferences and avoid animation that shifts table rows while staff are working.

Use text contrast of at least 4.5:1 for normal text. Test muted sidebar copy, badges, placeholder text, and keyboard focus. Hover cannot be the only way to reveal a required action.

## Content and trust

Use **Presentation request**, **Client**, **Draft**, **Needs approval**, **Approved**, and **Sent** consistently. **Sent** requires a confirmed provider result in production. Demo actions say **Simulate send** and produce **Simulated** records. A browser-local draft is identified as local.

Use fictional names and reserved example email addresses in screenshots and demo fixtures. Private CSV records remain outside the frontend bundle. No dashboard card should show imported counts as if they were live frontend data.

Show one clear action per card. Omit inactive feature buttons or explain their unavailable state. Global search must open an actual search experience. A template button must insert editable copy. A connection badge must distinguish configuration from a verified live connection.

For workflow details, wireframes, and production integration boundaries, see [Dashboard UX and delivery plan](ux.md).
