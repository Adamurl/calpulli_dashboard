# Dashboard verification

## Presentation loading and navigation, November 12, 2026

The Presentations index now starts separate paged-table and statistics reads, supports receipt-date ordering and server filtering/paging, and shows independent table/statistics skeletons and retries. Status is rightmost; visible UUID and arrow columns are removed; row cells and Enter open details while checkboxes retain selection. Export retrieves the entire matching set only on demand. Mutation refreshes clear stale selections. The skeleton adapts the shadcn table example with existing CSS and reduced-motion support.

Presentations is now a main sidebar section with Drafts, Clients, Templates and Activity beneath it. Inbox remains global. Child pages have scoped `/presentations/...` paths, with safe Map-backed legacy aliases. Collapsed/disclosed groups use explicit hidden state. Other-chat detail URLs and caching edits were preserved while reconciling the final component interfaces.

Final `tsc -b`, `vite build --configLoader native`, `npm run format:check` and `git diff --check` passed. The default Vite config loader stalled in this host, so the successful final production build used the documented native loader without changing repository scripts or configuration. `node --experimental-strip-types tests/navigation.test.mjs` reports **48 assertions passed**, including canonical/legacy/hash routes and invalid login-return paths. Locked offline backend sync and Ruff checks pass; the backend suite reports **226 passed, 35 skipped**. PostgreSQL integration checks require an available dedicated `_test` database and remain unverified.

A controlled harness ran actual frontend data functions against 1,072 fictional rows, five runs each. The former path made 11 sequential calls and returned 1,072 table records each time. The new initial path made two concurrent calls and returned ten table records plus the aggregate response each time. All runs validated expected data and had zero errors. This measures request work and concurrency, not production latency. Authentication, real SQL execution, browser rendering and production network timing are excluded. See [loading analysis](../docs/dashboard/loading.md).

The browser runners now define **21 loading scenarios** at `/tests/index-check.html`, **23 navigation scenarios** at `/tests/nav-check.html`, and the existing live-data regressions at `/tests/live-check.html`. Their wrappers and reduced-motion check are in Playwright. Targeted Playwright execution was attempted, but Chrome aborted with SIGABRT before assertions; the first test failed to launch and the reduced-motion test did not run. Safari access was intermittent and returned `cgWindowNotFound` before a final run could finish. These runners are provided but are not claimed as passing browser checks. The local presentation and nested template routes returned HTTP 200.

Independent source reviews found no remaining blocking backend, index or sidebar defects after fixes to search cancellation, stale selection and alias safety. No environment files, dependencies, migrations, production resources, outgoing email, pushes or deployments were changed by this index/navigation work.

## Live presentation records, November 11, 2026

The signed-in workspace now loads FastAPI records, full form answers, original submissions, read-only operations, activities, and stored email history. Dashboard status and note updates use the workspace PATCH, persist the verified staff UUID, and bypass email recommendation and dispatch. Demo data stays separate. Existing authentication, recovery pages, environment files, Vite proxy and Vercel routing were preserved.

`npm run build`, `npm run format:check`, and `git diff --check` passed. Locked offline dependency sync and backend Ruff checks passed. The backend suite reports **222 passed, 34 skipped** with the unavailable inherited integration database removed from that test process. A local PostgreSQL initialization also failed because the host could not resolve its effective user ID. No real database records or migrations were changed. PostgreSQL integration tests remain unverified.

Safari executed **18 live-data checks successfully** before the original runner's final navigation assertion raced against the previous iframe. The final page visibly showed the correct error with no partial dataset. The runner now waits for the new fixture before that assertion. Independent review also found and corrected same-user token-refresh state loss, invisible logout errors, and editable note text during saving. Session loss now clears the prior staff gate. The expanded **23-check runner has not completed a new browser run** because native app access began returning `cgWindowNotFound`. It is available at `/tests/live-check.html` and wrapped by `tests/live-data.spec.ts`.

The observed checks covered paginated summaries, header export placement, receipt-date statistics, details-first tabs, form and operations fields, nullable values and recorded zeroes, original answers, empty history, saved notes and status, conflicts, email load errors, bearer credentials, no delivery requests, no live records in local storage, and mobile overflow. These use fictional Auth and API boundaries, not a real staff login.

`npm test` was attempted. Chrome aborted at launch before assertions in all 17 tests. This is not a passing Playwright run. The updated demo runner and final expanded live runner still need browser execution. Independent backend and frontend source reviews found no remaining blocking issues after the fixes.

Read-only Supabase checks confirmed schema revision `0005`, 1,072 requests, 878 receipt timestamps, 509 operations records, and no email messages. Live production login and the deployed frontend/API integration were not tested. No environment changes, push, deployment, migrations, imports, or email delivery were performed.

## Password recovery, November 11, 2026

