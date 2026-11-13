import { z } from "zod";
import { apiFetch, ApiError } from "./api";
import { requestSchema } from "./domain";
import type { Inquiry } from "./domain";

const nullableText = z.string().nullable();
export const summarySchema = z.object({
  id: z.uuid(),
  source: requestSchema.shape.source,
  status: requestSchema.shape.status,
  form_version: z.string(),
  received_at: nullableText,
  created_at: z.string(),
  updated_at: z.string(),
  event_date: nullableText,
  start_time: nullableText,
  end_time: nullableText,
  event_timezone: nullableText,
  organization_name: nullableText,
  contact_full_name: nullableText,
  contact_email: nullableText,
  event_types: z.array(z.string()),
  venue_address: nullableText,
  estimated_guests: z.number().nullable(),
});
export const detailSchema = summarySchema.extend({
  source_key: nullableText,
  external_id: nullableText,
  import_batch_id: nullableText,
  source_row_number: z.number().nullable(),
  event_access: nullableText,
  event_setting: nullableText,
  event_purpose: nullableText,
  audience_distance_12ft: nullableText,
  unavailable_logistics: nullableText,
  contact_first_name: nullableText,
  contact_last_name: nullableText,
  contact_phone: nullableText,
  organization_website: nullableText,
  referral_sources: z.array(z.string()),
  referral_reference: nullableText,
  additional_notes: nullableText,
  internal_notes: nullableText,
  original_fields: z.record(z.string(), z.unknown()),
});
export type Presentation = z.infer<typeof detailSchema>;
export const activitySchema = z.object({
  id: z.uuid(),
  request_id: z.uuid(),
  kind: z.string(),
  actor_id: nullableText,
  summary: nullableText,
  previous_status: nullableText,
  new_status: nullableText,
  note: nullableText,
  created_at: z.string(),
});
export type ActivityRecord = z.infer<typeof activitySchema>;
const basis = z.enum(["unknown", "recorded", "explicit", "user_assumption"]);
export const operationsSchema = z.object({
  request_id: z.uuid(),
  imported_from: nullableText,
  quoted_amount: z.union([z.string(), z.number()]).nullable(),
  recorded_received_amount: z.union([z.string(), z.number()]).nullable(),
  currency: nullableText,
  finder_name: nullableText,
  payment_status: z.enum([
    "unknown",
    "paid",
    "unpaid",
    "partial",
    "no_charge",
    "refunded",
  ]),
  payment_basis: basis,
  payment_method: z.enum([
    "unknown",
    "check",
    "cash",
    "bank_transfer",
    "other",
  ]),
  payment_notes: nullableText,
  engagement_type: z.enum([
    "unknown",
    "paid",
    "volunteer",
    "calpulli_internal",
  ]),
  engagement_basis: basis,
  invoice_status: z.enum(["unknown", "done", "not_done"]),
  coi_status: z.enum(["unknown", "done", "not_done"]),
  attendance_count: z.number().nullable(),
  roster_count: z.number().nullable(),
  attendance_notes: nullableText,
  parking_notes: nullableText,
  dressing_room_notes: nullableText,
  logistics_notes: nullableText,
  status_basis: z.enum(["explicit", "user_assumption", "unresolved"]),
  updated_at: z.string(),
});
export type Operations = z.infer<typeof operationsSchema>;
export const emailSchema = z.object({
  id: z.uuid(),
  subject: z.string(),
  body_text: z.string(),
  recipient_email: nullableText,
  recipient_name: nullableText,
  status: z.enum([
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "SENDING",
    "SENT",
    "FAILED",
    "CANCELLED",
  ]),
  created_at: z.string(),
  sent_at: nullableText,
});
export type EmailRecord = z.infer<typeof emailSchema>;
export type LoadState<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: T };
export function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Unable to load presentation data. Please try again.";
}
export function toInquiry(item: z.infer<typeof summarySchema>): Inquiry {
  return {
    id: item.id,
    name: item.contact_full_name || "Not provided",
    email: item.contact_email || "",
    organization: item.organization_name || "Not provided",
    title: item.event_types.map(humanize).join(", ") || "Presentation request",
    date: item.event_date || "",
    status: item.status,
    source: item.source,
    guests: item.estimated_guests,
    location: item.venue_address || "Not provided",
    unread: false,
    preview: "",
    receivedAt: item.received_at,
  };
}
export function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
export async function fetchPresentation(id: string, signal: AbortSignal) {
  return detailSchema.parse(
    await (await apiFetch(`/api/v1/presentations/${id}`, { signal })).json(),
  );
}
export async function fetchOperations(id: string, signal: AbortSignal) {
  try {
    return operationsSchema.parse(
      await (
        await apiFetch(`/api/v1/presentations/${id}/operations`, { signal })
      ).json(),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export async function fetchEmails(id: string, signal: AbortSignal) {
  return z
    .object({ messages: z.array(emailSchema) })
    .parse(
      await (
        await apiFetch(`/api/v1/presentations/${id}/emails`, { signal })
      ).json(),
    ).messages;
}
export async function fetchPresentations(
  signal: AbortSignal,
): Promise<Inquiry[]> {
  const items: Inquiry[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await apiFetch(
      `/api/v1/presentations?limit=100&offset=${offset}`,
      { signal },
    );
    const page = z
      .object({ items: z.array(summarySchema) })
      .parse(await response.json());
    items.push(...page.items.map(toInquiry));
    if (page.items.length < 100) return items;
  }
}
export async function fetchActivities(
  id: string,
  signal?: AbortSignal,
): Promise<ActivityRecord[]> {
  const items: ActivityRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await apiFetch(
      `/api/v1/presentations/${id}/activities?limit=100&offset=${offset}`,
      { signal },
    );
    const page = z
      .object({ items: z.array(activitySchema) })
      .parse(await response.json());
    items.push(...page.items);
    if (page.items.length < 100) return items;
  }
}
