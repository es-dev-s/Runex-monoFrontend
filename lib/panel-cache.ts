import type { DatabaseOverview, DatabaseTable, EnvVar, UsageSnapshot } from "@/lib/api";

const USAGE = (key: string) => `runex.usage.${key}`;
const TABLES = (projectId: string, nodeId: string) => `runex.tables.${projectId}.${nodeId}`;

const variables = new Map<string, { items: EnvVar[]; platform: string[] }>();
const platformVars = new Map<string, EnvVar[]>();
const connections = new Map<string, DatabaseOverview>();

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.stringify(value);
    if (raw.length > 180_000) return;
    localStorage.setItem(key, raw);
  } catch {
    /* private mode / quota */
  }
}

export function readUsageSnapshot(scope: string): UsageSnapshot | null {
  if (!scope) return null;
  const snap = readJSON<UsageSnapshot>(USAGE(scope));
  if (!snap || !Array.isArray(snap.projects)) return null;
  return snap;
}

export function rememberUsageSnapshot(scope: string, snap: UsageSnapshot) {
  if (!scope) return;
  const slim: UsageSnapshot = {
    ...snap,
    projects: (snap.projects ?? []).map((project) => ({
      ...project,
      nodes: (project.nodes ?? []).map((node) => ({
        ...node,
        series: (node.series ?? []).slice(-24),
      })),
    })),
  };
  writeJSON(USAGE(scope), slim);
}

export function readTables(projectId: string, nodeId: string): DatabaseTable[] {
  const rows = readJSON<DatabaseTable[]>(TABLES(projectId, nodeId));
  if (!rows?.length) return [];
  return rows.filter((table) => table?.name && table.schema);
}

export function rememberTables(projectId: string, nodeId: string, tables: DatabaseTable[]) {
  writeJSON(TABLES(projectId, nodeId), tables.slice(0, 200));
}

function varKey(projectId: string, nodeId: string) {
  return `${projectId}:${nodeId}`;
}

export function readVariables(projectId: string, nodeId: string) {
  return variables.get(varKey(projectId, nodeId)) ?? null;
}

export function rememberVariables(projectId: string, nodeId: string, items: EnvVar[], platform: string[]) {
  variables.set(varKey(projectId, nodeId), { items, platform });
}

export function readPlatformVars(projectId: string, nodeId: string) {
  return platformVars.get(varKey(projectId, nodeId)) ?? null;
}

export function rememberPlatformVars(projectId: string, nodeId: string, rows: EnvVar[]) {
  platformVars.set(varKey(projectId, nodeId), rows);
}

export function readConnection(projectId: string, nodeId: string) {
  return connections.get(varKey(projectId, nodeId)) ?? null;
}

export function rememberConnection(projectId: string, nodeId: string, info: DatabaseOverview) {
  connections.set(varKey(projectId, nodeId), info);
}
