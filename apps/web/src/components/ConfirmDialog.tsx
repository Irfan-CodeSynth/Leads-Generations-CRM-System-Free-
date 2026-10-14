"use client";

import { useEffect, useRef } from "react";

/**
 * Destructive actions need a real interruption: a row can release ledger
 * entries, so `window.confirm` would hide what the user is agreeing to.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** What will also go, and what becomes collectable again. */
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="animate-fade-in absolute inset-0 bg-ink/30 backdrop-blur-sm dark:bg-black/60"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div className="glass-card animate-scale-in relative w-full max-w-md rounded-3xl p-6 shadow-card">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-ink active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-bad-fg px-4 py-2 text-sm font-semibold text-page transition hover:opacity-90 active:scale-95 disabled:opacity-60"
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
