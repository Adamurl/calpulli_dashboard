import { CalendarDays, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import type { Inquiry } from "../domain";

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
] as const;
const metrics = [
  { label: "Presentations", status: null },
  { label: "In review", status: "reviewing" },
  { label: "Booked", status: "booked" },
  { label: "Completed", status: "completed" },
] as const;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function RequestStats({ items }: { items: Inquiry[] }) {
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[0]);
  const menu = useRef<HTMLDetailsElement>(null);
  const today = new Date();
  const days = Array.from({ length: period.days * 2 }, (_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    date.setDate(date.getDate() - (period.days * 2 - 1 - index));
    return dateKey(date);
  });
  return (
    <section
      className="request-stats"
      aria-label="Presentation statistics by event date"
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
          <span>{period.days === 1 ? "Today" : `${period.days} days`}</span>
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
                checked={period.days === option.days}
                onChange={() => {
                  setPeriod(option);
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
      {metrics.map((metric) => {
        const counts = days.map(
          (day) =>
            items.filter(
              (item) =>
                item.date === day &&
                (!metric.status || item.status === metric.status),
            ).length,
        );
        const current = counts.slice(period.days);
        const previous = counts.slice(0, period.days);
        const value = current.reduce((sum, count) => sum + count, 0);
        const prior = previous.reduce((sum, count) => sum + count, 0);
        const change =
          value === prior
            ? "—"
            : prior
              ? `${value > prior ? "↑" : "↓"} ${Math.round((Math.abs(value - prior) / prior) * 100)}%`
              : "New";
        const maximum = Math.max(1, ...counts);
        function points(values: number[]) {
          const line = values.length === 1 ? [values[0], values[0]] : values;
          return line
            .map(
              (count, index) =>
                `${2 + (index / (line.length - 1)) * 92},${30 - (count / maximum) * 26}`,
            )
            .join(" ");
        }
        return (
          <div className="request-stat" key={metric.label}>
            <div>
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
              aria-label={`${metric.label}: ${value} over ${period.label.toLowerCase()}, ${prior} in the previous period. Based on event dates and current statuses.`}
            >
              <title>
                {metric.label} by event date. Solid: selected period. Dashed:
                previous period.
              </title>
              <polyline className="stat-previous" points={points(previous)} />
              <polyline className="stat-current" points={points(current)} />
            </svg>
          </div>
        );
      })}
    </section>
  );
}
