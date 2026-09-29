"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

export async function copyText(value: string) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function ConnectionField({
  label,
  value,
  secret = false,
  hint,
}: {
  label: string;
  value: string;
  secret?: boolean;
  hint?: string;
}) {
  const [revealed, setRevealed] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const shown = !value ? "—" : revealed ? value : mask(value);

  async function copy() {
    if (!value) return;
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium tracking-tight text-fg/38">{label}</p>
        {hint ? <p className="truncate text-[10px] tracking-tight text-fg/28">{hint}</p> : null}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <code
          title={revealed ? value : undefined}
          className="min-w-0 flex-1 truncate rounded-md bg-fg/[0.035] px-2 py-1.5 font-mono text-[11px] text-fg/80 ring-1 ring-fg/[0.06]"
        >
          {shown}
        </code>
        {secret ? (
          <button
            type="button"
            aria-label={revealed ? "Hide value" : "Show value"}
            onClick={() => setRevealed((current) => !current)}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-fg/35 hover:bg-fg/[0.06] hover:text-fg/80 md:size-7"
          >
            {revealed ? <EyeOff size={12} strokeWidth={1.75} /> : <Eye size={12} strokeWidth={1.75} />}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={() => void copy()}
          disabled={!value}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-md transition-colors duration-150 ease-out md:size-7",
            value ? "cursor-pointer text-fg/35 hover:bg-fg/[0.06] hover:text-fg/80" : "text-fg/15",
          )}
        >
          {copied ? <Check size={12} strokeWidth={2} className="text-emerald-800" /> : <Copy size={12} strokeWidth={1.75} />}
        </button>
      </div>
    </div>
  );
}

function mask(value: string) {
  if (value.length <= 12) return "•".repeat(Math.min(value.length, 8));
  return `${value.slice(0, 7)}••••${value.slice(-4)}`;
}
