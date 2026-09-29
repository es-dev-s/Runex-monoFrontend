"use client";

import {
  activity,
  ApiError,
  auth,
  NetworkError,
  projects as projectApi,
  usage as usageApi,
  type Deployment,
  type ProjectWithNodes,
  type ServiceNode,
  type UsageSnapshot,
  type User,
} from "@/lib/api";
import { signInSchema, signUpSchema } from "@/lib/auth-schema";
import { readUsageSnapshot } from "@/lib/panel-cache";
import { isDraftId } from "@/lib/projects";
import { relativeTime } from "@/lib/relative-time";
import { placeProject } from "@/lib/workspaces";
import {
  clearBoot,
  readBoard,
  readEvents,
  rememberAccount,
  rememberBoard,
  rememberBootList,
  rememberEvents,
  rememberShell,
  rememberSnapshot,
} from "@/lib/remember";
import { create } from "zustand";
import { deploymentToService, projectToService } from "./present";
import type { NavId, Service } from "./schema";

export type Notice = {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  projectId?: string;
};

const SEEN_KEY = "runex-seen-notices";

function readSeen() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids);
  } catch {
    return new Set<string>();
  }
}

function writeSeen(ids: Set<string>) {
  window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
}

function messageOf(cause: unknown, fallback: string) {
  if (cause instanceof NetworkError || cause instanceof ApiError) return cause.message;
  return fallback;
}

export type AuthFailure = { message: string; field?: string } | null;

const authField: Record<string, string> = {
  invalid_username: "username",
  username_taken: "username",
  invalid_email: "email",
  email_taken: "email",
  invalid_password: "password",
  invalid_credentials: "password",
};

function authFailure(cause: unknown, fallback: string): AuthFailure {
  if (cause instanceof ApiError && authField[cause.code]) {
    return { message: cause.message, field: authField[cause.code] };
  }
  return { message: messageOf(cause, fallback) };
}

function noticesFrom(events: Deployment[], seen: Set<string>): Notice[] {
  return events.slice(0, 12).map((event) => ({
    id: event.id,
    projectId: event.projectId,
    title: `${event.serviceTitle || event.projectName || "Service"} · ${event.status}`,
    detail:
      [event.projectName, event.sourceRef, event.error].filter(Boolean).join(" · ") ||
      event.sourceType,
    time: relativeTime(event.finishedAt || event.createdAt),
    unread: !seen.has(event.id),
  }));
}

type PlatformState = {
  session: "loading" | "in" | "out";
  user: User | null;
  projects: ProjectWithNodes[];
  events: Deployment[];
  usage: UsageSnapshot | null;
  services: Service[];
  notices: Notice[];
  activeNav: NavId;
  sort: "newest" | "oldest";
  listView: "list" | "grid";
  selectedIds: string[];
  deployOpen: boolean;
  authOpen: boolean;
  freshId: string | null;
  openId: string | null;
  error: string | null;
  busy: boolean;
  creating: boolean;
  removing: boolean;
  /** True after the saved shell has been copied into this store. */
  chromePrimed: boolean;
  /** True after this session has received a project list. Until then, boot cards stay up. */
  listed: boolean;
  signedIn: boolean;
  bootstrap: () => Promise<void>;
  hydrateCachedBoard: () => void;
  reload: () => Promise<void>;
  login: (login: string, password: string) => Promise<AuthFailure>;
  register: (input: { username: string; email: string; password: string }) => Promise<AuthFailure>;
  logout: () => Promise<void>;
  setNav: (nav: NavId) => void;
  toggleSelected: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clearSelected: () => void;
  toggleSort: () => void;
  setListView: (view: "list" | "grid") => void;
  setDeployOpen: (open: boolean) => void;
  setAuthOpen: (open: boolean) => void;
  createProject: (name: string) => Promise<string | null>;
  removeProjects: (ids: string[]) => Promise<string | null>;
  openProject: (id: string) => void;
  markNoticeRead: (id: string) => void;
  replaceProject: (project: ProjectWithNodes) => void;
};

let sessionGen = 0;
let reloadGen = 0;

function paint(projects: ProjectWithNodes[], events: Deployment[], seen: Set<string>) {
  return {
    projects,
    events,
    services: [...projects.map(projectToService), ...events.map(deploymentToService)],
    notices: noticesFrom(events, seen),
  };
}

