import { useEffect, useMemo, useState } from "react";
import { Mail, Plus, Reply, Send, Save, RefreshCw } from "lucide-react";
import type { Inquiry } from "../domain";
import {
  approveEmail,
  createEmailDraft,
  errorMessage,
  fetchEmails,
  fetchEmailCapabilities,
  fetchEmailTemplates,
  fetchEmailVariableCatalog,
  sendEmail,
  updateEmailDraft,
} from "../presentations";
import type {
  EmailRecord,
  EmailTemplate,
  EmailVariableCatalog,
  LoadState,
} from "../presentations";
import { Avatar, Modal } from "./ui";

type DraftState = {
  id: string | null;
  templateKey: string;
  replyToId: string | null;
  recipient: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
};

function variableNames(value: string) {
  return [
    ...new Set([...value.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1])),
  ];
}

function localVariables(item: Inquiry): Record<string, string> {
  return {
    Name: item.name,
    Organization: item.organization,
    "Event Description": item.title,
    "Presentation Details": item.title,
    "Requested Date": item.date,
    Location: item.location,
  };
}

function personName() {
  return "Calpulli Tonalehqueh";
}

function messageStatus(email: EmailRecord) {
  if (email.status === "SENT") return "Sent";
  if (email.status === "FAILED")
    return email.error_message || "Delivery failed";
  return email.status.replaceAll("_", " ").toLowerCase();
}