Added `/forgot-password` and `/reset-password` with the login typography and inputs, a centered single-column layout, and no background photograph. Recovery links are processed by the installed Supabase SDK using an isolated in-memory session; ordinary saved staff authentication is unchanged. Direct visits do not expose password inputs. The reset component mounts before the workspace, so recovery never requires staff approval or calls business APIs.

Safari reported **17 recovery checks passed** against the real SDK and a local fictional Auth network boundary. Checks covered direct visits with an existing staff session, expired links, rejected forged tokens, URL cleanup, password mismatch, server password rejection, successful updates, local sign-out, existing staff-session preservation, reload denial, root recovery callbacks, mobile width, email redirect URL, generic confirmation, and rate limits. The photograph-free desktop request page was visually inspected. The existing workspace runner also reported **51 checks passed**.

`npm run build`, `npm run format:check`, `node --check tests/auth-fixture.mjs`, and `git diff --check` passed. Independent security review found no blocking defects. No dependencies, database changes, or backend source changes; backend checks were not rerun locally.

Chrome still aborts at launch even outside the shell sandbox, before Playwright assertions. Live email delivery and real password changes were not performed. At local verification, Supabase redirect settings were still pending. Production must allow `https://www.calpullitonalehqueh.org/reset-password` as an exact Auth redirect. Request a new email after changing redirect settings. Refreshing a consumed recovery page requires a new link because recovery tokens are deliberately not persisted.

Production follow-up: commit `7632b1e` deployed successfully through Vercel and its GitHub Actions run passed. The live `/forgot-password` form loads with sign-in configured, and a direct `/reset-password` visit shows the invalid-link message without password inputs. With explicit user approval, the exact `https://www.calpullitonalehqueh.org/reset-password` redirect was added to Supabase and read back from the saved configuration. The Site URL was already the production domain. No recovery email was sent or real password changed during verification.

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

## Presentation detail loading and URLs, November 12, 2026

Individual records use `/presentations/[id]`. The core record loads first, then activities and operations independently. Conversations load on the first visit to their tab. Direct detail visits skip index, statistics, and overview requests. Each pending section uses skeletons, and failed sections retry without clearing notes or reloading the record. The permanent Reload request button is removed.

Observed checks for this change:

- `npm run build` passed after the final source edits. Installed Zod annotations and the existing bundle-size advisory remain nonfatal.
- `npm run format:check` passed. `node tests/navigation.test.mjs` passed 48 assertions, and `node tests/detail-navigation.test.mjs` passed 28 detail-route and login-destination assertions.
- Safari ran the actual React app with fictional Auth and API boundaries. `tests/detail-check.html` reported 22 checks passed, including progressive sections, deferred conversations, targeted retry with an unsaved note, history, read cancellation, missing records, pending-save navigation, staff login return paths, and mobile skeleton width. `tests/live-check.html` reported 23 checks passed. `tests/index-check.html` reported 21 checks passed, including retained table interaction and independent loading.
- A subsequent independent review found the immediate-reopen variant of the pending-save race. The final source fix hands the saved record to the reopened detail, cancels its older read, and refreshes activity. The reviewer verified the fix with no blockers. The expanded detail runner now has a check that reopens before the previous save finishes. Its final browser run was interrupted when native browser window access failed with `cgWindowNotFound`, so no passing result is claimed for that added case.
- Playwright's selected suites were attempted, but installed Chrome aborted with `SIGABRT` before assertions. The official temporary headless-browser download also failed DNS resolution for `cdn.playwright.dev`. Browser refresh with an authenticated session and reduced-motion emulation have Playwright tests in `tests/detail-loading.spec.ts` but no observed pass from this run.

To repeat the manual detail checks, run the frontend locally, open `/tests/detail-check.html`, and select **Run detail checks**. No production records, schema, credentials, deployment, or external service settings changed in this task. No production latency improvement is claimed.

## Clients skeletons and navigation polish, November 12, 2026

Clients now renders contact-shaped skeletons with an announced busy state while its existing data loader runs. Its search input and query survive loading. Activity is removed from workspace navigation and rendering; old flat, nested, and fragment links return to Presentations. Per-presentation activity history remains available. Submenu rows are 28 pixels tall without vertical margins or a guide line. Main statistics numbers align with the right edge of their headings, with change indicators to the left.

`npm run build` and `npm run format:check` passed. The route suites passed 46 navigation assertions and 28 detail-route assertions. In Safari, the actual React app's fictional-data runner at `/tests/clients-check.html` reported **13 clients checks passed**. It checked loading announcements, placeholders, retained search, compact submenu spacing, removed Activity navigation, preserved detail activity, old-route redirects, exact heading/value alignment, and mobile overflow. New Playwright scenarios in `tests/clients-loading.spec.ts` were added but were not executed here; Chrome's startup failure from the prior check remains unresolved. Reduced-motion browser emulation is therefore not claimed. No dependencies, backend code, or external data changed in this task.
