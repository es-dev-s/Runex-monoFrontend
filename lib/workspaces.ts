"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { WORKSPACE_COOKIE } from "@/lib/workspace-cookie";

export const HOME_WORKSPACE = "home";
export { WORKSPACE_COOKIE };

export type Workspace = {
  id: string;
  name: string;
};

type Saved = {
  activeId: string;
  created: Workspace[];
  projects: Record<string, string>;
};

const EMPTY = '{"activeId":"home","created":[],"projects":{}}';
const listeners = new Set<() => void>();

function storageKey(userId: string) {
  return `runex.workspaces.${userId}`;
}

function readRaw(userId: string) {
  if (!userId || typeof localStorage === "undefined") return EMPTY;
  try {
    return localStorage.getItem(storageKey(userId)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeWorkspaceCookie(raw: string) {
  if (typeof document === "undefined") return;
  const encoded = encodeURIComponent(raw);
  if (encoded.length > 3800) return;
  document.cookie = `${WORKSPACE_COOKIE}=${encoded}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

function writeRaw(userId: string, saved: Saved) {
  if (!userId) return;
  const raw = JSON.stringify(saved);
  try {
    localStorage.setItem(storageKey(userId), raw);
  } catch {
    /* private mode */
  }
  writeWorkspaceCookie(raw);
  listeners.forEach((listener) => listener());
}

function parse(raw: string): Saved {
  try {
    const value = JSON.parse(raw) as Partial<Saved>;
    const created = Array.isArray(value.created)
      ? value.created.filter(
          (item): item is Workspace =>
            Boolean(item) &&
            typeof item.id === "string" &&
            item.id !== HOME_WORKSPACE &&
            typeof item.name === "string" &&
            item.name.trim().length > 0,
        )
      : [];
    const projects =
      value.projects && typeof value.projects === "object" ? value.projects : {};
    return {
      activeId: typeof value.activeId === "string" ? value.activeId : HOME_WORKSPACE,
      created: created.map((item) => ({ id: item.id, name: item.name.trim().slice(0, 40) })),
      projects,
    };
  } catch {
    return { activeId: HOME_WORKSPACE, created: [], projects: {} };
  }
}

export function workspaceLabel(displayName: string) {
  const who = displayName.trim() || "Personal";
  return `${who}'s workspace`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const WorkspaceBootContext = createContext<string | null>(null);

/** The workspace cookie from the server, so the first paint matches the saved choice. */
export function WorkspaceBootProvider({
  raw,
  children,
}: {
  raw: string | null;
  children: ReactNode;
}) {
  return createElement(WorkspaceBootContext.Provider, { value: raw }, children);
}

export function useWorkspaces(userId: string, displayName: string) {
  const cookieRaw = useContext(WorkspaceBootContext);
  const raw = useSyncExternalStore(
    subscribe,
    () => (userId ? readRaw(userId) : cookieRaw && cookieRaw.startsWith("{") ? cookieRaw : EMPTY),
    () => (cookieRaw && cookieRaw.startsWith("{") ? cookieRaw : EMPTY),
  );
  useEffect(() => {
    if (!userId) return;
    const stored = readRaw(userId);
    if (stored === EMPTY || stored === cookieRaw) return;
    writeWorkspaceCookie(stored);
  }, [cookieRaw, userId]);
  return useMemo(() => {
    const saved = parse(raw);
    const home: Workspace = { id: HOME_WORKSPACE, name: workspaceLabel(displayName) };
    const items = [home, ...saved.created];
    const active = items.find((item) => item.id === saved.activeId) ?? home;
    const ready = Boolean(userId) || Boolean(cookieRaw && cookieRaw.startsWith("{"));
    return { active, items, saved, ready };
  }, [cookieRaw, displayName, raw, userId]);
}

export function projectWorkspace(userId: string, projectId: string) {
  return parse(readRaw(userId)).projects[projectId] || HOME_WORKSPACE;
}

export function belongsToWorkspace(userId: string, projectId: string | undefined, activeId: string) {
  if (!projectId) return activeId === HOME_WORKSPACE;
  return projectWorkspace(userId, projectId) === activeId;
}

export function selectWorkspace(userId: string, id: string) {
  const saved = parse(readRaw(userId));
  const known = id === HOME_WORKSPACE || saved.created.some((item) => item.id === id);
  if (!known) return;
  writeRaw(userId, { ...saved, activeId: id });
}

export function createWorkspace(userId: string, name: string) {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return null;
  const saved = parse(readRaw(userId));
  const id = `ws_${Math.random().toString(36).slice(2, 10)}`;
  writeRaw(userId, {
    ...saved,
    activeId: id,
    created: [...saved.created, { id, name: trimmed }],
  });
  return id;
}

/** Remember which workspace a project belongs to. Untagged projects stay on the home workspace. */
export function placeProject(userId: string | undefined, projectId: string) {
  if (!userId || !projectId) return;
  const saved = parse(readRaw(userId));
  const active = saved.activeId || HOME_WORKSPACE;
  if (saved.projects[projectId] === active) return;
  writeRaw(userId, {
    ...saved,
    projects: { ...saved.projects, [projectId]: active },
  });
}
