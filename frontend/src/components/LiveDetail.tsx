import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { apiFetch } from "../api";
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
import { Avatar, Badge } from "./ui";
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

type DetailPatch =
  | { internal_notes: string }
  | {
      status: Inquiry["status"];
      expected_current_status: Inquiry["status"];
    }
  | PresentationEditPayload;

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
  if (value === null || value === undefined || value === "")
    return <span className="muted">Not provided</span>;
  if (Array.isArray(value))
    return value.length ? (
      value
        .map((entry) =>
          typeof entry === "string" ? humanize(entry) : JSON.stringify(entry),
        )
        .join(", ")
    ) : (
      <span className="muted">Not provided</span>
    );
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
function Facts({ title, rows }: { title: string; rows: [string, unknown][] }) {
  return (
    <section className="card detail-facts">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div className="fact-pair" key={label}>
            <dt>{label}</dt>
            <dd>{valueText(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  const [saveError, setSaveError] = useState("");
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
    setSaveError("");
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
      if (mounted.current) setSaveError(errorMessage(error));
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
              <Skeleton className="detail-skeleton-action" />
              <Skeleton className="detail-skeleton-action" />
              <Skeleton className="detail-skeleton-edit" />
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
          <button className="button" onClick={() => setEditOpen(true)}>
            <Pencil size={14} /> Edit
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-title">
            <div>
              <h2>
                #{item.id.slice(0, 8)} <Badge status={item.status} />
              </h2>
              <p>{item.organization_name || "Presentation request"}</p>
            </div>
          </div>
          <div className="presentation-overview">
            <Facts
              title="Contact and organization"
              rows={[
                ["First name", item.contact_first_name],
                ["Last name", item.contact_last_name],
                ["Email", item.contact_email],
                ["Phone", item.contact_phone],
                ["Organization", item.organization_name],
                ["Website", item.organization_website],
              ]}
            />
            <Facts
              title="Event and venue"
              rows={[
                ["Date", item.event_date ? dateLabel(item.event_date) : null],
                ["Location", item.venue_address],
                ["Expected guests", item.estimated_guests],
                ["Start time", item.start_time],
                ["End time", item.end_time],
                ["Time zone", item.event_timezone],
                ["Event types", item.event_types],
                ["Purpose", item.event_purpose],
                ["Public or private", item.event_access],
                ["Indoor or outdoor", item.event_setting],
              ]}
            />
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
                <form
                  className="card note-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (text.trim() && !saving)
                      void save({ internal_notes: text.trim() });
                  }}
                >
                  <Avatar name={staffName} />
                  <textarea
                    aria-label="Internal note"
                    disabled={saving}
                    placeholder="Leave a comment…"
                    value={text}
                    maxLength={10000}
                    onChange={(event) => setText(event.target.value)}
                  />
                  <div>
                    <small>Staff only</small>
                    <button
                      className="button primary compact"
                      disabled={saving || !text.trim()}
                    >
                      {saving ? "Saving…" : "Post"}
                    </button>
                  </div>
                </form>
                {saveError && (
                  <p className="error" role="alert">
                    {saveError}
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
          <section>
            <h2>Client</h2>
            <Avatar name={item.contact_full_name || "Unknown"} />
            <h3>{item.contact_full_name || "Not provided"}</h3>
          </section>
          <section>
            <StatusPicker
              value={item.status}
              disabled={saving}
              onChange={(status) => {
                void save({ status, expected_current_status: item.status });
              }}
            />
            <small className="muted">
              Status changes are recorded in Activity. No email is sent
              automatically.
            </small>
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
          <Disclosure title="Event logistics">
            <Facts
              title="Event logistics"
              rows={[
                ["Audience distance", item.audience_distance_12ft],
                ["Unavailable logistics", item.unavailable_logistics],
                ["Additional notes", item.additional_notes],
              ]}
            />
          </Disclosure>
        </aside>
      </div>
      {editOpen && (
        <PresentationEditModal
          item={item}
          saving={saving}
          error={saveError}
          close={() => setEditOpen(false)}
          save={edit}
        />
      )}
    </div>
  );
}
