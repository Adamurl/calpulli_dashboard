# Calpulli workspace

A standalone React + TypeScript frontend, inspired by the Shopify admin references. Vite builds a static app that can run on Vercel separately from the existing FastAPI service.

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

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to sign in with an existing Supabase email/password user. No public signup is provided. Set `VITE_ENABLE_DEMO=true` to expose the sample workspace. Leave it false or unset to disable demo entry. Supabase manages session persistence, refresh, auth events, and logout.

All business records are fictional in both authenticated and demo views. No production API or database queries are made. The demo stores drafts, notes, archived conversations, read state, and request status changes under `calpulli-demo-v1` in this browser's local storage. It is a shared sample store for this browser, not a per-user server store. Reset it in Settings. It must never be repurposed to store real client data. Reloading exits demo mode; drafts persist.

The frontend does not expose the backend's `INTERNAL_API_TOKEN`. Before connecting real records, implement server-side Supabase JWT verification and staff authorization, per-user data isolation, authorized API calls, audit identities, conflict handling, and email delivery configuration. Existing backend email endpoints and incoming-email gaps are mapped in [the UX plan](../docs/DASHBOARD_UX.md). Supabase sign-in alone is not authorization to read Calpulli records.

## Features to review

- Desktop sidebar, mobile drawer, bottom account menu, logout, search with Cmd/Ctrl+K, notifications.
- Home overview, attention list, upcoming presentations, and derived sample counts.
- Presentation list with status tabs, search, date sorting, selection, CSV export, and details.
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

The observed verification for this task is a successful production build and 22 browser-run checks in Safari. Headless Playwright could not launch Chrome in this host sandbox, so those four tests are provided but did not execute their assertions here. The additional browser runner at http://127.0.0.1:5173/tests/browser-check.html runs the app in an iframe at desktop and 390px widths and reports each check. It resets only this origin's fictional workspace when you click Run browser checks. This development-only HTML is excluded from the production build. Real account login was not tested with user credentials.

## Vercel preparation

Import the repository with **Root Directory** set to `frontend`. Framework is **Vite**, build command `npm run build`, output `dist`, install command `npm ci`. Add the two public Supabase variables. Enable demo only on a deliberate preview deployment. `vercel.json` includes SPA routing and basic response headers. No deployment has been made by this task.

The frontend can be deployed as a fictional-data preview independently. A production data deployment requires the server authorization work above and a deployed FastAPI backend. Vercel deployment does not host the current persistent Python/PostgreSQL backend automatically.

## Design

See [style guide](../docs/DASHBOARD_STYLE_GUIDE.md) and [UX and integration plan](../docs/DASHBOARD_UX.md). Components live in `src/components`, domain schemas in `src/domain.ts`, sample fixtures in `src/data.ts`, Supabase client in `src/auth.ts`, and shared visual tokens in `src/styles.css`.
