import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Column<Id extends string> = { id: Id; label: string };
export type TableSort<Field extends string> = {
  field: Field;
  ascending: boolean;
};
export type SortOption<Field extends string> = Column<Field> & {
  directions: readonly [ascending: string, descending: string];
};

export function useTableColumns<Id extends string, Entry extends Column<Id>>(
  initial: readonly Entry[],
) {
  const [ordered, setOrdered] = useState(() => [...initial]);
  const [hidden, setHidden] = useState<Id[]>([]);
  const visible = ordered.filter((column) => !hidden.includes(column.id));
  function move(id: Id, to: number) {
    setOrdered((current) => {
      const from = current.findIndex((column) => column.id === id);
      if (from < 0 || to < 0 || to >= current.length || from === to)
        return current;
      const next = current.slice();
      const [column] = next.splice(from, 1);
      next.splice(to, 0, column);
      return next;
    });
  }
  function toggle(id: Id) {
    setHidden((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length + 1 >= ordered.length) return current;
      return [...current, id];
    });
  }
  return { ordered, hidden, visible, move, toggle };
}

export function TableColumnsMenu<Id extends string, Field extends string>({
  columns,
  options,
  sort,
  onSort,
}: {
  columns: ReturnType<typeof useTableColumns<Id, Column<Id>>>;
  options: readonly SortOption<Field>[];
  sort: TableSort<Field>;
  onSort: (next: TableSort<Field>) => void;
}) {
  const dragging = useRef<Id | null>(null);
  const [target, setTarget] = useState<Id | null>(null);
  const current = options.find(({ id }) => id === sort.field);
  const directions = current?.directions ?? ["Ascending", "Descending"];

  function clearDrag() {
    dragging.current = null;
    setTarget(null);
  }

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) clearDrag();
      }}
    >
      <Popover.Trigger
        className="button compact column-settings-trigger"
        aria-label="Columns"
        title="Columns"
      >
        <Columns3 size={15} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          sideOffset={6}
          className="column-settings-positioner"
        >
          <Popover.Popup
            className="column-settings"
            aria-label="Table settings"
          >
            <div className="column-settings-sort">
              <span>
                <ArrowUpDown size={14} aria-hidden="true" /> Sort by
              </span>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  className="column-sort-trigger"
                  aria-label={`Sort by, ${current?.label}`}
                >
                  {current?.label} <ChevronDown size={13} aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="dropdown-menu-content column-sort-menu"
                  aria-label="Sort options"
                >
                  <DropdownMenuRadioGroup
                    value={sort.field}
                    aria-label="Sort field"
                    onValueChange={(value: unknown) => {
                      const chosen = options.find(({ id }) => id === value);
                      if (chosen && chosen.id !== sort.field)
                        onSort({ field: chosen.id, ascending: sort.ascending });
                    }}
                  >
                    {options.map(({ id, label }) => (
                      <DropdownMenuRadioItem
                        key={id}
                        value={id}
                        className="dropdown-menu-item"
                      >
                        {label}
                        <DropdownMenuRadioItemIndicator>
                          <Check size={14} aria-hidden="true" />
                        </DropdownMenuRadioItemIndicator>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuRadioGroup
                    className="column-sort-direction"
                    aria-label="Sort direction"
                    value={sort.ascending ? "asc" : "desc"}
                    onValueChange={(value: unknown) => {
                      if (value === "asc" || value === "desc")
                        onSort({ ...sort, ascending: value === "asc" });
                    }}
                  >
                    {directions.map((label, position) => (
                      <DropdownMenuRadioItem
                        key={label}
                        value={position === 0 ? "asc" : "desc"}
                        className="dropdown-menu-item"
                        closeOnClick
                      >
                        {label}
                        <DropdownMenuRadioItemIndicator>
                          <Check size={14} aria-hidden="true" />
                        </DropdownMenuRadioItemIndicator>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="column-settings-label">Columns</p>
            <ul className="column-settings-list">
              {columns.ordered.map(({ id, label }, position) => {
                const shown = !columns.hidden.includes(id);
                const locked = shown && columns.visible.length === 1;
                return (
                  <li
                    key={id}
                    data-drop-target={target === id || undefined}
                    onDragOver={(event) => {
                      if (dragging.current === null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dragging.current !== id) setTarget(id);
                    }}
                    onDrop={(event) => {
                      if (dragging.current === null) return;
                      event.preventDefault();
                      columns.move(dragging.current, position);
                      clearDrag();
                    }}
                  >
                    <button
                      className="column-grip"
                      type="button"
                      draggable
                      aria-label={`Reorder ${label}`}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title={`Drag or use arrow keys to move ${label}`}
                      onDragStart={(event) => {
                        dragging.current = id;
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", id);
                      }}
                      onDragEnd={clearDrag}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowUp" &&
                          event.key !== "ArrowDown"
                        )
                          return;
                        event.preventDefault();
                        columns.move(
                          id,
                          position + (event.key === "ArrowUp" ? -1 : 1),
                        );
                      }}
                    >
                      <GripVertical size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="column-visibility"
                      aria-label={`Show ${label} column`}
                      aria-pressed={shown}
                      disabled={locked}
                      onClick={() => columns.toggle(id)}
                    >
                      <span>{label}</span>
                      {shown ? (
                        <Eye size={14} aria-hidden="true" />
                      ) : (
                        <EyeOff size={14} aria-hidden="true" />
                      )}
                    </button>
                    <div className="column-touch-order">
                      <button
                        type="button"
                        aria-label={`Move ${label} up`}
                        disabled={position === 0}
                        onClick={() => columns.move(id, position - 1)}
                      >
                        <ArrowUp size={12} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${label} down`}
                        disabled={position === columns.ordered.length - 1}
                        onClick={() => columns.move(id, position + 1)}
                      >
                        <ArrowDown size={12} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
