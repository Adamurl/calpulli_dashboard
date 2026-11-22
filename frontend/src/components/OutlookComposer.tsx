import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, Paperclip, Send, X } from "lucide-react";
import { ApiError } from "../api";
import {
  maxAttachmentBytes,
  maxAttachmentCount,
  outlookError,
  outlookTemplateOptions,
  previewOutlookMessage,
  sendOutlookMessage,
} from "../outlook";
import type { EmailFormat, OutlookTemplate } from "../outlook";
import { fetchEmailTemplates } from "../presentations";
import type { LoadState } from "../presentations";
import { EmailBodyEditor } from "./EmailBodyEditor";
import { OutlookContactPicker } from "./OutlookContactPicker";
import type { ComposeContext, ContactSelection } from "./OutlookContactPicker";
import { Modal } from "./ui";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const acceptedFileExtensions =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.heic";

export function OutlookComposer({
  address,
  recipientLocked,
  chooseContext,
  reply,
  testMode,
  templates,
  close,
  onAccepted,
}: {
  address?: string;
  recipientLocked: boolean;
  chooseContext: boolean;
  reply?: { id: string; subject: string };
  testMode: boolean;
  templates?: OutlookTemplate[];
  close: () => void;
  onAccepted: (status: "accepted" | "simulated") => void;
}) {
  const [recipient, setRecipient] = useState(address ?? "");
  const [subject, setSubject] = useState(
    reply ? reply.subject.trim() || "(No subject)" : "",
  );
  const [body, setBody] = useState("");
  const [format, setFormat] = useState<EmailFormat>("plain");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [context, setContext] = useState<ComposeContext>("other");
  const [contact, setContact] = useState<ContactSelection | null>(null);
  const [contactTemplates, setContactTemplates] = useState<OutlookTemplate[]>(
    [],
  );
  const [preview, setPreview] = useState<LoadState<string>>({
    kind: "loading",
  });
  const appliedTemplate = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const presentation = contact?.presentation;
  const starters = templates ?? contactTemplates;

  useEffect(() => {
    if (!presentation) return;
    const controller = new AbortController();
    fetchEmailTemplates(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setContactTemplates(outlookTemplateOptions(data, presentation));
      })
      .catch(() => {
        if (!controller.signal.aborted) setContactTemplates([]);
      });
    return () => controller.abort();
  }, [presentation]);

  useEffect(() => {
    if (!review || format !== "markdown") return;
    const controller = new AbortController();
    previewOutlookMessage(body, format, controller.signal)
      .then((html) => {
        if (!controller.signal.aborted)
          setPreview({ kind: "ready", data: html });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setPreview({ kind: "error", message: outlookError(failure) });
      });
    return () => controller.abort();
  }, [body, format, review]);

  const selectContact = useCallback((next: ContactSelection | null) => {
    setContactTemplates([]);
    setContact(next);
    setRecipient(next?.address ?? "");
    setError("");
    requestId.current = undefined;
    if (appliedTemplate.current) {
      setSubject("");
      setBody("");
      appliedTemplate.current = false;
    }
  }, []);

  function change(setter: () => void) {
    requestId.current = undefined;
    setError("");
    setter();
  }

  function addFiles(added: File[]) {
    if (
      added.some((file) => {
        const extension = file.name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? "";
        return (
          file.name.length > 180 ||
          /[\u0000-\u001f\u007f/\\]/.test(file.name) ||
          !acceptedFileExtensions.split(",").includes(extension)
        );
      })
    ) {
      setError(
        "Choose a PDF, Office document, text file, CSV, or supported image with a short filename.",
      );
      return;
    }
    const next = [...files, ...added];
    const bytes = next.reduce((total, file) => total + file.size, 0);
    if (next.length > maxAttachmentCount || bytes > maxAttachmentBytes) {
      setError("Attach up to 8 files, with a combined size of 2.5 MB.");
      return;
    }
    if (added.some((file) => file.size === 0)) {
      setError("Empty files cannot be attached.");
      return;
    }
    change(() => setFiles(next));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError("");
    if (!review) {
      if (!recipient.trim() || !body.trim() || (!reply && !subject.trim())) {
        setError("Enter a recipient, a subject, and a message.");
        return;
      }
      setPreview({ kind: "loading" });
      setReview(true);
      return;
    }
    if (format === "markdown" && preview.kind !== "ready") return;
    inFlight.current = true;
    setSending(true);
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await sendOutlookMessage({
        requestId: requestId.current,
        recipient: recipient.trim(),
        subject,
        body,
        format,
        files,
        replyTo: reply?.id,
      });
      onAccepted(result.status);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        setUncertain(true);
      }
      setError(outlookError(failure));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const title = review
    ? "Review Outlook email"
    : reply
      ? "Reply in Outlook thread"
      : "Write Outlook email";

  return (
    <Modal title={title} close={close} busy={sending} wide>
      <form onSubmit={(event) => void submit(event)}>
        <div className="composer-body outlook-compose">
          {testMode && (
            <p className="notice">
              Test delivery goes to the configured test inbox.
              {reply && " Outlook sends it as a separate test message."}
            </p>
          )}
          {review ? (
            <>
              <div className="review-headers">
                <p>
                  <span>To</span>
                  {recipient}
                </p>
                <p>
                  <span>Subject</span>
                  {subject}
                </p>
              </div>
              {format === "plain" ? (
                <div className="email-text">{body}</div>
              ) : preview.kind === "ready" ? (
                <iframe
                  title="Formatted email preview"
                  className="outlook-preview"
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{font:14px system-ui;margin:12px;overflow-wrap:anywhere}</style></head><body>${preview.data}</body></html>`}
                />
              ) : preview.kind === "loading" ? (
                <p role="status">Rendering email preview…</p>
              ) : (
                <p role="alert" className="error">
                  {preview.message}
                </p>
              )}
            </>
          ) : (
            <>
              {chooseContext && (
                <>
                  <ToggleGroup<ComposeContext>
                    aria-label="Recipient type"
                    value={[context]}
                    onValueChange={([next]) => {
                      if (next && next !== context) {
                        selectContact(null);
                        setContext(next);
                      }
                    }}
                  >
                    <ToggleGroupItem value="other">
                      Other recipient
                    </ToggleGroupItem>
                    <ToggleGroupItem value="presentation">
                      Presentation client
                    </ToggleGroupItem>
                    <ToggleGroupItem value="vendor">MNY vendor</ToggleGroupItem>
                  </ToggleGroup>
                  {context !== "other" && (
                    <OutlookContactPicker
                      key={context}
                      kind={context}
                      change={selectContact}
                    />
                  )}
                </>
              )}
              <label>
                To
                <input
                  type="email"
                  value={recipient}
                  maxLength={320}
                  readOnly={recipientLocked || context !== "other"}
                  required
                  onChange={(event) =>
                    change(() => setRecipient(event.target.value))
                  }
                />
              </label>
              <label>
                Subject
                <input
                  value={subject}
                  maxLength={998}
                  readOnly={Boolean(reply)}
                  required={!reply}
                  onChange={(event) =>
                    change(() => setSubject(event.target.value))
                  }
                />
              </label>
              {!reply && starters.length > 0 && (
                <label>
                  Start with a template
                  <select
                    value=""
                    onChange={(event) => {
                      const template = starters.find(
                        (entry) => entry.key === event.target.value,
                      );
                      if (template) {
                        change(() => {
                          setSubject(template.subject);
                          setBody(template.body);
                          setFormat("plain");
                          appliedTemplate.current = true;
                        });
                      }
                    }}
                  >
                    <option value="" disabled>
                      Choose a template
                    </option>
                    {starters.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.subject}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <EmailBodyEditor
                body={body}
                format={format}
                onBodyChange={(next) => change(() => setBody(next))}
                onFormatChange={(next) => change(() => setFormat(next))}
              />
              <label className="outlook-attachment-picker">
                <span>
                  <Paperclip size={15} aria-hidden="true" /> Attach files
                </span>
                <input
                  type="file"
                  accept={acceptedFileExtensions}
                  multiple
                  onChange={(event) => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
                <small className="muted">Up to 8 files, 2.5 MB total.</small>
              </label>
            </>
          )}
          {files.length > 0 && (
            <ul className="outlook-attachments" aria-label="Attached files">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <Paperclip size={14} aria-hidden="true" />
                  <span>{file.name}</span>
                  {!review && (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        change(() =>
                          setFiles(
                            files.filter((_, position) => position !== index),
                          ),
                        )
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <div>
            {review && (
              <button
                className="button"
                type="button"
                disabled={sending || uncertain}
                onClick={() => {
                  setReview(false);
                  setError("");
                }}
              >
                <ArrowLeft size={14} aria-hidden="true" /> Edit email
              </button>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={
                sending ||
                (review && format === "markdown" && preview.kind !== "ready")
              }
            >
              {review ? (
                <Send size={14} aria-hidden="true" />
              ) : (
                <ArrowRight size={14} aria-hidden="true" />
              )}
              {sending
                ? "Submitting email…"
                : review
                  ? uncertain
                    ? "Check send status"
                    : "Send email"
                  : "Review email"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
