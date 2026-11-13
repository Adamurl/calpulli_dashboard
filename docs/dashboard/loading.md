# Presentation index loading

The Presentations index loads one table page and aggregated statistics independently after staff verification. A slow or failed table request does not hide statistics; a slow or failed statistics request does not block the table.

## What changed

Previously, `LiveWorkspace` fetched every 100-record summary page sequentially before showing the index. The table then filtered and sorted those records in the browser, while statistics repeatedly converted receipt timestamps for each day and metric. The table sorted event dates, which did not show when requests arrived.

The index now makes two independent reads:

| Read | Returned data | When it runs |
| --- | --- | --- |
| `/api/v1/presentations/index` | Ten summaries by default, filtered count and overall count | Initial entry, debounced search, status filter, receipt sort or page change |
| `/api/v1/presentations/statistics` | Four daily count series for the selected and previous periods | Initial entry, period change or explicit retry |

The table query selects summary columns rather than loading original form payloads and internal notes. Search, status filtering, sorting and pagination run before rows reach the browser. Receipt dates sort newest first; unknown receipt dates remain last in either direction. Event dates remain visible as a separate optional column.

The statistics query groups receipts by Los Angeles calendar date and current status, over at most two 30-day periods. It returns counts rather than request records. Unknown receipt dates are excluded; import timestamps never substitute for submission dates. These are current-status counts for a receipt cohort, not historical status transitions.

## Loading and interaction

Table headers, search and filters remain visible while row-shaped skeletons replace pending rows. Analytics have separate fixed-size placeholders and retry controls. Decorative skeleton blocks are hidden from assistive technology; their containing regions expose busy state and loading announcements. Reduced-motion preferences disable animation. The skeleton follows the [shadcn table example](https://ui.shadcn.com/docs/components/base/skeleton) using the existing CSS theme without installing a component framework.

Search waits 200 milliseconds after meaningful typing. Superseded table, period and global-search requests are aborted and stale results cannot replace the current selection. Changing a table filter does not refetch analytics. Opening and returning from details preserves table filters, page and selected statistics period. Saving status or notes refreshes the affected index and statistics and clears stale row selections.

Rows open from their ordinary cells or Enter key. Checkboxes retain selection behavior. A primary text button also provides keyboard access. The visible UUID and arrow-action columns are removed, with Status at the far right.

Export is deliberate additional work. It retrieves all matching pages, or the selected matching requests, only after Export is clicked. It does not silently export just the current page. CSV cells escape quotes and formula-leading input.

## Evidence and limits

A controlled harness executed the actual frontend fetch functions against the same 1,072-row fictional dataset, five runs per implementation. The old loader made 11 sequential calls and received 1,072 table records in every run. The new initial path made two concurrent calls and received ten table records plus aggregate series in every run. Both sets had zero errors and validated the expected returned data. The trace excludes authentication, real database execution, browser rendering and production network latency. It establishes bounded initial work and independent requests, not a measured production speedup.

Local trace artifacts and their rerunnable harness are under `.audit/index-load-*`. Browser scenarios are in `frontend/tests/index-check.html`, with a Playwright wrapper in `index-loading.spec.ts`. Those cover opposing response delays, skeletons, independent retries, search cancellation, server paging, row interaction, export completeness, CSV escaping and stale-selection clearing. See the [verification record](../../frontend/VERIFICATION.md) for observed passes and environment limits.

Other overview pages still use the existing complete-summary loader. Global search requests up to twenty matching index summaries on demand. Staff verification remains mandatory on every API call. No authentication cache, new database index, dependency, migration or production environment setting was introduced.

## Individual presentation pages

Presentations have URLs at `/presentations/[id]`. The login return path retains the ID, and Back and Forward restore the corresponding view. Named routes such as `/presentations/templates` keep their existing meanings. Demo presentation IDs are numeric; live records use UUIDs. The existing SPA fallback serves deep links on refresh.

A direct detail visit fetches the core record before starting activities and operations. It does not mount the index or fetch overview summaries. Returning to an index that was already open preserves its filters, page, and statistics period.

The initial skeleton follows the contact, event, and client sidebar layout. Once the record arrives, those fields render while operations and notes keep their own skeletons. Conversation history loads on the first visit to its tab and stays in memory for that open presentation. A slow or failed section does not hide the loaded record. Each error retries only the affected resource and preserves unsaved notes. The permanent Reload request button is removed.

Navigation aborts pending reads and ignores late responses. A pending save is allowed to settle after navigation because aborting a browser request cannot undo a server commit. A successful save refreshes the preserved index even if its detail view has closed. If the same presentation has reopened, the saved record replaces its earlier read and refreshes activity without clearing unsaved text. The closed view receives no state updates.

The development-only `frontend/tests/detail-check.html` runner uses fictional Auth and API responses to check progressive loading, deferred conversations, retries, history, login return paths, pending saves, missing records, and mobile skeleton width. `detail-loading.spec.ts` adds Playwright coverage for authenticated refresh and reduced motion. `node tests/detail-navigation.test.mjs`, run from `frontend/`, checks route parsing and rejects unsafe login destinations. These checks establish loading behavior and bounded work, not a measured production speedup.
