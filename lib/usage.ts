import type { NodeUsage, ProjectUsage, UsagePoint, UsageSnapshot } from "@/lib/api";

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Number(value.toFixed(digits));
  return `${rounded} ${units[unit]}`;
}

export function formatMB(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return "0 MB";
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

export function usageRatio(used: number, allocated: number): number {
  if (!allocated || allocated <= 0) return 0;
  return Math.min(1, Math.max(0, used / allocated));
}

/** Split `128 MB` so the number and unit can be styled separately. */
export function splitBytes(bytes: number, digits = 1): { value: string; unit: string } {
  const formatted = formatBytes(bytes, digits);
  const cut = formatted.lastIndexOf(" ");
  if (cut <= 0) return { value: formatted, unit: "" };
  return { value: formatted.slice(0, cut), unit: formatted.slice(cut + 1) };
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "0%";
  return `${Math.round(ratio * 100)}%`;
}

export function formatCpu(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return "0%";
  if (percent < 10) return `${percent.toFixed(1)}%`;
  return `${Math.round(percent)}%`;
}

export type HottestMetric = "ram" | "disk";

export function hottestShare(
  ramUsed: number,
  ramAlloc: number,
  diskUsed: number,
  diskAlloc: number,
): { metric: HottestMetric; ratio: number } {
  const ram = usageRatio(ramUsed, ramAlloc);
  const disk = usageRatio(diskUsed, diskAlloc);
  if (disk > ram) return { metric: "disk", ratio: disk };
  return { metric: "ram", ratio: ram };
}

/**
 * Headroom 0–100: how much of the reserved RAM and disk is still free,
 * using the tighter of the two so one hot resource cannot hide behind a quiet one.
 */
export function capacityScore(
  ramUsed: number,
  ramAlloc: number,
  diskUsed: number,
  diskAlloc: number,
): number {
  if (ramAlloc <= 0 && diskAlloc <= 0) return 100;
  const { ratio } = hottestShare(ramUsed, ramAlloc, diskUsed, diskAlloc);
  return Math.round(Math.max(0, Math.min(1, 1 - ratio)) * 100);
}

export function capacityHeadline(score: number): string {
  if (score >= 80) return "Plenty of room";
  if (score >= 55) return "Comfortable";
  if (score >= 25) return "Getting tight";
  if (score > 0) return "Near the limit";
  return "Over the limit";
}

export function peakCpu(nodes: NodeUsage[]): number {
  return nodes.reduce((max, node) => Math.max(max, node.cpuPercent || 0), 0);
}

export function runningNodeCount(nodes: NodeUsage[]): number {
  return nodes.filter((node) => node.status === "running").length;
}

/** A node that is actually consuming resources or in flight — idle unused copies stay off the Usage page. */
export function isLiveNode(node: NodeUsage): boolean {
  const status = (node.status ?? "").toLowerCase();
  if (status === "running" || status === "building") return true;
  return (node.ramUsedBytes || 0) > 0 || (node.diskUsedBytes || 0) > 0;
}

export function liveNodes(nodes: NodeUsage[] | undefined | null): NodeUsage[] {
  return (nodes ?? []).filter(isLiveNode);
}

export const MEMORY_PRESETS_MB = [128, 256, 512, 1024, 2048, 4096];
export const DISK_PRESETS_MB = [512, 1024, 2048, 5120, 10240, 20480];

export function presetOptions(
  presets: number[],
  current: number,
  min: number,
  max: number,
): { value: string; label: string }[] {
  const values = new Set<number>();
  for (const item of presets) {
    if (item >= min && item <= max) values.add(item);
  }
  if (current > 0) values.add(current);
  return [...values]
    .sort((a, b) => a - b)
    .map((item) => ({ value: String(item), label: formatMB(item) }));
}

export function mergeSeries(nodes: NodeUsage[]): UsagePoint[] {
  const max = Math.max(0, ...nodes.map((node) => node.series?.length ?? 0));
  if (max === 0) return [];
  const out: UsagePoint[] = [];
  for (let i = 0; i < max; i++) {
    let ram = 0;
    let disk = 0;
    let cpu = 0;
    let t = 0;
    for (const node of nodes) {
      const series = node.series ?? [];
      const point = series[series.length - max + i];
      if (!point) continue;
      ram += point.ram;
      disk += point.disk;
      cpu += point.cpu;
      t = point.t;
    }
    out.push({ t, ram, disk, cpu });
  }
  return out;
}

export function allNodes(snapshot: UsageSnapshot | null | undefined): NodeUsage[] {
  return snapshot?.projects?.flatMap((project) => project.nodes ?? []) ?? [];
}

export function findNodeUsage(snapshot: UsageSnapshot | null | undefined, nodeId: string): NodeUsage | null {
  for (const project of snapshot?.projects ?? []) {
    const node = project.nodes?.find((item) => item.id === nodeId);
    if (node) return node;
  }
  return null;
}

export function formatClock(unix: number): string {
  if (!Number.isFinite(unix) || unix <= 0) return "";
  const date = new Date(unix * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function nodeAllocBytes(node: Pick<NodeUsage, "memoryMb" | "diskMb">, metric: "ram" | "disk"): number {
  return (metric === "ram" ? node.memoryMb : node.diskMb) * 1024 * 1024;
}

export function sumAllocBytes(nodes: NodeUsage[], metric: "ram" | "disk"): number {
  return nodes.reduce((sum, node) => sum + nodeAllocBytes(node, metric), 0);
}

export function sumUsedBytes(nodes: NodeUsage[], metric: "ram" | "disk"): number {
  return nodes.reduce((sum, node) => sum + (metric === "ram" ? node.ramUsedBytes : node.diskUsedBytes), 0);
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "postgresql":
      return "PostgreSQL";
    case "redis":
      return "Redis";
    case "service":
      return "Service";
    default:
      return kind;
  }
}

export function projectUsageOf(snapshot: UsageSnapshot | null | undefined, projectId: string): ProjectUsage | null {
  return snapshot?.projects?.find((item) => item.id === projectId) ?? null;
}
