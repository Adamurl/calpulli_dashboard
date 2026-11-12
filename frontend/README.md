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

Open http://127.0.0.1:5173 and choose **Explore demo workspace**. The local environment prepared for this task already points to the Calpulli Tonalehqueh Supabase project using its public publishable key. No secret server key is used.

## Authentication and data

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to sign in with an existing Supabase email/password user. No public signup is provided. Set `VITE_ENABLE_DEMO=true` to expose the sample workspace. Leave it false or unset to disable demo entry. Supabase manages session persistence, refresh, auth events, and logout. Missing or malformed public authentication settings disable sign-in and show the login page instead of crashing at startup. `VITE_SUPABASE_URL` must be an HTTP or HTTPS project URL, without surrounding quotes in the Vercel value. Rebuild after changing build variables.

After login, the frontend sends the session JWT to `/api/v1/auth/me` and opens the workspace only after the backend verifies staff approval. Configure the backend's Supabase URL, publishable key, and `STAFF_USER_IDS` using the [staff authentication instructions](../README.md#supabase-staff-authentication). For local login, run FastAPI on port 8000; Vite proxies `/api` to it. Demo mode makes no protected API calls.

All business records are still fictional in both authenticated and demo views. The auth check returns only the verified user UUID, not business records. The sample store uses `calpulli-demo-v1` in this browser's local storage, shared across sample sessions in this browser. Reset it in Settings. Never store real client data there. Before connecting real records, implement business-data loading, audit identities, conflict handling, and email delivery configuration. Existing endpoints and incoming-email gaps are mapped in [the UX plan](../docs/dashboard/ux.md).

Home lives at `/`. Signed-out visitors go to `/login`; protected deep links return to the requested page after login. Workspace navigation uses paths such as `/presentations` and supports reload, Back, and Forward. Legacy links such as `/#inbox` migrate to `/inbox`. The login return path is restricted to workspace pages.

## Features to review

- Desktop sidebar with a persistent collapsed icon rail, mobile drawer, bottom account menu, logout, search with Cmd/Ctrl+K, notifications.
- Home overview, attention list, upcoming presentations, and derived sample counts.
- Presentation table with status tabs, search, date sorting, page selection, column visibility, page-size controls, pagination, CSV export, and details.
- Client conversations, personal email composer, editable saved drafts, review queue, and internal notes.
- Sample templates, clients, activity, and connection settings.
- Draft review saves the message for review. No messages are sent or synchronized.

## Verify

```bash
npm run build
npm run format:check
npm test
```

Playwright uses locally installed Google Chrome. The test server starts on port 5173 if no existing preview is running. Tests cover the login boundary, invalid-login error, request search and detail, status changes, notes, persisted and edited drafts, review queue, templates, mobile navigation, and logout. External auth responses are intercepted in the invalid-login test; a real account login requires an existing user's credentials and is not claimed by this test.

The observed verification for this task is a successful production build and 41 browser-run checks in Safari. Headless Playwright could not launch Chrome in this host sandbox, so the Playwright tests are provided but did not execute their assertions here. The additional browser runner at http://127.0.0.1:5173/tests/browser-check.html runs the app in an iframe at desktop and 390px widths and reports each check. It resets only this origin's fictional workspace when you click Run browser checks. This development-only HTML is excluded from the production build. Real account login was not tested with user credentials.

## Vercel preparation

Import the repository with **Root Directory** set to the repository root, not `frontend`. The root [`vercel.json`](../vercel.json) defines the `frontend` Vite service and `backend` FastAPI service, public routing, SPA fallback, and response headers. Frontend commands run inside `frontend` using `npm ci`, `npm run build`, and output `dist`.

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables. Enable demo only on a deliberate preview deployment. The frontend uses same-origin `/api/v1/...` requests with the logged-in user's current JWT. No service binding is needed for browser-to-public-API requests. Runtime binding URLs cannot be read by this static browser app or during its build. Never put database credentials, server secrets, or a fixed user JWT in a `VITE_` variable.

See the root [Vercel setup instructions](../README.md#vercel-services) for backend environment variables and local verification. Deployment does not provision PostgreSQL or run migrations. No deployment has been made by this change.

## Design

See [style guide](../docs/dashboard/style-guide.md) and [UX and integration plan](../docs/dashboard/ux.md). The interface uses black, white, and gray, with color reserved for request status badges. Login uses the provided Calpulli logo and name above a form on the left half, with the supplied full-color photograph on the right. Mobile shows only the form. Forgot password opens the email recovery request form. Page headers contain one title and its icon.

The login and table adapt the [shadcn login reference](https://ui.shadcn.com/blocks/login) and [dashboard reference](https://ui.shadcn.com/blocks#dashboard-01) to the existing CSS setup. Shared table elements live in `src/components/table.tsx`; no Tailwind, TanStack, chart, or drag-and-drop dependencies were added. Table state stays with the existing `Inquiry` model in `Requests.tsx`. `RequestStats.tsx` provides Today (default), Last 7 days, and Last 30 days. Counts and monochrome lines use event dates and current request statuses, comparing equal calendar-day periods ending today. Today has one daily bucket, not hourly history. This control changes statistics, not table filters. The index has no maximum width. The package registry was unreachable during this change.

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
