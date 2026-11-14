import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

export function Disclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Collapsible className="record-details">
      <CollapsibleTrigger className="disclosure-trigger">
        <span>{title}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="disclosure-content">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
