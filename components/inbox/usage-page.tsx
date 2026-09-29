"use client";

import { PostgresMark } from "@/components/icons/postgres-mark";
import { RedisMark } from "@/components/icons/redis-mark";
import { useWorkspaceUsage } from "@/hooks/use-usage";
import type { NodeUsage, ProjectUsage, UsageSnapshot } from "@/lib/api";
import { usePlatformStore } from "@/lib/inbox/store";
import { rememberSelectedNode } from "@/lib/remember";
import { formatBytes, formatCpu } from "@/lib/usage";
import { belongsToWorkspace, useWorkspaces } from "@/lib/workspaces";
import { useEffect, useMemo, useState } from "react";
import { usePresentedChrome } from "./chrome";

/** Every account includes this much. Matches alloc.AccountMemoryMB / AccountDiskMB. */
const ACCOUNT_RAM = 1024 * 1024 * 1024;
const ACCOUNT_DISK = 5 * 1024 * 1024 * 1024;
const BURN = "#fd4e00";
const QUIET = "#d8d8dc";

type Consumer = {
  projectId: string;
  project: string;
  node: NodeUsage;
};

export function WorkspaceUsage() {
  const stored = usePlatformStore((state) => state.usage);
  const user = usePlatformStore((state) => state.user);
  const openProject = usePlatformStore((state) => state.openProject);
  const { name } = usePresentedChrome();
  const { active } = useWorkspaces(user?.id ?? "", name);
  const live = useWorkspaceUsage(true);
  const snapshot = live.data ?? stored;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live.data) return;
    usePlatformStore.setState({ usage: live.data });
  }, [live.data]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const projects = useMemo(() => {
    const list = snapshot?.projects ?? [];
    if (!user?.id) return list;
    return list.filter((project) => belongsToWorkspace(user.id, project.id, active.id));
  }, [active.id, snapshot?.projects, user?.id]);

  const totals = useMemo(() => sum(projects), [projects]);
  const consumers = useMemo(() => rank(projects), [projects]);
  const burning = useMemo(() => consumers.filter((item) => item.node.ramUsedBytes > 0), [consumers]);
  const running = consumers.filter((item) => item.node.status === "running").length;
  const open = (item: Consumer) => {
    rememberSelectedNode(item.projectId, item.node.id);
    openProject(item.projectId);
  };

  const pending = snapshot == null;
  const memoryValue = pending ? "—" : formatBytes(totals.ram);
  const diskValue = pending ? "—" : formatBytes(totals.disk);
  const cpuValue = pending ? "—" : formatCpu(totals.cpu);

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] tracking-[-0.011em] text-[#8e8e93]">1 GB memory · 5 GB disk</p>
        <p className="inline-flex shrink-0 items-center gap-1.5 text-[12px] tracking-[-0.006em] text-[#8e8e93] tabular-nums">
          <span className={`size-1.5 rounded-full ${!pending && ageSeconds(snapshot, now) < 20 ? "bg-[#047857]" : "bg-[#aeaeb2]"}`} />
          {freshness(snapshot, now)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-3">
        <Meter
          label="Memory"
          value={memoryValue}
          detail={pending ? "1 GB included" : room(totals.ram, ACCOUNT_RAM)}
          ratio={pending ? 0 : totals.ram / ACCOUNT_RAM}
          badge={pending ? undefined : `${Math.round((totals.ram / ACCOUNT_RAM) * 100)}%`}
        />
        <Meter
          label="Disk"
          value={diskValue}
          detail={pending ? "5 GB included" : room(totals.disk, ACCOUNT_DISK)}
          ratio={pending ? 0 : totals.disk / ACCOUNT_DISK}
          badge={pending ? undefined : `${Math.round((totals.disk / ACCOUNT_DISK) * 100)}%`}
        />
        <Meter
          label="CPU"
          value={cpuValue}
          detail={pending ? "Across services" : running === 1 ? "1 running" : `${running} running`}
          ratio={pending ? 0 : Math.min(1, totals.cpu / 100)}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-3 @min-[680px]:grid-cols-[minmax(0,1fr)_232px]">
        <section className="flex min-w-0 flex-col rounded-[18px] border border-[#ececec] bg-white px-4 pt-4 pb-3.5">
          <h2 className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">By service</h2>
          <ServiceBars rows={burning} pending={pending} onOpen={open} />
        </section>

        <section className="flex min-w-0 flex-col rounded-[18px] border border-[#ececec] bg-white px-4 pt-4 pb-4">
          <h2 className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">Included</h2>
          <Gauge used={pending ? 0 : totals.ram} quota={ACCOUNT_RAM} pending={pending} />
          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#f2f2f2] pt-3">
            <Figure label="In use" value={memoryValue} swatch={BURN} />
            <Figure label="Available" value={pending ? "—" : formatBytes(Math.max(0, ACCOUNT_RAM - totals.ram))} swatch={QUIET} />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[18px] border border-[#ececec] bg-white">
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
          <h2 className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">Services</h2>
          <p className="text-[12px] text-[#8e8e93] tabular-nums">
            {pending ? "—" : consumers.length === 0 ? "None" : String(consumers.length)}
          </p>
        </div>
        <Share used={burning} />
        {pending ? (
          <div className="mt-3 h-24 border-t border-[#f2f2f2]" />
        ) : consumers.length === 0 ? (
          <p className="border-t border-[#f2f2f2] px-4 py-8 text-[13px] text-[#8e8e93]">No services are running.</p>
        ) : (
          <div className="mt-3">
            <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_72px_52px_84px] gap-3 border-t border-[#f2f2f2] px-4 py-2 text-[12px] text-[#8e8e93]">
              <span>Project</span>
              <span>Service</span>
              <span className="text-right">Memory</span>
              <span className="text-right">CPU</span>
              <span className="text-right">Status</span>
            </div>
            <ul>
              {consumers.map((item) => (
                <li key={item.node.id} className="border-t border-[#f2f2f2]">
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="grid w-full grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_72px_52px_84px] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/[0.03]"
                  >
                    <span className="truncate text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">{item.project}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] tracking-[-0.011em] text-[#3a3a3c]">
                      <KindMark kind={item.node.kind} />
                      <span className="truncate">{item.node.title || "Service"}</span>
                    </span>
                    <span className="text-right text-[13px] text-[#1d1d1f] tabular-nums">{formatBytes(item.node.ramUsedBytes)}</span>
                    <span className="text-right text-[12px] text-[#6e6e73] tabular-nums">{formatCpu(item.node.cpuPercent)}</span>
                    <span className="text-right">
                      <StatusPill status={item.node.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Meter({ label, value, detail, ratio, badge }: { label: string; value: string; detail: string; ratio: number; badge?: string }) {
  const width = Math.max(0, Math.min(100, ratio * 100));
  return (
    <section className="rounded-[18px] border border-[#ececec] bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] tracking-[-0.011em] text-[#8e8e93]">{label}</p>
        {badge ? <p className="text-[12px] text-[#8e8e93] tabular-nums">{badge}</p> : null}
      </div>
      <p className="mt-2 text-[26px] leading-none font-semibold tracking-[-0.04em] text-[#1d1d1f] tabular-nums">{value}</p>
      <p className="mt-1.5 text-[12px] text-[#8e8e93]">{detail}</p>
      <div
        className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-[#efefef]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
      >
        <div className="h-full rounded-full bg-[#fd4e00]" style={{ width: `${width}%` }} />
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-[#8e8e93]">
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Figure({ label, value, swatch }: { label: string; value: string; swatch: string }) {
  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-[12px] text-[#8e8e93]">
        <span className="size-1.5 rounded-full" style={{ background: swatch }} />
        {label}
      </p>
      <p className="mt-1 text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f] tabular-nums">{value}</p>
    </div>
  );
}

function Gauge({ used, quota, pending }: { used: number; quota: number; pending?: boolean }) {
  const ratio = quota > 0 ? used / quota : 0;
  const arc = Math.max(0, Math.min(1, ratio));
  const percent = pending ? "—" : `${Math.round(Math.max(0, ratio) * 100)}%`;
  return (
    <div className="relative mt-1">
      <svg viewBox="0 0 200 118" className="h-[132px] w-full" role="img" aria-label={pending ? "Memory" : `${percent} of included memory is in use`}>
        <path d={semicircle(1)} fill="none" stroke={QUIET} strokeWidth="12" strokeLinecap="round" />
        {arc > 0.004 ? (
          <path d={semicircle(arc)} fill="none" stroke={BURN} strokeWidth="12" strokeLinecap="round" />
        ) : null}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
        <p className="text-[32px] leading-none font-semibold tracking-[-0.045em] text-[#1d1d1f] tabular-nums">{percent}</p>
        <p className="mt-1 text-[12px] text-[#8e8e93]">of 1 GB</p>
      </div>
    </div>
  );
}

function ServiceBars({ rows, pending, onOpen }: { rows: Consumer[]; pending: boolean; onOpen: (item: Consumer) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const plotted = rows.slice(0, 12);
  if (pending) return <div className="mt-3 h-[188px]" />;
  if (plotted.length === 0) {
    return <p className="flex h-[188px] items-center text-[13px] text-[#8e8e93]">No services are running.</p>;
  }
  const max = Math.max(...plotted.map((row) => row.node.ramUsedBytes));
  const ceiling = niceCeiling(max);
  const hot = plotted.reduce((best, row, index) => (row.node.ramUsedBytes > plotted[best].node.ramUsedBytes ? index : best), 0);
  const active = hover ?? hot;
  const focus = plotted[active];

  return (
    <div className="mt-3 min-w-0" onMouseLeave={() => setHover(null)}>
      <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
        <div className="relative h-[156px] text-[11px] text-[#8e8e93] tabular-nums">
          <span className="absolute top-0 right-0">{formatBytes(ceiling, 0)}</span>
          <span className="absolute top-1/2 right-0 -translate-y-1/2">{formatBytes(ceiling / 2, 0)}</span>
        </div>
        <div className="relative h-[156px]">
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-[#ececec]" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-[#ececec]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-[#e4e4e7]" />
          <div className="absolute inset-0 flex items-end gap-1.5">
            {plotted.map((row, index) => {
              const ratio = Math.max(0, Math.min(1, row.node.ramUsedBytes / ceiling));
              const on = index === active;
              return (
                <button
                  key={row.node.id}
                  type="button"
                  aria-label={`${row.project} ${row.node.title || "Service"} ${formatBytes(row.node.ramUsedBytes)}`}
                  onMouseEnter={() => setHover(index)}
                  onFocus={() => setHover(index)}
                  onClick={() => onOpen(row)}
                  className="flex h-full min-w-0 flex-1 items-end"
                >
                  <span
                    className="block w-full rounded-t-[5px] transition-colors duration-150"
                    style={{
                      height: `${Math.max(ratio * 100, row.node.ramUsedBytes > 0 ? 1.5 : 0)}%`,
                      background: on ? BURN : QUIET,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] tracking-[-0.011em] text-[#1d1d1f]">
          <span className="font-medium">{focus.project}</span>
          <span className="text-[#8e8e93]"> · {focus.node.title || "Service"}</span>
        </p>
        <p className="shrink-0 text-[13px] tracking-[-0.011em] text-[#1d1d1f] tabular-nums">{formatBytes(focus.node.ramUsedBytes)}</p>
      </div>
    </div>
  );
}

function Share({ used }: { used: Consumer[] }) {
  const shown = used.slice(0, 6);
  const rest = used.slice(6).reduce((sumBytes, item) => sumBytes + item.node.ramUsedBytes, 0);
  const parts = [
    ...shown.map((item, index) => ({
      key: item.node.id,
      label: `${item.project} · ${item.node.title || "Service"}`,
      bytes: item.node.ramUsedBytes,
      color: BURN_SCALE[Math.min(index, BURN_SCALE.length - 1)],
    })),
    ...(rest > 0 ? [{ key: "rest", label: "Other", bytes: rest, color: "#c8c8cc" }] : []),
  ];
  return (
    <div className="px-4 pt-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[#efefef]" role="img" aria-label="Share of the included 1 GB">
        {parts.map((part) => (
          <div
            key={part.key}
            title={`${part.label} · ${formatBytes(part.bytes)}`}
            style={{ width: `${(part.bytes / ACCOUNT_RAM) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {parts.slice(0, 4).map((part) => (
          <Legend key={part.key} color={part.color} label={part.label} />
        ))}
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#8e8e93]">
          <span className="size-1.5 rounded-full bg-[#efefef] ring-1 ring-black/15" />
          Available
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const failed = status === "failed";
  const running = status === "running";
  const tone = failed
    ? "bg-[#fff6f5] text-[#b42318]"
    : running
      ? "bg-[#f3f3f5] text-[#047857]"
      : "bg-[#f3f3f5] text-[#8e8e93]";
  return <span className={`inline-flex rounded-full px-2 py-[3px] text-[11px] font-medium ${tone}`}>{labelStatus(status)}</span>;
}

function KindMark({ kind }: { kind: string }) {
  if (kind === "postgresql") {
    return (
      <span className="text-[#336791]">
        <PostgresMark size={12} />
      </span>
    );
  }
  if (kind === "redis") {
    return (
      <span className="text-[#DC382C]">
        <RedisMark size={12} />
      </span>
    );
  }
  return null;
}

const BURN_SCALE = ["#fd4e00", "#ff7a3d", "#ff9a6a", "#ffb894", "#e0a090", "#c8c8cc"];

function sum(projects: ProjectUsage[]) {
  return projects.reduce(
    (total, project) => ({
      ram: total.ram + project.ramUsedBytes,
      disk: total.disk + project.diskUsedBytes,
      cpu: total.cpu + project.cpuPercent,
    }),
    { ram: 0, disk: 0, cpu: 0 },
  );
}

function rank(projects: ProjectUsage[]): Consumer[] {
  const rows: Consumer[] = [];
  for (const project of projects) {
    for (const node of project.nodes ?? []) {
      rows.push({ projectId: project.id, project: project.name, node });
    }
  }
  rows.sort((a, b) => b.node.ramUsedBytes - a.node.ramUsedBytes || b.node.cpuPercent - a.node.cpuPercent);
  return rows;
}

function room(used: number, quota: number) {
  if (used > quota) return `${formatBytes(used - quota)} over`;
  return `${formatBytes(Math.max(0, quota - used))} available`;
}

function niceCeiling(bytes: number) {
  const mb = Math.max(bytes, 1) / (1024 * 1024);
  const padded = mb * 1.12;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 150, 200, 250, 500, 1000];
  const nice = steps.find((step) => step >= padded) ?? Math.ceil(padded / 100) * 100;
  return nice * 1024 * 1024;
}

function semicircle(ratio: number) {
  const cx = 100;
  const cy = 96;
  const r = 74;
  const start = Math.PI;
  const end = Math.PI * (1 - Math.max(0.001, Math.min(1, ratio)));
  const point = (angle: number) => [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
  const [x0, y0] = point(start);
  const [x1, y1] = point(end);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function labelStatus(status: string) {
  if (status === "running") return "Running";
  if (status === "building") return "Deploying";
  if (status === "failed") return "Failed";
  if (!status) return "Idle";
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function ageSeconds(snapshot: UsageSnapshot | null, now: number) {
  if (!snapshot?.generatedAt) return Number.POSITIVE_INFINITY;
  const then = new Date(snapshot.generatedAt).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.round((now - then) / 1000));
}

function freshness(snapshot: UsageSnapshot | null, now: number) {
  const seconds = ageSeconds(snapshot, now);
  if (!Number.isFinite(seconds)) return "Updating";
  if (seconds < 5) return "Live";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  return `Updated ${Math.round(seconds / 60)}m ago`;
}
