"use client";

import { GithubMark } from "@/components/icons/github-mark";
import { PostgresMark } from "@/components/icons/postgres-mark";
import { RedisMark } from "@/components/icons/redis-mark";
import { activity, type Deployment, type LogLine, type ProjectWithNodes } from "@/lib/api";
import { usePlatformStore } from "@/lib/inbox/store";
import { rememberSelectedNode } from "@/lib/remember";
import { HOME_WORKSPACE, useWorkspaces } from "@/lib/workspaces";
import { BottomSheet, useMaxMd } from "@/components/ui/bottom-sheet";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePresentedChrome } from "./chrome";

type Tone = "deploy" | "push" | "crash" | "building";
type Mark = "github" | "postgresql" | "redis" | "";

type ActivityRow = {
  id: string;
  deploymentId: string;
  projectId: string;
  nodeId: string;
  parent: boolean;
  tone: Tone;
  mark: Mark;
  title: string;
  at: string;
  project: string;
  service: string;
  how: string;
  error: string;
  startedAt: string;
  finishedAt: string;
  fresh: boolean;
};

const ROW = 40;
const MAIN_X = 20;
const BRANCH_X = 6;
const PANEL = 504;

const TONE_COLOR: Record<Tone, string> = {
  deploy: "#4c8dff",
  push: "#e09a3a",
  crash: "#e07070",
  building: "#4c8dff",
};

