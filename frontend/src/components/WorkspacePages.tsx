import { useState } from "react";
import {
  Mail,
  ArrowUpRight,
  Search,
  ShieldCheck,
  Check,
  Copy,
} from "lucide-react";
import type { Inquiry } from "../domain";
import { templates } from "../domain";
import { Avatar, Modal } from "./ui";
import { Skeleton } from "./Skeleton";
export function Clients({
  items,
  open,
  live = false,
  loading = false,
}: {
  items: Inquiry[];
  open: (id: string) => void;
  live?: boolean;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  return (
    <div className="list-page">
      <div className="page-heading">
        <span className="pill">
          {loading ? (
            <Skeleton className="clients-skeleton-count" />
          ) : (
            items.length
          )}{" "}
          {live ? "request contacts" : "sample clients"}
        </span>
      </div>
      <section className="card" aria-label="Clients" aria-busy={loading}>
        {loading && (
          <span className="sr-only" role="status">
            Loading clients…
          </span>
        )}
        <div className="table-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search clients"
              placeholder="Search people and organizations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="clients-grid">
          {loading
            ? Array.from({ length: 8 }, (_, index) => (
                <div className="client-skeleton" aria-hidden="true" key={index}>
                  <Skeleton className="client-skeleton-avatar" />
                  <div>
                    <Skeleton className="client-skeleton-name" />
                    <Skeleton className="client-skeleton-organization" />
                    <Skeleton className="client-skeleton-email" />
                  </div>
                </div>
              ))
            : items
                .filter((i) =>
                  `${i.name} ${i.organization} ${i.email}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((i) => (
                  <button key={i.id} onClick={() => open(i.id)}>
                    <Avatar name={i.name} />
                    <div>
                      <strong>{i.name}</strong>
                      <p>{i.organization}</p>
                      <small>{i.email}</small>
                    </div>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
        </div>
      </section>
    </div>
  );
}
export function Templates({
  useTemplate,
  notify,
}: {
  useTemplate: (subject: string, body: string) => void;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState<(typeof templates)[number] | null>(
      null,
    ),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState("");
  return (
    <div className="list-page">
      <div className="page-heading">
        <span className="pill">Reference copy · Not activated</span>
      </div>
      <div className="template-grid">
        {templates.map((t, index) => (
          <section className="card template-card" key={t.name}>
            <span className={`template-illustration template-${index}`}>
              <Mail size={35} strokeWidth={1} />
              <span className="stamp">c</span>
            </span>
            <div>
              <span className="eyebrow">{t.stage}</span>
              <h2>{t.name}</h2>
              <p>{t.body.split("\n\n")[1]}</p>
              <button
                className="button"
                onClick={() => {
                  setSelected(t);
                  setSubject(t.subject);
                  setBody(t.body);
                }}
              >
                Preview & personalize
                <ArrowUpRight size={14} />
              </button>
            </div>
          </section>
        ))}
      </div>
      <p className="notice">
        Templates here are sample copy. Backend automation templates require
        separate staff review and activation.
      </p>
      {selected && (
        <Modal title={selected.name} close={() => setSelected(null)} wide>
          <div className="composer-body">
            <label>
              Subject
              <input
                value={subject}
                maxLength={998}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                rows={12}
                value={body}
                maxLength={30000}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <p className="muted">
              Choose a client in the composer and replace [Name] before
              reviewing.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(body);
                  notify("Template copied.");
                } catch {
                  notify(
                    "Copy unavailable. Select the template text to copy it.",
                  );
                }
              }}
            >
              <Copy size={14} />
              Copy text
            </button>
            <button
              className="button primary"
              disabled={!subject.trim() || !body.trim()}
              onClick={() => {
                useTemplate(subject, body);
                setSelected(null);
              }}
            >
              Use this template
              <ArrowUpRight size={14} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function SettingsPage({
  name,
  email,
  isDemo,
  configured,
  notify,
}: {
  name: string;
  email: string;
  isDemo: boolean;
  configured: boolean;
  notify: (s: string) => void;
}) {
  const [reset, setReset] = useState(false);
  return (
    <div className="list-page settings-page">
      <section className="settings-section">
        <div>
          <h2>Your account</h2>
          <p>Your identity and workspace access.</p>
        </div>
        <div className="card settings-card">
          <div className="profile-line">
            <Avatar name={name} />
            <div>
              <strong>{name}</strong>
              <p>{email}</p>
            </div>
            <span className="pill">
              {isDemo ? "Demo user" : "Supabase user"}
            </span>
          </div>
          <div className="settings-row">
            <div>
              <strong>Authentication</strong>
              <p>
                {configured
                  ? "Connected to Calpulli Supabase Auth"
                  : "Public Supabase environment settings required"}
              </p>
            </div>
            <ShieldCheck size={19} />
          </div>
          <small>
            Supabase sign-in identifies users. Access to production records
            needs server-side staff authorization.
          </small>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Email channel</h2>
          <p>How your conversations are delivered.</p>
        </div>
        <div className="card settings-card">
          <div className="settings-row">
            <div>
              <strong>
                <Mail size={15} />
                Email workspace
              </strong>
              <p>Sample mode · No messages sent or synchronized</p>
            </div>
            <span className="badge reviewing">Preview</span>
          </div>
          <p>
            The backend supports draft editing, approvals, and mock delivery.
            Live Gmail and incoming email sync are not connected to this
            frontend.
          </p>
          <button
            className="button"
            onClick={() =>
              notify(
                "Live email requires backend authorization, provider setup, and a separate activation review.",
              )
            }
          >
            View connection requirements
            <ArrowUpRight size={14} />
          </button>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Sample workspace</h2>
          <p>A safe place to explore the interface.</p>
        </div>
        <div className="card settings-card">
          <p>
            Fictional clients, drafts, notes, and request changes are stored in
            this browser. Nothing here changes the Calpulli database.
          </p>
          <button className="button" onClick={() => setReset(true)}>
            Reset sample workspace
          </button>
        </div>
      </section>
      {reset && (
        <Modal title="Reset sample workspace?" close={() => setReset(false)}>
          <div className="composer-body">
            <p>
              This removes the drafts, notes, and sample changes you made in
              this browser. Production data is unaffected.
            </p>
          </div>
          <div className="modal-footer">
            <button className="button" onClick={() => setReset(false)}>
              Keep my work
            </button>
            <button
              className="button primary"
              onClick={() => {
                localStorage.removeItem("calpulli-demo-v1");
                location.reload();
              }}
            >
              <Check size={14} />
              Reset sample data
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
