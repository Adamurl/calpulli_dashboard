# Dashboard verification

## Password recovery, November 11, 2026

Added `/forgot-password` and `/reset-password` with the login typography and inputs, a centered single-column layout, and no background photograph. Recovery links are processed by the installed Supabase SDK using an isolated in-memory session; ordinary saved staff authentication is unchanged. Direct visits do not expose password inputs. The reset component mounts before the workspace, so recovery never requires staff approval or calls business APIs.

Safari reported **17 recovery checks passed** against the real SDK and a local fictional Auth network boundary. Checks covered direct visits with an existing staff session, expired links, rejected forged tokens, URL cleanup, password mismatch, server password rejection, successful updates, local sign-out, existing staff-session preservation, reload denial, root recovery callbacks, mobile width, email redirect URL, generic confirmation, and rate limits. The photograph-free desktop request page was visually inspected. The existing workspace runner also reported **51 checks passed**.

`npm run build`, `npm run format:check`, `node --check tests/auth-fixture.mjs`, and `git diff --check` passed. Independent security review found no blocking defects. No dependencies, database changes, or backend source changes; backend checks were not rerun locally.

Chrome still aborts at launch even outside the shell sandbox, before Playwright assertions. Live email delivery, real password changes, and live Supabase redirect settings were not changed or verified. Production must allow `https://www.calpullitonalehqueh.org/reset-password` as an exact Auth redirect. Request a new email after changing redirect settings. Refreshing a consumed recovery page requires a new link because recovery tokens are deliberately not persisted.

## Root and clean routes, November 11, 2026

Production Chrome reproduced the blank screen at the root. Its console reported `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.` during client initialization. Public auth configuration now validates before client construction; malformed settings leave sign-in disabled with the existing administrator notice.

Safari reported **51 checks passed**, including root-to-login routing, Home at `/`, clean navigation, Back and Forward, logout, protected deep links, legacy hash migration, and existing desktop/mobile workflows. A separate Vite server with an intentionally invalid Supabase URL and demo disabled displayed `/login`, the administrator notice, and a disabled login button instead of a blank page.

`npm run build`, `npm run format:check`, and `git diff --check` passed. Independent source review found no blocking defects; its token-refresh navigation observation was corrected by depending on signed-in status rather than the session object. No new dependencies or backend changes. Backend checks were not rerun.

Playwright was attempted but Chrome aborted at startup before assertions. New authenticated routing tests remain unexecuted here; real-user sign-in was not tested. Production authentication still requires a valid `VITE_SUPABASE_URL` build value and redeployment. The code fix does not change Vercel settings.

## Login and statistics follow-up, November 11, 2026

Safari reported **41 checks passed**, including the two-column login dimensions, loaded background photograph, visual-only password reset control, arrow-free submit button, Today default, 7-day and 30-day changes, event-date totals, wide-screen expansion, rounded checkboxes, and existing desktop/mobile workflows. The login was visually inspected at desktop size. Build and formatting checks passed.

Statistics use local calendar days and current request statuses. No creation timestamps or historical status transitions exist in the sample model. Today displays a flat single-day line rather than invented hourly values. No charting dependency was added. Chrome's previously observed startup failure remains unresolved; the new Playwright coverage has not run assertions in Chrome. Real sign-in and password recovery were not tested; password recovery is intentionally visual only.

## Frontend refresh, November 11, 2026

- `npm run build` passed TypeScript checking and the production Vite build.
- `npm run format:check` passed. `git diff --check` passed.
- Safari displayed **32 checks passed** in `tests/browser-check.html`. This includes the collapsed icon rail, a single page title, page size, next-page navigation, page selection, mixed selection, column visibility, empty results, mobile table overflow, search, date sorting, request detail, status changes, notes, draft persistence, templates, mobile navigation, and logout.
- The centered login and desktop presentation table with the collapsed sidebar were visually inspected in Safari. The supplied logo renders correctly on both light and dark backgrounds.
- `npm test` failed before assertions because Chrome aborted at launch. Retrying outside the shell sandbox had the same result. The five Playwright tests remain unverified in Chrome.
- The npm registry could not resolve. No dependency or lockfile changes were made. The shadcn table elements and login layout were adapted to the existing CSS setup; table state uses the existing `Inquiry` model.
- Real-user authentication, live backend data, and CSV download contents were not reverified. Authentication logic is unchanged. Backend checks were not rerun because no backend files changed. No push or deployment was performed.

The Model the Domain principle kept the existing request model and explicit pagination state. Prove It Works required the live Safari workflow checks in addition to the build.

## Earlier verification

Observed November 10, 2026. Scope is the new frontend; ongoing backend work was preserved.

## Passed

- `npm run build` completed TypeScript checking and a production Vite build.
- `npm run format:check` passed after formatting.
- `git diff --check` passed.
- npm installation reported no known dependency vulnerabilities at installation time.
- The local preview returned HTTP 200 on http://127.0.0.1:5173.
- Login, Home, and request detail were visually inspected through native browser screenshots.
- The development-only [browser runner](tests/browser-check.html) reported **22 checks passed** in Safari, observed through its accessibility tree. It exercised the real React app in an iframe at desktop and 390px widths.

The browser checks covered malformed URL fallback; gated login; password visibility; sample disclosure and identity; presentation filtering; event date sorting in both directions; client/event context; request status updates; internal notes; required email fields; saving personal drafts; review content and delivery disclosure; persistence across reload; template insertion; global search into draft history; local sample storage; mobile detail/inbox overflow; hidden/open mobile navigation; account logout; and absence of uncaught browser errors.

A read-only source review found date sorting, malformed-fragment, mobile drawer visibility, and secondary contrast issues. These were corrected before the successful browser run. Subsequent changes were formatting, copy, a password accessible label, and a login illustration caption position.

## Verification limits

`npm test` was attempted twice. Chrome aborted at startup under the host sandbox, before the four Playwright tests could run assertions. This is not a passing Playwright run. The Safari runner provides the observed browser behavior checks instead. Its source remains available to reproduce them; it resets only the origin's fictional demo store. It is excluded from the production build.

Supabase email/password authentication uses the SDK and the Calpulli project's public publishable key, but a real existing-user login was not performed because no user credentials were supplied. The Playwright invalid-auth-response test was written but not executed past browser startup. Session refresh and real network auth failure behavior remain unverified live.

No real client records were fetched. No database migrations, backend changes, live email, Gmail sync, deployment, push, or external resource changes were performed by this dashboard task. Backend quality checks were not rerun because this task did not change backend source. Existing backend changes were already present at task start.

Vite emits nonfatal comments from the installed Zod package and a bundle-size advisory. The build exits successfully. This is a reviewable frontend preview, not a production authorization or email-delivery release.
