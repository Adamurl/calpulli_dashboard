import { useEffect, useState } from "react";
import { z } from "zod";
import { apiFetch } from "../api";
import type { LoadState } from "../presentations";

const contactPageSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      first_name: z.string().nullable(),
      last_name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      message: z.string(),
      received_at: z.iso.datetime({ offset: true }),
    }),
  ),
  previous_offset: z.number().int().nonnegative().nullable(),
  next_offset: z.number().int().nonnegative().nullable(),
});
const receivedDate = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function ContactMessages() {
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    LoadState<z.infer<typeof contactPageSchema>>
  >({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await apiFetch(
          `/api/v1/contact-messages?offset=${offset}`,
          { signal: controller.signal },
        );
        const data = contactPageSchema.parse(await response.json());
        if (!controller.signal.aborted) setResult({ kind: "ready", data });
      } catch {
        if (!controller.signal.aborted) {
          setResult({
            kind: "error",
            message: "Website contact messages couldn’t be loaded.",
          });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [offset, attempt]);

  function openPage(newOffset: number | null) {
    if (newOffset === null) return;
    setResult({ kind: "loading" });
    setOffset(newOffset);
  }

  return (
    <section
      className="card live-request-list contact-messages"
      aria-labelledby="contact-messages-heading"
    >
      <h2 id="contact-messages-heading">Website contact messages</h2>
      {result.kind === "loading" ? (
        <p role="status">Loading contact messages…</p>
      ) : result.kind === "error" ? (
        <>
          <p role="alert">{result.message}</p>
          <button
            className="button"
            onClick={() => {
              setResult({ kind: "loading" });
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </>
      ) : (
        <>
          {result.data.messages.length === 0 && <p>No contact messages yet.</p>}
          {result.data.messages.map((message) => {
            const name = [message.first_name, message.last_name]
              .filter(Boolean)
              .join(" ");
            const sender =
              name || message.email || message.phone || "Website visitor";
            return (
              <details key={message.id}>
                <summary>
                  <strong>{sender}</strong>
                  <time dateTime={message.received_at}>
                    {receivedDate.format(new Date(message.received_at))}
                  </time>
                </summary>
                {message.email && message.email !== sender && (
                  <p>{message.email}</p>
                )}
                {message.phone && message.phone !== sender && (
                  <p>{message.phone}</p>
                )}
                <p className="contact-message-body">{message.message}</p>
              </details>
            );
          })}
          <div className="contact-message-pagination">
            {result.data.previous_offset !== null && (
              <button
                className="button"
                onClick={() => openPage(result.data.previous_offset)}
              >
                Newer messages
              </button>
            )}
            {result.data.next_offset !== null && (
              <button
                className="button"
                onClick={() => openPage(result.data.next_offset)}
              >
                Older messages
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