export function ActivityTimeline() {
  const user = usePlatformStore((state) => state.user);
  const { name } = usePresentedChrome();
  const { active, saved, ready } = useWorkspaces(user?.id ?? "", name);
  const [events, setEvents] = useState<Deployment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const narrow = useMaxMd();
  const [hotId, setHotId] = useState<string | null>(null);
  const projects = usePlatformStore((state) => state.projects);
  const openProject = usePlatformStore((state) => state.openProject);

  useEffect(() => {
    const ac = new AbortController();
    let live = true;
    activity
      .get(undefined, ac.signal)
      .then((feed) => {
        if (!live) return;
        setEvents((feed.events ?? []).filter(isDeploy));
      })
      .catch((cause: unknown) => {
        if (!live || isAbort(cause)) return;
        setFailed(true);
        setEvents([]);
      });
    return () => {
      live = false;
      ac.abort();
    };
  }, []);

  const mine = useMemo(() => {
    if (!ready || events === null) return [];
    const visible = events.filter((event) => {
      if (event.id.startsWith("preview-")) return false;
      const placed = saved.projects[event.projectId] || HOME_WORKSPACE;
      return placed === active.id;
    });
    return markFresh(visible);
  }, [active.id, events, ready, saved.projects]);

  const rows = useMemo(() => mine.flatMap(rowsFor), [mine]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !rows.some((row) => row.id === selectedId)) setSelectedId(null);
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <div className={`relative flex min-h-0 flex-1 overflow-hidden ${selected && !narrow ? "gap-2" : ""}`}>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#ececec] bg-white">
        <header className="flex items-baseline justify-between gap-3 px-5 pt-5 pb-2">
          <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-[#1d1d1f]">Audit logs</h2>
          <p className="text-[12px] tracking-[-0.006em] text-[#8e8e93]">Recent</p>
        </header>

        {events === null || !ready ? (
          <div className="flex flex-col gap-2 px-5 pt-3" aria-hidden>
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-8 rounded-lg bg-[#f6f6f6]" />
            ))}
          </div>
        ) : failed ? (
          <p className="px-5 py-10 text-[14px] text-[#8e8e93]">Audit logs could not be loaded.</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-[14px] leading-6 text-[#8e8e93]">
            No deploys, pushes, or crashes yet.
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <div className="relative">
              <ul>
                {rows.map((row) => {
                  const on = row.id === selectedId;
                  const failed = isFailure(row);
                  return (
                    <li key={row.id} style={{ height: ROW }}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-current={on ? "true" : undefined}
                        onMouseEnter={() => setHotId(row.id)}
                        onMouseLeave={() => setHotId((current) => (current === row.id ? null : current))}
                        onClick={() => setSelectedId(row.id)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          setSelectedId(row.id);
                        }}
                        className={`flex h-full w-full items-center gap-3 rounded-[10px] pr-4 pl-12 text-left outline-none ${
                          failed
                            ? "bg-[#fff6f5]"
                            : on || hotId === row.id
                              ? "bg-[var(--preview-face)]"
                              : ""
                        } ${row.parent ? "text-[#1d1d1f]" : "text-[#b0b0b0]"}`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[13px] tracking-[-0.011em]">
                          {row.parent ? (
                            <Sentence
                              row={row}
                              mark={resolveMark(projects, row)}
                              onProject={() => openProject(row.projectId)}
                              onNode={() => {
                                if (row.nodeId) rememberSelectedNode(row.projectId, row.nodeId);
                                openProject(row.projectId);
                              }}
                            />
                          ) : (
                            <span className="truncate">{row.title}</span>
                          )}
                        </span>
                        <time
                          suppressHydrationWarning
                          className="shrink-0 text-[11px] tracking-[-0.01em] text-[#aeaeb2] tabular-nums"
                        >
                          {exact(row.at)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Graph rows={rows} hotId={hotId} selectedId={selectedId} />
            </div>
          </div>
        )}
      </section>

      <div
        className="hidden min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] md:block"
        style={{ width: selected ? PANEL : 0 }}
      >
        {selected && !narrow ? (
          <LogPanel row={selected} onClose={() => setSelectedId(null)} />
        ) : null}
      </div>
      {selected && narrow ? (
        <BottomSheet onClose={() => setSelectedId(null)}>
          <LogPanel fill row={selected} onClose={() => setSelectedId(null)} />
        </BottomSheet>
      ) : null}
    </div>
  );
}

function Graph({ rows, hotId, selectedId }: { rows: ActivityRow[]; hotId: string | null; selectedId: string | null }) {
  const height = rows.length * ROW;
  return (
    <svg width={36} height={height} className="pointer-events-none absolute top-0 left-2 z-10" aria-hidden>
      {rows.slice(0, -1).map((row, index) => {
        const next = rows[index + 1];
        return (
          <path
            key={`${row.id}-line`}
            d={link(row, index, next)}
            fill="none"
            stroke={segmentColor(row, next)}
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        );
      })}
      {rows.map((row, index) => {
        const y = index * ROW + ROW / 2;
        if (row.parent) {
          const fill = row.id === hotId || row.id === selectedId ? "var(--preview-face)" : "var(--card)";
          return <circle key={row.id} cx={MAIN_X} cy={y} r={5.5} fill={fill} stroke={TONE_COLOR.deploy} strokeWidth={1.75} />;
        }
        return <circle key={row.id} cx={BRANCH_X} cy={y} r={3.5} fill={TONE_COLOR[row.tone]} />;
      })}
    </svg>
  );
}

/**
 * The spine stays straight. A branch leaves it with a smooth hook, runs
 * straight through the side dots, then hooks back. Dots sit on the straight part.
 */
function link(row: ActivityRow, index: number, next: ActivityRow) {
  const x1 = row.parent ? MAIN_X : BRANCH_X;
  const x2 = next.parent ? MAIN_X : BRANCH_X;
  const y1 = index * ROW + ROW / 2;
  const y2 = (index + 1) * ROW + ROW / 2;
  // Spine rings break the line. Side dots sit on it, so the branch runs through their centers.
  const start = y1 + (row.parent ? 8 : 0);
  const end = y2 - (next.parent ? 8 : 0);
  if (end - start < 4) return `M ${x1} ${start} L ${x2} ${end}`;
  if (x1 === x2) return `M ${x1} ${start} L ${x2} ${end}`;
  const bow = Math.min(Math.abs(x2 - x1), (end - start) / 2);
  if (x2 < x1) {
    const land = start + bow;
    return `M ${x1} ${start} C ${x1} ${land}, ${x2} ${start}, ${x2} ${land} L ${x2} ${end}`;
  }
  const lift = end - bow;
  return `M ${x1} ${start} L ${x1} ${lift} C ${x1} ${end}, ${x2} ${lift}, ${x2} ${end}`;
}

function segmentColor(row: ActivityRow, next: ActivityRow) {
  if (row.parent && next.parent) return TONE_COLOR.deploy;
  if (!row.parent && !next.parent) return TONE_COLOR[row.tone];
  const branch = row.parent ? next : row;
  return TONE_COLOR[branch.tone];
}

function LogPanel({ row, onClose, fill = false }: { row: ActivityRow; onClose: () => void; fill?: boolean }) {
  const [logs, setLogs] = useState<LogLine[] | null>(null);
  const [logError, setLogError] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const ticket = useRef(0);
  const deploymentId = row.deploymentId;

  useEffect(() => {
    const ac = new AbortController();
    const mine = ++ticket.current;
    setLogs(null);
    setLogError(false);
    activity
      .logs(deploymentId, ac.signal)
      .then((lines) => {
        if (mine !== ticket.current) return;
        setLogs(lines);
      })
      .catch((cause: unknown) => {
        if (mine !== ticket.current || isAbort(cause)) return;
        setLogError(true);
        setLogs([]);
      });
    return () => ac.abort();
  }, [deploymentId]);

  useEffect(() => {
    const node = scroller.current;
    if (!node || !logs) return;
    node.scrollTop = node.scrollHeight;
  }, [logs]);

  const outcome = outcomeOf(row);

  return (
    <aside
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-white ${
        fill ? "w-full" : "w-[504px] shrink-0 rounded-[16px] border border-[#ececec]"
      }`}
    >
      <header className="flex items-start gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">{row.title}</h2>
          <p className="mt-1 text-[12px] tracking-[-0.006em] text-[#8e8e93]">{stamp(row.at)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[#8e8e93] transition-colors hover:bg-black/[0.04] hover:text-[#1d1d1f]"
        >
          <X size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </header>

      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 border-t border-[#f2f2f2] px-5 py-4 text-[13px] tracking-[-0.011em]">
        <dt className="text-[#8e8e93]">Project</dt>
        <dd className="truncate text-[#1d1d1f]">{row.project}</dd>
        <dt className="text-[#8e8e93]">Service</dt>
        <dd className="truncate text-[#1d1d1f]">{row.service}</dd>
        <dt className="text-[#8e8e93]">How</dt>
        <dd className="truncate text-[#1d1d1f]">{row.how}</dd>
        <dt className="text-[#8e8e93]">Result</dt>
        <dd className={`font-medium ${outcome.className}`}>{outcome.label}</dd>
        <dt className="text-[#8e8e93]">Started</dt>
        <dd className="text-[#1d1d1f] tabular-nums">{exact(row.startedAt)}</dd>
        <dt className="text-[#8e8e93]">Finished</dt>
        <dd className="text-[#1d1d1f] tabular-nums">{row.finishedAt ? exact(row.finishedAt) : "In progress"}</dd>
        <dt className="text-[#8e8e93]">Took</dt>
        <dd className="text-[#1d1d1f] tabular-nums">{took(row.startedAt, row.finishedAt)}</dd>
      </dl>

      {row.error ? (
        <p className="mx-5 mb-3 rounded-lg bg-[#fff6f5] px-3 py-2 text-[12.5px] leading-5 text-[#b42318]">
          {row.error}
        </p>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-[#f2f2f2] px-5 pt-3.5 pb-1">
        <h3 className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">Logs</h3>
        <p className="text-[11px] text-[#aeaeb2] tabular-nums">{hourOf(row)}</p>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pb-4">
        {logs === null ? (
          <div className="flex flex-col gap-2 px-5 pt-3" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-4 rounded bg-[#f6f6f6]" />
            ))}
          </div>
        ) : logError ? (
          <p className="px-5 py-6 text-[13px] text-[#8e8e93]">Logs could not be loaded.</p>
        ) : logs.length === 0 ? (
          <p className="px-5 py-6 text-[13px] leading-5 text-[#8e8e93]">No log lines in the last hour.</p>
        ) : (
          <ol>
            {logs.map((line) => (
              <li
                key={line.id}
                className="grid grid-cols-[76px_1fr] gap-3 px-5 py-[3px] font-mono text-[12px] leading-5"
              >
                <time className="text-[#aeaeb2]">{clock(line.ts)}</time>
                <span className={lineTone(line.level)}>{line.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

function rowsFor(event: Deployment): ActivityRow[] {
  const service = event.serviceTitle || event.projectName || "Service";
  const project = event.projectName || "Project";
  const ref = (event.sourceRef || "").trim();
  const status = event.status as string;
  const crashed = status === "failed" || status === "cancelled";
  const push = event.trigger === "github";
  const building = status === "running" || status === "building";
  const at = event.finishedAt || event.createdAt;
  const error = (event.error || "").trim();
  const how = push ? (ref ? `Push to ${ref}` : "Push") : "Manual deploy";

  const fresh = Boolean((event as Deployment & { fresh?: boolean }).fresh);
  let title = fresh ? `Deployed new ${service}` : `Deployed ${service}`;
  let tone: Tone = "deploy";
  if (crashed) {
    title = status === "cancelled" ? `${service} was cancelled` : `${service} crashed`;
    tone = "crash";
  } else if (push) {
    title = `Auto-deployed ${service} on push`;
    tone = "push";
  } else if (building) {
    title = `Deploying ${service}`;
    tone = "building";
  }

  const base = {
    deploymentId: event.id,
    projectId: event.projectId,
    nodeId: event.nodeId || "",
    project,
    service,
    how,
    error,
    at,
    startedAt: event.createdAt,
    finishedAt: event.finishedAt || "",
    fresh: fresh && tone === "deploy",
    mark: markFor(event),
  };
  const parent: ActivityRow = { ...base, id: event.id, parent: true, tone, title, fresh: fresh && tone === "deploy" };
  const children: ActivityRow[] = [];
  if (push) {
    children.push({
      ...base,
      id: `${event.id}:push`,
      parent: false,
      tone: "push",
      title: ref ? `Pushed ${ref}` : "Pushed to GitHub",
      at: event.createdAt,
    });
  }
  if (crashed) {
    children.push({
      ...base,
      id: `${event.id}:crash`,
      parent: false,
      tone: "crash",
      title: error || "Container exited",
      at,
    });
  }
  return [parent, ...children];
}

function outcomeOf(row: ActivityRow) {
  if (row.tone === "crash") {
    return row.title.toLowerCase().includes("cancelled")
      ? { label: "Cancelled", className: "text-[#8e8e93]" }
      : { label: "Crashed", className: "text-[#b42318]" };
  }
  if (row.tone === "push") return { label: "On push", className: "text-[#B45309]" };
  if (row.tone === "building") return { label: "Deploying", className: "text-[#1d4ed8]" };
  if (row.fresh) return { label: "Deployed new", className: "text-[#047857]" };
  return { label: "Deployed", className: "text-[#047857]" };
}

function lineTone(level: string) {
  const value = level.toLowerCase();
  if (value === "error") return "text-[#b42318]";
  if (value === "warn") return "text-[#B45309]";
  return "text-[#3a3a3c]";
}

function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${day} · ${exact(iso)}`;
}

function exact(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function markFor(event: Deployment): Mark {
  const name = (event.serviceTitle || "").toLowerCase();
  if (name.includes("postgres") || name === "loadtest") return "postgresql";
  if (name.includes("redis")) return "redis";
  if (event.trigger === "github" || event.sourceType === "github") return "github";
  return "";
}

function resolveMark(projects: ProjectWithNodes[], row: ActivityRow): Mark {
  const project = projects.find((item) => item.id === row.projectId);
  const node =
    project?.nodes.find((item) => item.id === row.nodeId) ??
    project?.nodes.find((item) => item.title === row.service);
  if (node?.kind === "postgresql") return "postgresql";
  if (node?.kind === "redis") return "redis";
  if (node?.sourceType === "github") return "github";
  return row.mark;
}

function Sentence({
  row,
  mark,
  onProject,
  onNode,
}: {
  row: ActivityRow;
  mark: Mark;
  onProject: () => void;
  onNode: () => void;
}) {
  const node = <Chip label={row.service} mark={mark} onClick={onNode} />;
  const project = <Chip label={row.project} onClick={onProject} />;
  const quiet = "shrink-0 text-[#6e6e73]";
  if (row.tone === "crash") {
    const cancelled = row.title.includes("cancelled");
    return (
      <>
        {node}
        <span className={quiet}>in</span>
        {project}
        <span className="shrink-0">{cancelled ? "was cancelled" : "crashed"}</span>
      </>
    );
  }
  if (row.tone === "push") {
    return (
      <>
        <span className="shrink-0">Auto-deployed</span>
        {node}
        <span className={quiet}>in</span>
        {project}
        <span className={quiet}>on push</span>
      </>
    );
  }
  return (
    <>
      <span className="shrink-0">{row.tone === "building" ? "Deploying" : row.fresh ? "Deployed new" : "Deployed"}</span>
      {node}
      <span className={quiet}>in</span>
      {project}
    </>
  );
}

function Chip({ label, mark, onClick }: { label: string; mark?: Mark; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="inline-flex h-[18px] max-w-[8.5rem] shrink items-center gap-1 rounded-[5px] bg-black/[0.04] px-1.5 text-[12px] leading-none font-medium tracking-[-0.011em] text-[#1d1d1f] transition-colors hover:bg-black/[0.05]"
    >
      {mark ? <NodeMark mark={mark} /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

function NodeMark({ mark }: { mark: Mark }) {
  if (mark === "postgresql") {
    return (
      <span className="text-[#336791]">
        <PostgresMark size={11} />
      </span>
    );
  }
  if (mark === "redis") {
    return (
      <span className="text-[#DC382C]">
        <RedisMark size={11} />
      </span>
    );
  }
  if (mark === "github") return <GithubMark size={11} />;
  return null;
}

function clock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function isFailure(row: ActivityRow) {
  return row.tone === "crash" && !row.title.toLowerCase().includes("cancelled");
}

function markFresh(events: Deployment[]): Array<Deployment & { fresh?: boolean }> {
  const groups = new Map<string, Deployment[]>();
  for (const event of events) {
    const key = event.nodeId || `${event.projectId}:${event.serviceTitle || ""}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  const freshIds = new Set<string>();
  for (const list of groups.values()) {
    const plain = list.filter((event) => {
      const status = event.status as string;
      const bad = status === "failed" || status === "cancelled" || status === "running" || status === "building";
      return !bad && event.trigger !== "github";
    });
    if (plain.length === 0) continue;
    plain.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    freshIds.add(plain[0].id);
  }
  return events.map((event) => ({ ...event, fresh: freshIds.has(event.id) }));
}

function took(start: string, end: string) {
  if (!end) return "Still running";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours}h ${remain}m` : `${hours}h`;
}

function hourOf(row: ActivityRow) {
  if (!row.finishedAt) return `Since ${exact(row.startedAt)}`;
  return `${exact(row.startedAt)} – ${exact(row.finishedAt)}`;
}

function isAbort(cause: unknown) {
  return cause instanceof DOMException && cause.name === "AbortError";
}

function isDeploy(event: Deployment) {
  return (
    event.status === "success" ||
    event.status === "failed" ||
    event.status === "running" ||
    event.status === "building" ||
    event.status === "cancelled"
  );
}
