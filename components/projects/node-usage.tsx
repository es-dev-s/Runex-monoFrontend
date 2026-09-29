"use client";

import type { NodeUsage } from "@/lib/api";
import { UsageChart, UsageMeter } from "@/components/usage/usage-chart";
import { formatBytes, formatMB, usageRatio } from "@/lib/usage";

export function NodeUsageCard({ live, status }: { live?: NodeUsage | null; status?: string }) {
  if (!live) {
    const measuring = status === "running" || status === "building";
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6">
        <p className="max-w-[18rem] text-center text-[12px] leading-relaxed tracking-tight text-fg/45">
          {measuring
            ? "Waiting for the first live sample. Runex measures this node about every 12 seconds."
            : "Memory and disk appear here once this service is running."}
        </p>
      </div>
    );
  }

  const ramAlloc = live.memoryMb * 1024 * 1024;
  const diskAlloc = live.diskMb * 1024 * 1024;
  const series = live.series ?? [];
  const ramPct = Math.round(usageRatio(live.ramUsedBytes, ramAlloc) * 100);
  const diskPct = Math.round(usageRatio(live.diskUsedBytes, diskAlloc) * 100);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">Live usage</h3>
        <span className="inline-flex items-center gap-1.5 text-[11px] tracking-tight text-fg/35">
          <span className="size-1.5 rounded-full bg-[#3DDC97]" />
          Live
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed tracking-tight text-fg/40">
        Charts are scaled to this node’s allocation, so a small bar means a small share of the reserved RAM or disk.
      </p>

      <div className="mt-4 flex flex-col gap-3.5">
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[12px] tracking-tight text-fg/45">Memory</span>
            <span className="font-mono text-[11px] tabular-nums text-fg/55">
              {formatBytes(live.ramUsedBytes)}
              <span className="text-fg/30"> / {formatMB(live.memoryMb)}</span>
              <span className="ml-2 text-fg/30">{ramPct}%</span>
            </span>
          </div>
          <UsageMeter used={live.ramUsedBytes} allocated={ramAlloc} tone="ram" />
        </div>
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[12px] tracking-tight text-fg/45">Disk</span>
            <span className="font-mono text-[11px] tabular-nums text-fg/55">
              {formatBytes(live.diskUsedBytes)}
              <span className="text-fg/30"> / {formatMB(live.diskMb)}</span>
              <span className="ml-2 text-fg/30">{diskPct}%</span>
            </span>
          </div>
          <UsageMeter used={live.diskUsedBytes} allocated={diskAlloc} tone="disk" />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg bg-black/[0.03] ring-1 ring-black/[0.06]">
        <div className="flex items-center justify-between px-3 pt-3">
          <p className="text-[12px] font-medium tracking-tight text-fg/80">Memory trend</p>
        </div>
        {series.length > 0 ? (
          <UsageChart series={series} metric="ram" allocated={ramAlloc} className="h-[168px]" />
        ) : (
          <p className="px-3 py-8 text-[12px] tracking-tight text-fg/32">Waiting for the first sample.</p>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg bg-black/[0.03] ring-1 ring-black/[0.06]">
        <div className="flex items-center justify-between px-3 pt-3">
          <p className="text-[12px] font-medium tracking-tight text-fg/80">Disk trend</p>
        </div>
        {series.length > 0 ? (
          <UsageChart series={series} metric="disk" allocated={diskAlloc} className="h-[168px]" />
        ) : (
          <p className="px-3 py-8 text-[12px] tracking-tight text-fg/32">Waiting for the first sample.</p>
        )}
      </div>

      {live.cpuPercent > 0 ? (
        <p className="mt-3 font-mono text-[11px] tabular-nums text-fg/32">CPU {live.cpuPercent.toFixed(1)}%</p>
      ) : null}
    </div>
  );
}
