"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import {
  ApiError,
  NetworkError,
  projects,
  type LogLine,
  type Project,
  type ServiceNode,
  type StreamEvent,
} from "@/lib/api";
import { usePlatformStore } from "@/lib/inbox/store";
import { isDraftId } from "@/lib/projects";
import { readLogs, readSnapshot, rememberLogs, rememberSnapshot, forgetProjectLocal, type SavedLog } from "@/lib/remember";

export type StreamLog = {
  /** Stable key for rendering. Server log lines have ids; streamed ones do not. */
  key: string;
  ts: string;
  phase?: string;
  level?: string;
  text: string;
  nodeId?: string;
};

type State = {
  project: Project | null;
  nodes: ServiceNode[];
  logs: StreamLog[];
  loading: boolean;
  error: string | null;
  /** False while the event stream is disconnected, so the UI can show it. */
  live: boolean;
  /** Nodes the user just removed. SSE/cache must not put them back. */
  dropped: Record<string, true>;
  /** Monotonic clock for optimistic and live updates. */
  rev: number;
  /** Last local revision that changed each node outside a list fetch. */
  nodeRev: Record<string, number>;
};

type Action =
  | { type: "reset" }
  | { type: "hydrate"; project: Project; nodes: ServiceNode[]; logs?: SavedLog[] }
  | { type: "loaded"; project: Project; nodes: ServiceNode[]; logs?: LogLine[]; baseline: number }
  | { type: "failed"; error: string; gone?: boolean }
  | { type: "dropNode"; nodeId: string; rev: number }
  | { type: "restoreNode"; nodeId: string }
  | { type: "upsertNode"; node: ServiceNode; rev: number }
  | { type: "live"; live: boolean }
  | { type: "event"; event: StreamEvent; rev: number };

/** Keeps memory bounded on long-running builds that emit thousands of lines. */
const MAX_LOGS = 2000;

function toStreamLog(line: LogLine): StreamLog {
  return {
    key: `db${line.id}`,
    ts: line.ts,
    phase: line.phase,
    level: line.level,
    text: line.text,
    nodeId: line.nodeId,
  };
}

function sameLine(log: StreamLog, event: StreamEvent) {
  if (log.text !== event.text) return false;
  if ((log.nodeId || "") !== (event.nodeId || "")) return false;
  if (event.ts && log.ts && log.ts !== event.ts) return false;
  return true;
}

function keepBuildClock(prev: ServiceNode[], next: ServiceNode[]): ServiceNode[] {
  const byId = new Map(prev.map((node) => [node.id, node]));
  return next.map((node) => {
    const prior = byId.get(node.id);
    const x = node.x === 0 && node.y === 0 && prior && (prior.x !== 0 || prior.y !== 0) ? prior.x : node.x;
    const y = node.x === 0 && node.y === 0 && prior && (prior.x !== 0 || prior.y !== 0) ? prior.y : node.y;
    if (node.status !== "building") {
      return { ...node, x, y, startedAt: null };
    }
    const kept = prior?.status === "building" ? prior.startedAt : null;
    return { ...node, x, y, startedAt: node.startedAt || kept || null };
  });
}

function withoutDropped(nodes: ServiceNode[], dropped: Record<string, true>) {
  if (!Object.keys(dropped).length) return nodes;
  return nodes.filter((node) => !dropped[node.id]);
}

/** A list response that started before a local change must not walk status backwards. */
function serverLags(local: string, server: string) {
  if (local === server) return false;
  if (local === "building" && (server === "ready" || server === "idle")) return true;
  if (local === "running" && (server === "building" || server === "ready" || server === "idle")) return true;
  if (
    (local === "failed" || local === "stopped") &&
    (server === "building" || server === "ready" || server === "running" || server === "idle")
  ) {
    return true;
  }
  return false;
}

