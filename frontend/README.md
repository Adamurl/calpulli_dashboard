# Calpulli workspace

A React + TypeScript frontend, inspired by the Shopify admin references. Vite builds a static app deployed alongside FastAPI in one Vercel project.

## Run locally

Requires Node 22.12+ and npm.

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:5173 and sign in with an approved staff account to load records through FastAPI on port 8000. Choose **Explore demo workspace** separately to review fictional conversations. The local environment prepared for this task already points to the Calpulli Tonalehqueh Supabase project using its public publishable key. No secret server key is used.

## Authentication and data

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to sign in with an existing Supabase email/password user. No public signup is provided. Set `VITE_ENABLE_DEMO=true` to expose the sample workspace. Leave it false or unset to disable demo entry. Supabase manages session persistence, refresh, auth events, and logout. Missing or malformed public authentication settings disable sign-in and show the login page instead of crashing at startup. `VITE_SUPABASE_URL` must be an HTTP or HTTPS project URL, without surrounding quotes in the Vercel value. Rebuild after changing build variables.

After login, the frontend sends the session JWT to `/api/v1/auth/me` and opens the workspace only after the backend verifies staff approval. Configure the backend's Supabase URL, publishable key, and `STAFF_USER_IDS` using the [staff authentication instructions](../README.md#supabase-staff-authentication). For local login, run FastAPI on port 8000; Vite proxies `/api` to it. Demo mode makes no protected API calls.

Approved staff load real presentation records through the same-origin FastAPI service. The Presentations index independently requests one server-filtered, receipt-sorted page and aggregated statistics. Opening a presentation loads the core record, activity, and read-only operations independently. The detail page keeps presentation data alongside two tabs: Activity and Email thread. The Activity timeline records notes, status changes, edited presentation details, and email workflow events. Email history loads when its tab opens. Status changes and detail edits do not send email automatically from the workspace endpoint. The demo uses a separate `calpulli-demo-v1` browser store. Real business records stay in memory and never enter that sample store. Existing public and server environment settings are reused; no additional environment variables are required.

Home lives at `/`. Signed-out visitors go to `/login`; protected deep links return to the requested page after login. Presentations is the main business section, with Drafts, Clients, and Templates beneath it. Those pages use `/presentations/drafts`, `/presentations/clients`, and `/presentations/templates`; old flat links remain aliases. The standalone Activity page is removed for now. Its old URLs redirect to Presentations, while individual presentation activity histories remain available. Home, Inbox, and Settings stay global. Workspace navigation supports reload, Back, and Forward. Legacy links such as `/#inbox` migrate to `/inbox`. The login return path is restricted to workspace pages.

Individual presentations use `/presentations/[id]`. Direct links retain their destination through login and staff verification. Browser history restores details or the index, and returning to a previously opened index preserves its filters. A direct detail view loads its request, activity, and operations; it also loads one hidden index page for the previous/next controls, while skipping statistics and overview reads. The persistent **Reload request** button is removed; failed sections offer targeted retries.

## Features to review

- Desktop sidebar with a persistent collapsed icon rail, mobile drawer, bottom account menu, logout, search with Cmd/Ctrl+K, notifications. Presentations has an automatically expanded submenu without an arrow. Gray selection backgrounds appear only on main navigation sections.
- Live presentation overview, search, client snapshots, full details, saved status/detail changes, and notes. The detail header has previous/next controls for the visible index page. Demo Home retains its sample overview.
- Clients keeps its search field visible while contact-shaped skeletons load. Search text remains intact when contacts arrive. The presentation submenu uses compact rows without a vertical guide. Main statistics values align with the right edge of their headings; change indicators sit to the left.
- Presentation table with independent table/statistics skeletons, status tabs, debounced server search, receipt-date sorting, whole-row navigation, page selection, column visibility, page-size controls and server pagination. Status is the rightmost column; request UUIDs and arrow controls are omitted. Export loads the full filtered set only when requested.
- Live email template editing, workflow trigger/readiness labels, customer/staff variable reference.
- Live email drafts and explicit approval-gated send/reply actions from each presentation's Email thread. Replies continue the saved Gmail provider thread. Delivery mode is shown before sending; mock and redirected test deliveries are labeled. Incoming customer replies are not synchronized into the dashboard.
- Read-only payment, engagement, invoice, COI, attendance, and logistics information where an operations record exists. Historical assumptions remain labeled.
- Saving a draft does not send it. Manual sends require staff approval. Activating templates marked Automatic enables their registered automatic workflows; the template editor displays that behavior before activation.

## Verify

```bash
npm run build
npm run format:check
npm test
```

Playwright uses locally installed Google Chrome. The test server starts on port 5173 if no existing preview is running. Tests cover the login boundary, invalid-login error, request search and detail, status changes, notes, persisted and edited drafts, review queue, templates, mobile navigation, and logout. External auth responses are intercepted in the invalid-login test; a real account login requires an existing user's credentials and is not claimed by this test.

See [verification results](VERIFICATION.md) for the current checks and limitations. The development-only demo runner at `/tests/browser-check.html` resets only this origin's fictional workspace. The new `/tests/live-check.html` exercises live-data behavior with fictional Auth and API responses and leaves stored user data unchanged. Its Playwright wrapper is `tests/live-data.spec.ts`. Neither runner is included in the production build. Real staff login and the production data connection require separate live verification.

## Vercel preparation

