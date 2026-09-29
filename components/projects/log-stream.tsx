"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { StreamLog } from "@/hooks/use-project-stream";

const LEVEL_COLOR: Record<string, string> = {
  error: "text-rose-700",
  warn: "text-amber-800",
  success: "text-emerald-800",
  cmd: "text-fg/60",
  info: "text-fg/70",
};

/**
 * Build output for one service.
 *
 * Follows the tail only while the user is already at the bottom; scrolling up
 * to read an error must not be undone by the next incoming line.
 */
export function LogStream({ logs, empty }: { logs: StreamLog[]; empty?: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const hasLogs = logs.length > 0;

  // The scroll node only mounts once there are lines. Re-bind when it appears
  // so the first empty→non-empty transition still tracks pin state.
  useEffect(() => {
    if (!hasLogs) return;
    const node = scrollRef.current;
    if (!node) return;

    const onScroll = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      setPinned(distance < 40);
    };
    onScroll();
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [hasLogs]);

  useLayoutEffect(() => {
    if (!pinned || !hasLogs) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logs, pinned, hasLogs]);

  return (
    <div className="relative min-h-0 flex-1">
      {logs.length === 0 ? (
        empty ?? (
          <p className="px-4 py-10 text-center text-[12px] tracking-tight text-fg/40">
            No build output yet.
          </p>
        )
      ) : (
        <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2">
          {logs.map((line) => (
            <p
              key={line.key}
              className="flex gap-2.5 py-[1px] font-mono text-[11px] leading-[1.6] break-words whitespace-pre-wrap"
            >
              {line.phase ? (
                <span className="shrink-0 text-fg/22 select-none">
                  {line.phase.slice(0, 4).padEnd(4)}
                </span>
              ) : null}
              <span className={cn("min-w-0 flex-1", LEVEL_COLOR[line.level ?? "info"] ?? "text-fg/65")}>
                {line.text}
              </span>
            </p>
          ))}
        </div>
      )}

      {logs.length > 0 && !pinned ? (
        <button
          type="button"
          onClick={() => setPinned(true)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-fg/10 px-3 py-1 text-[11px] tracking-tight text-fg/80 ring-1 ring-fg/[0.12] backdrop-blur-sm transition-colors duration-150 ease-out hover:bg-fg/15"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