function mergeLoaded(state: State, incoming: ServiceNode[], baseline: number) {
  const localById = new Map(state.nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const merged = incoming.map((server) => {
    seen.add(server.id);
    const local = localById.get(server.id);
    const rev = state.nodeRev[server.id] ?? 0;
    const newer = Boolean(local) && rev > 0 && rev >= baseline;
    if (local && newer && serverLags(local.status, server.status)) {
      const keepPlace = server.x === 0 && server.y === 0 && (local.x !== 0 || local.y !== 0);
      return {
        ...server,
        status: local.status,
        startedAt: local.startedAt,
        error: local.error,
        url: server.url || local.url,
        x: keepPlace ? local.x : server.x,
        y: keepPlace ? local.y : server.y,
      };
    }
    return keepBuildClock(local ? [local] : [], [server])[0];
  });
  for (const local of state.nodes) {
    if (seen.has(local.id) || state.dropped[local.id]) continue;
    const rev = state.nodeRev[local.id] ?? 0;
    if (rev > 0 && rev >= baseline) merged.push(local);
  }
  return withoutDropped(merged, state.dropped);
}

function logKey(line: { nodeId?: string; ts?: string; text: string }) {
  return `${line.nodeId ?? ""}|${line.ts ?? ""}|${line.text}`;
}

function mergeLogs(current: StreamLog[], incoming?: LogLine[]) {
  if (!incoming || incoming.length === 0) return current;
  const mapped = incoming.map(toStreamLog);
  // A line already stored is the durable copy. Keep anything the server has
  // not returned yet so a refresh cannot blank a log that just landed.
  const stored = new Set(mapped.map((line) => logKey(line)));
  const extra = current.filter((line) => !stored.has(logKey(line)));
  const next = mapped.concat(extra);
  return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
}

function applyEvent(state: State, event: StreamEvent): State {
  if (event.nodeId && state.dropped[event.nodeId]) return state;
  if (event.kind === "log") {
    if (!event.text) return state;
    // Logs never change node status. Historical "Preparing isolated workspace"
    // lines used to mark one service as building on every reload.
    const start = Math.max(0, state.logs.length - 80);
    for (let i = state.logs.length - 1; i >= start; i--) {
      if (sameLine(state.logs[i], event)) return state;
    }
    const next = state.logs.concat({
      key: `s${state.logs.length}-${event.ts ?? ""}`,
      ts: event.ts ?? new Date().toISOString(),
      phase: event.phase,
      level: event.level,
      text: event.text,
      nodeId: event.nodeId,
    });
    return { ...state, logs: next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next };
  }

  // status / stack / ready frames all carry current node state. A frame without
  // a nodeId is project-level.
  if (!event.nodeId) {
    if (!state.project || !event.status || state.project.status === event.status) return state;
    return { ...state, project: { ...state.project, status: event.status } };
  }

  let matched = false;
  let changed = false;
  const nodes = state.nodes.map((node) => {
    if (node.id !== event.nodeId) return node;
    matched = true;
    let status = event.status ?? node.status;
    if (event.kind === "stack" && status === "building" && !event.startedAt && node.status !== "building") {
      status = node.status;
    }
    const building = status === "building";
    const next = {
      ...node,
      status,
      url: event.url !== undefined && event.url !== "" ? event.url : node.url,
      platformUrl: event.platformUrl !== undefined ? event.platformUrl : node.platformUrl,
      platformUrlEnabled:
        event.platformUrlEnabled !== undefined ? event.platformUrlEnabled : node.platformUrlEnabled,
      primaryKind: event.primaryKind || node.primaryKind,
      framework: event.framework || node.framework,
      languages: event.languages ?? node.languages,
      stack: event.stack ?? node.stack,
      error: status === "running" || building ? null : node.error,
      startedAt: building ? event.startedAt || node.startedAt || null : null,
    };
    if (sameNode(node, next)) return node;
    changed = true;
    return next;
  });

  return matched && changed ? { ...state, nodes } : state;
}

function sameNode(a: ServiceNode, b: ServiceNode) {
  return (
    a.status === b.status &&
    a.title === b.title &&
    a.caption === b.caption &&
    a.url === b.url &&
    a.platformUrl === b.platformUrl &&
    a.platformUrlEnabled === b.platformUrlEnabled &&
    a.primaryKind === b.primaryKind &&
    a.framework === b.framework &&
    a.error === b.error &&
    a.startedAt === b.startedAt &&
    a.x === b.x &&
    a.y === b.y &&
    sameList(a.languages, b.languages) &&
    sameList(a.stack, b.stack)
  );
}

function sameList(a: unknown, b: unknown) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => item === b[index] || JSON.stringify(item) === JSON.stringify(b[index]));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return INITIAL;
    case "hydrate":
      // Fresh project context: never keep the previous project's logs or
      // dropped-node set — both caused wrong UI after a quick project switch.
      return {
        ...INITIAL,
        project: action.project,
        nodes: action.nodes,
        logs: (action.logs ?? []).map((line) => ({
          key: line.key || `c${line.ts}-${line.text}`,
          ts: line.ts,
          phase: line.phase,
          level: line.level,
          text: line.text,
          nodeId: line.nodeId,
        })),
        loading: false,
        error: null,
      };
    case "loaded": {
      const nodes = mergeLoaded(state, action.nodes, action.baseline);
      rememberSnapshot(action.project, nodes);
      return {
        ...state,
        project: action.project,
        nodes,
        logs: mergeLogs(state.logs, action.logs),
        loading: false,
        error: null,
      };
    }
    case "failed":
      if (action.gone) {
        return { ...INITIAL, loading: false, error: action.error };
      }
      // Keep the last good graph on screen. A failed refetch must not turn a
      // live workspace into the error page.
      if (state.project) {
        return { ...state, loading: false, error: action.error };
      }
      return { ...state, loading: false, error: action.error };
    case "dropNode": {
      const nodes = state.nodes.filter((node) => node.id !== action.nodeId);
      if (state.project) rememberSnapshot(state.project, nodes);
      return {
        ...state,
        nodes,
        rev: action.rev,
        nodeRev: { ...state.nodeRev, [action.nodeId]: action.rev },
        dropped: { ...state.dropped, [action.nodeId]: true },
      };
    }
    case "restoreNode": {
      if (!state.dropped[action.nodeId]) return state;
      const dropped = { ...state.dropped };
      delete dropped[action.nodeId];
      const nodeRev = { ...state.nodeRev };
      delete nodeRev[action.nodeId];
      return { ...state, dropped, nodeRev };
    }
    case "upsertNode": {
      const dropped = { ...state.dropped };
      delete dropped[action.node.id];
      const exists = state.nodes.some((node) => node.id === action.node.id);
      const nodes = exists
        ? state.nodes.map((node) => (node.id === action.node.id ? { ...node, ...action.node } : node))
        : state.nodes.concat(action.node);
      if (state.project) rememberSnapshot(state.project, nodes);
      return {
        ...state,
        nodes,
        dropped,
        error: null,
        rev: action.rev,
        nodeRev: { ...state.nodeRev, [action.node.id]: action.rev },
      };
    }
    case "live":
      return { ...state, live: action.live };
    case "event": {
      const next = applyEvent(state, action.event);
      if (next === state) return state;
      const nodeId = action.event.nodeId;
      const nodeRev =
        action.event.kind !== "log" && nodeId
          ? { ...state.nodeRev, [nodeId]: action.rev }
          : state.nodeRev;
      const stamped = { ...next, rev: action.rev, nodeRev };
      if (stamped.project && action.event.kind !== "log") {
        rememberSnapshot(stamped.project, stamped.nodes);
      }
      return stamped;
    }
  }
}

