import {
  Search,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Columns3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { IndexQuery } from "../indexData";
import { errorMessage } from "../presentations";
import { Skeleton } from "./Skeleton";
import { createPortal } from "react-dom";
import type { Inquiry } from "../domain";
import { dateLabel } from "../data";
import { RequestStats } from "./RequestStats";
import { Badge } from "./ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

function SelectionCheckbox({
  checked,
  mixed = false,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      disabled={disabled}
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
const optionalColumns = [
  { id: "received", label: "Received" },
  { id: "date", label: "Event date" },
  { id: "name", label: "Client" },
  { id: "organization", label: "Organization" },
  { id: "guests", label: "Guests" },
  { id: "status", label: "Status" },
] as const;
type Column = (typeof optionalColumns)[number]["id"];
const tabs = [
  { label: "All", status: null },
  { label: "New", status: "new" },
  { label: "In review", status: "reviewing" },
  { label: "Booked", status: "booked" },
  { label: "Completed", status: "completed" },
] as const;
export type RemoteRequests = {
  selectionRevision: number;
  filters: IndexQuery;
  total: number;
  totalAll: number;
  loading: boolean;
  error: string | null;
  change: (filters: IndexQuery) => void;
  retry: () => void;
  exportData: (selected: string[], signal: AbortSignal) => Promise<Inquiry[]>;
};
function compareReceived(a: Inquiry, b: Inquiry, ascending: boolean) {
  const first = a.receivedAt ? Date.parse(a.receivedAt) : NaN;
  const second = b.receivedAt ? Date.parse(b.receivedAt) : NaN;
  if (!Number.isFinite(first))
    return Number.isFinite(second) ? 1 : a.id.localeCompare(b.id);
  if (!Number.isFinite(second)) return -1;
  return (
    (ascending ? first - second : second - first) || a.id.localeCompare(b.id)
  );
}
function receivedLabel(stamp: Inquiry["receivedAt"]) {
  return stamp
    ? new Date(stamp).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not provided";
}
export function Requests({
  items,
  open,
  notify,
  exportTarget,
  live = false,
  remote,
  statistics,
}: {
  items: Inquiry[];
  open: (id: string) => void;
  notify: (message: string) => void;
  exportTarget?: HTMLElement | null;
  live?: boolean;
  remote?: RemoteRequests;
  statistics?: ReactNode;
}) {
  const [localStatus, setStatus] = useState<Inquiry["status"] | null>(null);
  const [localQuery, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [remote?.selectionRevision]);
  const [localAscending, setAscending] = useState(false);
  const [hidden, setHidden] = useState<Column[]>([]);
  const [localPagination, setPagination] = useState({ index: 0, size: 10 });
  const [exporting, setExporting] = useState(false);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const status = remote ? remote.filters.status : localStatus;
  const query = remote ? remote.filters.query : localQuery;
  const ascending = remote ? remote.filters.ascending : localAscending;
  const pagination = remote
    ? { index: remote.filters.index, size: remote.filters.size }
    : localPagination;
  const filtered = remote
    ? items
    : items
        .filter(
          (item) =>
            (!status || item.status === status) &&
            `${item.name} ${item.organization} ${item.email} ${item.title}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) => compareReceived(a, b, ascending));
  const total = remote ? remote.total : filtered.length;
  const loading = remote?.loading ?? false;
  const pageCount = Math.ceil(total / pagination.size);
  const pageIndex = Math.min(pagination.index, Math.max(0, pageCount - 1));
  const rows = remote
    ? filtered
    : filtered.slice(
        pageIndex * pagination.size,
        (pageIndex + 1) * pagination.size,
      );
  const visibleColumns = optionalColumns.filter(
    (column) => !hidden.includes(column.id),
  );
  const selectedCount = remote
    ? selected.length
    : filtered.filter((item) => selected.includes(item.id)).length;
  const pageSelectedCount = rows.filter((item) =>
    selected.includes(item.id),
  ).length;
  function setPage(index: number) {
    if (remote) remote.change({ ...remote.filters, index });
    else setPagination((value) => ({ ...value, index }));
  }
  async function exportRows() {
    const controller = new AbortController();
    exportController.current?.abort();
    exportController.current = controller;
    setExporting(true);
    try {
      const exported = remote
        ? await remote.exportData(selected, controller.signal)
        : filtered.filter(
            (item) => !selectedCount || selected.includes(item.id),
          );
      controller.signal.throwIfAborted();
      const text = [
        [
          "ID",
          "Client",
          "Email",
          "Organization",
          "Event date",
          "Status",
          "Received",
          "Venue",
          "Estimated guests",
        ],
        ...exported.map((item) => [
          item.id,
          item.name,
          item.email,
          item.organization,
          item.date,
          item.status,
          item.receivedAt || "",
          item.location,
          item.guests === null ? "" : String(item.guests),
        ]),
      ]
        .map((row) =>
          row
            .map((value) => {
              const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(value)
                ? "'" + value
                : value;
              return '"' + safe.replaceAll('"', '""') + '"';
            })
            .join(","),
        )
        .join("\n");
      const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = live
        ? "calpulli-presentations.csv"
        : "calpulli-demo-presentations.csv";
      link.click();
      URL.revokeObjectURL(url);
      notify(`${exported.length} presentations exported.`);
    } catch (error) {
      if (!controller.signal.aborted) notify(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }
  function cell(column: Column, item: Inquiry) {
    switch (column) {
      case "received":
        return receivedLabel(item.receivedAt);
      case "date":
        return dateLabel(item.date);
      case "name":
        return item.name;
      case "organization":
        return (
          <button className="table-link normal" onClick={() => open(item.id)}>
            {item.organization}
          </button>
        );
      case "status":
        return <Badge status={item.status} />;
      case "guests":
        return item.guests === null ? "Not provided" : item.guests;
    }
  }
  return (
    <div className="list-page">
      {exportTarget ? (
        createPortal(
          <button
            className="button primary"
            onClick={exportRows}
            disabled={loading || !!remote?.error || !total || exporting}
          >
            <Download size={14} />
            {exporting ? "Exporting…" : "Export"}{" "}
            {selectedCount ? `(${selectedCount})` : ""}
          </button>,
          exportTarget,
        )
      ) : (
        <div className="page-heading actions-only">
          <button
            className="button primary"
            onClick={exportRows}
            disabled={loading || !!remote?.error || !total || exporting}
          >
            <Download size={14} />
            {exporting ? "Exporting…" : "Export"}{" "}
            {selectedCount ? `(${selectedCount})` : ""}
          </button>
        </div>
      )}
      {statistics ?? <RequestStats items={items} />}
      <section
        className="card table-card"
        aria-label="Presentations"
        aria-busy={loading}
      >
        <div className="table-tabs" role="group" aria-label="Filter by status">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              className={status === tab.status ? "selected" : ""}
              aria-pressed={status === tab.status}
              onClick={() => {
                if (remote)
                  remote.change({
                    ...remote.filters,
                    status: tab.status,
                    index: 0,
                  });
                else {
                  setStatus(tab.status);
                  setPage(0);
                }
                setSelected([]);
              }}
            >
              {tab.label}
              {!tab.status && (
                <span>
                  {loading ? (
                    <Skeleton className="skeleton-count" />
                  ) : remote ? (
                    remote.totalAll
                  ) : (
                    items.length
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search presentations"
              placeholder="Search and filter presentations"
              maxLength={200}
              value={query}
              onChange={(event) => {
                if (remote)
                  remote.change({
                    ...remote.filters,
                    query: event.target.value,
                    index: 0,
                  });
                else {
                  setQuery(event.target.value);
                  setPage(0);
                }
                setSelected([]);
              }}
            />
          </label>
          <details className="column-menu">
            <summary className="button compact">
              <Columns3 size={14} />
              Columns
            </summary>
            <div>
              {optionalColumns.map((column) => (
                <label key={column.id}>
                  <input
                    type="checkbox"
                    checked={!hidden.includes(column.id)}
                    onChange={(event) =>
                      setHidden((value) =>
                        event.target.checked
                          ? value.filter((id) => id !== column.id)
                          : [...value, column.id],
                      )
                    }
                  />
                  {column.label}
                </label>
              ))}
            </div>
          </details>
        </div>
        {loading && (
          <span className="sr-only" role="status">
            Loading presentation rows…
          </span>
        )}
        <Table aria-label="Presentation requests">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <SelectionCheckbox
                  label="Select all presentations on this page"
                  disabled={loading || !!remote?.error}
                  checked={
                    !loading &&
                    rows.length > 0 &&
                    pageSelectedCount === rows.length
                  }
                  mixed={
                    pageSelectedCount > 0 && pageSelectedCount < rows.length
                  }
                  onChange={(checked) =>
                    setSelected((value) =>
                      checked
                        ? [...new Set([...value, ...rows.map((row) => row.id)])]
                        : value.filter(
                            (id) => !rows.some((row) => row.id === id),
                          ),
                    )
                  }
                />
              </TableHead>
              {visibleColumns.map((column) => (
                <TableHead
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.id === "received"
                      ? ascending
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {column.id === "received" ? (
                    <button
                      className="table-sort"
                      onClick={() => {
                        if (remote)
                          remote.change({
                            ...remote.filters,
                            ascending: !ascending,
                            index: 0,
                          });
                        else {
                          setAscending(!ascending);
                          setPage(0);
                        }
                      }}
                      aria-label={`Sort by received date ${ascending ? "descending" : "ascending"}`}
                    >
                      Received{" "}
                      {ascending ? (
                        <ArrowUp size={13} />
                      ) : (
                        <ArrowDown size={13} />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: pagination.size }, (_, index) => (
                <TableRow
                  key={index}
                  aria-hidden="true"
                  className="skeleton-row"
                >
                  {Array.from(
                    { length: visibleColumns.length + 1 },
                    (_, cell) => (
                      <TableCell key={cell}>
                        <Skeleton
                          className={
                            cell === 0 ? "skeleton-checkbox" : "skeleton-cell"
                          }
                        />
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))
            ) : remote?.error ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  className="table-empty"
                >
                  <div role="alert">{remote.error}</div>
                  <button className="button compact" onClick={remote.retry}>
                    Retry table
                  </button>
                </TableCell>
              </TableRow>
            ) : rows.length ? (
              rows.map((item) => (
                <TableRow
                  key={item.id}
                  className="request-row"
                  tabIndex={0}
                  aria-label={`Open presentation for ${item.organization}, ${item.name}`}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      event.target === event.currentTarget
                    ) {
                      event.preventDefault();
                      open(item.id);
                    }
                  }}
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest(
                        "button,a,input,select,label,summary",
                      )
                    )
                      return;
                    open(item.id);
                  }}
                  data-state={
                    selected.includes(item.id) ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <SelectionCheckbox
                      label={`Select request ${item.id}`}
                      checked={selected.includes(item.id)}
                      onChange={(checked) =>
                        setSelected((value) =>
                          checked
                            ? [...value, item.id]
                            : value.filter((id) => id !== item.id),
                        )
                      }
                    />
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>
                      {cell(column.id, item)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  className="table-empty"
                >
                  No presentations found. Try another search or status.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="data-pagination">
          <span>
            {selectedCount} of {total} row(s) selected.
          </span>
          <label>
            Rows per page
            <select
              aria-label="Rows per page"
              value={pagination.size}
              onChange={(event) => {
                const size = Number(event.target.value);
                if (remote)
                  remote.change({ ...remote.filters, index: 0, size });
                else setPagination({ index: 0, size });
                setSelected([]);
              }}
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span>
            {loading
              ? "Loading rows…"
              : `Page ${total ? pageIndex + 1 : 0} of ${pageCount}`}
          </span>
          <div className="page-buttons">
            <button
              className="button compact"
              aria-label="First page"
              disabled={loading || !!remote?.error || pageIndex === 0}
              onClick={() => setPage(0)}
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              className="button compact"
              aria-label="Previous page"
              disabled={loading || !!remote?.error || pageIndex === 0}
              onClick={() => setPage(pageIndex - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="button compact"
              aria-label="Next page"
              disabled={
                loading || !!remote?.error || pageIndex + 1 >= pageCount
              }
              onClick={() => setPage(pageIndex + 1)}
            >
              <ChevronRight size={15} />
            </button>
            <button
              className="button compact"
              aria-label="Last page"
              disabled={
                loading || !!remote?.error || pageIndex + 1 >= pageCount
              }
              onClick={() => setPage(pageCount - 1)}
            >
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
