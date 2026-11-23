import { optionalText } from "../display";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isValid, parseISO } from "date-fns";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Mail,
  Pencil,
  Phone,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "../api";
import { CommentComposer } from "./CommentComposer";
import { Disclosure } from "./Disclosure";
import { StatusPicker } from "./StatusPicker";
import type { Inquiry } from "../domain";
import {
  detailSchema,
  errorMessage,
  fetchActivities,
  fetchPresentation,
  fetchOperations,
  humanize,
  toInquiry,
} from "../presentations";
import type { LoadState, Operations, Presentation } from "../presentations";
import { dateLabel } from "../data";
import { Badge } from "./ui";
import { Calendar } from "./ui/calendar";
import { Skeleton } from "./Skeleton";
import {
  PresentationSkeleton,
  FactsSkeleton,
  HistorySkeleton,
} from "./PresentationSkeleton";
import { PresentationEmailThread } from "./PresentationEmailThread";
import {
  PresentationEditModal,
  type PresentationEditPayload,
} from "./PresentationEditModal";
const detailTabs: readonly ("Activity" | "Email thread")[] = [
  "Activity",
  "Email thread",
];

const sourceLabels = {
  wix: "Website form",
  manual: "Manual entry",
  legacy_csv: "CSV import",
} satisfies Record<Presentation["source"], string>;
const receivedDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
});
const organizationPlaceholders = new Set([
  "-",
  "—",
  "na",
  "n.a.",
  "n.a",
  "n / a",
  "none",
  "no organization",
  "unknown",
]);
const eventTypeLabels = new Map([
  ["k12_school", "K-12 school"],
  ["college_university", "College / university"],
  ["nonprofit", "Nonprofit"],
  ["government", "City / government"],
  ["corporate", "Corporate event"],
  ["cultural_organization", "Cultural organization"],
  ["funeral", "Funeral"],
  ["grand_opening", "Grand opening"],
  ["other", "Other"],
]);

type DetailPatch =
  | { internal_notes: string }
  | {
      status: Inquiry["status"];
      expected_current_status: Inquiry["status"];
    }
  | PresentationEditPayload;

type SaveError = { area: "status" | "comment" | "edit"; message: string };

function useDetailResource<T>(
  id: string,
  fetchData: (id: string, signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const [state, setState] = useState<LoadState<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const activeController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    activeController.current = controller;
    setState({ kind: "loading" });
    fetchData(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ kind: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [id, fetchData, enabled, attempt]);
  const replace = useCallback((data: T) => {
    activeController.current?.abort();
    setState({ kind: "ready", data });
  }, []);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, replace, retry };
}

