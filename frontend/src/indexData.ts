import { z } from "zod";
import { apiFetch } from "./api";
import { summarySchema, toInquiry } from "./presentations";
import type { Inquiry } from "./domain";

export type StatisticsDays = 1 | 7 | 30;
export const metricKeys = [
  "presentations",
  "reviewing",
  "booked",
  "completed",
] as const;
export const analyticsSchema = z
  .object({
    days: z.number().int().min(1).max(92),
    timezone: z.literal("America/Los_Angeles"),
    start_date: z.string(),
    end_date: z.string(),
    metrics: z.array(
      z.object({
        key: z.enum(metricKeys),
        current: z.array(z.number().int().nonnegative()),
        previous: z.array(z.number().int().nonnegative()),
      }),
    ),
  })
  .refine(
    (value) =>
      value.metrics.length === metricKeys.length &&
      new Set(value.metrics.map((metric) => metric.key)).size ===
        metricKeys.length &&
      value.metrics.every(
        (metric) =>
          metric.current.length === value.days &&
          metric.previous.length === value.days,
      ),
    "Invalid statistics series",
  );
export type Analytics = z.infer<typeof analyticsSchema>;
export const indexPageSchema = z.object({
  items: z.array(summarySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  total_all: z.number().int().nonnegative(),
});
export type PresentationSortField =
  "received" | "date" | "name" | "organization" | "guests" | "status";

export type IndexQuery = {
  query: string;
  status: Inquiry["status"] | null;
  ascending: boolean;
  sortField?: PresentationSortField;
  index: number;
  size: number;
};
export type IndexPage = Omit<z.infer<typeof indexPageSchema>, "items"> & {
  items: Inquiry[];
};
export async function fetchPresentationIndex(
  query: IndexQuery,
  signal: AbortSignal,
): Promise<IndexPage> {
  const params = new URLSearchParams({
    limit: String(query.size),
    offset: String(query.index * query.size),
    sort: `${query.sortField ?? "received"}_${query.ascending ? "asc" : "desc"}`,
  });
  if (query.query) params.set("q", query.query);
  if (query.status) params.set("status", query.status);
  const response = await apiFetch(`/api/v1/presentations/index?${params}`, {
    signal,
  });
  const page = indexPageSchema.parse(await response.json());
  signal.throwIfAborted();
  return { ...page, items: page.items.map(toInquiry) };
}
export async function fetchPresentationStatistics(
  days: number,
  signal: AbortSignal,
): Promise<Analytics> {
  const response = await apiFetch(
    `/api/v1/presentations/statistics?days=${days}`,
    { signal },
  );
  const data = analyticsSchema.parse(await response.json());
  signal.throwIfAborted();
  if (data.days !== days) throw new Error("Statistics period mismatch");
  return data;
}
