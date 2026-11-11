import {
  ArrowLeft,
  Mail,
  MoreHorizontal,
  CalendarDays,
  MapPin,
  Users,
  FileText,
  Plus,
  Clock3,
  Check,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import type { Draft, Inquiry } from "../domain";
import { statusLabels } from "../domain";
import { dateLabel } from "../data";
import { Badge, Avatar } from "./ui";
export function Detail({
  item,
  drafts,
  notes,
  back,
  compose,
  edit,
  note,
  status,
  archive,
}: {
  item: Inquiry;
  drafts: Draft[];
  notes: string[];
  back: () => void;
  compose: () => void;
  edit: (d: Draft) => void;
  note: (text: string) => void;
  status: (value: Inquiry["status"]) => void;
  archive: () => void;
}) {
  const [text, setText] = useState(""),
    [tab, setTab] = useState("Conversation");
  return (
    <div className="detail-page">
      <div className="detail-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={16} />
          Back to workspace
        </button>
        <div>
          <button className="button" onClick={archive}>
            Archive conversation
          </button>
          <button className="button primary" onClick={compose}>
            <Plus size={14} />
            New email
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-title">
            <div>
              <h1>
                #{item.id} <Badge status={item.status} />
              </h1>
              <p>
                {item.title} · {item.organization}
              </p>
            </div>
            <span className="muted">Sample request</span>
          </div>
          <div className="detail-tabs">
            {["Conversation", "Presentation details", "Activity"].map((t) => (
              <button
                className={tab === t ? "selected" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Conversation" ? (
            <>
              <section className="card email-card">
                <header>
                  <Avatar name={item.name} />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.email} <span>to Calpulli Tonalehqueh</span>
                    </small>
                  </div>
                  <time>Nov 10, 2026 · 9:41 AM</time>
                </header>
                <div className="email-content">
                  <h3>{item.title}</h3>
                  <p>Hello Calpulli team,</p>
                  <p>{item.preview}</p>
                  <p>
                    We are planning our event for {dateLabel(item.date)} in{" "}
                    {item.location}, with around {item.guests} guests. It would
                    be wonderful to share this experience with our community.
                  </p>
                  <p>Please let me know what information you need from us.</p>
                  <p>
                    Thank you,
                    <br />
                    {item.name.split(" ")[0]}
                  </p>
                </div>
                <footer>
                  <Mail size={13} /> Fictional incoming email for preview
                </footer>
              </section>
              {drafts.map((d) => (
                <section className="card draft-preview" key={d.id}>
                  <div className="section-head">
                    <h2>
                      <FileText size={15} />
                      {d.status === "review" ? "Awaiting review" : "Draft"}
                    </h2>
                    <button className="button compact" onClick={() => edit(d)}>
                      Edit draft
                    </button>
                  </div>
                  <h3>{d.subject}</h3>
                  <p className="email-text">{d.body}</p>
                  <small>
                    To {d.to} · Saved{" "}
                    {new Date(d.updated).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </small>
                </section>
              ))}
              <button className="reply-box" onClick={compose}>
                <Avatar name="Calpulli Team" small />
                <span>Write a personal reply…</span>
                <span className="button">
                  Reply
                  <ArrowUpRight size={13} />
                </span>
              </button>
            </>
          ) : tab === "Presentation details" ? (
            <section className="card detail-facts">
              <h2>Presentation details</h2>
              <dl>
                <dt>Event</dt>
                <dd>{item.title}</dd>
                <dt>Date</dt>
                <dd>{dateLabel(item.date)}</dd>
                <dt>Organization</dt>
                <dd>{item.organization}</dd>
                <dt>Venue</dt>
                <dd>{item.location}</dd>
                <dt>Estimated guests</dt>
                <dd>{item.guests}</dd>
                <dt>Source</dt>
                <dd>
                  {item.source === "wix"
                    ? "Wix form"
                    : item.source === "manual"
                      ? "Manual entry"
                      : "Historical import"}
                </dd>
              </dl>
              <p className="notice">
                These fictional details are for interface review. Production
                records are not connected.
              </p>
            </section>
          ) : (
            <section className="card activity-list">
              <h2>Request activity</h2>
              <p>
                <Clock3 size={15} /> Inquiry received · Nov 10, 2026
              </p>
              {drafts.map((d) => (
                <p key={d.id}>
                  <FileText size={15} />
                  {d.status === "review"
                    ? "Email queued for review"
                    : "Email draft saved"}{" "}
                  · {new Date(d.updated).toLocaleString()}
                </p>
              ))}
            </section>
          )}
          <section className="timeline-section">
            <h2>
              Internal notes <span className="muted">Only your workspace</span>
            </h2>
            <form
              className="card note-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) {
                  note(text.trim());
                  setText("");
                }
              }}
            >
              <textarea
                aria-label="Internal note"
                placeholder="Leave a note for your team…"
                value={text}
                maxLength={3000}
                onChange={(e) => setText(e.target.value)}
              />
              <div>
                <small>Demo notes stay in this browser.</small>
                <button
                  className="button primary compact"
                  disabled={!text.trim()}
                >
                  Add note
                </button>
              </div>
            </form>
            <div className="timeline">
              {notes.map((n, index) => (
                <div key={index}>
                  <span className="timeline-dot" />
                  <p>
                    <strong>Team note</strong>
                    <br />
                    {n}
                  </p>
                </div>
              ))}
              <div>
                <span className="timeline-dot" />
                <p>
                  <strong>Inquiry received</strong>
                  <br />A new connection through{" "}
                  {item.source === "wix" ? "the Wix form" : "the workspace"}.
                </p>
              </div>
            </div>
          </section>
        </div>
        <aside className="client-sidebar">
          <section>
            <div className="section-head">
              <h2>Client</h2>
              <MoreHorizontal size={16} />
            </div>
            <Avatar name={item.name} />
            <h3>{item.name}</h3>
            <span className="client-email">{item.email}</span>
            <p>{item.organization}</p>
            <button className="text-button" onClick={compose}>
              Write an email
              <ArrowUpRight size={12} />
            </button>
          </section>
          <section>
            <h2>Presentation</h2>
            <p>
              <CalendarDays size={14} />
              {dateLabel(item.date)}
            </p>
            <p>
              <MapPin size={14} />
              {item.location}
            </p>
            <p>
              <Users size={14} />
              {item.guests} expected guests
            </p>
          </section>
          <section>
            <label>
              Status
              <select
                aria-label="Request status"
                value={item.status}
                onChange={(e) => {
                  const found = Object.keys(statusLabels).find(
                    (s) => s === e.target.value,
                  );
                  if (found) status(found as Inquiry["status"]);
                }}
              >
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <small className="muted">
              Changes affect this sample workspace only.
            </small>
          </section>
          <section>
            <h2>Connection summary</h2>
            <p>
              <Mail size={14} />1 incoming sample message
            </p>
            <p>
              <FileText size={14} />
              {drafts.length} saved drafts
            </p>
            <p>
              <Check size={14} />
              Personal attention, always
            </p>
          </section>
          <div className="privacy-callout">
            <span className="tiny-dot" />
            <p>Thoughtful conversations start with the full picture.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
