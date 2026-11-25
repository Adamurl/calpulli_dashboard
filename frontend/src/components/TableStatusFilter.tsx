import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function TableStatusFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="table-filter-trigger" aria-label={label}>
        <span>
          {options.find((option) => option.value === value)?.label ?? "All"}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={label}>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              className="dropdown-menu-item"
              key={option.value}
              value={option.value}
              closeOnClick
            >
              {option.label}
              <DropdownMenuRadioItemIndicator>
                <Check size={14} aria-hidden="true" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
