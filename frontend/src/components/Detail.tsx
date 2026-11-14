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
import { StatusPicker } from "./StatusPicker";
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
    [tab, setTab] = useState("Presentation details");
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
              <h2>
                #{item.id} <Badge status={item.status} />
              </h2>
              <p>
                {item.title} · {item.organization}
              </p>
            </div>
            <span className="muted">Sample request</span>
          </div>
          <div className="detail-tabs">
            {["Presentation details", "Conversation thread", "Activity"].map(
              (t) => (
                <button
                  className={tab === t ? "selected" : ""}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ),
            )}
          </div>
          {tab === "Conversation thread" ? (
            <>
              <p className="demo-thread-label">
                <strong>Demo conversation</strong> · Fictional messages showing
                the complete presentation workflow.
              </p>
              {[
                {
                  sender: item.name,
                  email: item.email,
                  to: "Calpulli Tonalehqueh",
                  time: "Nov 10, 2026 · 9:41 AM",
                  subject: item.title,
                  body: `Hello Calpulli team,\n\n${item.preview}\n\nWe are planning our event for ${dateLabel(item.date)} in ${item.location}, with around ${item.guests} guests. Could you share your availability and presentation options?\n\nThank you,\n${item.name.split(" ")[0]}`,
                },
                {
                  sender: "Calpulli Team",
                  email: "team@example.org",
                  to: item.name,
                  time: "Nov 10, 2026 · 11:15 AM",
                  subject: `Re: ${item.title}`,
                  body: `Hello ${item.name.split(" ")[0]},\n\nThank you for inviting Calpulli Tonalehqueh. We would love to share a cultural presentation with your community.\n\nCould you confirm whether the performance space is indoors or outdoors, the available time, and whether you can provide a dressing room and parking nearby?\n\nWarmly,\nCalpulli Team`,
                },
                {
                  sender: item.name,
                  email: item.email,
                  to: "Calpulli Tonalehqueh",
                  time: "Nov 10, 2026 · 1:32 PM",
                  subject: `Re: ${item.title}`,
                  body: "Thank you for your response!\n\nThe presentation will be in our indoor assembly room from 1:00 to 2:00 PM. We can provide a private dressing room and reserve three parking spaces next to the entrance. There is room to keep the audience at least 12 feet from the dancers.\n\nWe would especially enjoy a short explanation of the traditions and an opportunity for questions.",
                },
                {
                  sender: "Calpulli Team",
                  email: "team@example.org",
                  to: item.name,
                  time: "Nov 11, 2026 · 10:05 AM",
                  subject: "Presentation proposal and next steps",
                  body: `Hello ${item.name.split(" ")[0]},\n\nThat space sounds suitable. Our example proposal includes a 45-minute presentation followed by 15 minutes for questions. We will coordinate arrival and setup with your venue contact.\n\nPlease review the proposal and confirm the details. In the live workflow, contract and payment confirmation are separate steps before booking.\n\nWarmly,\nCalpulli Team`,
                },
                {
                  sender: item.name,
                  email: item.email,
                  to: "Calpulli Tonalehqueh",
                  time: "Nov 11, 2026 · 2:20 PM",
                  subject: "Re: Presentation proposal and next steps",
                  body: "The proposed format looks wonderful. We have reviewed the details and would like to move forward.\n\nPlease send the contract and payment instructions. I will be your point of contact on the day and meet you at the reserved parking area.\n\nWe look forward to welcoming you!",
                },
              ].map((message) => (
                <section className="card email-card" key={message.time}>
                  <header>
                    <Avatar name={message.sender} />
                    <div>
                      <strong>{message.sender}</strong>
                      <small>
                        {message.email} <span>to {message.to}</span>
                      </small>
                    </div>
                    <time>{message.time}</time>
                  </header>
                  <div className="email-content">
                    <h3>{message.subject}</h3>
                    <p className="email-text">{message.body}</p>
                  </div>
                  <footer>
                    <Mail size={13} />
                    Demo message · Not sent
                  </footer>
                </section>
              ))}
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
            <StatusPicker value={item.status} onChange={status} />
            <small className="muted">
              Changes affect this sample workspace only.
            </small>
          </section>
          <section>
            <h2>Connection summary</h2>
            <p>
              <Mail size={14} />5 demo messages
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
        </aside>
      </div>
    </div>
  );
}
