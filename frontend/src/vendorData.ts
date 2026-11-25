import { z } from "zod";
import { apiFetch } from "./api";
import type { VendorYear } from "./navigation";

export const vendorCategoryOptions = [
  ["FOOD", "Food"],
  ["ARTS_CRAFTS", "Arts & Crafts"],
  ["DANZANTE", "Danzante"],
  ["NON_PROFIT", "Non-Profit"],
  ["SCHOOL", "School"],
  ["CORP", "Corporation"],
  ["TRIBAL", "Tribal"],
  ["SMALL", "Small"],
  ["GOVT", "Government"],
  ["OTHER", "Other"],
] as const;

export function vendorTypeLabel(category: string | null): string | null {
  const value = category?.trim();
  if (!value) return null;
  if (value.toUpperCase() === "A&C") return "Arts & Crafts";
  if (value === "DANZANTES") return "Danzante";
  return vendorCategoryOptions.find(([key]) => key === value)?.[1] ?? value;
}

export const vendorIndexPath = "/api/v1/mny/vendors";

export function vendorStatisticsPath(year: VendorYear) {
  return `${vendorIndexPath}/statistics?event_year=${year}` as const;
}

const vendorStage = z.enum(["applied", "accepted", "declined", "unknown"]);
export type VendorStage = z.infer<typeof vendorStage>;
export const vendorStages = {
  applied: { label: "Applied", color: "new" },
  accepted: { label: "Accepted", color: "proposal_sent" },
  declined: { label: "Denied", color: "unknown" },
  unknown: { label: "Stage not recorded", color: "unknown" },
} satisfies Record<VendorStage, { label: string; color: string }>;

const count = z.number().int().nonnegative();

export async function fetchVendorActivity(
  year: VendorYear,
  days: number,
  signal: AbortSignal,
) {
  const response = await apiFetch(
    `${vendorIndexPath}/activity?event_year=${year}&days=${days}`,
    { signal },
  );
  const series = z.array(count).length(days);
  return z
    .object({ current: series, previous: series })
    .parse(await response.json());
}
export const vendorSummarySchema = z.object({
  id: z.guid(),
  event_year: z.number().int(),
  stage: vendorStage,
  source: z.enum(["form_csv", "legacy_vendor"]),
  business_name: z.string().nullable(),
  category: z.string().nullable(),
  submitted_at: z.string().nullable(),
  follower_count: count.nullable(),
  contact_name: z.string().nullable(),
  requested_spot_count: count.nullable(),
  assigned_spot_labels: z.array(z.string()).nullable(),
  paid_before_deadline: z.boolean().nullable(),
});
export const vendorListSchema = z.object({
  items: z.array(vendorSummarySchema),
  limit: count,
  offset: count,
  total: count,
});
export const vendorStatsSchema = z.object({
  total_vendors: count,
  total_paid: z.number().nullable(),
  requested_spots: count.nullable(),
  assigned_spots: count.nullable(),
});
export const vendorDetailSchema = vendorSummarySchema.extend({
  email: z.string().nullable(),
  phone: z.string().nullable(),
  follower_response: z.string().nullable(),
  responses: z.record(z.string(), z.unknown()),
  previous_id: z.guid().nullish(),
  next_id: z.guid().nullish(),
});
export type VendorDetail = z.infer<typeof vendorDetailSchema>;
export const vendorCommentSchema = z.object({
  id: z.guid(),
  body: z.string(),
  created_at: z.iso.datetime({ offset: true }),
});
export type VendorComment = z.infer<typeof vendorCommentSchema>;

export function spotCountForSpace(space: string | null): number | null {
  const dimensions =
    /^(\d+)\s*(?:ft|['′])?\s*[x×]\s*(\d+)\s*(?:ft|['′])?$/i.exec(
      space?.trim() ?? "",
    );
  if (!dimensions) return null;
  const width = Number(dimensions[1]);
  const depth = Number(dimensions[2]);
  const count = (width / 10) * (depth / 10);
  return width > 0 &&
    depth > 0 &&
    width % 10 === 0 &&
    depth % 10 === 0 &&
    Number.isSafeInteger(count)
    ? count
    : null;
}

export type VendorSummary = z.infer<typeof vendorSummarySchema>;
export const vendorCategoriesSchema = z.array(z.string());
