import { useEffect, useState } from "react";
import { Mail, Paperclip, Plus, RefreshCw, Reply } from "lucide-react";
import {
  downloadOutlookAttachment,
  getOutlookAttachments,
  getOutlookCapabilities,
  getOutlookConversation,
  getOutlookMessages,
  outlookError,
} from "../outlook";
import type {
  OutlookAttachment,
  OutlookCapabilities,
  OutlookFolder,
  OutlookMessage,
  OutlookPage,
  OutlookTemplate,
} from "../outlook";
import type { LoadState } from "../presentations";
import { OutlookComposer } from "./OutlookComposer";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export type OutlookContact = {
  address: string;
  kind: "presentation" | "vendor";
};

function dateLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function replyAddress(
  message: OutlookMessage,
  mailbox?: string | null,
  contact?: string,
  incomingSender?: string,
) {
  const sender = message.sender.toLowerCase();
  const fromMailbox = sender === mailbox?.toLowerCase();
  const toContact = message.recipients.some(
    (recipient) => recipient.toLowerCase() === contact?.toLowerCase(),
  );
  if (fromMailbox || toContact) return contact ?? message.recipients[0];
  const fromKnownContact =
    sender === contact?.toLowerCase() ||
    sender === incomingSender?.toLowerCase();
  if (mailbox || fromKnownContact)
    return message.reply_to?.[0] ?? (message.sender || undefined);
}

function MessageAttachments({
  messageId,
  advertised,
}: {
  messageId: string;
  advertised: boolean;
}) {
  const [expanded, setExpanded] = useState(advertised);
  const [files, setFiles] = useState<LoadState<OutlookAttachment[]>>({
    kind: "loading",
  });
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    getOutlookAttachments(messageId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setFiles({ kind: "ready", data });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setFiles({ kind: "error", message: outlookError(failure) });
      });
    return () => controller.abort();
  }, [expanded, messageId]);

  if (!expanded)
    return (
      <button
        className="text-button outlook-attachment-check"
        type="button"
        onClick={() => setExpanded(true)}
      >
        <Paperclip size={14} aria-hidden="true" /> Check attachments
      </button>
    );
  if (files.kind === "loading")
    return <p role="status">Loading attachments…</p>;
  if (files.kind === "error")
    return (
      <p className="error" role="alert">
        {files.message}
      </p>
    );
  if (!files.data.length) return <p className="muted">No file attachments.</p>;
  return (
    <>
      <ul className="outlook-attachments" aria-label="Message attachments">
        {files.data.map((file) => (
          <li key={file.id}>
            <button
              className="button"
              type="button"
              onClick={() => {
                setDownloadError("");
                void downloadOutlookAttachment(messageId, file).catch(
                  (failure: unknown) => setDownloadError(outlookError(failure)),
                );
              }}
            >
              <Paperclip size={14} aria-hidden="true" /> Download {file.name}
            </button>
          </li>
        ))}
      </ul>
      {downloadError && (
        <p role="alert" className="error">
          {downloadError}
        </p>
      )}
    </>
  );
}

