import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { ReactNode } from "react";

export function TablePagination({
  index,
  size,
  total,
  loading,
  disabled,
  summary,
  onPageChange,
  onSizeChange,
}: {
  index: number;
  size: number;
  total: number;
  loading: boolean;
  disabled: boolean;
  summary: ReactNode;
  onPageChange: (index: number) => void;
  onSizeChange: (size: number) => void;
}) {
  const pageCount = Math.ceil(total / size);
  const atStart = loading || disabled || index === 0;
  const atEnd = loading || disabled || index + 1 >= pageCount;
  const controls = [
    { label: "First page", Icon: ChevronsLeft, page: 0, disabled: atStart },
    {
      label: "Previous page",
      Icon: ChevronLeft,
      page: index - 1,
      disabled: atStart,
    },
    {
      label: "Next page",
      Icon: ChevronRight,
      page: index + 1,
      disabled: atEnd,
    },
    {
      label: "Last page",
      Icon: ChevronsRight,
      page: pageCount - 1,
      disabled: atEnd,
    },
  ];

  return (
    <div className="data-pagination">
      <span>{summary}</span>
      <label>
        Rows per page
        <select
          aria-label="Rows per page"
          value={size}
          onChange={(event) => onSizeChange(Number(event.target.value))}
        >
          {[5, 10, 20, 50].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <span role="status">
        {loading
          ? "Loading rows…"
          : `Page ${total ? index + 1 : 0} of ${pageCount}`}
      </span>
      <div className="page-buttons">
        {controls.map(({ label, Icon, page, disabled }) => (
          <button
            key={label}
            className="button compact"
            aria-label={label}
            disabled={disabled}
            onClick={() => onPageChange(page)}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
