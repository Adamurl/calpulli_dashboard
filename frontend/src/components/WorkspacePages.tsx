import { useEffect, useState } from "react";
import {
  Mail,
  ArrowUpRight,
  Search,
  ShieldCheck,
  Check,
  Copy,
  RefreshCw,
} from "lucide-react";
import type { Inquiry } from "../domain";
import { templates } from "../domain";
import { Avatar, Modal } from "./ui";
import { Skeleton } from "./Skeleton";
import {
  fetchEmailTemplates,
  fetchEmailVariableCatalog,
  updateEmailTemplate,
  errorMessage,
} from "../presentations";
import type {
  EmailTemplate,
  EmailVariableCatalog,
  LoadState,
} from "../presentations";
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
      <section
        className="card template-table-wrap"
        aria-label="Sample templates"
      >
        <table className="template-table">
          <thead>
            <tr>
              <th scope="col">Template</th>
              <th scope="col">Purpose</th>
              <th scope="col">Email policy</th>
              <th scope="col">Status</th>
              <th scope="col">Last edited</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const edit = () => {
                setSelected(template);
                setSubject(template.subject);
                setBody(template.body);
              };
              return (
                <tr key={template.name} onClick={edit}>
                  <th scope="row">
                    <button
                      className="text-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        edit();
                      }}
                    >
                      {template.name}
                    </button>
                  </th>
                  <td>{template.stage}</td>
                  <td>Manual</td>
                  <td>
                    <span className="badge template-inactive">Inactive</span>
                  </td>
                  <td>Sample copy</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
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

function readableKey(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function LiveTemplates({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<LoadState<EmailTemplate[]>>({
    kind: "loading",
  });
  const [variables, setVariables] = useState<EmailVariableCatalog | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [readyForUse, setReadyForUse] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setTemplates({ kind: "loading" });
    Promise.all([
      fetchEmailTemplates(controller.signal),
      fetchEmailVariableCatalog(controller.signal),
    ])
      .then(([items, catalog]) => {
        if (controller.signal.aborted) return;
        setTemplates({ kind: "ready", data: items });
        setVariables(catalog);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setTemplates({ kind: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [attempt]);
  async function saveTemplate() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const updated = await updateEmailTemplate({
        key: selected.key,
        subject,
        body_text: body,
        ready_for_use: readyForUse,
      });
      setTemplates((current) =>
        current.kind === "ready"
          ? {
              kind: "ready",
              data: current.data.map((item) =>
                item.key === updated.key ? updated : item,
              ),
            }
          : current,
      );
      setSelected(null);
      notify("Template saved.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="list-page live-templates">
      {templates.kind === "error" ? (
        <section className="card data-error" role="alert">
          <p>{templates.message}</p>
          <button
            className="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={14} /> Try again
          </button>
        </section>
      ) : (
        <section
          className="card template-table-wrap"
          aria-label="Email templates"
          aria-busy={templates.kind === "loading"}
        >
          {templates.kind === "loading" && (
            <span className="sr-only" role="status">
              Loading email templates…
            </span>
          )}
          <table className="template-table">
            <thead>
              <tr>
                <th scope="col">Template</th>
                <th scope="col">Purpose</th>
                <th scope="col">Email policy</th>
                <th scope="col">Status</th>
                <th scope="col">Last edited</th>
              </tr>
            </thead>
            <tbody>
              {templates.kind === "loading"
                ? Array.from({ length: 6 }, (_, index) => (
                    <tr key={index} aria-hidden="true">
                      {Array.from({ length: 5 }, (_, column) => (
                        <td key={column}>
                          <Skeleton className="template-cell-skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                : templates.data.map((template) => {
                    const workflows =
                      variables?.workflows.filter(
                        (workflow) => workflow.template_key === template.key,
                      ) ?? [];
                    const policies = [
                      ...new Set(
                        workflows.map(
                          (workflow) =>
                            ({
                              automatic: "Automatic",
                              approval_required: "Staff approval",
                              manual_only: "Manual",
                            })[workflow.sending_rule],
                        ),
                      ),
                    ];
                    const edit = () => {
                      setSelected(template);
                      setSubject(template.subject);
                      setBody(template.body_text);
                      setReadyForUse(template.ready_for_use);
                    };
                    return (
                      <tr key={template.key} onClick={edit}>
                        <th scope="row">
                          <button
                            className="text-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              edit();
                            }}
                          >
                            {readableKey(template.key)}
                          </button>
                        </th>
                        <td>{template.subject}</td>
                        <td>
                          {policies.length ? policies.join(" / ") : "Manual"}
                        </td>
                        <td>
                          <span
                            className={`badge ${template.ready_for_use ? "template-active" : "template-inactive"}`}
                          >
                            {template.ready_for_use ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <time dateTime={template.updated_at}>
                            {new Date(template.updated_at).toLocaleDateString(
                              [],
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </time>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </section>
      )}
      {selected && (
        <Modal
          title={`Edit ${readableKey(selected.key)}`}
          close={() => setSelected(null)}
          wide
        >
          <div className="composer-body live-template-editor">
            <label>
              Subject
              <input
                maxLength={998}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                rows={14}
                maxLength={30000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <label className="template-activation">
              <input
                type="checkbox"
                checked={readyForUse}
                onChange={(event) => setReadyForUse(event.target.checked)}
              />
              Active
            </label>
          </div>
          <div className="modal-footer">
            <button className="button" onClick={() => setSelected(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={saving || !subject.trim() || !body.trim()}
              onClick={() => void saveTemplate()}
            >
              {saving ? "Saving…" : "Save template"}
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
