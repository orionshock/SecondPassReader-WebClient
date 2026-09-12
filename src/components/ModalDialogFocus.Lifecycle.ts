import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not(:disabled)",
  "[href]",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useModalDialogFocus({
  active,
  dialogRef,
  initialFocusRef,
  onDismiss,
  dismissDisabled = false,
}: {
  active: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  dismissDisabled?: boolean;
}) {
  const onDismissRef = useRef(onDismiss);
  const dismissDisabledRef = useRef(dismissDisabled);
  onDismissRef.current = onDismiss;
  dismissDisabledRef.current = dismissDisabled;

  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    (initialFocusRef?.current ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dismissDisabledRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onDismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialogRef.current?.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [active, dialogRef, initialFocusRef]);
}