Import the repository with **Root Directory** set to the repository root, not `frontend`. The root [`vercel.json`](../vercel.json) defines the `frontend` Vite service and `backend` FastAPI service, public routing, SPA fallback, and response headers. Frontend commands run inside `frontend` using `npm ci`, `npm run build`, and output `dist`.

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables. Enable demo only on a deliberate preview deployment. The frontend uses same-origin `/api/v1/...` requests with the logged-in user's current JWT. No service binding is needed for browser-to-public-API requests. Runtime binding URLs cannot be read by this static browser app or during its build. Never put database credentials, server secrets, or a fixed user JWT in a `VITE_` variable.

See the root [Vercel setup instructions](../README.md#vercel-services) for backend environment variables and local verification. Deployment does not provision PostgreSQL or run migrations. No deployment has been made by this change.

## Design

See [style guide](../docs/dashboard/style-guide.md) and [UX and integration plan](../docs/dashboard/ux.md). The interface uses black, white, and gray, with color reserved for request status badges. Login uses the provided Calpulli logo and name above a form on the left half, with the supplied full-color photograph on the right. Mobile shows only the form. Forgot password opens the email recovery request form. Page headers contain one title and its icon.

The login and table adapt the [shadcn login reference](https://ui.shadcn.com/blocks/login) and [dashboard reference](https://ui.shadcn.com/blocks#dashboard-01) to the existing CSS setup. Shared table elements live in `src/components/table.tsx`; no Tailwind, TanStack, chart, or drag-and-drop dependencies were added. The shared table consumes the `Inquiry` display model; API responses are validated before mapping nullable historical fields into the display. `RequestStats.tsx` provides Today (default), Last 7 days, and Last 30 days. Counts and monochrome lines use receipt dates in America/Los_Angeles and current request statuses, comparing equal calendar-day periods ending today. Unknown receipt dates are excluded rather than replaced with import timestamps. Today has one daily bucket, not hourly history. This control changes statistics, not table filters. The index has no maximum width. The package registry was unreachable during this change.

Components live in `src/components`, domain schemas in `src/domain.ts`, sample fixtures in `src/data.ts`, Supabase client in `src/auth.ts`, and shared visual tokens in `src/styles.css`.

## Password recovery

`/forgot-password` sends a Supabase recovery email using the current site's `/reset-password` URL. The response does not reveal whether an account exists. `/reset-password` is reachable without a staff session, but only an initial Supabase recovery link plus a verified Auth session enables password entry. Missing, expired, and invalid links show a request-new-link action. Passwords must match and contain at least eight characters; Supabase also enforces the project's password policy.

Recovery uses the SDK's implicit email-link flow in an isolated, in-memory client. It does not replace or clear an existing browser staff session and never mounts the workspace or calls staff APIs. After an update, the recovery session signs out locally. Reloading the page after tokens are removed requires a new email link. Standard dashboard emails redirected to the root are also recognized when Supabase supplies `type=recovery`.

In **Supabase → Authentication → URL Configuration**, use `https://www.calpullitonalehqueh.org` as the Site URL and add this exact production Redirect URL:

```text
https://www.calpullitonalehqueh.org/reset-password
```

For local development, separately allow `http://127.0.0.1:5173/reset-password`. Keep the recovery email template's default confirmation link so Supabase verifies the one-time token before redirecting. A custom template must preserve that verification step; linking directly to the page grants no reset access. The application sends the redirect URL when requesting an email. Existing emails may retain their old redirect, so request a fresh email after configuration changes. No server secret key belongs in the frontend.

### Local recovery browser checks

The fixture uses fictional users and never sends mail. In separate terminals, run from `frontend/`:

```bash
node tests/auth-fixture.mjs
```

```bash
VITE_SUPABASE_URL=http://127.0.0.1:5182 VITE_SUPABASE_PUBLISHABLE_KEY=fictional-public-key VITE_ENABLE_DEMO=true npm run dev -- --port 5175 --strictPort
```

Open `http://127.0.0.1:5175/tests/recovery-check.html` and click **Run recovery checks**. These development-only files are excluded from the Vite production build. Do not use the fictional environment values in a deployment. This checks the real SDK against a mocked Auth network boundary; it does not verify live mail delivery or real-account password changes.

### Template and presentation editing

Templates use a compact table with workflow email policies, active status, and last edit dates. Select a row or its template-name button to edit; the heading sits beside workspace search. Template placeholders remain editable in subject and message text. Contact, event, and payment facts are visible on presentation details, with other operations under a disclosure. Activity composers use the signed-in staff profile name and initials. Event types are toggle chips.

The reusable `DatePicker` uses the generated shadcn `Calendar`, React DayPicker 10 and date-fns 4 for the current event-date field. It preserves date-only API values, supports keyboard navigation, month/year selection and clearing, and returns focus to its trigger after selection or Escape. Its calendar uses a light theme.

To verify with fictional Auth/API boundaries, open `/tests/presentation-polish-check.html` in the local development server and choose **Run polish checks**, or run `npx playwright test tests/presentation-polish.spec.ts`. These fixtures are excluded from the production build.

The shadcn calendar was added from `frontend/` with `npx shadcn@latest add calendar` using the Base UI / Nova preset. `components.json` and the `@/` alias support future component installation. Tailwind 4 compiles only the generated UI directory; `src/shadcn.css` excludes the global reset and scopes theme variables to the calendar so existing app styles remain intact. The generated calendar forwards its day-button ref to preserve keyboard focus. The CLI, unused animation helpers and optional font are not runtime dependencies.

### Collapsible controls

`npx shadcn@latest add collapsible` installs the Base UI Collapsible primitive used by detail disclosures, the status chooser, calendar panel, statistics period and column pickers, and sidebar disclosures. The status chooser uses labeled radio choices and the existing status-save handler. Its text and chevron have equal horizontal insets. Detail disclosure triggers use matching top/bottom padding and show keyboard focus. Run `/tests/collapsible-check.html` on the local development server to check these controls with fictional data.