export function PresentationEmailThread({
  id,
  item,
  notify,
  onChanged,
}: {
  id: string;
  item: Inquiry;
  notify: (message: string) => void;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<LoadState<EmailRecord[]>>({
    kind: "loading",
  });
  const [templates, setTemplates] = useState<LoadState<EmailTemplate[]>>({
    kind: "loading",
  });
  const [catalog, setCatalog] = useState<EmailVariableCatalog | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setMessages({ kind: "loading" });
    fetchEmails(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setMessages({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setMessages({ kind: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchEmailTemplates(controller.signal),
      fetchEmailVariableCatalog(controller.signal),
      fetchEmailCapabilities(controller.signal),
    ])
      .then(([items, values, capabilities]) => {
        if (controller.signal.aborted) return;
        setTemplates({ kind: "ready", data: items });
        setCatalog(values);
        setDeliveryMode(capabilities.delivery_mode);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTemplates({ kind: "error", message: errorMessage(error) });
          setCapabilityError(errorMessage(error));
        }
      });
    return () => controller.abort();
  }, []);
  const messageList = messages.kind === "ready" ? messages.data : [];
  const templateList = templates.kind === "ready" ? templates.data : [];
  const readyTemplates = templateList;
  const selectedTemplate = useMemo(
    () =>
      readyTemplates.find((template) => template.key === draft?.templateKey) ??
      null,
    [draft?.templateKey, readyTemplates],
  );
  const tokens = draft ? variableNames(`${draft.subject}\n${draft.body}`) : [];
  const values = { ...localVariables(item), ...(draft?.variables ?? {}) };
  const missingValues = tokens.filter((name) => !values[name]?.trim());

  function startDraft(
    template: EmailTemplate,
    parent?: EmailRecord,
    existing?: EmailRecord,
  ) {
    setFormError("");
    setDraft({
      id: existing?.id ?? null,
      templateKey: template.key,
      replyToId: existing?.reply_to_id ?? parent?.id ?? null,
      recipient: existing?.recipient_email ?? item.email,
      subject:
        existing?.source_subject ??
        existing?.subject ??
        parent?.subject ??
        template.subject,
      body: existing?.source_body ?? existing?.body_text ?? template.body_text,
      variables: existing?.variables ?? {},
    });
  }

  function beginNew() {
    const template =
      readyTemplates.find(
        (entry) => entry.key === "custom_follow_up" && entry.ready_for_use,
      ) ??
      readyTemplates.find((entry) => entry.ready_for_use) ??
      readyTemplates.find((entry) => entry.key === "custom_follow_up") ??
      readyTemplates[0];
    if (!template) {
      setFormError("Load an email template before writing a message.");
      return;
    }
    startDraft(template);
  }

  async function persistDraft(send: boolean) {
    if (!draft || saving) return;
    setSaving(true);
    setFormError("");
    try {
      let messageId = draft.id;
      if (!messageId) {
        const created = await createEmailDraft(id, {
          template_key: draft.templateKey,
          variables: draft.variables,
          reply_to_id: draft.replyToId,
        });
        messageId = created.id;
        setDraft((current) =>
          current ? { ...current, id: created.id } : current,
        );
      }
      const updated = await updateEmailDraft(id, messageId, {
        subject: draft.subject,
        body_text: draft.body,
        variables: draft.variables,
        recipient_email: draft.recipient,
        reply_to_id: draft.replyToId,
      });
      if (!send) {
        setDraft(null);
        setAttempt((value) => value + 1);
        onChanged();
        notify("Email draft saved.");
        return;
      }
      if (updated.missing_variables.length) {
        setFormError(
          `Complete these before sending: ${updated.missing_variables.join(", ")}.`,
        );
        return;
      }
      const approved = await approveEmail(id, messageId);
      if (approved.status !== "APPROVED") {
        setFormError(
          "The draft was not approved. Refresh the thread and try again.",
        );
        return;
      }
      const sent = await sendEmail(id, messageId);
      if (sent.status !== "SENT") {
        setFormError(sent.error_message || "The email could not be sent.");
        return;
      }
      setDraft(null);
      setAttempt((value) => value + 1);
      onChanged();
      notify("Email sent in the customer thread.");
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function updateDraft<K extends keyof DraftState>(
    key: K,
    value: DraftState[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <section className="email-thread" aria-label="Email thread">
      <div className="email-thread-heading">
        <div>
          <h2>Email thread</h2>
          <p>
            Messages written here are saved to this presentation. Replies
            continue the provider thread.
          </p>
        </div>
        <button
          className="button primary"
          onClick={beginNew}
          disabled={templates.kind !== "ready" || !item.email}
        >
          <Plus size={14} /> New email
        </button>
      </div>
      {deliveryMode && (
        <p className="notice email-mode-notice">{deliveryMode}</p>
      )}
      {capabilityError && (
        <p className="error" role="alert">
          Unable to confirm email delivery mode. Drafts can be saved, but
          sending is disabled until delivery settings load.
        </p>
      )}
      {!item.email && (
        <p className="notice">
          Add a customer email address to compose a message.
        </p>
      )}
      {templates.kind === "error" && (
        <div className="error" role="alert">
          {templates.message}
        </div>
      )}
      {messages.kind === "loading" ? (
        <div className="card thread-loading" role="status">
          Loading email history…
        </div>
      ) : messages.kind === "error" ? (
        <div className="card data-error" role="alert">
          <p>{messages.message}</p>
          <button
            className="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      ) : messageList.length ? (
        [...messageList]
          .sort((left, right) =>
            left.created_at.localeCompare(right.created_at),
          )
          .map((message) => (
            <section className="card email-card" key={message.id}>
              <header>
                <Avatar name={personName()} />
                <div>
                  <strong>{personName()}</strong>
                  <small>To {message.recipient_email || "Not provided"}</small>
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
              <footer>
                <span
                  className={`badge email-status ${message.status.toLowerCase()}`}
                >
                  {messageStatus(message)}
                </span>
                <span>{message.template_key.replaceAll("_", " ")}</span>
                {(message.status === "DRAFT" ||
                  message.status === "PENDING_APPROVAL" ||
                  message.status === "APPROVED") && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const template = templateList.find(
                        (entry) => entry.key === message.template_key,
                      );
                      if (template) startDraft(template, undefined, message);
                    }}
                  >
                    Edit draft
                  </button>
                )}
                {message.status === "SENT" && message.provider_thread_id && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const template =
                        templateList.find(
                          (entry) =>
                            entry.key === "custom_follow_up" &&
                            entry.ready_for_use,
                        ) ??
                        templateList.find((entry) => entry.ready_for_use) ??
                        templateList.find(
                          (entry) => entry.key === message.template_key,
                        );
                      if (template) startDraft(template, message);
                    }}
                  >
                    <Reply size={13} /> Reply
                  </button>
                )}
              </footer>
            </section>
          ))
      ) : (
        <section className="card empty-thread">
          <Mail size={22} />
          <h3>No email history yet</h3>
          <p>
            Choose a template or write a personal message to start the customer
            thread.
          </p>
        </section>
      )}
      {draft && (
        <Modal
          title={
            draft.replyToId ? "Reply in email thread" : "Write customer email"
          }
          close={() => setDraft(null)}
          wide
        >
          <div className="composer-body email-compose-form">
            <label>
              Template
              <select
                value={draft.templateKey}
                disabled={Boolean(draft.id)}
                onChange={(event) => {
                  const template = templateList.find(
                    (entry) => entry.key === event.target.value,
                  );
                  if (template)
                    startDraft(
                      template,
                      draft.replyToId
                        ? messageList.find(
                            (entry) => entry.id === draft.replyToId,
                          )
                        : undefined,
                    );
                }}
              >
                {templateList.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.subject}
                    {template.ready_for_use ? "" : " · Inactive"}
                  </option>
                ))}
              </select>
            </label>
            {selectedTemplate && !selectedTemplate.ready_for_use && (
              <p className="notice">
                This template is inactive. Save a draft or activate the template
                before sending.
              </p>
            )}
            <label>
              To
              <input
                type="email"
                maxLength={320}
                value={draft.recipient}
                disabled={Boolean(draft.replyToId)}
                onChange={(event) =>
                  updateDraft("recipient", event.target.value)
                }
              />
            </label>
            <label>
              Subject
              <input
                maxLength={998}
                value={draft.subject}
                disabled={Boolean(draft.replyToId)}
                onChange={(event) => updateDraft("subject", event.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                rows={13}
                maxLength={30000}
                value={draft.body}
                onChange={(event) => updateDraft("body", event.target.value)}
              />
            </label>
            {tokens.length > 0 && (
              <div className="email-variable-inputs">
                <strong>Personalize template values</strong>
                {tokens.map((name) => (
                  <label key={name}>
                    {name}
                    {catalog?.auto_populated.includes(name) && (
                      <small>
                        From this presentation. You can adjust it for this
                        email.
                      </small>
                    )}
                    <input
                      value={values[name] || ""}
                      onChange={(event) =>
                        updateDraft("variables", {
                          ...draft.variables,
                          [name]: event.target.value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            {missingValues.length > 0 && (
              <p className="error">
                Add values for {missingValues.join(", ")}.
              </p>
            )}
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <p className="muted">
              Sending requires a final staff approval. A new email stays in the
              same customer conversation when you use Reply.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="button"
              disabled={saving || !draft.subject.trim() || !draft.body.trim()}
              onClick={() => void persistDraft(false)}
            >
              <Save size={14} /> Save draft
            </button>
            <button
              className="button primary"
              disabled={
                saving ||
                !deliveryMode ||
                Boolean(capabilityError) ||
                !draft.subject.trim() ||
                !draft.body.trim() ||
                !draft.recipient.trim() ||
                missingValues.length > 0 ||
                !selectedTemplate?.ready_for_use
              }
              onClick={() => void persistDraft(true)}
            >
              <Send size={14} />{" "}
              {saving
                ? "Sending…"
                : deliveryMode?.startsWith("Mock")
                  ? "Approve and test delivery"
                  : "Approve and send"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
