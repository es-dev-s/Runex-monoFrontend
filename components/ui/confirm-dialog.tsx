"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";

export type ConfirmTone = "neutral" | "danger";

export function ConfirmDialog({
  title,
  detail,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  tone = "neutral",
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  detail: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const detailId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const target = tone === "danger" ? cancelRef.current : confirmRef.current;
    target?.focus();
  }, [tone]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, pending]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center px-3 md:px-5">
      <button
        type="button"
        aria-label="Dismiss"
        disabled={pending}
        onClick={() => !pending && onClose()}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={detailId}
        className={cn(chromePanel, "relative w-full max-w-[22.5rem] p-5")}
      >
        <h2 id={titleId} className="text-[15px] font-medium tracking-tight text-fg">
          {title}
        </h2>
        <p id={detailId} className="mt-1.5 text-[13px] leading-relaxed tracking-tight text-fg/50">
          {detail}
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-[12px] leading-relaxed tracking-tight text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-1.5">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13px] tracking-tight text-fg/55 transition-colors duration-150 ease-out hover:bg-fg/[0.06] hover:text-fg disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={cn(
              "inline-flex h-8 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium tracking-tight transition-colors duration-150 ease-out",
              tone === "danger"
                ? "bg-rose-500/90 text-fg hover:bg-rose-500"
                : "bg-btn text-btn-fg hover:bg-brand-hover",
              pending ? "cursor-progress opacity-70" : "cursor-pointer",
            )}
          >
            {pending ? <Loader2 size={13} strokeWidth={2} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
