import type { NodeKind, ProjectStatus, ServiceNode } from "@/lib/api";
import { colorFor } from "@/lib/inbox/present";
import { statusSchema, type Service } from "@/lib/inbox/schema";

export const BOOT_COOKIE = "runex_boot";

export type BootNode = {
  id: string;
  kind: string;
  title: string;
  status: string;
  placed: boolean;
  source?: string;
};

export type BootProject = {
  id: string;
  name: string;
  status: string;
  time: string;
  detail: string;
  nodes?: BootNode[];
};

export type Boot = {
  known: boolean;
  name: string;
  username: string;
  openId: string | null;
  openName: string;
  activeNav: string;
  sort: "newest" | "oldest";
  listView: "list" | "grid";
  /** True only after the user picks a project layout. Otherwise Grid is the default. */
  listViewSet: boolean;
  projects: BootProject[];
};

const NAVS = new Set([
  "projects",
  "activity",
  "usage",
  "people",
  "general",
  "plans",
  "billing",
  "audit",
  "workspace",
  "pinned",
  "servers",
  "team",
  "logs",
  "settings",
]);

export function emptyBoot(known: boolean): Boot {
  return {
    known,
    name: "",
    username: "",
    openId: null,
    openName: "",
    activeNav: "projects",
    sort: "newest",
    listView: "grid",
    listViewSet: false,
    projects: [],
  };
}

export function parseBoot(raw: string | undefined, known: boolean): Boot {
  const boot = emptyBoot(known);
  if (!raw) return boot;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<Boot>;
    if (typeof parsed.name === "string") boot.name = parsed.name.slice(0, 80);
    if (typeof parsed.username === "string") boot.username = parsed.username.slice(0, 80);
    if (typeof parsed.openId === "string" && parsed.openId) boot.openId = parsed.openId.slice(0, 80);
    if (typeof parsed.openName === "string") boot.openName = parsed.openName.slice(0, 80);
    if (typeof parsed.activeNav === "string" && NAVS.has(parsed.activeNav)) boot.activeNav = parsed.activeNav;
    if (parsed.sort === "oldest") boot.sort = "oldest";
    if (parsed.listViewSet === true && (parsed.listView === "list" || parsed.listView === "grid")) {
      boot.listView = parsed.listView;
      boot.listViewSet = true;
    }
    if (Array.isArray(parsed.projects)) {
      boot.projects = parsed.projects.slice(0, 8).flatMap((item) => {
        if (!item || typeof item.id !== "string" || typeof item.name !== "string") return [];
        return [
          {
            id: item.id.slice(0, 80),
            name: item.name.slice(0, 80),
            status: typeof item.status === "string" ? item.status.slice(0, 24) : "idle",
            time: typeof item.time === "string" ? item.time.slice(0, 24) : "",
            detail: typeof item.detail === "string" ? item.detail.slice(0, 80) : "",
            nodes: Array.isArray(item.nodes) ? parseBootNodes(item.nodes) : undefined,
          },
        ];
      });
    }
  } catch {
    return emptyBoot(known);
  }
  return boot;
}

function parseBootNodes(value: unknown): BootNode[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((node) => {
    if (!node || typeof node !== "object") return [];
    const item = node as Partial<BootNode>;
    if (typeof item.id !== "string" || typeof item.kind !== "string") return [];
    return [
      {
        id: item.id.slice(0, 40),
        kind: item.kind.slice(0, 16),
        title: typeof item.title === "string" ? item.title.slice(0, 24) : "",
        status: typeof item.status === "string" ? item.status.slice(0, 16) : "idle",
        placed: item.placed !== false,
        source: item.source === "github" || item.source === "zip" ? item.source : "",
      },
    ];
  });
}

function fitBoot(boot: Omit<Boot, "known">, title: number, nodes: number, detail: number): Omit<Boot, "known"> {
  return {
    ...boot,
    projects: boot.projects.slice(0, 8).map((project) => ({
      ...project,
      detail: detail > 0 ? project.detail.slice(0, detail) : "",
      nodes: (project.nodes ?? []).slice(0, nodes).map((node) => ({
        ...node,
        title: node.title.slice(0, title),
      })),
    })),
  };
}

export function writeBootCookie(boot: Omit<Boot, "known">) {
  if (typeof document === "undefined") return;
  const attempts = [boot, fitBoot(boot, 16, 4, 24), fitBoot(boot, 12, 3, 0), fitBoot(boot, 10, 2, 0)];
  let raw = encodeURIComponent(JSON.stringify(attempts[attempts.length - 1]));
  for (const payload of attempts) {
    const next = encodeURIComponent(JSON.stringify(payload));
    if (next.length <= 3600) {
      raw = next;
      break;
    }
  }
  document.cookie = `${BOOT_COOKIE}=${raw}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function clearBootCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${BOOT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

const KINDS = new Set(["service", "railway", "postgresql", "redis", "container"]);
const STATUSES = new Set(["idle", "building", "running", "failed", "ready", "stopped"]);

export function faceNodes(projectId: string, nodes: BootNode[]): ServiceNode[] {
  return nodes.map((node) => ({
    id: node.id,
    projectId,
    kind: (KINDS.has(node.kind) ? node.kind : "service") as NodeKind,
    title: node.title || "Service",
    caption: "",
    x: 0,
    y: 0,
    status: (STATUSES.has(node.status) ? node.status : "idle") as ProjectStatus,
    sourceType:
      node.source === "github" || node.source === "zip"
        ? node.source
        : node.placed && node.kind === "service"
          ? "github"
          : null,
    createdAt: "",
    updatedAt: "",
  }));
}

export function bootServices(projects: BootProject[]): Service[] {
  return projects.map((project, index) => {
    const status = statusSchema.safeParse(project.status);
    return {
      id: project.id,
      projectId: project.id,
      name: project.name,
      detail: project.detail || "production",
      time: project.time,
      scope: "production",
      status: status.success ? status.data : "idle",
      pinned: false,
      target: "web",
      mark: (project.name.trim()[0] ?? "R").toUpperCase(),
      color: colorFor(project.id),
      order: projects.length - index,
    };
  });
}
