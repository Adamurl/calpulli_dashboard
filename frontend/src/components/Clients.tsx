import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { statusLabels } from "../domain";
import type { Inquiry } from "../domain";
import { fetchPresentationIndex } from "../indexData";
import type { IndexPage } from "../indexData";
import { errorMessage } from "../presentations";
import type { LoadState } from "../presentations";
import { Skeleton } from "./Skeleton";

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function Clients({
  items,
  open,
  live = false,
}: {
  items: Inquiry[];
  open: (id: string) => void;
  live?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [records, setRecords] = useState<LoadState<IndexPage>>({
    kind: "loading",
  });
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    setRecords({ kind: "loading" });
    const timer = setTimeout(
      () => {
        fetchPresentationIndex(
          {
            query: query.trim(),
            status: null,
            ascending: false,
            index: pageIndex,
            size: 10,
          },
          controller.signal,
        )
          .then((data) => {
            if (!controller.signal.aborted) setRecords({ kind: "ready", data });
          })
          .catch((error: unknown) => {
            if (!controller.signal.aborted)
              setRecords({ kind: "error", message: errorMessage(error) });
          });
      },
      query ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [live, query, pageIndex, attempt]);
  const matches = live
    ? []
    : items.filter((item) =>
        `${item.name} ${item.organization} ${item.email}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      );
  const loading = live && records.kind === "loading";
  const failed = live && records.kind === "error";
  const rows = live
    ? records.kind === "ready"
      ? records.data.items
      : []
    : matches.slice(pageIndex * 10, (pageIndex + 1) * 10);
  const total = live
    ? records.kind === "ready"
      ? records.data.total
      : 0
    : matches.length;
  const pageCount = Math.ceil(total / 10);
  return (
    <div className="list-page">
      <div className="page-heading">
        <span className="pill">
          {loading || failed
            ? "Request contacts"
            : `${total} ${live ? "request contacts" : "sample clients"}`}
        </span>
      </div>
      <section
        className="card clients-card"
        aria-label="Clients"
        aria-busy={loading}
      >
        {loading && (
          <span className="sr-only" role="status">
            Loading clients…
          </span>
        )}
        <div className="table-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search clients"
              placeholder="Search people, email, and organizations"
              maxLength={200}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageIndex(0);
              }}
            />
          </label>
        </div>
        {failed && records.kind === "error" ? (
          <div className="data-error" role="alert">
            <p>{records.message}</p>
            <button
              className="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="template-table-wrap">
              <table className="template-table clients-table">
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Email",
                      "Company / organization",
                      "Request received",
                      "Event date",
                      "Status",
                    ].map((heading) => (
                      <th scope="col" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 10 }, (_, index) => (
                      <tr
                        className="client-skeleton"
                        key={index}
                        aria-hidden="true"
                      >
                        {Array.from({ length: 6 }, (_, column) => (
                          <td key={column}>
                            <Skeleton className="template-cell-skeleton" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length ? (
                    rows.map((item) => (
                      <tr key={item.id} onClick={() => open(item.id)}>
                        <th scope="row">
                          <button
                            className="text-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              open(item.id);
                            }}
                          >
                            {item.name}
                          </button>
                        </th>
                        <td>{item.email || "Not provided"}</td>
                        <td>{item.organization}</td>
                        <td>{dateLabel(item.receivedAt)}</td>
                        <td>{dateLabel(item.date)}</td>
                        <td>
                          <span className={`badge ${item.status}`}>
                            {statusLabels[item.status]}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        {query.trim()
                          ? "No matching clients."
                          : "No request contacts yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="data-pagination" aria-label="Client pagination">
              <span>
                {loading
                  ? "Loading clients…"
                  : total
                    ? `${pageIndex * 10 + 1}–${Math.min((pageIndex + 1) * 10, total)} of ${total}`
                    : "0 contacts"}
              </span>
              <span>
                {loading
                  ? ""
                  : `Page ${total ? pageIndex + 1 : 0} of ${pageCount}`}
              </span>
              <div className="page-buttons">
                <button
                  className="button"
                  disabled={loading || pageIndex === 0}
                  onClick={() => setPageIndex((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  className="button"
                  disabled={loading || pageIndex + 1 >= pageCount}
                  onClick={() => setPageIndex((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
