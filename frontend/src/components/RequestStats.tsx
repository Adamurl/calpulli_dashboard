import { CalendarDays, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import type { Inquiry } from "../domain";
import type { Analytics, StatisticsDays } from "../indexData";
import type { LoadState } from "../presentations";
import { Skeleton } from "./Skeleton";

const periods = [
  { days: 1, label: "Today", comparison: "Compared to yesterday" },
  {
    days: 7,
    label: "Last 7 days",
    comparison: "Compared to the previous 7 days",
  },
  {
    days: 30,
    label: "Last 30 days",
    comparison: "Compared to the previous 30 days",
  },
] satisfies { days: StatisticsDays; label: string; comparison: string }[];
const metrics = [
  { label: "Presentations", key: "presentations" },
  { label: "In review", key: "reviewing" },
  { label: "Booked", key: "booked" },
  { label: "Completed", key: "completed" },
] as const;
const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function dateKey(date: Date) {
  const parts = calendar.formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}
function localAnalytics(items: Inquiry[], days: StatisticsDays): Analytics {
  const today = dateKey(new Date());
  const dates = Array.from({ length: days * 2 }, (_, index) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (days * 2 - 1 - index));
    return date.toISOString().slice(0, 10);
  });
  const buckets = new Map(
    dates.map((date) => [
      date,
      { presentations: 0, reviewing: 0, booked: 0, completed: 0 },
    ]),
  );
  for (const item of items) {
    if (!item.receivedAt) continue;
    const date = new Date(item.receivedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const bucket = buckets.get(dateKey(date));
    if (!bucket) continue;
    bucket.presentations++;
    if (
      item.status === "reviewing" ||
      item.status === "booked" ||
      item.status === "completed"
    )
      bucket[item.status]++;
  }
  return {
    days,
    timezone: "America/Los_Angeles",
    start_date: dates[days],
    end_date: today,
    metrics: metrics.map((metric) => {
      const counts = dates.map((date) => buckets.get(date)?.[metric.key] ?? 0);
      return {
        key: metric.key,
        current: counts.slice(days),
        previous: counts.slice(0, days),
      };
    }),
  };
}
type Props =
  | { items: Inquiry[]; remote?: never }
  | {
      items?: never;
      remote: {
        days: StatisticsDays;
        state: LoadState<Analytics>;
        change: (days: StatisticsDays) => void;
        retry: () => void;
      };
    };
export function RequestStats(props: Props) {
  const [localDays, setLocalDays] = useState<StatisticsDays>(1);
  const menu = useRef<HTMLDetailsElement>(null);
  const days = props.remote ? props.remote.days : localDays;
  const period = periods.find((option) => option.days === days) ?? periods[0];
  const state = props.remote
    ? props.remote.state
    : ({
        kind: "ready",
        data: localAnalytics(props.items, days),
      } satisfies LoadState<Analytics>);
  return (
    <section
      className="request-stats"
      aria-label="Presentation statistics by received date"
      aria-busy={state.kind === "loading"}
    >
      <details
        className="period-menu"
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menu.current) {
            menu.current.open = false;
            menu.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary>
          <CalendarDays size={13} />
          <span>{days === 1 ? "Today" : `${days} days`}</span>
          <ChevronDown size={12} />
        </summary>
        <fieldset>
          <legend className="sr-only">Statistics period</legend>
          {periods.map((option) => (
            <label key={option.days}>
              <input
                type="radio"
                name="stats-period"
                value={option.days}
                checked={days === option.days}
                onChange={() => {
                  if (props.remote) props.remote.change(option.days);
                  else setLocalDays(option.days);
                  if (menu.current) {
                    menu.current.open = false;
                    menu.current.querySelector("summary")?.focus();
                  }
                }}
              />
              <span>
                {option.label}
                <small>{option.comparison}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </details>
      {state.kind === "loading" && (
        <span className="sr-only" role="status">
          Loading presentation statistics…
        </span>
      )}
      {state.kind === "error" ? (
        <div className="stats-error" role="alert">
          <p>{state.message}</p>
          <button className="text-button" onClick={props.remote?.retry}>
            Retry statistics
          </button>
        </div>
      ) : (
        metrics.map((metric) => {
          const series =
            state.kind === "ready"
              ? state.data.metrics.find((series) => series.key === metric.key)
              : undefined;
          if (!series)
            return (
              <div className="request-stat" key={metric.key}>
                <div>
                  <Skeleton className="skeleton-stat-label" />
                  <Skeleton className="skeleton-stat-value" />
                </div>
                <Skeleton className="skeleton-chart" />
              </div>
            );
          const value = series.current.reduce((sum, count) => sum + count, 0),
            prior = series.previous.reduce((sum, count) => sum + count, 0);
          const change =
            value === prior
              ? "—"
              : prior
                ? `${value > prior ? "↑" : "↓"} ${Math.round((Math.abs(value - prior) / prior) * 100)}%`
                : "New";
          const max = Math.max(1, ...series.current, ...series.previous);
          function points(values: number[]) {
            const line = values.length === 1 ? [values[0], values[0]] : values;
            return line
              .map(
                (count, index) =>
                  `${2 + (index / (line.length - 1)) * 92},${30 - (count / max) * 26}`,
              )
              .join(" ");
          }
          return (
            <div className="request-stat" key={metric.key}>
              <div className="stat-copy">
                <span className="stat-label">{metric.label}</span>
                <div className="stat-value">
                  <strong>{value}</strong>
                  <small title={`${prior} in the previous period`}>
                    {change}
                  </small>
                </div>
              </div>
              <svg
                viewBox="0 0 96 34"
                role="img"
                aria-label={`${metric.label}: ${value} over ${period.label.toLowerCase()}, ${prior} in the previous period. Based on receipt dates in America/Los_Angeles and current statuses.`}
              >
                <title>
                  {metric.label} by received date. Solid: selected period.
                  Dashed: previous period.
                </title>
                <polyline
                  className="stat-previous"
                  points={points(series.previous)}
                />
                <polyline
                  className="stat-current"
                  points={points(series.current)}
                />
              </svg>
            </div>
          );
        })
      )}
    </section>
  );
}
