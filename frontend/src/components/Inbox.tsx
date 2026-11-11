import { useState } from "react";
import { Search, Mail, ArrowUpRight, Plus } from "lucide-react";
import type { Inquiry, Draft } from "../domain";
import { Avatar, Badge, Empty } from "./ui";
export function Inbox({
  items,
  drafts,
  open,
  compose,
  edit,
  mode,
}: {
  items: Inquiry[];
  drafts: Draft[];
  open: (id: string) => void;
  compose: () => void;
  edit: (d: Draft) => void;
  mode: "Inbox" | "Drafts";
}) {
  const [tab, setTab] = useState("All"),
    [query, setQuery] = useState("");
  const matches = items.filter(
    (i) =>
      `${i.name} ${i.email} ${i.organization} ${i.preview}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (tab !== "Unread" || i.unread),
  );
  const filteredDrafts = drafts.filter(
    (d) =>
      `${d.to} ${d.subject} ${d.body}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (tab !== "Needs review" || d.status === "review"),
  );
  return (
    <div className="list-page">
      <div className="page-heading">
        <button className="button primary" onClick={compose}>
          <Plus size={15} />
          New email
        </button>
      </div>
      <section className="card inbox-card">
        <div className="table-tabs">
          {(mode === "Inbox" ? ["All", "Unread"] : ["All", "Needs review"]).map(
            (t) => (
              <button
                className={t === tab ? "selected" : ""}
                onClick={() => setTab(t)}
                key={t}
              >
                {t}
              </button>
            ),
          )}
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label={`Search ${mode.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, or keyword"
            />
          </label>
          <span className="muted">
            {mode === "Inbox" ? matches.length : filteredDrafts.length}{" "}
            conversations
          </span>
        </div>
        {mode === "Inbox"
          ? matches.map((i) => (
              <button
                className={`inbox-row ${i.unread ? "unread" : ""}`}
                key={i.id}
                onClick={() => open(i.id)}
              >
                <Avatar name={i.name} />
                <div className="inbox-sender">
                  <strong>{i.name}</strong>
                  <small>{i.organization}</small>
                </div>
                <div className="inbox-preview">
                  <strong>{i.title}</strong>
                  <p>{i.preview}</p>
                </div>
                <Badge status={i.status} />
                <span className="inbox-date">
                  {i.unread && <span className="unread-dot" />}Nov 10
                  <ArrowUpRight size={14} />
                </span>
              </button>
            ))
          : filteredDrafts.map((d) => (
              <button
                className="inbox-row draft-row"
                key={d.id}
                onClick={() => edit(d)}
              >
                <span className="quick-icon">
                  <Mail size={18} />
                </span>
                <div className="inbox-sender">
                  <strong>{d.to}</strong>
                  <small>
                    {d.status === "review" ? "Needs review" : "Draft"}
                  </small>
                </div>
                <div className="inbox-preview">
                  <strong>{d.subject}</strong>
                  <p>{d.body}</p>
                </div>
                <span className="inbox-date">
                  Edit
                  <ArrowUpRight size={14} />
                </span>
              </button>
            ))}
        {(mode === "Inbox" ? !matches.length : !filteredDrafts.length) && (
          <Empty
            title={
              mode === "Drafts"
                ? "A little space for your next thought."
                : "You’re all caught up."
            }
          >
            {mode === "Drafts"
              ? "Write a personal email and save it here before sharing."
              : "Try another search or come back to all conversations."}
          </Empty>
        )}
        <div className="card-footer">
          Sample conversations · No live mailbox connected
        </div>
      </section>
    </div>
  );
}