function bootRows(projects: ProjectWithNodes[]) {
  const ordered = projects.slice().sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  return ordered.slice(0, 8).map((project) => {
    const service = projectToService(project);
    const nodes = (project.nodes ?? [])
      .filter((node) => node.kind !== "service" || Boolean(node.sourceType) || node.status !== "idle")
      .slice(0, 5)
      .map((node) => ({
        id: node.id,
        kind: node.kind,
        title: (node.title || node.caption || "").slice(0, 24),
        status: node.status,
        placed: true,
        source: node.sourceType === "github" || node.sourceType === "zip" ? node.sourceType : "",
      }));
    return {
      id: project.id,
      name: project.name,
      status: service.status,
      time: service.time,
      detail: service.detail.slice(0, 80),
      nodes,
    };
  });
}

function publishProjects(projects: ProjectWithNodes[]) {
  rememberBoard(projects);
  rememberBootList(bootRows(projects));
}

/** Removed locally while Docker is still tearing the container down. */
const hiddenNodes = new Set<string>();
const hiddenProjects = new Set<string>();

export function hideNode(id: string) {
  if (id) hiddenNodes.add(id);
}

export function showNode(id: string) {
  hiddenNodes.delete(id);
}

export function hideProject(id: string) {
  if (id) hiddenProjects.add(id);
}

export function showProject(id: string) {
  hiddenProjects.delete(id);
}

function withoutHidden(project: ProjectWithNodes): ProjectWithNodes {
  const nodes = project.nodes ?? [];
  if (!nodes.some((node) => hiddenNodes.has(node.id) || isDraftId(node.id))) return project;
  return { ...project, nodes: nodes.filter((node) => !hiddenNodes.has(node.id)) };
}

