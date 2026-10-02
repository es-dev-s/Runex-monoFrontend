import type { Deployment, Project, ProjectWithNodes, ServiceNode } from "@/lib/api";
import { clearBootCookie, writeBootCookie } from "@/lib/boot";
import type { Point } from "@/lib/project-layout";

type Snapshot = { project: Project; nodes: ServiceNode[] };
type View = { scale: number; x: number; y: number };

const NAME = (id: string) => `harbor.projectName.${id}`;
const SNAP = (id: string) => `harbor.projectSnap.v2.${id}`;
const LEGACY_SNAP = (id: string) => `harbor.projectSnap.${id}`;
const LOGS = (id: string) => `runex.logs.${id}`;
const DEPLOYS = (projectId: string, nodeId: string) => `runex.deploys.${projectId}.${nodeId}`;
const VIEW = (id: string) => `harbor.canvasView.${id}`;
const POS = (id: string) => `harbor.canvasPos.${id}`;
const BOARD = "harbor.boardProjects";
const SHELL = "runex.shell";
const SELECTED = (id: string) => `runex.selectedNode.${id}`;
const TAB = (nodeId: string) => `runex.inspectorTab.${nodeId}`;

export type ShellState = {
  openId?: string | null;
  openName?: string;
  activeNav?: string;
  sort?: "newest" | "oldest";
  listView?: "list" | "grid";
};

const ACCOUNT = "runex.account";
const LIST = "runex.bootList";
const EVENTS = "runex.events";

type Account = { id?: string; name: string; username: string };
type BootRow = {
  id: string;
  name: string;
  status: string;
  time: string;
  detail: string;
  workspaceId?: string;
  nodes?: { id: string; kind: string; title: string; status: string; placed: boolean }[];
};

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    const raw = JSON.stringify(value);
    if (raw.length > 180_000) return;
    localStorage.setItem(key, raw);
  } catch {
    /* private mode / quota */
  }
}

export function rememberProjectName(id: string, name: string) {
  const label = name.trim();
  if (!id || !label) return;
  try {
    localStorage.setItem(NAME(id), label);
  } catch {
    /* private mode */
  }
}

export function readProjectName(id: string): string | null {
  if (!id) return null;
  try {
    return localStorage.getItem(NAME(id));
  } catch {
    return null;
  }
}

/** True when the breadcrumb would otherwise show a raw platform id. */
export function looksLikeProjectId(value: string) {
  return /^[a-z]{2,6}_[a-f0-9]{8,}$/i.test(value.trim());
}

export type SavedLog = {
  key: string;
  ts: string;
  phase?: string;
  level?: string;
  text: string;
  nodeId?: string;
};

export function rememberSnapshot(project: Project, nodes: ServiceNode[]) {
  rememberProjectName(project.id, project.name);
  writeJSON(SNAP(project.id), { project, nodes });
}

export function readSnapshot(id: string): Snapshot | null {
  const snap = readJSON<Snapshot>(SNAP(id));
  if (!snap?.project?.id || snap.project.id !== id) return null;
  if (!Array.isArray(snap.nodes)) return null;
  return snap;
}

export function rememberEvents(events: Deployment[]) {
  writeJSON(
    EVENTS,
    events.slice(0, 24).filter((event) => event?.id && !event.id.startsWith("local-")),
  );
}

export function readEvents(): Deployment[] {
  const rows = readJSON<Deployment[]>(EVENTS);
  if (!rows?.length) return [];
  return rows.filter((event) => event?.id && event.createdAt && event.projectId);
}

export function rememberLogs(projectId: string, logs: SavedLog[]) {
  if (!projectId) return;
  writeJSON(
    LOGS(projectId),
    logs.slice(-400).filter((line) => line.text),
  );
}

export function readLogs(projectId: string): SavedLog[] {
  const rows = readJSON<SavedLog[]>(LOGS(projectId));
  if (!rows?.length) return [];
  return rows.filter((line) => line && line.text && line.ts);
}

export function rememberDeployments(projectId: string, nodeId: string, items: Deployment[]) {
  if (!projectId || !nodeId) return;
  writeJSON(DEPLOYS(projectId, nodeId), items.slice(0, 30));
}

export function readDeployments(projectId: string, nodeId: string): Deployment[] {
  const rows = readJSON<Deployment[]>(DEPLOYS(projectId, nodeId));
  if (!rows?.length) return [];
  return rows.filter((item) => item?.id && item.createdAt);
}

export function rememberBoard(projects: ProjectWithNodes[]) {
  writeJSON(BOARD, projects.slice(0, 60));
}

export function readBoard(): ProjectWithNodes[] | null {
  const items = readJSON<ProjectWithNodes[]>(BOARD);
  if (!Array.isArray(items)) return null;
  const next = items.filter((project) => project?.id && Array.isArray(project.nodes));
  if (next.length === 0) return null;
  return next;
}

