import { z } from "zod";
export const requestSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.union([z.email(), z.literal("")]),
  organization: z.string(),
  title: z.string(),
  date: z.string(),
  status: z.enum([
    "new",
    "reviewing",
    "proposal_sent",
    "booked",
    "completed",
    "declined",
    "cancelled",
    "unknown",
  ]),
  source: z.enum(["wix", "manual", "legacy_csv"]),
  guests: z.number().nullable(),
  receivedAt: z.string().nullable().optional(),
  location: z.string(),
  unread: z.boolean(),
  preview: z.string(),
});
export type Inquiry = z.infer<typeof requestSchema>;
export const draftSchema = z.object({
  id: z.string(),
  inquiryId: z.string(),
  to: z.email(),
  subject: z
    .string()
    .min(1)
    .max(998)
    .regex(/^[^\r\n\x00]+$/),
  body: z.string().min(1).max(30000),
  status: z.enum(["draft", "review"]),
  updated: z.string(),
});
export type Draft = z.infer<typeof draftSchema>;
export const workspaceSchema = z.object({
  drafts: z.array(draftSchema),
  notes: z.record(z.string(), z.array(z.string())),
  archived: z.array(z.string()),
  read: z.array(z.string()),
  statuses: z.record(z.string(), requestSchema.shape.status),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type Page =
  | "Home"
  | "Presentations"
  | "Inbox"
  | "Drafts"
  | "Clients"
  | "Templates"
  | "Settings";
export const statusLabels: Record<Inquiry["status"], string> = {
  new: "New inquiry",
  reviewing: "In review",
  proposal_sent: "Proposal sent",
  booked: "Booked",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  unknown: "Unknown",
};
export const emptyWorkspace: Workspace = {
  drafts: [],
  notes: {},
  archived: [],
  read: [],
  statuses: {},
};
export const templates = [
  {
    name: "A warm welcome",
    stage: "New inquiry",
    subject: "Thank you for inviting Calpulli",
    body: "Hello [Name],\n\nThank you for thinking of Calpulli Tonalehqueh for your event. We would love to learn more about what you have in mind.\n\nWould you be available for a short call this week?\n\nWarmly,\nCalpulli Tonalehqueh",
  },
  {
    name: "Presentation proposal",
    stage: "Proposal",
    subject: "Your Calpulli presentation",
    body: "Hello [Name],\n\nIt was lovely connecting with you. We are putting together a presentation that celebrates culture, community, and connection.\n\nPlease let us know your preferred date and any venue requirements.\n\nWarmly,\nCalpulli Tonalehqueh",
  },
  {
    name: "A friendly follow-up",
    stage: "Follow-up",
    subject: "Checking in about your event",
    body: "Hello [Name],\n\nI wanted to follow up on your presentation request. Do you have any questions we can help with?\n\nWe look forward to hearing from you.\n\nWarmly,\nCalpulli Tonalehqueh",
  },
];
