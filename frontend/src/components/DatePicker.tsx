import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Calendar } from "./ui/calendar";
import { format, isValid, parseISO } from "date-fns";

/** Date-only values stay in local calendar time rather than UTC. */
export function DatePicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <Collapsible
      className="date-picker-field"
      open={open}
      onOpenChange={setOpen}
    >
      <span id={`${id}-label`}>{label}</span>
      <div className="date-picker-controls">
        <CollapsibleTrigger
          ref={trigger}
          type="button"
          className="button date-picker-trigger"
          aria-labelledby={`${id}-label ${id}-value`}
          disabled={disabled}
        >
          <span id={`${id}-value`}>
            {selected ? format(selected, "PPP") : "Choose date"}
          </span>
          <CalendarDays size={16} aria-hidden="true" />
        </CollapsibleTrigger>
        {selected && (
          <button
            type="button"
            className="icon-button date-picker-clear"
            aria-label="Clear date"
            title={`Clear ${label.toLowerCase()}`}
            disabled={disabled}
            onClick={() => {
              onChange("");
              close();
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <CollapsibleContent
        id={id}
        role="region"
        aria-label={`${label} calendar`}
        className="date-picker-calendar"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          formatters={{ formatMonthDropdown: (date) => format(date, "MMM") }}
          startMonth={new Date(1900, 0)}
          endMonth={new Date(new Date().getFullYear() + 50, 11)}
          showOutsideDays
          autoFocus
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            close();
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