export function readShell(): ShellState | null {
  const shell = readJSON<ShellState>(SHELL);
  if (!shell || typeof shell !== "object") return null;
  return shell;
}

function syncBootCookie() {
  if (typeof document === "undefined") return;
  const shell = readShell();
  const account = readJSON<Account>(ACCOUNT);
  const projects = readJSON<BootRow[]>(LIST);
  writeBootCookie({
    name: account?.name ?? "",
    username: account?.username ?? "",
    openId: shell?.openId || null,
    openName: shell?.openName ?? "",
    activeNav: shell?.activeNav || "projects",
    sort: shell?.sort === "oldest" ? "oldest" : "newest",
    listView: shell?.listView === "list" ? "list" : "grid",
    listViewSet: shell?.listView === "list" || shell?.listView === "grid",
    projects: Array.isArray(projects) ? projects.slice(0, 8) : [],
  });
}

export function rememberAccount(user: { id?: string; name?: string; username?: string } | null) {
  if (!user) {
    try {
      localStorage.removeItem(ACCOUNT);
    } catch {
      /* private mode */
    }
  } else {
    const current = readJSON<Account>(ACCOUNT);
    writeJSON(ACCOUNT, {
      id: user.id || current?.id || "",
      name: user.name ?? "",
      username: user.username ?? "",
    });
  }
  syncBootCookie();
}

export function rememberBootList(projects: BootRow[]) {
  writeJSON(LIST, projects.slice(0, 8));
  syncBootCookie();
}

export function clearBoot() {
  try {
    localStorage.removeItem(ACCOUNT);
    localStorage.removeItem(LIST);
    localStorage.removeItem(SHELL);
    localStorage.removeItem(BOARD);
  } catch {
    /* private mode */
  }
  clearBootCookie();
}

export function rememberShell(patch: ShellState) {
  const current = readShell() ?? {};
  writeJSON(SHELL, { ...current, ...patch });
  syncBootCookie();
}

export function readSelectedNode(projectId: string): string | null {
  if (!projectId) return null;
  try {
    return localStorage.getItem(SELECTED(projectId));
  } catch {
    return null;
  }
}

export function rememberSelectedNode(projectId: string, nodeId: string | null) {
  if (!projectId) return;
  try {
    if (nodeId) localStorage.setItem(SELECTED(projectId), nodeId);
    else localStorage.removeItem(SELECTED(projectId));
  } catch {
    /* private mode */
  }
}

const INSPECTOR_TABS = new Set([
  "overview",
  "database",
  "deployments",
  "logs",
  "variables",
  "usage",
  "settings",
]);

export function readInspectorTab(nodeId: string): string | null {
  if (!nodeId) return null;
  try {
    const stored = localStorage.getItem(TAB(nodeId));
    return stored && INSPECTOR_TABS.has(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function rememberInspectorTab(nodeId: string, tab: string) {
  if (!nodeId || !INSPECTOR_TABS.has(tab)) return;
  try {
    localStorage.setItem(TAB(nodeId), tab);
  } catch {
    /* private mode */
  }
}

export function forgetProjectLocal(id: string) {
  if (!id) return;
  try {
    localStorage.removeItem(NAME(id));
    localStorage.removeItem(SNAP(id));
    localStorage.removeItem(LEGACY_SNAP(id));
    localStorage.removeItem(LOGS(id));
    localStorage.removeItem(VIEW(id));
    localStorage.removeItem(POS(id));
    localStorage.removeItem(SELECTED(id));
    sessionStorage.removeItem(`harbor.selectedNode.${id}`);
    sessionStorage.removeItem(`runex.selectedNode.${id}`);
  } catch {
    /* private mode */
  }
  const board = readBoard();
  if (board) rememberBoard(board.filter((project) => project.id !== id && project.familyId !== id));
}

export function rememberCanvasView(projectId: string, view: View) {
  if (!projectId) return;
  writeJSON(VIEW(projectId), view);
}

export function readCanvasView(projectId: string): View | null {
  const view = readJSON<View>(VIEW(projectId));
  if (!view) return null;
  if (![view.scale, view.x, view.y].every((n) => Number.isFinite(n))) return null;
  if (view.scale < 0.2 || view.scale > 4) return null;
  return view;
}

export function rememberCanvasPositions(projectId: string, positions: Record<string, Point>) {
  if (!projectId) return;
  writeJSON(POS(projectId), positions);
}

export function readCanvasPositions(projectId: string): Record<string, Point> {
  const positions = readJSON<Record<string, Point>>(POS(projectId));
  if (!positions || typeof positions !== "object") return {};
  const next: Record<string, Point> = {};
  for (const [id, point] of Object.entries(positions)) {
    if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) next[id] = { x: point.x, y: point.y };
  }
  return next;
}
