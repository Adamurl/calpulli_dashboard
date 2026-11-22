import { optionalText } from "../display";
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  RefreshCw,
  Search,
} from "lucide-react";
import type { z } from "zod";
import { ApiError, apiFetch } from "../api";
import { vendorPath, vendorYears } from "../navigation";
import type { VendorRoute, VendorYear } from "../navigation";
import type { LoadState } from "../presentations";
import {
  vendorDetailSchema,
  vendorListSchema,
  vendorStatsSchema,
  vendorStages,
} from "../vendorData";
import { VendorRecord } from "./VendorRecord";
import { Skeleton } from "./Skeleton";

import type { VendorStage } from "../vendorData";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { TablePagination } from "./TablePagination";
import { TableColumnsMenu, useTableColumns } from "./TableColumnsMenu";
import type { SortOption, TableSort } from "./TableColumnsMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type VendorNavigate = (route: VendorRoute) => void;
const indexPath = "/api/v1/mny/vendors";
const columns = [
  { id: "received", label: "Applied on", sort: "received" },
  { id: "name", label: "Vendor", sort: "name" },
  { id: "contact", label: "Contact name", sort: null },
  { id: "category", label: "Category", sort: null },
  { id: "count", label: "Requested spots", sort: null },
  { id: "spots", label: "Assigned spots", sort: null },
  { id: "deadline", label: "Paid before deadline", sort: null },
  { id: "stage", label: "Status", sort: null },
] as const;
type Column = (typeof columns)[number]["id"];
const vendorSortOptions = [
  {
    id: "received",
    label: "Applied on",
    directions: ["Oldest first", "Newest first"],
  },
  { id: "name", label: "Vendor", directions: ["A to Z", "Z to A"] },
  { id: "contact", label: "Contact name", directions: ["A to Z", "Z to A"] },
  { id: "category", label: "Category", directions: ["A to Z", "Z to A"] },
  {
    id: "stage",
    label: "Status",
    directions: ["New to assigned", "Assigned to new"],
  },
] as const satisfies readonly SortOption<string>[];
type VendorSort = (typeof vendorSortOptions)[number]["id"];
const stages: { label: string; value: VendorStage | null }[] = [
  { label: "All", value: null },
  { label: "New", value: "applied" },
  { label: "Accepted", value: "accepted" },
  { label: "Paid", value: "paid" },
  { label: "Spot assigned", value: "spot_assigned" },
];
const applicationDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
});
const metrics = [
  { key: "total_vendors", label: "Vendors" },
  { key: "total_paid", label: "Total paid" },
  { key: "requested_spots", label: "Requested spots" },
  { key: "assigned_spots", label: "Assigned spots" },
] as const;

const number = new Intl.NumberFormat();
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function useVendorResource<T>(
  path: `/api/v1/${string}`,
  schema: z.ZodType<T>,
  delay = 0,
  revision = 0,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    attempt: number;
    revision: number;
    state: LoadState<T>;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiFetch(path, { signal: controller.signal })
        .then(async (response) => schema.parse(await response.json()))
        .then((data) => {
          if (!controller.signal.aborted)
            setResult({
              path,
              attempt,
              revision,
              state: { kind: "ready", data },
            });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              path,
              attempt,
              revision,
              state: {
                kind: "error",
                message:
                  error instanceof ApiError
                    ? error.message
                    : "Unable to load vendor data. Please try again.",
              },
            });
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [path, schema, attempt, delay, revision]);
  const state: LoadState<T> =
    result?.path === path &&
    result.attempt === attempt &&
    result.revision === revision
      ? result.state
      : { kind: "loading" };
  return { state, retry: () => setAttempt((value) => value + 1) };
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="data-error" role="alert">
      <p>{message}</p>
      <button className="button" onClick={retry}>
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}

function follow(
  event: MouseEvent<HTMLAnchorElement>,
  route: VendorRoute,
  navigate: VendorNavigate,
) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(route);
}

