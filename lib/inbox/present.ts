import type { Deployment, ProjectStatus, ProjectWithNodes, UsageSnapshot } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import type { Service, ServiceStatus } from "./schema";

const COLORS = ["#FD4E00", "#1F1F1F", "#5B8DEF", "#0F766E", "#7C6BF2", "#334155", "#C2410C"];

export function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function mapStatus(status: ProjectStatus | string | null | undefined): ServiceStatus {
  switch (status) {
    case "ready":
    case "running":
      return "ready";
    case "building":
      return "building";
    case "failed":
      return "failed";
    case "stopped":
      return "stopped";
    case "idle":
      return "idle";
    default:
      return "queued";
  }
}

export function statusLabel(status: ServiceStatus) {
  switch (status) {
    case "ready":
      return "Ready";
    case "running":
      return "Running";
    case "building":
      return "Building";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "idle":
      return "Idle";
    default:
      return "Queued";
  }
}

export function statusColor(status: ServiceStatus) {
  switch (status) {
    case "ready":
    case "running":
      return "#1F9D55";
    case "building":
      return "#C2410C";
    case "failed":
      return "#E11D48";
    default:
      return "#6E6E73";
  }
}

function markOf(name: string) {
  const trimmed = name.trim();
  return (trimmed[0] ?? "R").toUpperCase();
}

export function projectToService(project: ProjectWithNodes): Service {
  const nodes = project.nodes ?? [];
  const primary = nodes.find((node) => node.kind === "service") ?? nodes[0];
  const status = mapStatus(primary?.status ?? project.status);
  const bits = [
    project.environment || "production",
    primary?.framework || project.framework,
    primary?.sourceRef || project.sourceRef,
    primary?.url || project.url,
  ].filter((bit): bit is string => Boolean(bit && String(bit).trim()));
  const onlyData =
    nodes.length > 0 && nodes.every((node) => node.kind === "postgresql" || node.kind === "redis");
  return {
    id: project.id,
    projectId: project.id,
    name: project.name,
    detail: bits.join(" · ") || project.subtitle || "Empty project",
    time: relativeTime(project.updatedAt),
    scope: "production",
    status,
    pinned: false,
    target: onlyData ? "server" : "web",
    mark: markOf(project.name),
    color: colorFor(project.id),
    order: Date.parse(project.updatedAt) || 0,
  };
}

export function deploymentToService(event: Deployment): Service {
  const name = event.serviceTitle || event.projectName || "Deployment";
  const status = mapStatus(event.status === "success" ? "ready" : event.status);
  const detail = [event.projectName, event.trigger, event.sourceRef, event.framework, event.error]
    .filter((bit): bit is string => Boolean(bit && String(bit).trim()))
    .join(" · ");
  return {
    id: `deploy:${event.id}`,
    projectId: event.projectId,
    name,
    detail: detail || event.sourceType || "Deployment",
    time: relativeTime(event.finishedAt || event.createdAt),
    scope: "activity",
    status,
    pinned: false,
    target: "web",
    mark: markOf(name),
    color: colorFor(event.projectId || event.id),
    order: Date.parse(event.createdAt) || 0,
  };
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function usageRatio(snapshot: UsageSnapshot | null) {
  const used = snapshot?.totals.ramUsedBytes ?? 0;
  const alloc = snapshot?.totals.ramAllocBytes ?? 0;
  if (alloc <= 0) return 0;
  return Math.min(1, used / alloc);
}
