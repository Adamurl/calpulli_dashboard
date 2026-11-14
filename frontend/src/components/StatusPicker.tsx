import { useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { requestSchema, statusLabels } from "../domain";
import type { Inquiry } from "../domain";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

export function StatusPicker({
  value,
  disabled = false,
  onChange,
}: {
  value: Inquiry["status"];
  disabled?: boolean;
  onChange: (status: Inquiry["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <Collapsible
      className="status-picker"
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <span className="status-picker-label" id={id}>
        Status
      </span>
      <CollapsibleTrigger
        ref={trigger}
        className="status-picker-trigger"
        aria-label={`Request status: ${statusLabels[value]}`}
      >
        <span>{statusLabels[value]}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="status-picker-content">
        <fieldset aria-labelledby={id}>
          {requestSchema.shape.status.options.map((status) => (
            <label key={status}>
              <input
                type="radio"
                value={status}
                name={`${id}-status`}
                checked={value === status}
                disabled={disabled}
                onChange={() => {
                  if (status !== value) onChange(status);
                  close();
                }}
              />
              <span>{statusLabels[status]}</span>
            </label>
          ))}
        </fieldset>
      </CollapsibleContent>
    </Collapsible>
  );
}
