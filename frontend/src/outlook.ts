import { z } from "zod";
import { ApiError, apiFetch } from "./api";
import type { Inquiry } from "./domain";
import type { EmailTemplate } from "./presentations";

const base = "/api/v1/outlook" as const;
export const maxAttachmentBytes = 2_500_000;
export const maxAttachmentCount = 8;

const capabilitiesSchema = z.object({
  mailbox_available: z.boolean(),
  test_mode: z.boolean(),
  mailbox_address: z.string().nullable().optional(),
});
const messageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  subject: z.string(),
  sender: z.string(),
  recipients: z.array(z.string()),
  reply_to: z.array(z.string()).optional(),
  at: z.string().nullable(),
  body_text: z.string(),
  has_attachments: z.boolean(),
});
const pageSchema = z.object({
  messages: z.array(messageSchema),
  next_skip: z.number().int().min(0).nullable(),
});
const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  content_type: z.string(),
});
const sendResultSchema = z.object({
  message_id: z.string().nullable(),
  conversation_id: z.string().nullable(),
  status: z.enum(["accepted", "simulated"]),
});

export type OutlookCapabilities = z.infer<typeof capabilitiesSchema>;
export type OutlookMessage = z.infer<typeof messageSchema>;
export type OutlookPage = z.infer<typeof pageSchema>;
export type OutlookAttachment = z.infer<typeof attachmentSchema>;
export type OutlookFolder = "inbox" | "sentitems";
export type EmailFormat = "plain" | "markdown";
export type OutlookTemplate = { key: string; subject: string; body: string };

export function presentationEmailVariables(
  item: Inquiry,
): Record<string, string> {
  return {
    Name: item.name,
    Organization: item.organization,
    "Event Description": item.title,
    "Presentation Details": item.title,
    "Requested Date": item.date,
    Location: item.location,
  };
}

export function outlookTemplateOptions(
  templates: EmailTemplate[],
  item: Inquiry,
): OutlookTemplate[] {
  const values = presentationEmailVariables(item);
  const tokens = /\[([^\]]+)\]/g;
  function render(source: string) {
    return source.replace(tokens, (original, key: string) =>
      Object.hasOwn(values, key) ? values[key] : original,
    );
  }
  return templates
    .filter(
      (template) =>
        template.ready_for_use &&
        [
          ...`${template.subject}\n${template.body_text}`.matchAll(tokens),
        ].every(([, key]) => Object.hasOwn(values, key) && values[key].trim()),
    )
    .map((template) => ({
      key: template.key,
      subject: render(template.subject),
      body: render(template.body_text),
    }));
}

export function outlookError(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return "Delivery needs review. Check Sent Items before trying again.";
  return error instanceof ApiError && [401, 403].includes(error.status)
    ? error.message
    : "Outlook could not finish this request. Try again.";
}

export async function getOutlookCapabilities(signal: AbortSignal) {
  const response = await apiFetch(`${base}/capabilities`, { signal });
  return capabilitiesSchema.parse(await response.json());
}

export async function getOutlookStatistics(days: number, signal: AbortSignal) {
  const response = await apiFetch(`${base}/statistics?days=${days}`, {
    signal,
  });
  const count = z.number().int().nonnegative();
  return z
    .object({
      received: count,
      previously_received: count,
      awaiting_reply: count,
      daily_received: z.array(count).length(days),
    })
    .parse(await response.json());
}

export async function previewOutlookMessage(
  body: string,
  format: EmailFormat,
  signal: AbortSignal,
) {
  const response = await apiFetch(`${base}/preview`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body_text: body, format }),
  });
  return z.object({ html: z.string() }).parse(await response.json()).html;
}

export async function getOutlookMessages(
  folder: OutlookFolder,
  skip: number,
  contact: string | undefined,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ folder, skip: String(skip) });
  if (contact) query.set("contact", contact);
  const response = await apiFetch(`${base}/messages?${query}`, { signal });
  return pageSchema.parse(await response.json());
}

export async function getOutlookConversation(id: string, signal: AbortSignal) {
  const response = await apiFetch(
    `${base}/conversations/${encodeURIComponent(id)}`,
    { signal },
  );
  return z.array(messageSchema).parse(await response.json());
}

function attachmentPath(messageId: string) {
  return `${base}/messages/${encodeURIComponent(messageId)}/attachments` as const;
}

export async function getOutlookAttachments(
  messageId: string,
  signal: AbortSignal,
) {
  const response = await apiFetch(attachmentPath(messageId), { signal });
  return z.array(attachmentSchema).parse(await response.json());
}

export async function downloadOutlookAttachment(
  messageId: string,
  file: OutlookAttachment,
) {
  const response = await apiFetch(
    `${attachmentPath(messageId)}/${encodeURIComponent(file.id)}`,
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readAttachment(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.includes(",")) {
        reject(new Error("Unable to read attachment"));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Unable to read attachment"));
    reader.readAsDataURL(file);
  });
}

export async function sendOutlookMessage(input: {
  requestId: string;
  recipient: string;
  subject: string;
  body: string;
  format: EmailFormat;
  files: File[];
  replyTo?: string;
}) {
  const attachments = await Promise.all(
    input.files.map(async (file) => ({
      name: file.name,
      content_type: file.type || "application/octet-stream",
      content_base64: await readAttachment(file),
    })),
  );
  const response = await apiFetch(`${base}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request_id: input.requestId,
      recipient: input.recipient,
      subject: input.subject,
      body_text: input.body,
      format: input.format,
      attachments,
      reply_to: input.replyTo,
    }),
  });
  return sendResultSchema.parse(await response.json());
}
