import { useId, useRef } from "react";
import { Bold, Heading2, Italic, List, ListOrdered } from "lucide-react";
import type { EmailFormat } from "../outlook";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const markup = [
  { label: "Bold", Icon: Bold, prefix: "**", suffix: "**", block: false },
  { label: "Italic", Icon: Italic, prefix: "_", suffix: "_", block: false },
  { label: "Heading", Icon: Heading2, prefix: "## ", suffix: "", block: true },
  { label: "Bulleted list", Icon: List, prefix: "- ", suffix: "", block: true },
  {
    label: "Numbered list",
    Icon: ListOrdered,
    prefix: "1. ",
    suffix: "",
    block: true,
  },
];

export function EmailBodyEditor({
  body,
  format,
  disabled,
  onBodyChange,
  onFormatChange,
}: {
  body: string;
  format: EmailFormat;
  disabled?: boolean;
  onBodyChange: (body: string) => void;
  onFormatChange: (format: EmailFormat) => void;
}) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  function applyMarkup(action: (typeof markup)[number]) {
    const input = field.current;
    if (!input) return;
    const { selectionStart: start, selectionEnd: end } = input;
    const lineStart = action.block
      ? body.lastIndexOf("\n", start - 1) + 1
      : start;
    const before = body.slice(0, lineStart);
    const selected = body.slice(lineStart, end);
    const after = body.slice(end);
    const marked = action.block
      ? selected
          .split("\n")
          .map((line) => action.prefix + line)
          .join("\n")
      : action.prefix + selected + action.suffix;
    const next = before + marked + after;
    if (next.length > 30_000) return;
    onBodyChange(next);
    requestAnimationFrame(() => {
      if (field.current !== input) return;
      input.focus();
      input.setSelectionRange(
        lineStart + action.prefix.length,
        lineStart + marked.length - action.suffix.length,
      );
    });
  }

  return (
    <div className="outlook-editor">
      <label htmlFor={id}>Message</label>
      <ToggleGroup<EmailFormat>
        aria-label="Message format"
        disabled={disabled}
        value={[format]}
        onValueChange={([next]) => {
          if (next) onFormatChange(next);
        }}
      >
        <ToggleGroupItem value="plain">Plain text</ToggleGroupItem>
        <ToggleGroupItem value="markdown">Formatted</ToggleGroupItem>
      </ToggleGroup>
      {format === "markdown" && (
        <div
          className="outlook-format-tools"
          role="group"
          aria-label="Formatting"
        >
          {markup.map(({ label, Icon, ...action }) => (
            <button
              key={label}
              className="icon-button"
              type="button"
              title={label}
              aria-label={label}
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyMarkup({ label, Icon, ...action })}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        ref={field}
        value={body}
        rows={10}
        maxLength={30_000}
        required
        disabled={disabled}
        onChange={(event) => onBodyChange(event.target.value)}
        aria-describedby={format === "markdown" ? `${id}-help` : undefined}
      />
      {format === "markdown" && (
        <small className="muted" id={`${id}-help`}>
          Formatting uses Markdown. For a link, write
          [label](https://example.org).
        </small>
      )}
    </div>
  );
}
