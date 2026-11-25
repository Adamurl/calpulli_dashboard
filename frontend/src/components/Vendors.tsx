import { optionalText } from "../display";
import { useEffect, useRef, useState } from "react";
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
  vendorCategoriesSchema,
  vendorCategoryOptions,
  vendorDetailSchema,
  vendorIndexPath as indexPath,
  vendorListSchema,
  vendorStatsSchema,
  vendorStages,
  vendorStatisticsPath,
  vendorTypeLabel,
} from "../vendorData";
import { VendorRecord } from "./VendorRecord";
import { Modal } from "./ui";
import { Skeleton } from "./Skeleton";

import type { VendorStage, VendorSummary } from "../vendorData";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { TablePagination } from "./TablePagination";
import { TableStatusFilter } from "./TableStatusFilter";
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
const columns = [
  { id: "received", label: "Applied on", sort: "received" },
  { id: "name", label: "Vendor", sort: "name" },
  { id: "contact", label: "Contact name", sort: null },
  { id: "category", label: "Vendor type", sort: null },
  { id: "count", label: "Requested spots", sort: null },
  { id: "spots", label: "Assigned spots", sort: null },
  { id: "deadline", label: "Paid before deadline", sort: null },
  { id: "stage", label: "Application status", sort: null },
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
  { id: "category", label: "Vendor type", directions: ["A to Z", "Z to A"] },
  {
    id: "stage",
    label: "Application status",
    directions: ["Applied to denied", "Denied to applied"],
  },
] as const satisfies readonly SortOption<string>[];
type VendorSort = (typeof vendorSortOptions)[number]["id"];
const stages: { label: string; value: VendorStage | null }[] = [
  { label: "All", value: null },
  { label: "Applied", value: "applied" },
  { label: "Accepted", value: "accepted" },
  { label: "Denied", value: "declined" },
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

function SelectionCheckbox({
  checked,
  mixed = false,
  label,
  onChange,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function BulkVendorEditor({
  selected,
  year,
  close,
  saved,
}: {
  selected: VendorSummary[];
  year: VendorYear;
  close: () => void;
  saved: () => void;
}) {
  const [drafts, setDrafts] = useState(selected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { state } = useVendorResource(
    "/api/v1/mny/vendors/categories",
    vendorCategoriesSchema,
  );
  const categories = [
    ...new Set([
      ...vendorCategoryOptions.map(([value]) => value),
      ...(state.kind === "ready" ? state.data : []),
      ...selected.flatMap((vendor) =>
        vendor.category ? [vendor.category] : [],
      ),
    ]),
  ].sort();
  const changes = drafts.flatMap((vendor, index) => {
    const original = selected[index];
    const stageChanged = vendor.stage !== original.stage;
    const categoryChanged = vendor.category !== original.category;
    if (!stageChanged && !categoryChanged) return [];
    return [
      {
        id: vendor.id,
        expected_stage: original.stage,
        expected_category: original.category,
        ...(stageChanged ? { stage: vendor.stage } : {}),
        ...(categoryChanged ? { category: vendor.category } : {}),
      },
    ];
  });
  async function save() {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/v1/mny/vendors/bulk-edit?event_year=${year}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: changes }),
      });
      saved();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to save changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={`Bulk edit ${selected.length} vendors`}
      close={close}
      wide
      busy={saving}
    >
      <div className="vendor-bulk-content">
        <label className="vendor-bulk-apply">
          Set application status for all selected
          <select
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "applied" ||
                value === "accepted" ||
                value === "declined"
              )
                setDrafts((current) =>
                  current.map((item) => ({ ...item, stage: value })),
                );
            }}
          >
            <option value="" disabled>
              Choose status
            </option>
            <option value="applied">Applied</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Denied</option>
          </select>
        </label>
        <p>
          Changes are saved together. Changing application status does not send
          email.
        </p>
        {state.kind === "error" && (
          <p role="alert">
            Unable to load vendor categories. Existing selected categories are
            still available.
          </p>
        )}
        <div className="vendor-bulk-scroll">
          <table className="vendor-bulk-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Vendor category</th>
                <th>Application status</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((vendor, index) => (
                <tr key={vendor.id}>
                  <th scope="row">
                    {vendor.business_name || "Unnamed vendor"}
                  </th>
                  <td>
                    <select
                      aria-label={`Vendor category for ${vendor.business_name || vendor.id}`}
                      value={vendor.category ?? ""}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  category: event.target.value || null,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Not recorded</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {vendorTypeLabel(category)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Application status for ${vendor.business_name || vendor.id}`}
                      value={vendor.stage}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (
                          value === "applied" ||
                          value === "accepted" ||
                          value === "declined"
                        )
                          setDrafts((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, stage: value } : item,
                            ),
                          );
                      }}
                    >
                      <option value="unknown" disabled>
                        Not recorded
                      </option>
                      <option value="applied">Applied</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Denied</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="modal-footer">
        {changes.length > 100 && (
          <p className="error" role="alert">
            Select at most 100 changed vendors per save.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div>
          <button className="button" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => void save()}
            disabled={saving || !changes.length || changes.length > 100}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
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
  const [selected, setSelected] = useState<VendorSummary[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [stage, setStage] = useState<VendorStage | null>(null);
  const [sort, setSort] = useState<TableSort<VendorSort>>({
    field: "received",
    ascending: false,
  });
  const columnSettings = useTableColumns(columns);
  const [pagination, setPagination] = useState({ index: 0, size: 25 });
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
      className="card table-card vendor-table workspace-table"
      aria-label="Vendors"
      aria-busy={loading}
    >
      <div className="table-tools table-filter-bar">
        <TableStatusFilter
          label="Filter by application status"
          value={stage ?? ""}
          options={stages.map(({ label, value }) => ({
            label,
            value: value ?? "",
          }))}
          onChange={(value) => {
            setStage(
              value === "applied" ||
                value === "accepted" ||
                value === "declined"
                ? value
                : null,
            );
            setPage(0);
          }}
        />
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
            <TableHead scope="col">
              <SelectionCheckbox
                label="Select all vendors on this page"
                checked={
                  rows.length > 0 &&
                  rows.every((row) =>
                    selected.some((item) => item.id === row.id),
                  )
                }
                mixed={
                  rows.some((row) =>
                    selected.some((item) => item.id === row.id),
                  ) &&
                  !rows.every((row) =>
                    selected.some((item) => item.id === row.id),
                  )
                }
                onChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [
                          ...current.filter(
                            (item) => !rows.some((row) => row.id === item.id),
                          ),
                          ...rows,
                        ]
                      : [],
                  )
                }
              />
            </TableHead>
            {visibleColumns.map(({ id, label, sort: key }, index) => {
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
                  className={
                    selected.length > 0 && index === 0
                      ? "vendor-selection-header"
                      : undefined
                  }
                  aria-sort={
                    active
                      ? sort.ascending
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span
                    className={
                      selected.length > 0 ? "vendor-header-hidden" : undefined
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
                  </span>
                  {selected.length > 0 && index === 0 && (
                    <div className="vendor-selection-bar">
                      <span>{selected.length} selected</span>
                      <button
                        className="button"
                        onClick={() => setBulkOpen(true)}
                      >
                        Bulk edit
                      </button>
                    </div>
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
                <TableCell>
                  <Skeleton className="skeleton-checkbox" />
                </TableCell>
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
                colSpan={visibleColumns.length + 1}
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
                category: vendorTypeLabel(row.category) || "-",
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
                  onClick={(event) => {
                    if (
                      !(event.target instanceof Element) ||
                      !event.target.closest("input,label,button,a,select")
                    )
                      navigate(route);
                  }}
                  data-state={
                    selected.some((item) => item.id === row.id)
                      ? "selected"
                      : undefined
                  }
                >
                  <TableCell>
                    <SelectionCheckbox
                      label={`Select vendor ${businessName || row.id}`}
                      checked={selected.some((item) => item.id === row.id)}
                      onChange={(checked) =>
                        setSelected((current) =>
                          checked
                            ? [...current, row]
                            : current.filter((item) => item.id !== row.id),
                        )
                      }
                    />
                  </TableCell>
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
                colSpan={visibleColumns.length + 1}
              >
                No vendors match this view.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {bulkOpen && (
        <BulkVendorEditor
          selected={selected}
          year={year}
          close={() => setBulkOpen(false)}
          saved={() => {
            setBulkOpen(false);
            setSelected([]);
            retry();
          }}
        />
      )}
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
    vendorStatisticsPath(year),
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
