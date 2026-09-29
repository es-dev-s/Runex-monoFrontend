"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, NetworkError, usage as usageApi, type UsageSnapshot } from "@/lib/api";
import { readUsageSnapshot, rememberUsageSnapshot } from "@/lib/panel-cache";

type State = {
  scope: string;
  data: UsageSnapshot | null;
  loading: boolean;
  error: string | null;
};

const POLL_MS = 12_000;

function useUsageLoader(
  load: (signal: AbortSignal) => Promise<UsageSnapshot>,
  enabled: boolean,
  /** When this changes, prior samples are ignored until the new scope resolves. */
  scopeKey = "",
  pollMs = POLL_MS,
) {
  const [state, setState] = useState<State>({
    scope: scopeKey,
    data: null,
    loading: enabled,
    error: null,
  });
  const inflight = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    const cached = readUsageSnapshot(scopeKey);
    if (!cached) return;
    setState({ scope: scopeKey, data: cached, loading: false, error: null });
  }, [scopeKey]);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const scoped = scopeKey;
    try {
      const data = await load(controller.signal);
      if (controller.signal.aborted) return;
      rememberUsageSnapshot(scoped, data);
      setState({ scope: scoped, data, loading: false, error: null });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const message =
        cause instanceof NetworkError || cause instanceof ApiError
          ? cause.message
          : "Could not load usage.";
      setState((current) => ({
        scope: scoped,
        data: current.scope === scoped ? current.data : null,
        loading: false,
        error: message,
      }));
    }
  }, [load, scopeKey]);

  useEffect(() => {
    if (!enabled) {
      inflight.current?.abort();
      return;
    }
    void refresh();
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    };
    const id = window.setInterval(tick, pollMs);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      inflight.current?.abort();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, pollMs, refresh, scopeKey]);

  // Ignore stale samples from a previous project without a sync setState in the effect.
  const fresh = state.scope === scopeKey;
  return {
    data: enabled && fresh ? state.data : null,
    loading: Boolean(enabled) && (!fresh || state.loading),
    error: enabled && fresh ? state.error : null,
    reload: refresh,
  };
}

export function useWorkspaceUsage(enabled = true) {
  const load = useCallback((signal: AbortSignal) => usageApi.workspace(undefined, signal), []);
  return useUsageLoader(load, enabled, "workspace", 4_000);
}

export function useProjectUsage(projectId: string | null | undefined, enabled = true) {
  const id = projectId?.trim() ?? "";
  const load = useCallback((signal: AbortSignal) => usageApi.project(id, signal), [id]);
  return useUsageLoader(load, Boolean(id) && enabled, id);
}