const INITIAL: State = {
  project: null,
  nodes: [],
  logs: [],
  loading: true,
  error: null,
  live: false,
  dropped: {},
  rev: 0,
  nodeRev: {},
};

function initialState(): State {
  return INITIAL;
}

/**
 * Loads one project and keeps it current from the server-sent event stream.
 *
 * Reloading metadata (after a deploy or env apply) must not wipe log history —
 * that is what made the Logs tab look empty right after a build started.
 */
export function useProjectStream(projectId: string) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const inflight = useRef<AbortController | null>(null);
  const clock = useRef(0);

  const stamp = useCallback(() => {
    clock.current += 1;
    return clock.current;
  }, []);

  const load = useCallback(async (mode: "full" | "meta" = "full") => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const baseline = clock.current;

    try {
      const [detail, logs] = await Promise.all([
        projects.get(projectId, controller.signal),
        mode === "full"
          ? projects.logs(projectId, {}, controller.signal).catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      if (controller.signal.aborted) return;
      dispatch({
        type: "loaded",
        project: detail.project,
        nodes: detail.nodes ?? [],
        logs,
        baseline,
      });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (cause instanceof ApiError && cause.isNotFound) {
        forgetProjectLocal(projectId);
        dispatch({ type: "failed", error: "This project no longer exists.", gone: true });
        return;
      }
      const message =
        cause instanceof ApiError
          ? cause.message
          : cause instanceof NetworkError
            ? cause.message
            : "Could not load this project.";
      dispatch({ type: "failed", error: message });
    }
  }, [projectId]);

  useLayoutEffect(() => {
    const logs = readLogs(projectId);
    const cached = readSnapshot(projectId);
    if (cached) {
      dispatch({ type: "hydrate", project: cached.project, nodes: cached.nodes, logs });
      return;
    }
    const known = usePlatformStore.getState().projects.find((item) => item.id === projectId);
    if (known) {
      dispatch({ type: "hydrate", project: known, nodes: known.nodes ?? [], logs });
      return;
    }
    dispatch({ type: "reset" });
  }, [projectId]);

  useEffect(() => {
    if (!state.project || state.loading) return;
    const handle = window.setTimeout(() => {
      rememberLogs(
        projectId,
        state.logs.map((line) => ({
          key: line.key,
          ts: line.ts,
          phase: line.phase,
          level: line.level,
          text: line.text,
          nodeId: line.nodeId,
        })),
      );
    }, 200);
    return () => window.clearTimeout(handle);
  }, [projectId, state.loading, state.logs, state.project]);

  useEffect(() => {
    if (isDraftId(projectId)) return;
    void load("full");
    return () => inflight.current?.abort();
  }, [load, projectId]);

  useEffect(() => {
    if (!state.project || isDraftId(state.project.id)) return;
    usePlatformStore.getState().replaceProject({ ...state.project, nodes: state.nodes });
  }, [state.nodes, state.project]);

  useEffect(() => {
    if (!projectId || isDraftId(projectId) || !state.project) return;
    const busy = state.nodes.some((node) => node.status === "building");
    if (state.live && !busy) return;
    const tick = () => {
      if (document.hidden) return;
      void load("full");
    };
    const timer = window.setInterval(tick, state.live ? 2500 : 4000);
    return () => window.clearInterval(timer);
  }, [load, projectId, state.live, state.nodes, state.project]);

  useEffect(() => {
    if (!projectId || isDraftId(projectId)) return;

    dispatch({ type: "live", live: false });
    const source = new EventSource(projects.eventsURL(projectId), { withCredentials: true });
    let opened = false;

    source.onopen = () => {
      dispatch({ type: "live", live: true });
      // The first open races the initial load. Later reconnects catch logs
      // that were written while the stream was down.
      if (opened) void load("full");
      opened = true;
    };
    source.onerror = () => dispatch({ type: "live", live: false });
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as StreamEvent;
        const rev = event.kind === "log" ? clock.current : stamp();
        dispatch({ type: "event", event, rev });
      } catch {
        // Heartbeats arrive as SSE comments and never reach onmessage.
      }
    };

    return () => {
      source.onmessage = null;
      source.onerror = null;
      source.onopen = null;
      source.close();
    };
  }, [load, projectId, stamp]);

  const reload = useCallback(() => load("meta"), [load]);

  const dropNode = useCallback((nodeId: string) => {
    if (!nodeId) return;
    dispatch({ type: "dropNode", nodeId, rev: stamp() });
  }, [stamp]);

  const restoreNode = useCallback((nodeId: string) => {
    if (!nodeId) return;
    dispatch({ type: "restoreNode", nodeId });
  }, []);

  const upsertNode = useCallback((node: ServiceNode) => {
    if (!node?.id) return;
    dispatch({ type: "upsertNode", node, rev: stamp() });
  }, [stamp]);

  const noteBuilding = useCallback((nodeId: string) => {
    if (!nodeId) return;
    dispatch({
      type: "event",
      event: {
        kind: "status",
        status: "building",
        nodeId,
        startedAt: new Date().toISOString(),
      },
      rev: stamp(),
    });
  }, [stamp]);

  return { ...state, reload, noteBuilding, dropNode, restoreNode, upsertNode };
}
