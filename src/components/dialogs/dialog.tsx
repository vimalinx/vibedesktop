import { useEffect, useRef } from "react";
import type { I18nMessages } from "@/lib/i18n";

export function Dialog({
  title,
  children,
  onClose,
  t
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  t: I18nMessages;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  /* A dialog must be enterable and leavable without a mouse: focus moves to
     the first control on open, Escape closes, and focus returns to whatever
     opened it. Tab is kept inside while the dialog is up — the desktop behind
     it is inert in meaning, so it must be inert to the keyboard too. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? [])
      ].filter((element) => !element.hasAttribute("disabled"));
    focusables()[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} aria-label={t.dialogs.close}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
