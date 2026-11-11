import { useState } from "react";
import {
  FileText,
  Save,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { draftSchema, templates } from "../domain";
import type { Draft, Inquiry } from "../domain";
import { Modal } from "./ui";
export function Composer({
  inquiry,
  draft,
  items,
  save,
  close,
}: {
  inquiry: Inquiry;
  draft?: Draft;
  items: Inquiry[];
  save: (draft: Draft) => void;
  close: () => void;
}) {
  const [clientId, setClientId] = useState(draft?.inquiryId ?? inquiry.id),
    [to, setTo] = useState(draft?.to ?? inquiry.email),
    [subject, setSubject] = useState(draft?.subject ?? ""),
    [body, setBody] = useState(draft?.body ?? ""),
    [review, setReview] = useState(false),
    [error, setError] = useState("");
  function record(status: Draft["status"]) {
    return draftSchema.safeParse({
      id: draft?.id ?? crypto.randomUUID(),
      inquiryId: clientId,
      to,
      subject,
      body,
      status,
      updated: new Date().toISOString(),
    });
  }
  function submit(status: Draft["status"]) {
    const result = record(status);
    if (!result.success) {
      setError(
        "Enter a valid recipient, a single-line subject, and a message.",
      );
      setReview(false);
      return;
    }
    save(result.data);
    close();
  }
  return (
    <Modal
      title={review ? "Review your email" : "New personal email"}
      close={close}
      wide
    >
      <div className="composer-body">
        {review ? (
          <>
            <div className="review-notice">
              <ShieldCheck size={18} />
              <div>
                <strong>Ready for a thoughtful review</strong>
                <p>
                  This preview saves to your review queue. It does not send an
                  email.
                </p>
              </div>
            </div>
            <div className="review-headers">
              <p>
                <span>To</span>
                {to}
              </p>
              <p>
                <span>Subject</span>
                {subject}
              </p>
            </div>
            <div className="email-text">{body}</div>
          </>
        ) : (
          <>
            <label>
              Client
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setTo(
                    items.find((i) => i.id === e.target.value)?.email ?? "",
                  );
                }}
              >
                {items.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.name} · {i.organization}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                maxLength={320}
              />
            </label>
            <label>
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="A personal hello goes a long way"
                maxLength={998}
              />
            </label>
            <label className="template-picker">
              <FileText size={14} />
              Start with a template
              <select
                aria-label="Email template"
                defaultValue=""
                onChange={(e) => {
                  const template = templates.find(
                    (t) => t.name === e.target.value,
                  );
                  if (template) {
                    setSubject(template.subject);
                    setBody(
                      template.body.replaceAll(
                        "[Name]",
                        items
                          .find((i) => i.id === clientId)
                          ?.name.split(" ")[0] ?? "",
                      ),
                    );
                  }
                }}
              >
                <option value="" disabled>
                  Choose a template
                </option>
                {templates.map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="message-label">
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write something meaningful…"
                rows={11}
                maxLength={30000}
              />
            </label>
            <small className="muted">
              Plain text email · {body.length.toLocaleString()} characters ·
              Saved only when you choose Save draft
            </small>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-footer">
        <span className="muted">Sample workspace · No email will be sent</span>
        <div>
          {review ? (
            <>
              <button className="button" onClick={() => setReview(false)}>
                <ArrowLeft size={14} />
                Back to editing
              </button>
              <button
                className="button primary"
                onClick={() => submit("review")}
              >
                Save for review
              </button>
            </>
          ) : (
            <>
              <button className="button" onClick={() => submit("draft")}>
                <Save size={14} />
                Save draft
              </button>
              <button
                className="button primary"
                onClick={() => {
                  const result = record("draft");
                  if (result.success) {
                    setError("");
                    setReview(true);
                  } else
                    setError(
                      "Enter a valid recipient, a single-line subject, and a message.",
                    );
                }}
              >
                Review email
                <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
