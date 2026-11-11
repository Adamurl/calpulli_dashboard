# Dashboard verification

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