function VendorStatistics({
  year,
  navigate,
  state,
  retry,
}: {
  year: VendorYear;
  navigate: VendorNavigate;
  state: LoadState<z.infer<typeof vendorStatsSchema>>;
  retry: () => void;
}) {
  return (
    <section
      className="request-stats vendor-stats"
      aria-label={`${year} vendor statistics`}
      aria-busy={state.kind === "loading"}
    >
      <div className="period-menu">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="vendor-year-trigger"
            aria-label={`Event year, ${year}`}
          >
            <CalendarDays size={13} aria-hidden="true" />
            <span>{year}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label="Event year">
            <DropdownMenuRadioGroup
              value={year}
              onValueChange={(value) => {
                const selected = vendorYears.find((option) => option === value);
                if (selected && selected !== year)
                  navigate({ year: selected, id: null });
              }}
            >
              {vendorYears.map((option) => (
                <DropdownMenuRadioItem
                  className="dropdown-menu-item"
                  key={option}
                  value={option}
                  closeOnClick
                >
                  {option}
                  <DropdownMenuRadioItemIndicator>
                    <Check size={14} aria-hidden="true" />
                  </DropdownMenuRadioItemIndicator>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {state.kind === "error" ? (
        <div className="stats-error">
          <LoadError message={state.message} retry={retry} />
        </div>
      ) : (
        metrics.map(({ key, label }) => {
          const zeroWhenEmpty =
            key === "total_paid" || key === "requested_spots";
          const value =
            state.kind === "ready"
              ? (state.data[key] ?? (zeroWhenEmpty ? 0 : null))
              : null;
          return (
            <div className="request-stat" key={key}>
              <div className="stat-copy">
                <span className="stat-label">{label}</span>
                <div className="stat-value">
                  {state.kind === "loading" ? (
                    <Skeleton className="skeleton-stat-value" />
                  ) : value === null ? (
                    <span className="muted">-</span>
                  ) : (
                    <strong>
                      {key === "total_paid"
                        ? currency.format(value)
                        : number.format(value)}
                    </strong>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

function labelsText(labels: string[] | null) {
  return labels?.map(optionalText).filter(Boolean).join(", ") || "-";
}

function paidText(paid: boolean | null) {
  return paid === null ? "-" : paid ? "Yes" : "No";
}

function VendorIndex({
  year,
  navigate,
  revision,
  yearTotal,
  yearTotalLoading,
}: {
  year: VendorYear;
  navigate: VendorNavigate;
  revision: number;
  yearTotal: number | null;
  yearTotalLoading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<VendorStage | null>(null);
  const [sort, setSort] = useState<TableSort<VendorSort>>({
    field: "received",
    ascending: false,
  });
  const columnSettings = useTableColumns(columns);
  const [pagination, setPagination] = useState({ index: 0, size: 10 });
  const filters = new URLSearchParams({
    event_year: String(year),
    limit: String(pagination.size),
    offset: String(pagination.index * pagination.size),
    sort: sort.field,
    direction: sort.ascending ? "asc" : "desc",
  });
  if (query.trim()) filters.set("q", query.trim());
  if (stage) filters.set("stage", stage);
  const { state, retry } = useVendorResource(
    `${indexPath}?${filters}`,
    vendorListSchema,
    query.trim() ? 200 : 0,
    revision,
  );
  const loading = state.kind === "loading";
  const rows = state.kind === "ready" ? state.data.items : [];
  const total = state.kind === "ready" ? state.data.total : 0;
  const visibleColumns = columnSettings.visible;
  const nameHidden = columnSettings.hidden.includes("name");

  function changeSort(next: TableSort<VendorSort>) {
    setSort(next);
    setPage(0);
  }

  function setPage(index: number) {
    setPagination((current) => ({ ...current, index }));
  }

  useEffect(() => {
    if (state.kind !== "ready") return;
    const last = Math.max(0, Math.ceil(state.data.total / pagination.size) - 1);
    if (pagination.index > last) {
      setPagination({ size: pagination.size, index: last });
    }
  }, [state, pagination]);

  return (
    <section
      className="card table-card vendor-table"
      aria-label="Vendors"
      aria-busy={loading}
    >
      <div
        className="table-tabs"
        role="group"
        aria-label="Filter by vendor stage"
      >
        {stages.map(({ label, value }) => (
          <button
            key={label}
            aria-pressed={stage === value}
            className={stage === value ? "selected" : ""}
            onClick={() => {
              setStage(value);
              setPage(0);
            }}
          >
            {label}
            {value === null && (yearTotalLoading || yearTotal !== null) && (
              <span>
                {yearTotalLoading ? (
                  <Skeleton className="skeleton-count" />
                ) : (
                  number.format(yearTotal ?? 0)
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="table-tools">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="Search vendors"
            placeholder="Search vendors, contacts, and categories"
            maxLength={200}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <TableColumnsMenu
          columns={columnSettings}
          options={vendorSortOptions}
          sort={sort}
          onSort={changeSort}
        />
      </div>
      <Table aria-label="Vendor applications">
        <TableHeader>
          <TableRow>
            {visibleColumns.map(({ id, label, sort: key }) => {
              const active = id === sort.field;
              const Indicator = active
                ? sort.ascending
                  ? ArrowUp
                  : ArrowDown
                : ArrowUpDown;
              return (
                <TableHead
                  key={id}
                  scope="col"
                  aria-sort={
                    active
                      ? sort.ascending
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {key ? (
                    <button
                      className="table-sort"
                      aria-label={`Sort by ${label.toLowerCase()}`}
                      onClick={() =>
                        changeSort({
                          field: key,
                          ascending: active
                            ? !sort.ascending
                            : key !== "received",
                        })
                      }
                    >
                      {label} <Indicator size={13} aria-hidden="true" />
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: pagination.size }, (_, index) => (
              <TableRow className="skeleton-row" key={index} aria-hidden="true">
                {visibleColumns.map(({ id }) => (
                  <TableCell key={id}>
                    <Skeleton className="skeleton-cell" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : state.kind === "error" ? (
            <TableRow>
              <TableCell
                className="table-empty"
                colSpan={visibleColumns.length}
              >
                <LoadError message={state.message} retry={retry} />
              </TableCell>
            </TableRow>
          ) : rows.length ? (
            rows.map((row) => {
              const route = { year, id: row.id };
              const businessName = optionalText(row.business_name);
              const badge = vendorStages[row.stage];
              const submitted = row.submitted_at
                ? new Date(row.submitted_at)
                : null;
              const values: Record<Column, ReactNode> = {
                name: (
                  <a
                    className="table-link normal"
                    aria-label={
                      businessName ? undefined : "Open unnamed vendor"
                    }
                    href={vendorPath(route)}
                    onClick={(event) => {
                      event.stopPropagation();
                      follow(event, route, navigate);
                    }}
                  >
                    {businessName ?? "-"}
                  </a>
                ),
                stage:
                  row.stage === "unknown" ? (
                    "-"
                  ) : (
                    <span className={`badge ${badge.color}`}>
                      <Circle size={8} aria-hidden="true" />
                      {badge.label}
                    </span>
                  ),
                contact: optionalText(row.contact_name) || "-",
                category: optionalText(row.category) || "-",
                received:
                  submitted && Number.isFinite(submitted.getTime())
                    ? applicationDate.format(submitted)
                    : "-",
                count: row.requested_spot_count ?? "-",
                spots: labelsText(row.assigned_spot_labels),
                deadline: paidText(row.paid_before_deadline),
              };
              return (
                <TableRow
                  className="request-row"
                  key={row.id}
                  tabIndex={nameHidden ? 0 : undefined}
                  aria-label={
                    nameHidden
                      ? `Open vendor ${businessName ?? "record"}`
                      : undefined
                  }
                  onKeyDown={(event) => {
                    if (nameHidden && event.key === "Enter") navigate(route);
                  }}
                  onClick={() => navigate(route)}
                >
                  {visibleColumns.map(({ id }) => (
                    <TableCell key={id}>{values[id]}</TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                className="table-empty"
                colSpan={visibleColumns.length}
              >
                No vendors match this view.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <TablePagination
        index={pagination.index}
        size={pagination.size}
        total={total}
        loading={loading}
        disabled={state.kind === "error"}
        summary={`${number.format(total)} vendors`}
        onPageChange={setPage}
        onSizeChange={(size) => setPagination({ index: 0, size })}
      />
    </section>
  );
}

function VendorIndexPage({
  year,
  navigate,
  revision,
  hidden,
}: {
  year: VendorYear;
  navigate: VendorNavigate;
  revision: number;
  hidden: boolean;
}) {
  const { state, retry } = useVendorResource(
    `${indexPath}/statistics?event_year=${year}`,
    vendorStatsSchema,
  );
  return (
    <div className="list-page" hidden={hidden}>
      <VendorStatistics
        year={year}
        navigate={navigate}
        state={state}
        retry={retry}
      />
      <VendorIndex
        key={year}
        year={year}
        navigate={navigate}
        revision={revision}
        yearTotal={state.kind === "ready" ? state.data.total_vendors : null}
        yearTotalLoading={state.kind === "loading"}
      />
    </div>
  );
}

function VendorDetailPage({
  staffName,
  year,
  id,
  navigate,
  onSaved,
}: {
  year: VendorYear;
  staffName: string;
  id: string;
  navigate: VendorNavigate;
  onSaved: () => void;
}) {
  const recordPath = `${indexPath}/${encodeURIComponent(id)}` as const;
  const path = `${recordPath}?event_year=${year}` as const;
  const { state, retry } = useVendorResource(path, vendorDetailSchema);
  const indexRoute = { year, id: null };
  const back = (
    <a
      className="text-button"
      href={vendorPath(indexRoute)}
      onClick={(event) => follow(event, indexRoute, navigate)}
    >
      <ArrowLeft size={16} aria-hidden="true" />
      Back to vendors
    </a>
  );

  if (state.kind === "ready") {
    return (
      <VendorRecord
        initial={state.data}
        path={path}
        commentPath={`${recordPath}/comments?event_year=${year}`}
        staffName={staffName}
        back={back}
        move={(vendorId) => navigate({ year, id: vendorId })}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div
      className="detail-page live-detail"
      aria-busy={state.kind === "loading"}
    >
      <div className="detail-toolbar">{back}</div>
      {state.kind === "loading" ? (
        <p role="status">Loading vendor…</p>
      ) : (
        <LoadError message={state.message} retry={retry} />
      )}
    </div>
  );
}

export function VendorsWorkspace({
  route,
  navigate,
  staffName,
}: {
  route: VendorRoute;
  staffName: string;
  navigate: VendorNavigate;
}) {
  const { year, id } = route;
  const [revision, setRevision] = useState(0);
  const [indexVisited, setIndexVisited] = useState(id === null);
  useEffect(() => {
    if (!id) setIndexVisited(true);
  }, [id]);
  return (
    <>
      {(!id || indexVisited) && (
        <VendorIndexPage
          year={year}
          navigate={navigate}
          revision={revision}
          hidden={Boolean(id)}
        />
      )}
      {id && (
        <VendorDetailPage
          key={`${year}:${id}`}
          year={year}
          staffName={staffName}
          id={id}
          navigate={navigate}
          onSaved={() => setRevision((value) => value + 1)}
        />
      )}
    </>
  );
}
