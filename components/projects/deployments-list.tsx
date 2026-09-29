"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { activity, type Deployment } from "@/lib/api";
import { cn } from "@/lib/cn";
import { servicePublicUrl } from "@/lib/projects";
import { readDeployments, rememberDeployments } from "@/lib/remember";
import { relativeTime } from "@/lib/relative-time";

const STATUS_TONE: Record<string, { label: string; color: string }> = {
  success: { label: "Live", color: "#047857" },
  failed: { label: "Failed", color: "#BE123C" },
  building: { label: "Building", color: "#B45309" },
  running: { label: "Building", color: "#B45309" },
  staged: { label: "Ready", color: "#1D4ED8" },
  ready: { label: "Ready", color: "#1D4ED8" },
  cancelled: { label: "Cancelled", color: "rgba(0,0,0,0.45)" },
};

export function DeploymentsList({
  projectId,
  nodeId,
  status,
}: {
  projectId: string;
  nodeId: string;
  status?: string;
}) {
  const [items, setItems] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef("");
  const hasRows = useRef(false);

  useLayoutEffect(() => {
    const cached = readDeployments(projectId, nodeId);
    if (cached.length === 0) return;
    hasRows.current = true;
    setItems(cached);
    setLoading(false);
  }, [nodeId, projectId]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const switched = scope.current !== `${projectId}:${nodeId}`;
      scope.current = `${projectId}:${nodeId}`;
      if (switched) {
        const cached = readDeployments(projectId, nodeId);
        hasRows.current = cached.length > 0;
        setItems(cached);
        setLoading(cached.length === 0);
        setError(null);
      } else if (!hasRows.current) {
        setLoading(true);
      }
      try {
        const result = await activity.get(projectId, signal);
        if (signal.aborted) return;
        const events = (result.events ?? []).filter(
          (item) => !item.nodeId || item.nodeId === nodeId,
        );
        hasRows.current = true;
        setItems(events);
        rememberDeployments(projectId, nodeId, events);
        setError(null);
      } catch (cause) {
        if (signal.aborted) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError("Could not load deployments.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [projectId, nodeId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, status]);

  useEffect(() => {
    if (status !== "building") return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const controller = new AbortController();
      void load(controller.signal);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, status]);

  if (loading && items.length === 0) {
    return null;
  }

  if (error && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <p role="alert" className="text-[12px] tracking-tight text-rose-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            const controller = new AbortController();
            void load(controller.signal);
          }}
          className="mt-3 cursor-pointer text-[12px] font-medium tracking-tight text-[#1d4ed8] hover:text-[#1e3a8a]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-[13px] font-medium tracking-tight text-fg/80">No deploys yet</p>
        <p className="mt-1.5 text-[12px] leading-relaxed tracking-tight text-fg/40">
          Each deploy is listed here with its result, source, and URL.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    {error ? (
      <p role="alert" className="shrink-0 px-4 py-2 text-[12px] tracking-tight text-rose-700">
        {error}
      </p>
    ) : null}
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {items.map((item) => {
        const tone = STATUS_TONE[item.status] ?? STATUS_TONE.cancelled;
        return (
          <li
            key={item.id}
            className="flex items-start gap-3 border-b border-fg/[0.05] px-4 py-3"
          >
            <span
              aria-hidden="true"
              className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", item.status === "building" && "animate-pulse")}
              style={{ backgroundColor: tone.color }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium tracking-tight text-fg">{tone.label}</span>
                <span className="shrink-0 text-[11px] tracking-tight text-fg/35">
                  {relativeTime(item.createdAt)}
                </span>
              </span>
              <span className="mt-0.5 block truncate font-mono text-[11px] text-fg/45">
                {item.sourceRef || item.sourceType || "manual"}
                {item.trigger ? ` · ${item.trigger}` : ""}
              </span>
              {item.url ? (
                <span className="mt-1 block truncate font-mono text-[11px] text-[#1d4ed8]">
                  {servicePublicUrl(item.url)}
                </span>
              ) : null}
              {item.error ? (
                <span className="mt-1 block text-[11px] leading-relaxed tracking-tight text-rose-700">
                  {item.error}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