function OutlookThread({
  id,
  revision,
  replyAddressFor,
  onReply,
}: {
  id: string;
  revision: number;
  replyAddressFor: (message: OutlookMessage) => string | undefined;
  onReply: (message: OutlookMessage, recipient: string) => void;
}) {
  const [messages, setMessages] = useState<LoadState<OutlookMessage[]>>({
    kind: "loading",
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getOutlookConversation(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setMessages({ kind: "ready", data });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setMessages({ kind: "error", message: outlookError(failure) });
      });
    return () => controller.abort();
  }, [id, retry, revision]);

  if (messages.kind === "loading")
    return <p role="status">Loading Outlook conversation…</p>;
  if (messages.kind === "error")
    return (
      <div className="data-error" role="alert">
        <p>{messages.message}</p>
        <button
          className="button"
          onClick={() => setRetry((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    );
  if (!messages.data.length) return <p>This conversation is empty.</p>;
  return (
    <div className="outlook-thread" aria-label="Outlook conversation">
      {[...messages.data]
        .sort((left, right) => (left.at ?? "").localeCompare(right.at ?? ""))
        .map((message) => {
          const recipient = replyAddressFor(message);
          return (
            <article className="outlook-message" key={message.id}>
              <header>
                <h3>{message.subject || "No subject"}</h3>
                {message.at && (
                  <time dateTime={message.at}>{dateLabel(message.at)}</time>
                )}
              </header>
              <p className="outlook-envelope">
                <strong>From</strong> {message.sender}
              </p>
              {message.recipients.length > 0 && (
                <p className="outlook-envelope">
                  <strong>To</strong> {message.recipients.join(", ")}
                </p>
              )}
              <p className="email-text">{message.body_text}</p>
              <MessageAttachments
                messageId={message.id}
                advertised={message.has_attachments}
              />
              {recipient && (
                <button
                  className="button"
                  type="button"
                  aria-label={`Reply to ${recipient}`}
                  onClick={() => onReply(message, recipient)}
                >
                  <Reply size={14} aria-hidden="true" /> Reply
                </button>
              )}
            </article>
          );
        })}
    </div>
  );
}

type ComposeTarget =
  | { kind: "new" }
  | { kind: "reply"; message: OutlookMessage; recipient: string };

export function OutlookMailbox({
  contact,
  templates,
}: {
  contact?: OutlookContact;
  templates?: OutlookTemplate[];
}) {
  const [capabilities, setCapabilities] = useState<
    LoadState<OutlookCapabilities>
  >({ kind: "loading" });
  const [folder, setFolder] = useState<OutlookFolder>(
    contact ? "sentitems" : "inbox",
  );
  const [page, setPage] = useState<LoadState<OutlookPage>>({ kind: "loading" });
  const [windows, setWindows] = useState([0]);
  const [selected, setSelected] = useState<OutlookMessage | null>(null);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [revision, setRevision] = useState(0);
  const address = contact?.address;
  const context = contact?.kind;
  const skip = windows.at(-1) ?? 0;
  const ready =
    capabilities.kind === "ready" && capabilities.data.mailbox_available;
  const testMode = capabilities.kind === "ready" && capabilities.data.test_mode;
  const mailbox =
    capabilities.kind === "ready"
      ? capabilities.data.mailbox_address
      : undefined;

  useEffect(() => {
    const controller = new AbortController();
    getOutlookCapabilities(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setCapabilities({ kind: "ready", data });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setCapabilities({ kind: "error", message: outlookError(failure) });
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (!ready || (context && !address)) return;
    const controller = new AbortController();
    setPage({ kind: "loading" });
    let pending = false;
    async function load(background = false) {
      if (pending) return;
      pending = true;
      try {
        const data = await getOutlookMessages(
          folder,
          skip,
          address,
          controller.signal,
        );
        if (!controller.signal.aborted) setPage({ kind: "ready", data });
      } catch (failure) {
        if (!background && !controller.signal.aborted)
          setPage({ kind: "error", message: outlookError(failure) });
      } finally {
        pending = false;
      }
    }
    void load();
    const timer =
      !context && folder === "inbox" && skip === 0
        ? window.setInterval(() => {
            if (document.visibilityState === "visible") void load(true);
          }, 60_000)
        : undefined;
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [address, context, folder, ready, revision, skip]);

  const reply = compose?.kind === "reply" ? compose : undefined;
  const conversations = new Map<string, OutlookMessage>();
  if (page.kind === "ready") {
    for (const message of page.data.messages) {
      if (!conversations.has(message.conversation_id)) {
        conversations.set(message.conversation_id, message);
      }
    }
  }
  const sentAnchor = folder === "sentitems" ? selected?.sender : undefined;
  const incomingAnchor = folder === "inbox" ? selected?.sender : undefined;

  return (
    <section className="card outlook-mailbox" aria-label="Outlook mailbox">
      <header className="outlook-heading">
        <div>
          <h2>
            <Mail size={18} aria-hidden="true" /> Outlook email
          </h2>
          {address && <p>{address}</p>}
        </div>
        <div className="outlook-actions">
          {ready && (!contact || address) && (
            <button
              className="button primary"
              onClick={() => setCompose({ kind: "new" })}
            >
              <Plus size={15} aria-hidden="true" /> New Outlook email
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh Outlook email"
            title="Refresh Outlook email"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {confirmation && (
        <p className="notice" role="status">
          {confirmation}
        </p>
      )}
      {testMode && ready && <p className="notice">Outlook test mode</p>}
      {capabilities.kind === "loading" ? (
        <p role="status">Checking Outlook connection…</p>
      ) : capabilities.kind === "error" ? (
        <p className="error" role="alert">
          {capabilities.message}
        </p>
      ) : !ready ? (
        <p className="muted">
          Outlook is unavailable. Ask your administrator to configure the shared
          mailbox.
        </p>
      ) : contact && !address ? (
        <p className="muted">
          Add a contact email address to view Outlook messages.
        </p>
      ) : (
        <>
          <ToggleGroup<OutlookFolder>
            aria-label="Outlook folders"
            value={[folder]}
            onValueChange={([next]) => {
              if (!next || next === folder) return;
              setSelected(null);
              setWindows([0]);
              setFolder(next);
            }}
          >
            <ToggleGroupItem value="inbox">Incoming</ToggleGroupItem>
            <ToggleGroupItem value="sentitems">Sent</ToggleGroupItem>
          </ToggleGroup>
          {page.kind === "loading" ? (
            <p role="status">Loading Outlook messages…</p>
          ) : page.kind === "error" ? (
            <p className="error" role="alert">
              {page.message}
            </p>
          ) : (
            <>
              {conversations.size > 0 ? (
                <ul className="outlook-list" aria-label="Outlook conversations">
                  {[...conversations.values()].map((message) => (
                    <li key={message.conversation_id}>
                      <button
                        type="button"
                        className="outlook-row"
                        aria-pressed={
                          selected?.conversation_id === message.conversation_id
                        }
                        onClick={() => setSelected(message)}
                      >
                        <span>
                          <strong>{message.subject || "No subject"}</strong>
                          <small>
                            {folder === "inbox"
                              ? message.sender
                              : message.recipients.join(", ")}
                          </small>
                        </span>
                        {message.at && (
                          <time dateTime={message.at}>
                            {dateLabel(message.at)}
                          </time>
                        )}
                        {message.has_attachments && (
                          <Paperclip size={15} aria-label="Has attachments" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  No {folder === "inbox" ? "incoming" : "sent"} messages on this
                  page.
                </p>
              )}
              {(windows.length > 1 || page.data.next_skip !== null) && (
                <div className="outlook-actions outlook-pagination">
                  <button
                    className="button"
                    type="button"
                    disabled={windows.length === 1}
                    onClick={() => {
                      setSelected(null);
                      setWindows((current) => current.slice(0, -1));
                    }}
                  >
                    Previous messages
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={page.data.next_skip === null}
                    onClick={() => {
                      const next = page.data.next_skip;
                      if (next === null) return;
                      setSelected(null);
                      setWindows((current) => [...current, next]);
                    }}
                  >
                    More messages
                  </button>
                </div>
              )}
            </>
          )}
          {selected && (
            <OutlookThread
              key={selected.conversation_id}
              id={selected.conversation_id}
              revision={revision}
              replyAddressFor={(message) =>
                replyAddress(
                  message,
                  mailbox || sentAnchor,
                  address,
                  incomingAnchor,
                )
              }
              onReply={(message, recipient) =>
                setCompose({ kind: "reply", message, recipient })
              }
            />
          )}
        </>
      )}
      {compose && (
        <OutlookComposer
          address={reply?.recipient ?? address}
          recipientLocked={Boolean(address || (reply && mailbox))}
          chooseContext={!contact && !reply}
          reply={reply?.message}
          templates={templates}
          testMode={testMode}
          close={() => setCompose(null)}
          onAccepted={(status) => {
            setCompose(null);
            setConfirmation(
              status === "accepted"
                ? "Accepted by Microsoft for delivery."
                : "Simulated email recorded.",
            );
            if (!reply) {
              setSelected(null);
              setWindows([0]);
              setFolder("sentitems");
            }
            setRevision((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
