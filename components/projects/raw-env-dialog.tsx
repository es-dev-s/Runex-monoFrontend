"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";
import { formatEnv, parseEnv, type EnvPair } from "@/lib/envfile";

export function RawEnvDialog({
  current,
  managedKeys,
  pending,
  error,
  onClose,
  onAdd,
}: {
  current: EnvPair[];
  managedKeys: string[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onAdd: (raw: string, pairs: EnvPair[]) => void;
}) {
  const titleId = useId();
  const areaId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(() => formatEnv(current));
  const parsed = useMemo(() => parseEnv(text), [text]);
  const managed = useMemo(() => new Set(managedKeys), [managedKeys]);
  const existing = useMemo(() => new Map(current.map((pair) => [pair.key, pair.value])), [current]);

  const added = parsed.pairs.filter((pair) => !existing.has(pair.key) && !managed.has(pair.key));
  const updated = parsed.pairs.filter(
    (pair) => existing.has(pair.key) && existing.get(pair.key) !== pair.value && !managed.has(pair.key),
  );
  const skipped = parsed.pairs.filter((pair) => managed.has(pair.key));
  const unchanged = parsed.pairs.length - added.length - updated.length - skipped.length;
  const canAdd = added.length + updated.length > 0 && !pending;

  useEffect(() => {
    areaRef.current?.focus();
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          chromePanel,
          "relative flex max-h-[min(42rem,calc(100dvh-1.25rem))] w-full max-w-[34rem] flex-col md:max-h-[min(42rem,calc(100dvh-2rem))]",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-fg/[0.06] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[15px] font-medium tracking-tight text-fg">
              Raw Editor
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed tracking-tight text-fg/42">
              Paste a .env — one KEY=value per line. Runex splits them into variables. Existing keys are updated; Runex-managed keys stay locked.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={pending}
            onClick={onClose}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-fg/35 hover:bg-fg/[0.06] hover:text-fg"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-4">
          <label htmlFor={areaId} className="sr-only">
            Environment variables
          </label>
          <textarea
            id={areaId}
            ref={areaRef}
            value={text}
            disabled={pending}
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
            placeholder={"DATABASE_URL=postgres://user:pass@host:5432/db\nAPI_KEY=sk_live_…"}
            className="h-[12rem] w-full resize-none rounded-lg bg-black/[0.03] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-fg/90 outline-none ring-1 ring-black/[0.08] placeholder:text-fg/30 focus:ring-black/20"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 px-5 pt-3">
          <Stat label="parsed" value={parsed.pairs.length} />
          <Stat label="new" value={added.length} tone="add" />
          <Stat label="updated" value={updated.length} />
          {skipped.length > 0 ? <Stat label="locked" value={skipped.length} /> : null}
          {parsed.ignored > 0 ? <Stat label="ignored" value={parsed.ignored} tone="warn" /> : null}
          {unchanged > 0 ? <Stat label="unchanged" value={unchanged} /> : null}
        </div>

        {parsed.pairs.length > 0 ? (
          <ul className="mx-5 mt-3 max-h-28 overflow-y-auto rounded-lg bg-black/[0.03] px-2.5 py-2 ring-1 ring-black/[0.06]">
            {parsed.pairs.slice(0, 24).map((pair) => {
              const lock = managed.has(pair.key);
              const isNew = !existing.has(pair.key) && !lock;
              const isUpdate = existing.has(pair.key) && existing.get(pair.key) !== pair.value && !lock;
              return (
                <li key={pair.key} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate font-mono text-[11px] text-fg/75">{pair.key}</span>
                  <span className="shrink-0 text-[10px] tracking-tight text-fg/32">
                    {lock ? "Runex" : isNew ? "New" : isUpdate ? "Update" : "Same"}
                  </span>
                </li>
              );
            })}
            {parsed.pairs.length > 24 ? (
              <li className="pt-1 text-[10px] tracking-tight text-fg/30">
                +{parsed.pairs.length - 24} more
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="px-5 pt-3 text-[12px] tracking-tight text-fg/32">
            No valid KEY=value lines yet.
          </p>
        )}

        {error ? (
          <p role="alert" className="px-5 pt-3 pb-1 text-[12px] leading-relaxed tracking-tight text-rose-700">
            {error}
          </p>
        ) : null}
        </div>

        <footer className="mt-0 flex shrink-0 items-center justify-end gap-1.5 border-t border-fg/[0.06] px-5 py-3.5">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13px] tracking-tight text-fg/55 hover:bg-fg/[0.06] hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => onAdd(text, parsed.pairs.filter((pair) => !managed.has(pair.key)))}
            className={cn(
              "inline-flex h-8 min-w-[7.5rem] items-center justify-center gap-1.5 rounded-lg bg-btn px-3 text-[13px] font-medium tracking-tight text-btn-fg hover:bg-brand-hover",
              canAdd ? "cursor-pointer" : "cursor-not-allowed opacity-40",
              pending && "cursor-progress opacity-70",
            )}
          >
            {pending ? <Loader2 size={13} strokeWidth={2} className="animate-spin" /> : null}
            Add variables
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "add" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums ring-1 ring-fg/[0.06]",
        tone === "add" ? "text-emerald-800" : tone === "warn" ? "text-amber-800" : "text-fg/45",
      )}
    >
      {value}
      <span className="font-sans tracking-tight">{label}</span>
    </span>
  );
}
