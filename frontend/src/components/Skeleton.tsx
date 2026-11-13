import type { ComponentProps } from "react";

export function Skeleton({ className = "", ...props }: ComponentProps<"span">) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-slot="skeleton"
      className={`skeleton ${className}`}
    />
  );
}
