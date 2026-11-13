import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  RefreshCw,
  CalendarDays,
  MapPin,
  Users,
} from "lucide-react";
import { apiFetch } from "../api";
import { requestSchema, statusLabels } from "../domain";
import type { Inquiry } from "../domain";
import {
  detailSchema,
  errorMessage,
  fetchActivities,
  fetchPresentation,
  fetchOperations,
  fetchEmails,
  humanize,
} from "../presentations";
import type { LoadState, Operations, Presentation } from "../presentations";
import { dateLabel } from "../data";
import { Avatar, Badge } from "./ui";
import {
  PresentationSkeleton,
  FactsSkeleton,
  HistorySkeleton,
} from "./PresentationSkeleton";

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
          ["Status basis", humanize(data.status_basis)],
          ["Imported from", data.imported_from],
          ["Operations updated", new Date(data.updated_at).toLocaleString()],
        ]}
      />
      <p className="notice">
        Historical operational information is read-only. Recorded amounts and
        assumptions are shown as saved; they do not verify payment or booking.
      </p>
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
}: {
  id: string;
  back: () => void;
  updated: (item: Presentation) => void;
  saved: Presentation | null;
}) {
  const recordResource = useDetailResource(id, fetchPresentation);
  const record = recordResource.state;
  const observedSave = useRef(saved);
  const ready = record.kind === "ready";
  const activityResource = useDetailResource(id, fetchActivities, ready);
  const operationsResource = useDetailResource(id, fetchOperations, ready);
  const [conversationRequested, setConversationRequested] = useState(false);
  const emailResource = useDetailResource(
    id,
    fetchEmails,
    ready && conversationRequested,
  );
  const activities = activityResource.state;
  const operations = operationsResource.state;
  const emails = emailResource.state;
  useEffect(() => {
    if (saved && saved !== observedSave.current) {
      recordResource.replace(saved);
      activityResource.retry();
    }
    observedSave.current = saved;
  }, [saved, recordResource.replace, activityResource.retry]);
  const [tab, setTab] = useState("Presentation details");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save(
    patch:
      | { internal_notes: string }
      | {
          status: Inquiry["status"];
          expected_current_status: Inquiry["status"];
        },
  ) {
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
      if (!mounted.current) return;
      recordResource.replace(data);
      if ("internal_notes" in patch) setText("");
      activityResource.retry();
    } catch (error) {
      if (mounted.current) setSaveError(errorMessage(error));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  if (record.kind !== "ready")
    return (
      <div className="detail-page live-detail">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={16} />
          Back to presentations
        </button>
        {record.kind === "loading" ? (
          <PresentationSkeleton />
        ) : (
          <Failure message={record.message} retry={recordResource.retry} />
        )}
      </div>
    );
  const item = record.data;
  const noteRecords =
    activities.kind === "ready"
      ? activities.data.filter(
          (entry) => entry.kind === "note_added" && entry.note,
        )
      : [];
  return (
    <div className="detail-page live-detail">
      <div className="detail-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={16} />
          Back to presentations
        </button>
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
          <div
            className="detail-tabs"
            role="tablist"
            aria-label="Presentation sections"
          >
            {["Presentation details", "Conversation thread", "Activity"].map(
              (name) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={tab === name}
                  className={tab === name ? "selected" : ""}
                  onClick={() => {
                    setTab(name);
                    if (name === "Conversation thread")
                      setConversationRequested(true);
                  }}
                >
                  {name}
                </button>
              ),
            )}
          </div>
          {tab === "Presentation details" ? (
            <div className="detail-sections">
              <Facts
                title="Contact and organization"
                rows={[
                  ["Full name", item.contact_full_name],
                  ["First name", item.contact_first_name],
                  ["Last name", item.contact_last_name],
                  ["Email", item.contact_email],
                  ["Phone", item.contact_phone],
                  ["Organization", item.organization_name],
                  ["Website or social media", item.organization_website],
                ]}
              />
              <Facts
                title="Event and venue"
                rows={[
                  [
                    "Event date",
                    item.event_date ? dateLabel(item.event_date) : null,
                  ],
                  ["Start time", item.start_time],
                  ["End time", item.end_time],
                  ["Time zone", item.event_timezone],
                  ["Event types", item.event_types],
                  ["Purpose", item.event_purpose],
                  ["Public or private", item.event_access],
                  ["Indoor or outdoor", item.event_setting],
                  ["Venue address", item.venue_address],
                  ["Estimated guests", item.estimated_guests],
                  ["Audience distance of 12 feet", item.audience_distance_12ft],
                  ["Unavailable logistics", item.unavailable_logistics],
                ]}
              />
              <Facts
                title="Referral and additional information"
                rows={[
                  ["Referral sources", item.referral_sources],
                  ["Referred by", item.referral_reference],
                  ["Additional notes", item.additional_notes],
                ]}
              />
              {operations.kind === "ready" ? (
                operations.data ? (
                  <OperationsFacts data={operations.data} />
                ) : (
                  <section className="card detail-facts">
                    <h2>Historical operations</h2>
                    <p>
                      No operational information is recorded for this request.
                    </p>
                  </section>
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
              <Facts
                title="Request record"
                rows={[
                  ["Request ID", item.id],
                  ["Source", humanize(item.source)],
                  ["Form version", item.form_version],
                  [
                    "Received",
                    item.received_at
                      ? new Date(item.received_at).toLocaleString()
                      : null,
                  ],
                  ["Created", new Date(item.created_at).toLocaleString()],
                  ["Updated", new Date(item.updated_at).toLocaleString()],
                  ["Source key", item.source_key],
                  ["External ID", item.external_id],
                  ["Import batch", item.import_batch_id],
                  ["Source row", item.source_row_number],
                ]}
              />
              <details className="card original-submission">
                <summary>Original form submission</summary>
                {Object.keys(item.original_fields).length ? (
                  <dl>
                    {Object.entries(item.original_fields).map(
                      ([key, value]) => (
                        <div className="fact-pair" key={key}>
                          <dt>{key}</dt>
                          <dd>{valueText(value)}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                ) : (
                  <p>No original fields are recorded.</p>
                )}
              </details>
            </div>
          ) : tab === "Conversation thread" ? (
            <>
              {emails.kind === "loading" ? (
                <HistorySkeleton label="Loading conversation history" />
              ) : emails.kind === "error" ? (
                <Failure message={emails.message} retry={emailResource.retry} />
              ) : emails.data.length ? (
                [...emails.data]
                  .sort((a, b) => a.created_at.localeCompare(b.created_at))
                  .map((message) => (
                    <section className="card email-card" key={message.id}>
                      <header>
                        <Avatar name="Calpulli Team" />
                        <div>
                          <strong>Calpulli Tonalehqueh</strong>
                          <small>
                            To {message.recipient_email || "Not provided"}
                          </small>
                        </div>
                        <time>
                          {new Date(
                            message.sent_at || message.created_at,
                          ).toLocaleString()}
                        </time>
                      </header>
                      <div className="email-content">
                        <h3>{message.subject || "No subject"}</h3>
                        <p className="email-text">{message.body_text}</p>
                      </div>
                      <footer>{humanize(message.status.toLowerCase())}</footer>
                    </section>
                  ))
              ) : (
                <section className="card detail-facts">
                  <h2>No conversation history yet</h2>
                  <p>
                    No email messages are stored for this request. Historical
                    submissions do not include prior email conversations.
                  </p>
                </section>
              )}
              <p className="notice">
                Email composing and delivery are not enabled in this workspace
                yet.
              </p>
            </>
          ) : (
            <section className="card activity-list">
              <h2>Request activity</h2>
              {activities.kind === "loading" ? (
                <HistorySkeleton label="Loading activity" />
              ) : activities.kind === "error" ? (
                <Failure
                  message={activities.message}
                  retry={activityResource.retry}
                />
              ) : activities.data.length ? (
                activities.data.map((entry) => (
                  <div className="activity-entry" key={entry.id}>
                    <strong>{humanize(entry.kind)}</strong>
                    <p>
                      {entry.note ||
                        entry.summary ||
                        (entry.new_status
                          ? `${entry.previous_status ? humanize(entry.previous_status) + " → " : ""}${humanize(entry.new_status)}`
                          : "Request recorded")}
                    </p>
                    <small>
                      {new Date(entry.created_at).toLocaleString()}
                      {entry.actor_id ? ` · ${entry.actor_id}` : ""}
                    </small>
                  </div>
                ))
              ) : (
                <p>No activity is recorded.</p>
              )}
            </section>
          )}
          <section className="timeline-section">
            <h2>
              Internal notes <span className="muted">Staff only</span>
            </h2>
            <form
              className="card note-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (text.trim() && !saving)
                  void save({ internal_notes: text.trim() });
              }}
            >
              <textarea
                aria-label="Internal note"
                disabled={saving}
                placeholder="Leave a note for your team…"
                value={text}
                maxLength={10000}
                onChange={(event) => setText(event.target.value)}
              />
              <div>
                <small>Saved to this presentation record.</small>
                <button
                  className="button primary compact"
                  disabled={saving || !text.trim()}
                >
                  {saving ? "Saving…" : "Add note"}
                </button>
              </div>
            </form>
            {saveError && (
              <div className="error" role="alert">
                {saveError}
                <button
                  className="button"
                  onClick={() => {
                    setSaveError("");
                    recordResource.retry();
                  }}
                >
                  Refresh details
                </button>
              </div>
            )}
            {activities.kind === "error" ? (
              <Failure
                message={activities.message}
                retry={activityResource.retry}
              />
            ) : activities.kind === "loading" ? (
              <HistorySkeleton label="Loading internal notes" />
            ) : (
              <div className="timeline">
                {noteRecords.map((entry) => (
                  <div key={entry.id}>
                    <span className="timeline-dot" />
                    <p>
                      <strong>Team note</strong>
                      <br />
                      {entry.note}
                      <br />
                      <small>
                        {new Date(entry.created_at).toLocaleString()}
                      </small>
                    </p>
                  </div>
                ))}
                {item.internal_notes &&
                  !noteRecords.some(
                    (entry) => entry.note === item.internal_notes,
                  ) && (
                    <div>
                      <span className="timeline-dot" />
                      <p>
                        <strong>Recorded internal note</strong>
                        <br />
                        {item.internal_notes}
                      </p>
                    </div>
                  )}
              </div>
            )}
          </section>
        </div>
        <aside className="client-sidebar">
          <section>
            <h2>Client</h2>
            <Avatar name={item.contact_full_name || "Unknown"} />
            <h3>{item.contact_full_name || "Not provided"}</h3>
            <span className="client-email">
              {item.contact_email || "Not provided"}
            </span>
            <p>{item.organization_name || "Not provided"}</p>
          </section>
          <section>
            <h2>Presentation</h2>
            <p>
              <CalendarDays size={14} />
              {dateLabel(item.event_date || "")}
            </p>
            <p>
              <MapPin size={14} />
              {item.venue_address || "Not provided"}
            </p>
            <p>
              <Users size={14} />
              {item.estimated_guests === null
                ? "Guest count not provided"
                : `${item.estimated_guests} expected guests`}
            </p>
          </section>
          <section>
            <label>
              Status
              <select
                aria-label="Request status"
                value={item.status}
                disabled={saving}
                onChange={(event) => {
                  const status = requestSchema.shape.status.parse(
                    event.target.value,
                  );
                  if (status !== item.status)
                    void save({ status, expected_current_status: item.status });
                }}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <small className="muted">
              Status changes are saved. No email is sent.
            </small>
          </section>
        </aside>
      </div>
    </div>
  );
}
