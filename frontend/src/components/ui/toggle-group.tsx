import { Children, isValidElement } from "react";
import type { ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import "../../outlook.css";

type GroupProps<Value extends string> = {
  "aria-label": string;
  value: Value[];
  onValueChange: (value: Value[]) => void;
  disabled?: boolean;
  children: ReactNode;
};

export function ToggleGroup<Value extends string>({
  "aria-label": label,
  children,
  disabled,
  onValueChange,
  value,
}: GroupProps<Value>) {
  const options = Children.toArray(children).flatMap((child) =>
    isValidElement<{ value: Value }>(child) &&
    typeof child.props.value === "string"
      ? [child.props.value]
      : [],
  );
  return (
    <ToggleButtonGroup
      aria-label={label}
      className="email-toggle-group"
      data-slot="toggle-group"
      disallowEmptySelection
      isDisabled={disabled}
      onSelectionChange={(keys) =>
        onValueChange(options.filter((option) => keys.has(option)))
      }
      selectedKeys={value}
      selectionMode="single"
    >
      {children}
    </ToggleButtonGroup>
  );
}

export function ToggleGroupItem({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  return (
    <ToggleButton
      className="email-toggle"
      data-slot="toggle-group-item"
      id={value}
    >
      {children}
    </ToggleButton>
  );
}
