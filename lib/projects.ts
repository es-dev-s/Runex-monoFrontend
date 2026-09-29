import type { ProjectStatus, ServiceNode } from "@/lib/api";

export function projectHref(id: string) {
  return `/deployments/${encodeURIComponent(id)}`;
}

/**
 * Loopback address of a container published on this machine.
 * Only used when the service has no platform hostname yet.
 */
export function localServiceURL(node: { status?: string | null; port?: number | null }) {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return "";
  if (node.status !== "running" || !node.port) return "";
  return `http://127.0.0.1:${node.port}`;
}

/** Public app URLs are origins, or /apps/<name> on the dashboard host. */
export function servicePublicUrl(url: string) {
  const raw = url.trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (parsed.protocol === "http:" && publicWebHost(parsed.hostname)) {
      parsed.protocol = "https:";
    }
    const match = parsed.pathname.match(/^\/apps\/([^/]+)/i);
    if (match) {
      return `${parsed.origin}/apps/${match[1]}`;
    }
    return parsed.origin;
  } catch {
    return raw.replace(/\/deployments(\/.*)?$/i, "") || raw;
  }
}

function publicWebHost(host: string) {
  const name = host.toLowerCase();
  if (!name || name === "localhost" || name.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return false;
  return name.includes(".");
}

/** Hostname shown on canvas nodes — short enough to scan at a glance. */
export function serviceHost(url?: string | null) {
  if (!url) return "";
  const publicUrl = servicePublicUrl(url);
  try {
    const parsed = new URL(publicUrl.includes("://") ? publicUrl : `https://${publicUrl}`);
    if (parsed.pathname.startsWith("/apps/")) {
      return parsed.pathname.replace(/\/+$/, "").replace(/^\//, "");
    }
    return parsed.host;
  } catch {
    return publicUrl.replace(/^https?:\/\//, "");
  }
}

/**
 * Presentation metadata for a backend status value. Colours are literal rather
 * than Tailwind classes because several are applied as inline styles on the
 * canvas, where dynamic class names would be purged.
 */
export type StatusTone = {
  label: string;
  dot: string;
  /** True while a deploy is in flight, so the UI can animate. */
  busy: boolean;
};

const STATUS_TONES: Record<ProjectStatus, StatusTone> = {
  running: { label: "Running", dot: "#3DDC97", busy: false },
  building: { label: "Building", dot: "#F5C451", busy: true },
  failed: { label: "Failed", dot: "#FF6B6B", busy: false },
  ready: { label: "Ready to deploy", dot: "#6B9CFF", busy: false },
  stopped: { label: "Stopped", dot: "rgba(0,0,0,0.35)", busy: false },
  idle: { label: "Idle", dot: "rgba(0,0,0,0.28)", busy: false },
};

export function statusTone(status: string | null | undefined): StatusTone {
  return STATUS_TONES[(status ?? "idle") as ProjectStatus] ?? STATUS_TONES.idle;
}

/** Which glyph represents a node. Resolved to JSX by `ServiceIcon`. */
export type IconKind =
  | "web"
  | "server"
  | "worker"
  | "database"
  | "cache"
  | "container"
  | "github"
  | "archive";

/**
 * Classifies a node for display. Framework is checked before kind because
 * "service" covers every user codebase, so it is the framework that actually
 * distinguishes one from another.
 */
export function iconKind(node: ServiceNode): IconKind {
  if (node.kind === "postgresql") return "database";
  if (node.kind === "redis") return "cache";
  if (node.kind === "container" || node.kind === "railway") return "container";
  if (node.sourceType === "github") return "github";
  if (node.sourceType === "zip") return "archive";

  const framework = (node.framework ?? "").toLowerCase();
  if (framework.includes("next") || framework.includes("vite") || framework === "html") return "web";
  if (
    framework === "go" ||
    framework === "rust" ||
    framework.includes("fastapi") ||
    framework.includes("node")
  ) {
    return "server";
  }
  if (framework.includes("worker")) return "worker";
  return "web";
}

/** A service slot the user has not deployed anything into yet. */
export function isEmptySlot(node: ServiceNode) {
  return node.kind === "service" && !node.sourceType && node.status === "idle";
}

export function serviceLabel(node: ServiceNode) {
  return node.title?.trim() || node.caption?.trim() || node.id;
}

/** Quiet caption under the node title. Empty slots keep the name and say they are waiting. */
export function serviceCaption(node: ServiceNode) {
  if (isEmptySlot(node)) return "Not deployed";
  const tone = statusTone(node.status);
  if (isDatabaseNode(node) && node.status === "building") return "Starting";
  if ((node.status === "idle" || node.status === "ready") && node.kind === "postgresql") return "Postgres";
  if ((node.status === "idle" || node.status === "ready") && node.kind === "redis") return "Redis";
  return tone.label;
}

/**
 * Icon well. The mark keeps its brand — Postgres blue, Redis red, GitHub neutral.
 * Running, failed, and building stay on the status dot, except a failure or an
 * in-progress build, which takes the well so the problem is obvious.
 */
export function nodeMarkClass(node: ServiceNode) {
  if (isEmptySlot(node)) return "bg-fg/[0.04] text-fg/45";
  if (node.status === "failed") return "bg-[#BE123C]/10 text-[#BE123C]";
  if (node.status === "building") return "bg-[#B45309]/16 text-[#B45309]";
  if (node.kind === "postgresql") return "bg-[#336791]/12 text-[#336791]";
  if (node.kind === "redis") return "bg-[#DC382C]/12 text-[#DC382C]";
  if (node.sourceType === "github") return "bg-fg/[0.08] text-fg";
  return "bg-fg/[0.05] text-fg/70";
}

/** Copy for the redeploy confirmation — GitHub clones fresh, zip rebuilds the saved tree. */
export function redeployDetail(node: ServiceNode) {
  if (node.sourceType === "github") {
    const repo = node.sourceRef || "GitHub";
    const branch = node.githubBranch || "the default branch";
    return `Runex will clone a fresh copy of ${repo} (${branch}), rebuild the isolated container from scratch, and bring it online.`;
  }
  return "Runex will rebuild this service from the saved codebase and bring it online.";
}

/** Counts only services that are actually serving traffic. */
export function runningCount(nodes: ServiceNode[]) {
  return nodes.filter((node) => node.status === "running").length;
}

function previewKind(node: ServiceNode) {
  if (node.kind === "postgresql" || node.kind === "redis") return 1;
  return 0;
}

/**
 * Placed nodes on a project card, in an order that does not follow status.
 * A deploy finishing must not swap two names above and below each other.
 */
export function cardPreviewNodes(nodes: ServiceNode[]) {
  return nodes
    .filter(isPlacedNode)
    .slice()
    .sort(
      (a, b) =>
        previewKind(a) - previewKind(b) ||
        serviceLabel(a).localeCompare(serviceLabel(b)) ||
        a.id.localeCompare(b.id),
    );
}

/** Services the user has given a codebase. Idle empty slots are hidden. */
export function isPlacedNode(node: ServiceNode) {
  return !isEmptySlot(node);
}

export function isDatabaseNode(node: Pick<ServiceNode, "kind">) {
  return node.kind === "postgresql" || node.kind === "redis";
}

/** Client-only id painted before the control plane has answered. */
export function isDraftId(id: string | null | undefined) {
  return Boolean(id && id.startsWith("draft_"));
}

export function needsSource(nodes: ServiceNode[]) {
  const services = nodes.filter((node) => node.kind === "service");
  return services.length > 0 && services.every(isEmptySlot) && !nodes.some(isPlacedNode);
}
