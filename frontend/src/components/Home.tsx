import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { Inquiry, Page } from "../domain";
import type { LoadState } from "../presentations";
import { pacificDateKey } from "../lib/reporting";
import { Skeleton } from "./Skeleton";
import "./home.css";

const number = new Intl.NumberFormat("en-US");
const percentage = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const homePeriods = ["Last 7 days", "Last 30 days", "This quarter"] as const;
export type HomePeriod = (typeof homePeriods)[number];

export function homePeriodDays(period: HomePeriod, now = new Date()) {
  if (period === "Last 7 days") return 7;
  if (period === "Last 30 days") return 30;
  const today = new Date(`${pacificDateKey(now)}T00:00:00Z`);
  const quarterMonth = Math.floor(today.getUTCMonth() / 3) * 3;
  const quarterStart = Date.UTC(today.getUTCFullYear(), quarterMonth, 1);
  return (today.getTime() - quarterStart) / 86_400_000 + 1;
}

type Count =
  | { kind: "loading" | "unavailable" }
  | {
      kind: "ready";
      value: number;
      comparison?: { daily: number[]; previous: number };
    };

export function homeCount(value: number | null): Count {
  return value === null ? { kind: "unavailable" } : { kind: "ready", value };
}

export function homeActivity(current: number[], previous: number[]): Count {
  const sum = (values: number[]) =>
    values.reduce((total, value) => total + value, 0);
  return {
    kind: "ready",
    value: sum(current),
    comparison: { daily: current, previous: sum(previous) },
  };
}

function CountValue({ count }: { count: Count }) {
  if (count.kind === "loading") {
    return (
      <span role="status" aria-label="Loading count">
        <Skeleton className="home-count-skeleton" />
      </span>
    );
  }
  return count.kind === "ready" ? (
    number.format(count.value)
  ) : (
    <span className="home-unavailable">
      <span aria-hidden="true">-</span>
      <span className="sr-only">Unavailable</span>
    </span>
  );
}

function Change({
  current,
  previous,
  daily,
}: {
  current: number;
  previous: number;
  daily: number[];
}) {
  const difference = current - previous;
  const label = previous
    ? percentage.format(difference / previous)
    : current
      ? "New"
      : "";
  const trend = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
  const description = previous
    ? `${label} vs. the previous ${daily.length} days`
    : current
      ? `${number.format(current)} new in this period, zero in the previous period`
      : "No activity in either period";
  const pointCount = Math.min(6, daily.length);
  const points = Array.from({ length: pointCount }, (_, index) => {
    const start = Math.floor((index * daily.length) / pointCount);
    const end = Math.floor(((index + 1) * daily.length) / pointCount);
    const segment = daily.slice(start, end);
    return segment.reduce((sum, value) => sum + value, 0) / segment.length;
  });
  if (points.length === 1) points.push(points[0]);
  const maximum = Math.max(...points) || 1;
  const line = points
    .map(
      (value, index) =>
        `${1 + (index * 20) / (points.length - 1)},${10 - (value / maximum) * 8}`,
    )
    .join(" ");
  return (
    <span
      className="home-change"
      data-trend={trend}
      title={description}
      aria-label={description}
      role="img"
    >
      <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  );
}

export function Home({
  search,
  period,
  changePeriod,
  metrics,
  tasks,
  navigate,
  newRequests,
  replyDescription,
  extra,
}: {
  search: ReactNode;
  period: HomePeriod;
  changePeriod: (period: HomePeriod) => void;
  metrics: { label: string; page: Page; count: Count; scope?: string }[];
  tasks: { awaitingReply: Count; newRequests: Count };
  navigate: (page: Page) => void;
  newRequests: () => void;
  replyDescription?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="home-overview">
      <div className="home-summary">
        <label className="home-period">
          <span className="sr-only">Analytics period</span>
          <select
            value={period}
            onChange={(event) => {
              const selected = homePeriods.find(
                (option) => option === event.target.value,
              );
              if (selected) changePeriod(selected);
            }}
          >
            {homePeriods.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <ChevronDown size={12} aria-hidden="true" />
        </label>
        <section className="home-analytics" aria-label="Workspace analytics">
          {metrics.map(({ label, page, count, scope }) => (
            <button
              className="home-analytics-item"
              key={page}
              type="button"
              onClick={() => navigate(page)}
            >
              <span className="home-analytics-label">
                {label}
                {scope && <span> · {scope}</span>}
              </span>
              <span className="home-analytics-value">
                <strong>
                  <CountValue count={count} />
                </strong>
                {count.kind === "ready" && count.comparison && (
                  <Change current={count.value} {...count.comparison} />
                )}
              </span>
            </button>
          ))}
        </section>
      </div>
      <section
        className="home-center"
        aria-label="Workspace search and shortcuts"
      >
        {search}
        <div
          className="home-shortcuts"
          role="group"
          aria-label="Needs attention"
        >
          <button
            className="home-shortcut"
            type="button"
            title={replyDescription}
            aria-description={replyDescription}
            onClick={() => navigate("Inbox")}
          >
            Reply to emails{" "}
            <span className="home-shortcut-count">
              <CountValue count={tasks.awaitingReply} />
            </span>
          </button>
          <button className="home-shortcut" type="button" onClick={newRequests}>
            New presentation requests{" "}
            <span className="home-shortcut-count">
              <CountValue count={tasks.newRequests} />
            </span>
          </button>
          {extra}
        </div>
      </section>
    </div>
  );
}

export function HomeSearch({
  query,
  change,
  results,
  open,
}: {
  query: string;
  change: (query: string) => void;
  results: LoadState<Inquiry[]>;
  open: (id: string) => void;
}) {
  return (
    <search className="home-search" aria-label="Search presentations">
      <div className="search-field home-search-field">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search workspace records"
          placeholder="Search presentations, clients, and organizations…"
          value={query}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") change("");
          }}
          maxLength={200}
        />
      </div>
      {query.trim() && (
        <div className="command-results home-search-results">
          {results.kind === "loading" ? (
            <p role="status">Searching presentations…</p>
          ) : results.kind === "error" ? (
            <p role="alert">{results.message}</p>
          ) : results.data.length ? (
            results.data.map((item) => (
              <button key={item.id} type="button" onClick={() => open(item.id)}>
                <span>
                  {item.organization}
                  <small>
                    {item.name} · {item.title}
                  </small>
                </span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            ))
          ) : (
            <p role="status">No matching presentations.</p>
          )}
        </div>
      )}
    </search>
  );
}