function valueText(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => {
        if (entry == null) return null;
        if (typeof entry !== "string") return JSON.stringify(entry);
        const text = optionalText(entry);
        return text ? humanize(text) : null;
      })
      .filter(Boolean);
    if (entries.length) return entries.join(", ");
  } else if (value != null) {
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    const text = optionalText(String(value));
    if (text !== null) return text;
  }
  return <span className="muted">-</span>;
}
function Facts({
  title,
  rows,
  className = "",
}: {
  title: string;
  rows: [label: string, value: unknown, width?: "full"][];
  className?: string;
}) {
  return (
    <section className={`card detail-facts ${className}`.trimEnd()}>
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value, width]) => (
          <div
            className={
              width === "full" ? "fact-pair fact-full-width" : "fact-pair"
            }
            key={label}
          >
            <dt>{label}</dt>
            <dd>{valueText(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function clockTime(value: string | null) {
  const match = value?.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/,
  );
  if (!match) return null;
  const hours = Number(match[1]);
  return {
    clock: `${hours % 12 || 12}:${match[2]}`,
    period: hours < 12 ? "AM" : "PM",
  };
}

function formatClientPhone(phone: string) {
  if (!/^\+?[\d().\s-]+$/.test(phone)) return phone;

  const digits = phone.replace(/\D/g, "");
  const number = digits.match(/^(?:1)?(\d{3})(\d{3})(\d{4})$/);
  if (!number || (phone.startsWith("+") && digits.length !== 11)) return phone;

  return `+1 (${number[1]}) ${number[2]} - ${number[3]}`;
}

function EventAndVenue({ item }: { item: Presentation }) {
  const parsedDate = item.event_date ? parseISO(item.event_date) : null;
  const date = parsedDate && isValid(parsedDate) ? parsedDate : null;
  const start = clockTime(item.start_time);
  const end = clockTime(item.end_time);
  const time =
    start && end
      ? `${start.clock}${start.period === end.period ? "" : ` ${start.period}`} – ${end.clock} ${end.period}`
      : start
        ? `${start.clock} ${start.period}`
        : end
          ? `${end.clock} ${end.period}`
          : null;
  const timeLabel =
    start && !end ? "Start time" : end && !start ? "End time" : "Time";
  const zone = optionalText(item.event_timezone);
  const access = optionalText(item.event_access);
  const setting = optionalText(item.event_setting);
  const eventTypes = item.event_types.flatMap((value) => {
    const type = optionalText(value);
    return type ? [eventTypeLabels.get(type) ?? type] : [];
  });
  const tags = new Set([
    ...eventTypes,
    ...(access ? [humanize(access)] : []),
    ...(setting
      ? [setting === "unsure" ? "Not sure yet" : humanize(setting)]
      : []),
  ]);
  return (
    <div className="presentation-event-row">
      <section className="card detail-facts presentation-venue-facts">
        <h2>Event and venue</h2>
        <dl>
          <div className="fact-pair">
            <dt>Date</dt>
            <dd>{valueText(date ? dateLabel(item.event_date) : null)}</dd>
          </div>
          <div className="fact-pair">
            <dt>{timeLabel}</dt>
            <dd>
              {valueText(time)}
              {zone && <small className="venue-time-zone">{zone}</small>}
            </dd>
          </div>
          <div className="fact-pair">
            <dt>Location</dt>
            <dd>{valueText(item.venue_address)}</dd>
          </div>
          <div className="fact-pair">
            <dt>Expected guests</dt>
            <dd>{valueText(item.estimated_guests)}</dd>
          </div>
          <div className="fact-pair">
            <dt>Audience distance</dt>
            <dd>
              {valueText(
                item.audience_distance_12ft &&
                  humanize(item.audience_distance_12ft),
              )}
            </dd>
          </div>
          <div className="fact-pair">
            <dt>Unavailable logistics</dt>
            <dd>{valueText(item.unavailable_logistics)}</dd>
          </div>
        </dl>
        {tags.size > 0 && (
          <ul
            className="venue-tags"
            aria-label="Event types and setting"
            role="list"
          >
            {[...tags].map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
      </section>
      {date && (
        <div
          role="region"
          aria-label="Event calendar"
          className="card event-reference-calendar"
        >
          <Calendar
            className="p-0 bg-transparent"
            month={date}
            hideNavigation
            disableNavigation
            showOutsideDays={false}
            modifiers={{ selected: date }}
            classNames={{
              month: "rdp-month",
              caption_label: "rdp-caption_label",
              weekdays: "rdp-weekdays",
              weekday: "rdp-weekday",
              week: "rdp-week",
              day: "rdp-day",
              today: "",
            }}
          />
        </div>
      )}
    </div>
  );
}

function OperationsFacts({ data }: { data: Operations }) {
  return (
    <>
      <Facts
        title="Payment and paperwork"
        rows={[
          ["Quoted amount", data.quoted_amount],
          ["Recorded received amount", data.recorded_received_amount],
          ["Currency", data.currency],
          ["Payment status", humanize(data.payment_status)],
          ["Payment basis", humanize(data.payment_basis)],
          ["Payment method", humanize(data.payment_method)],
          ["Payment notes", data.payment_notes],
          ["Invoice status", humanize(data.invoice_status)],
          ["COI status", humanize(data.coi_status)],
        ]}
      />
      <Disclosure title="Operational details">
        <Facts
          title="Engagement and attendance"
          rows={[
            ["Engagement type", humanize(data.engagement_type)],
            ["Engagement basis", humanize(data.engagement_basis)],
            ["Finder", data.finder_name],
            ["Attendance count", data.attendance_count],
            ["Roster count", data.roster_count],
            ["Attendance notes", data.attendance_notes],
          ]}
        />
        <Facts
          title="Operational logistics"
          rows={[
            ["Parking", data.parking_notes],
            ["Dressing room", data.dressing_room_notes],
            ["Logistics", data.logistics_notes],
            ["Operations updated", new Date(data.updated_at).toLocaleString()],
          ]}
        />
        <p className="notice">
          Historical operational information is read-only. Recorded amounts and
          assumptions are shown as saved; they do not verify payment or booking.
        </p>
      </Disclosure>
    </>
  );
}
function Failure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="card data-error" role="alert">
      <p>{message}</p>
      <button className="button" onClick={retry}>
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}
export function LiveDetail({
  id,
  back,
  updated,
  saved,
  previousId,
  nextId,
  move,
  notify,
  staffName = "Staff",
}: {
  id: string;
  staffName?: string;
  back: () => void;
  updated: (item: Presentation) => void;
  saved: Presentation | null;
  previousId: string | null;
  nextId: string | null;
  move: (id: string) => void;
  notify: (message: string) => void;
}) {
  const recordResource = useDetailResource(id, fetchPresentation);
  const record = recordResource.state;
  const observedSave = useRef(saved);
  const ready = record.kind === "ready";
  const activityResource = useDetailResource(id, fetchActivities, ready);
  const operationsResource = useDetailResource(id, fetchOperations, ready);
  const activities = activityResource.state;
  const operations = operationsResource.state;
  useEffect(() => {
    if (saved && saved !== observedSave.current) {
      recordResource.replace(saved);
      activityResource.retry();
    }
    observedSave.current = saved;
  }, [saved, recordResource.replace, activityResource.retry]);
  const [tab, setTab] = useState<"Activity" | "Email thread">("Activity");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save(patch: DetailPatch): Promise<boolean> {
    setSaving(true);
    const area =
      "status" in patch
        ? "status"
        : "internal_notes" in patch
          ? "comment"
          : "edit";
    setSaveError(null);
    try {
      const data = detailSchema.parse(
        await (
          await apiFetch(`/api/v1/presentations/${id}/workspace`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
        ).json(),
      );
      observedSave.current = data;
      updated(data);
      if (!mounted.current) return false;
      recordResource.replace(data);
      if ("internal_notes" in patch) setText("");
      activityResource.retry();
      return true;
    } catch (error) {
      if (mounted.current) setSaveError({ area, message: errorMessage(error) });
      return false;
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  if (record.kind !== "ready")
    return (
      <div className="detail-page live-detail">
        <div className="detail-toolbar">
          <button className="text-button" onClick={back}>
            <ArrowLeft size={16} />
            Back to presentations
          </button>
          {record.kind === "loading" && (
            <div className="detail-actions" aria-hidden="true">
              <Skeleton className="detail-skeleton-edit" />
              <Skeleton className="detail-skeleton-action" />
              <Skeleton className="detail-skeleton-action" />
            </div>
          )}
        </div>
        {record.kind === "loading" ? (
          <PresentationSkeleton />
        ) : (
          <Failure message={record.message} retry={recordResource.retry} />
        )}
      </div>
    );
  const item = record.data;
  const clientName =
    optionalText(item.contact_full_name) ??
    [
      optionalText(item.contact_first_name),
      optionalText(item.contact_last_name),
    ]
      .filter(Boolean)
      .join(" ");
  const clientEmail = optionalText(item.contact_email);
  const clientPhone = optionalText(item.contact_phone);
  const organization = optionalText(item.organization_name);
  const organizationName =
    organization && !organizationPlaceholders.has(organization.toLowerCase())
      ? organization
      : null;
  const title = organizationName ?? (clientName || "Presentation request");
  const source = sourceLabels[item.source];
  const received = item.received_at ? new Date(item.received_at) : null;
  const edit = (values: PresentationEditPayload) => {
    void save(values).then((success) => {
      if (success) setEditOpen(false);
    });
  };
  const previousLabel = previousId
    ? "Previous request"
    : "No previous request on this page";
  const nextLabel = nextId ? "Next request" : "No next request on this page";
  const activityTitle = (kind: string) => {
    const labels: Record<string, string> = {
      created: "Request received",
      status_changed: "Status changed",
      details_updated: "Presentation details edited",
      note_added: "Staff comment",
      email_recommended: "Email recommended",
      email_blocked: "Email needs information",
      email_draft_created: "Email draft created",
      email_draft_updated: "Email draft edited",
      email_approved: "Email approved",
      email_cancelled: "Email cancelled",
      email_send_started: "Email sending",
      email_sent: "Email sent",
      email_send_failed: "Email delivery failed",
      email_send_retried: "Email retry started",
    };
    return labels[kind] || humanize(kind);
  };
  return (
    <div className="detail-page live-detail">
      <div className="detail-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={16} />
          Back to presentations
        </button>
        <div className="detail-actions">
          <button className="button" onClick={() => setEditOpen(true)}>
            <Pencil size={14} /> Edit
          </button>
          <button
            className="icon-button"
            aria-label={previousLabel}
            title={previousLabel}
            disabled={!previousId}
            onClick={() => previousId && move(previousId)}
          >
            <ChevronUp size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={nextLabel}
            title={nextLabel}
            disabled={!nextId}
            onClick={() => nextId && move(nextId)}
          >
            <ChevronDown size={17} />
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-title presentation-title">
            <div>
              <h2>
                <span>{title}</span>
                <Badge status={item.status} />
              </h2>
              <p className="presentation-source">
                {received && !Number.isNaN(received.getTime()) ? (
                  <>
                    <time dateTime={received.toISOString()}>
                      {receivedDateTime.format(received)}
                    </time>{" "}
                    from{" "}
                    {item.source === "legacy_csv"
                      ? "CSV import"
                      : source.toLowerCase()}
                  </>
                ) : (
                  source
                )}
              </p>
            </div>
          </div>
          <div className="presentation-overview presentation-overview--stacked">
            <Facts
              title="Request details"
              className="presentation-request-facts"
              rows={[
                ["Organization", organizationName],
                ["Website", item.organization_website],
                ["Event purpose", item.event_purpose, "full"],
                ["Additional notes", item.additional_notes, "full"],
              ]}
            />
            <EventAndVenue item={item} />
          </div>
          <div
            className="detail-tabs"
            role="tablist"
            aria-label="Presentation sections"
          >
            {detailTabs.map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                className={tab === name ? "selected" : ""}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {tab === "Email thread" ? (
            <PresentationEmailThread
              id={id}
              item={toInquiry(item)}
              notify={notify}
              onChanged={activityResource.retry}
            />
          ) : (
            <div className="activity-pane">
              <section className="timeline-section">
                <h2>
                  Activity{" "}
                  <span className="muted">
                    Only you and other staff can see comments
                  </span>
                </h2>
                <CommentComposer
                  staffName={staffName}
                  value={text}
                  onChange={setText}
                  onPost={(comment) => void save({ internal_notes: comment })}
                  saving={saving}
                />
                {saveError?.area === "comment" && (
                  <p className="error" role="alert">
                    {saveError.message}
                  </p>
                )}
                {activities.kind === "loading" ? (
                  <HistorySkeleton label="Loading activity" />
                ) : activities.kind === "error" ? (
                  <Failure
                    message={activities.message}
                    retry={activityResource.retry}
                  />
                ) : activities.data.length ? (
                  <div className="shopify-timeline">
                    <div className="timeline-day">
                      {new Date(
                        activities.data[0].created_at,
                      ).toLocaleDateString([], {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                    {activities.data.map((entry) => (
                      <article
                        className={`shopify-activity activity-${entry.kind}`}
                        key={entry.id}
                      >
                        <span className="shopify-activity-dot" />
                        <div className="shopify-activity-copy">
                          <header>
                            <strong>{activityTitle(entry.kind)}</strong>
                            <time>
                              {new Date(entry.created_at).toLocaleTimeString(
                                [],
                                { hour: "numeric", minute: "2-digit" },
                              )}
                            </time>
                          </header>
                          <p>
                            {entry.note ||
                              entry.summary ||
                              (entry.new_status
                                ? `${entry.previous_status ? humanize(entry.previous_status) + " → " : ""}${humanize(entry.new_status)}`
                                : "Request recorded")}
                          </p>
                          {entry.actor_id && <small>{entry.actor_id}</small>}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-activity">No activity is recorded.</p>
                )}
              </section>
            </div>
          )}
        </div>
        <aside className="client-sidebar">
          <section className="presentation-status">
            <StatusPicker
              value={item.status}
              disabled={saving}
              onChange={(status) => {
                void save({ status, expected_current_status: item.status });
              }}
            />
            {saveError?.area === "status" && (
              <p className="error" role="alert">
                {saveError.message}
              </p>
            )}
          </section>
          <section>
            <h2>Client</h2>
            <h3>{clientName || "-"}</h3>
            {clientEmail && (
              <a
                className="contact-link"
                href={`mailto:${encodeURIComponent(clientEmail).replace(/%40/g, "@")}`}
              >
                <Mail size={14} aria-hidden="true" />{" "}
                {clientEmail.toLowerCase()}
              </a>
            )}
            {clientPhone && (
              <a
                className="contact-link"
                href={`tel:${clientPhone.replace(/[^+\d]/g, "")}`}
              >
                <Phone size={14} aria-hidden="true" />{" "}
                {formatClientPhone(clientPhone)}
              </a>
            )}
          </section>
          {operations.kind === "ready" ? (
            operations.data ? (
              <OperationsFacts data={operations.data} />
            ) : (
              <p>No operational information is recorded.</p>
            )
          ) : operations.kind === "loading" ? (
            <FactsSkeleton
              title="Payment and paperwork"
              label="Loading operational information"
            />
          ) : (
            <Failure
              message={operations.message}
              retry={operationsResource.retry}
            />
          )}
        </aside>
      </div>
      {editOpen && (
        <PresentationEditModal
          item={item}
          saving={saving}
          error={saveError?.area === "edit" ? saveError.message : ""}
          close={() => setEditOpen(false)}
          save={edit}
        />
      )}
    </div>
  );
}
