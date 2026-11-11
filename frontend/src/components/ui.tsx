import { X, Circle, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { statusLabels } from "../domain";
import type { Inquiry } from "../domain";
export function Badge({ status }: { status: Inquiry["status"] }) {
  return (
    <span className={`badge ${status}`}>
      <Circle size={8} />
      {statusLabels[status]}
    </span>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span className={`avatar ${small ? "small" : ""}`}>
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Check size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      aria-label={title}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SelectLabel({ children }: { children: ReactNode }) {
  return (
    <span className="select-label">
      {children}
      <ChevronDown size={12} />
    </span>
  );
}