function projectFingerprint(project: ProjectWithNodes) {
  const nodes = (project.nodes ?? [])
    .map((node) =>
      [
        node.id,
        node.kind,
        node.status,
        node.title,
        node.caption,
        node.x,
        node.y,
        node.url ?? "",
        node.error ?? "",
        node.port ?? "",
        node.sourceType ?? "",
        node.sourceRef ?? "",
        node.framework ?? "",
        node.platformUrl ?? "",
        node.platformUrlEnabled ? "1" : "0",
        node.startedAt ?? "",
      ].join("\u001f"),
    )
    .join("\u001e");
  return [project.id, project.name, project.status, project.url ?? "", project.framework ?? "", project.error ?? "", nodes].join(
    "\u001d",
  );
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

function mergeNode(server: ServiceNode, local?: ServiceNode): ServiceNode {
  if (!local || !serverLags(local.status, server.status)) return server;
  return {
    ...server,
    status: local.status,
    startedAt: local.startedAt,
    error: local.error,
    url: server.url || local.url,
    title: server.title || local.title,
  };
}

function mergeOne(server: ProjectWithNodes, local?: ProjectWithNodes): ProjectWithNodes {
  if (!local) return withoutHidden(server);
  const localById = new Map((local.nodes ?? []).map((node) => [node.id, node]));
  const seen = new Set<string>();
  const nodes = (server.nodes ?? []).map((node) => {
    seen.add(node.id);
    return mergeNode(node, localById.get(node.id));
  });
  for (const node of local.nodes ?? []) {
    if (seen.has(node.id) || hiddenNodes.has(node.id)) continue;
    if (isDraftId(node.id) || node.status === "building") nodes.push(node);
  }
  return withoutHidden({ ...server, nodes });
}

/** Keep a project that was just created if this list response started before the insert. */
function mergeProjects(server: ProjectWithNodes[], local: ProjectWithNodes[]) {
  const localById = new Map(local.map((project) => [project.id, project]));
  const merged = server
    .filter((project) => !hiddenProjects.has(project.id))
    .map((project) => mergeOne(project, localById.get(project.id)));
  const ids = new Set(merged.map((project) => project.id));
  const pending = local.filter((project) => !ids.has(project.id) && !hiddenProjects.has(project.id));
  return pending.length ? [...pending, ...merged] : merged;
}

function draftId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `draft_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function liveDeployStatus(status: string): Deployment["status"] {
  if (status === "failed") return "failed";
  if (status === "stopped") return "cancelled";
  if (status === "building") return "building";
  return "success";
}

function withLiveDeploys(events: Deployment[], project: ProjectWithNodes): Deployment[] {
  const nodes = (project.nodes ?? []).filter((node) => !isDraftId(node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const next = events.map((event) => {
    if (!event.id.startsWith("local-") || event.projectId !== project.id || !event.nodeId) return event;
    const node = byId.get(event.nodeId);
    if (!node) return event;
    const status = liveDeployStatus(node.status);
    const title = node.title || event.serviceTitle;
    if (status === event.status && title === event.serviceTitle) return event;
    changed = true;
    return { ...event, status, serviceTitle: title };
  });
  const present = new Set(next.filter((event) => event.id.startsWith("local-")).map((event) => event.nodeId));
  const added: Deployment[] = [];
  for (const node of nodes) {
    if (node.status !== "building" || present.has(node.id)) continue;
    added.push({
      id: `local-${node.id}`,
      projectId: project.id,
      nodeId: node.id,
      serviceTitle: node.title,
      projectName: project.name,
      status: "building",
      phase: "start",
      trigger: "manual",
      sourceType: node.sourceType || node.kind,
      sourceRef: node.sourceRef,
      createdAt: node.startedAt || new Date().toISOString(),
    });
  }
  if (!changed && added.length === 0) return events;
  return added.length ? [...added, ...next].slice(0, 24) : next;
}

function mergeEvents(server: Deployment[], local: Deployment[]) {
  const locals = local.filter((event) => event.id.startsWith("local-"));
  if (locals.length === 0) return server;
  const kept = locals.filter((item) => {
    const started = Date.parse(item.createdAt) || 0;
    return !server.some((row) => {
      if (row.projectId !== item.projectId || row.nodeId !== item.nodeId) return false;
      return (Date.parse(row.createdAt) || 0) >= started - 5000;
    });
  });
  return kept.length ? [...kept, ...server].slice(0, 40) : server;
}

type StoreSet = (
  partial: Partial<PlatformState> | ((state: PlatformState) => Partial<PlatformState>),
) => void;

function commitList(set: StoreSet, get: () => PlatformState, listed: ProjectWithNodes[]) {
  const openId = get().openId;
  const merged = mergeProjects(listed, get().projects);
  const nextOpen = openId && merged.some((project) => project.id === openId) ? openId : null;
  if (openId !== nextOpen) rememberShell({ openId: nextOpen, openName: "" });
  const user = get().user;
  if (user) rememberAccount(user);
  publishProjects(merged);
  set({
    ...paint(merged, get().events, readSeen()),
    listed: true,
    error: null,
    openId: nextOpen,
  });
}

async function loadSecondary(gen: number, set: StoreSet, get: () => PlatformState) {
  try {
    const [feed, snapshot] = await Promise.all([activity.get(), usageApi.workspace()]);
    if (gen !== reloadGen || !get().signedIn) return;
    const events = mergeEvents(feed.events ?? [], get().events);
    rememberEvents(events);
    set((state) => ({
      ...paint(state.projects, events, readSeen()),
      usage: snapshot,
    }));
  } catch (cause) {
    if (gen !== reloadGen) return;
    if (cause instanceof ApiError && cause.isUnauthorized) {
      set({ session: "out", signedIn: false, user: null, authOpen: true });
    }
  }
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  session: "loading",
  user: null,
  projects: [],
  events: [],
  usage: null,
  services: [],
  notices: [],
  activeNav: "projects",
  sort: "newest",
  listView: "grid",
  selectedIds: [],
  deployOpen: false,
  authOpen: false,
  freshId: null,
  openId: null,
  error: null,
  busy: false,
  creating: false,
  removing: false,
  chromePrimed: false,
  listed: false,
  signedIn: false,

  hydrateCachedBoard: () => {
    if (get().listed || get().projects.length > 0) return;
    const board = readBoard();
    if (!board?.length) return;
    const ordered = board
      .slice()
      .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    set(paint(ordered, get().events.length > 0 ? get().events : readEvents(), readSeen()));
  },

  bootstrap: async () => {
    const cachedEvents = readEvents();
    const cachedUsage = readUsageSnapshot("workspace");
    if (cachedEvents.length > 0 || cachedUsage) {
      set((state) => ({
        usage: state.usage ?? cachedUsage,
        ...paint(state.projects, state.events.length > 0 ? state.events : cachedEvents, readSeen()),
      }));
    }
    const gen = ++sessionGen;
    const listGen = ++reloadGen;
    const listedP = projectApi.list().then(
      (projects) => ({ ok: true as const, projects }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    try {
      const user = await auth.me();
      if (gen !== sessionGen) return;
      rememberAccount(user);
      set({ session: "in", signedIn: true, user, authOpen: false, error: null });
      const listed = await listedP;
      if (gen !== sessionGen || listGen !== reloadGen || !get().signedIn) return;
      if (!listed.ok) {
        set({ error: messageOf(listed.cause, "Could not refresh the workspace.") });
        return;
      }
      commitList(set, get, listed.projects);
      await loadSecondary(listGen, set, get);
    } catch (cause) {
      if (gen !== sessionGen) return;
      if (cause instanceof ApiError && cause.isUnauthorized) {
        clearBoot();
        try {
          await auth.logout();
        } catch {
          /* The cookie is already rejected. */
        }
        if (gen !== sessionGen) return;
        set({
          session: "out",
          signedIn: false,
          user: null,
          projects: [],
          events: [],
          services: [],
          notices: [],
          usage: null,
          error: null,
          listed: false,
        });
        return;
      }
      set({ error: messageOf(cause, "Could not reach Runex.") });
    }
  },

  reload: async () => {
    if (!get().signedIn) return;
    const gen = ++reloadGen;
    try {
      const listed = await projectApi.list();
      if (gen !== reloadGen || !get().signedIn) return;
      commitList(set, get, listed);
      await loadSecondary(gen, set, get);
    } catch (cause) {
      if (gen !== reloadGen) return;
      if (cause instanceof ApiError && cause.isUnauthorized) {
        set({ session: "out", signedIn: false, user: null, authOpen: true });
        return;
      }
      set({ error: messageOf(cause, "Could not refresh the workspace.") });
    }
  },

  login: async (login, password) => {
    const parsed = signInSchema.safeParse({ login, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] ? String(issue.path[0]) : undefined;
      return { message: issue?.message ?? "Check those details.", field };
    }
    set({ busy: true, error: null });
    try {
      const user = await auth.login(parsed.data);
      rememberAccount(user);
      set({ session: "in", signedIn: true, user, authOpen: false, busy: false });
      await get().reload();
      return null;
    } catch (cause) {
      set({ busy: false });
      return authFailure(cause, "Could not sign in.");
    }
  },

  register: async (input) => {
    const parsed = signUpSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] ? String(issue.path[0]) : undefined;
      return { message: issue?.message ?? "Check those details.", field };
    }
    set({ busy: true, error: null });
    try {
      const user = await auth.register(parsed.data);
      rememberAccount(user);
      set({ session: "in", signedIn: true, user, authOpen: false, busy: false });
      await get().reload();
      return null;
    } catch (cause) {
      set({ busy: false });
      return authFailure(cause, "Could not create the account.");
    }
  },

  logout: async () => {
    try {
      await auth.logout();
    } catch {
      // A missing session is already signed out.
    }
    sessionGen += 1;
    reloadGen += 1;
    clearBoot();
    set({
      session: "out",
      signedIn: false,
      user: null,
      projects: [],
      events: [],
      services: [],
      notices: [],
      usage: null,
      deployOpen: false,
      selectedIds: [],
      openId: null,
      authOpen: false,
      creating: false,
      removing: false,
      busy: false,
      listed: false,
      listView: "grid",
    });
  },

  setNav: (activeNav) => {
    rememberShell({ activeNav, openId: null, openName: "" });
    set({
      activeNav,
      selectedIds: [],
      openId: null,
      deployOpen: activeNav === "projects" ? get().deployOpen : false,
    });
  },

  toggleSelected: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    })),

  toggleAll: (ids) =>
    set((state) => {
      const allSelected = ids.length > 0 && ids.every((id) => state.selectedIds.includes(id));
      return { selectedIds: allSelected ? [] : ids };
    }),

  clearSelected: () => set({ selectedIds: [] }),

  toggleSort: () =>
    set((state) => {
      const sort = state.sort === "newest" ? "oldest" : "newest";
      rememberShell({ sort });
      return { sort };
    }),

  setListView: (listView) => {
    rememberShell({ listView });
    set({ listView });
  },

  setDeployOpen: (deployOpen) => set({ deployOpen }),
  setAuthOpen: (authOpen) => set({ authOpen }),

  createProject: async (name) => {
    const now = new Date().toISOString();
    const id = draftId();
    const draft: ProjectWithNodes = {
      id,
      name: name.trim(),
      subtitle: "Untitled workspace",
      status: "idle",
      environment: "production",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: draftId(),
          projectId: id,
          kind: "service",
          title: name.trim(),
          caption: "Service",
          x: 0,
          y: 0,
          status: "idle",
        },
      ],
    };
    placeProject(get().user?.id, id);
    const opened = [draft, ...get().projects.filter((item) => item.id !== id)];
    publishProjects(opened);
    rememberShell({ openId: id, openName: draft.name, activeNav: "projects" });
    set({
      ...paint(opened, get().events, readSeen()),
      deployOpen: false,
      activeNav: "projects",
      selectedIds: [],
      freshId: id,
      openId: id,
      creating: false,
      listed: true,
      error: null,
    });
    try {
      const bundle = await projectApi.create({ name });
      const project: ProjectWithNodes = { ...bundle.project, nodes: bundle.nodes ?? [] };
      placeProject(get().user?.id, project.id);
      rememberSnapshot(project, project.nodes);
      set((state) => {
        const projects = [project, ...state.projects.filter((item) => item.id !== id && item.id !== project.id)];
        const staying = state.openId === id || state.openId === project.id;
        const openId = staying ? project.id : state.openId;
        if (staying) rememberShell({ openId: project.id, openName: project.name, activeNav: "projects" });
        publishProjects(projects);
        return {
          ...paint(projects, state.events, readSeen()),
          openId,
          freshId: staying ? project.id : state.freshId,
          creating: false,
          error: null,
        };
      });
      return null;
    } catch (cause) {
      const message = messageOf(cause, "Could not create the project.");
      set((state) => {
        const projects = state.projects.filter((item) => item.id !== id);
        const openId = state.openId === id ? null : state.openId;
        rememberShell({ openId, openName: "" });
        publishProjects(projects);
        return {
          ...paint(projects, state.events, readSeen()),
          openId,
          creating: false,
          error: message,
        };
      });
      return message;
    }
  },

  removeProjects: async (ids) => {
    if (ids.length === 0) return "Select a project.";
    const snapshot = get().projects;
    const openBefore = get().openId;
    for (const id of ids) hideProject(id);
    reloadGen += 1;
    set((state) => {
      const openId = state.openId && ids.includes(state.openId) ? null : state.openId;
      if (openId !== state.openId) rememberShell({ openId, openName: "" });
      const projects = state.projects.filter((project) => !ids.includes(project.id));
      publishProjects(projects);
      return {
        ...paint(
          projects,
          state.events.filter((event) => !ids.includes(event.projectId)),
          readSeen(),
        ),
        selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
        removing: false,
        openId,
        error: null,
      };
    });
    try {
      const result = await projectApi.bulkRemove(ids);
      const failed = new Set((result.failed ?? []).map((item) => item.id));
      for (const id of ids) {
        if (failed.has(id)) showProject(id);
      }
      if (failed.size > 0) {
        const back = snapshot.filter((project) => failed.has(project.id));
        set((state) => {
          const projects = [...back, ...state.projects.filter((project) => !failed.has(project.id))];
          publishProjects(projects);
          return {
            ...paint(projects, state.events, readSeen()),
            error: result.failed?.[0]?.error ?? null,
          };
        });
      }
      void get().reload();
      return result.failed?.length ? result.failed[0]?.error ?? "Some projects could not be deleted." : null;
    } catch (cause) {
      for (const id of ids) showProject(id);
      const openId = openBefore && ids.includes(openBefore) ? openBefore : get().openId;
      publishProjects(snapshot);
      set({
        ...paint(snapshot, get().events, readSeen()),
        openId,
        removing: false,
      });
      return messageOf(cause, "Could not delete those projects.");
    }
  },

  openProject: (id) => {
    const service = get().services.find((item) => item.id === id);
    const projectId = service?.projectId ?? id;
    if (!projectId || projectId.startsWith("deploy:")) return;
    if (service?.scope === "activity" && !get().projects.some((project) => project.id === projectId)) return;
    const name =
      get().projects.find((project) => project.id === projectId)?.name ??
      (service?.scope === "production" ? service.name : "");
    rememberShell({ openId: projectId, openName: name, activeNav: "projects" });
    set({
      openId: projectId,
      deployOpen: false,
      selectedIds: [],
      activeNav: "projects",
    });
  },

  markNoticeRead: (id) => {
    const seen = readSeen();
    seen.add(id);
    writeSeen(seen);
    set((state) => ({
      notices: state.notices.map((notice) =>
        notice.id === id ? { ...notice, unread: false } : notice,
      ),
    }));
  },

  replaceProject: (project) => {
    if (!project?.id || isDraftId(project.id)) return;
    const next = withoutHidden(project);
    const current = get().projects.find((item) => item.id === next.id);
    // The stream hands over a new object on every event, including the ones
    // that changed nothing. Writing that through notified every subscriber and
    // the stream effect ran again, which is the update loop that took the
    // dashboard down while a project was open.
    if (current && projectFingerprint(current) === projectFingerprint(next)) return;
    set((state) => {
      const exists = state.projects.some((item) => item.id === next.id);
      const projects = exists
        ? state.projects.map((item) => (item.id === next.id ? { ...item, ...next, nodes: next.nodes } : item))
        : [next, ...state.projects];
      const events = withLiveDeploys(state.events, next);
      publishProjects(projects);
      return paint(projects, events, readSeen());
    });
  },
}));
