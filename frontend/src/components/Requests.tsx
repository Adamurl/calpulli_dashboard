import {
  Search,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Columns3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
const optionalColumns = [
  { id: "date", label: "Event date" },
  { id: "name", label: "Client" },
  { id: "organization", label: "Organization" },
  { id: "status", label: "Status" },
  { id: "guests", label: "Guests" },
] as const;
type Column = (typeof optionalColumns)[number]["id"];
const tabs = [
  { label: "All", status: null },
  { label: "New", status: "new" },
  { label: "In review", status: "reviewing" },
  { label: "Booked", status: "booked" },
  { label: "Completed", status: "completed" },
] as const;
export function Requests({
  items,
  open,
  notify,
}: {
  items: Inquiry[];
  open: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [status, setStatus] = useState<Inquiry["status"] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [ascending, setAscending] = useState(false);
  const [hidden, setHidden] = useState<Column[]>([]);
  const [pagination, setPagination] = useState({ index: 0, size: 10 });
  const filtered = items
    .filter(
      (item) =>
        (!status || item.status === status) &&
        `${item.name} ${item.organization} ${item.id} ${item.title}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  const pageCount = Math.ceil(filtered.length / pagination.size);
  const pageIndex = Math.min(pagination.index, Math.max(0, pageCount - 1));
  const rows = filtered.slice(
    pageIndex * pagination.size,
    (pageIndex + 1) * pagination.size,
  );
  const visibleColumns = optionalColumns.filter(
    (column) => !hidden.includes(column.id),
  );
  const selectedCount = filtered.filter((item) =>
    selected.includes(item.id),
  ).length;
  const pageSelectedCount = rows.filter((item) =>
    selected.includes(item.id),
  ).length;
  function setPage(index: number) {
    setPagination((value) => ({ ...value, index }));
  }
  function exportRows() {
    const exported = filtered.filter(
      (item) => !selectedCount || selected.includes(item.id),
    );
    const text = [
      ["ID", "Client", "Organization", "Date", "Status"],
      ...exported.map((item) => [
        item.id,
        item.name,
        item.organization,
        item.date,
        item.status,
      ]),
    ]
      .map((row) =>
        row.map((value) => '"' + value.replaceAll('"', '""') + '"').join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "calpulli-sample-presentations.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify("Sample presentations exported.");
  }
  function cell(column: Column, item: Inquiry) {
    switch (column) {
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
        return item.guests;
    }
  }
  return (
    <div className="list-page">
      <div className="page-heading actions-only">
        <button className="button" onClick={exportRows}>
          <Download size={14} />
          Export {selectedCount ? `(${selectedCount})` : ""}
        </button>
      </div>
      <RequestStats items={items} />
      <section className="card table-card" aria-label="Presentations">
        <div className="table-tabs" role="group" aria-label="Filter by status">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              className={status === tab.status ? "selected" : ""}
              aria-pressed={status === tab.status}
              onClick={() => {
                setStatus(tab.status);
                setSelected([]);
                setPage(0);
              }}
            >
              {tab.label}
              {!tab.status && <span>{items.length}</span>}
            </button>
          ))}
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search presentations"
              placeholder="Search and filter presentations"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected([]);
                setPage(0);
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
        <Table aria-label="Presentation requests">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">
                <SelectionCheckbox
                  label="Select all presentations on this page"
                  checked={rows.length > 0 && pageSelectedCount === rows.length}
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
              <TableHead scope="col">Request</TableHead>
              {visibleColumns.map((column) => (
                <TableHead
                  key={column.id}
                  scope="col"
                  aria-sort={
                    column.id === "date"
                      ? ascending
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {column.id === "date" ? (
                    <button
                      className="table-sort"
                      onClick={() => {
                        setAscending(!ascending);
                        setPage(0);
                      }}
                      aria-label={`Sort by event date ${ascending ? "descending" : "ascending"}`}
                    >
                      Event date{" "}
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
              <TableHead scope="col">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((item) => (
                <TableRow
                  key={item.id}
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
                  <TableCell>
                    <button
                      className="table-link"
                      onClick={() => open(item.id)}
                    >
                      #{item.id}
                    </button>
                  </TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>
                      {cell(column.id, item)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <button
                      className="icon-button"
                      aria-label={`Open request ${item.id}`}
                      onClick={() => open(item.id)}
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + 3}
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
            {selectedCount} of {filtered.length} row(s) selected.
          </span>
          <label>
            Rows per page
            <select
              aria-label="Rows per page"
              value={pagination.size}
              onChange={(event) =>
                setPagination({ index: 0, size: Number(event.target.value) })
              }
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span>
            Page {filtered.length ? pageIndex + 1 : 0} of {pageCount}
          </span>
          <div className="page-buttons">
            <button
              className="button compact"
              aria-label="First page"
              disabled={pageIndex === 0}
              onClick={() => setPage(0)}
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              className="button compact"
              aria-label="Previous page"
              disabled={pageIndex === 0}
              onClick={() => setPage(pageIndex - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="button compact"
              aria-label="Next page"
              disabled={pageIndex + 1 >= pageCount}
              onClick={() => setPage(pageIndex + 1)}
            >
              <ChevronRight size={15} />
            </button>
            <button
              className="button compact"
              aria-label="Last page"
              disabled={pageIndex + 1 >= pageCount}
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
