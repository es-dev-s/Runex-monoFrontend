"use client";

import { ApiError, projects as projectsApi, type NodeUsage, type ServiceNode, type UsageLimits } from "@/lib/api";
import { MenuSelect } from "@/components/ui/menu-select";
import { UsageMeter } from "@/components/usage/usage-chart";
import { useConfirm } from "@/hooks/use-confirm";
import { DISK_PRESETS_MB, formatBytes, formatMB, MEMORY_PRESETS_MB, presetOptions, usageRatio } from "@/lib/usage";

const DEFAULT_LIMITS: UsageLimits = {
  minMemoryMb: 64,
  maxMemoryMb: 4096,
  minDiskMb: 128,
  maxDiskMb: 20480,
};

export function ServiceAllocation({
  projectId,
  node,
  live,
  limits,
  onChanged,
}: {
  projectId: string;
  node: ServiceNode;
  live?: NodeUsage | null;
  limits?: UsageLimits | null;
  onChanged: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const cap = limits ?? DEFAULT_LIMITS;
  const memoryMb = node.memoryMb || live?.memoryMb || (node.kind === "redis" ? 128 : 512);
  const diskMb = node.diskMb || live?.diskMb || (node.kind === "postgresql" ? 2048 : node.kind === "redis" ? 512 : 1024);
  const ramUsed = live?.ramUsedBytes ?? 0;
  const diskUsed = live?.diskUsedBytes ?? 0;
  const ramAlloc = memoryMb * 1024 * 1024;
  const diskAlloc = diskMb * 1024 * 1024;

  const ramOptions = presetOptions(MEMORY_PRESETS_MB, memoryMb, cap.minMemoryMb, cap.maxMemoryMb);
  const diskOptions = presetOptions(DISK_PRESETS_MB, diskMb, cap.minDiskMb, cap.maxDiskMb);

  function changeMemory(next: number) {
    if (next === memoryMb) return;
    confirm({
      title: `Set RAM to ${formatMB(next)}?`,
      detail: `This isolates ${node.title || "this node"} with a hard memory cgroup. Applied immediately on the running container. If usage stays over the new limit, Runex stops this node automatically.`,
      confirmLabel: "Update RAM",
      action: async () => {
        await projectsApi.updateNode(projectId, node.id, { memoryMb: next });
        onChanged();
      },
    });
  }

  function changeDisk(next: number) {
    if (next === diskMb) return;
    const shrinking = next < diskMb && diskUsed > next * 1024 * 1024;
    confirm({
      title: `Set disk to ${formatMB(next)}?`,
      detail: shrinking
        ? `This node is already using ${formatBytes(diskUsed)}. Free data before lowering the quota.`
        : `Runex reserves ${formatMB(next)} of disk for this node. Going over that quota stops this node automatically.`,
      confirmLabel: shrinking ? "Can't shrink" : "Update disk",
      tone: shrinking ? "danger" : "neutral",
      action: async () => {
        if (shrinking) throw new ApiError(409, "disk_in_use", "Free data before lowering the quota.");
        await projectsApi.updateNode(projectId, node.id, { diskMb: next });
        onChanged();
      },
    });
  }

  return (
    <section className="mt-6">
      {dialog}
      <p className="text-[11px] font-medium tracking-tight text-fg/35 uppercase">Allocation</p>
      <p className="mt-1.5 text-[12px] leading-relaxed tracking-tight text-fg/42">
        Isolated RAM and disk for this node only. Other services and databases keep their own limits.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[12px] font-medium tracking-tight text-fg/60">RAM</span>
          <MenuSelect
            compact
            ariaLabel="RAM allocation"
            value={String(memoryMb)}
            options={ramOptions}
            onChange={(value) => changeMemory(Number(value))}
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1.5 block text-[12px] font-medium tracking-tight text-fg/60">Disk</span>
          <MenuSelect
            compact
            ariaLabel="Disk allocation"
            value={String(diskMb)}
            options={diskOptions}
            onChange={(value) => changeDisk(Number(value))}
          />
        </label>
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        <AllocRow
          label="Memory"
          used={ramUsed}
          allocated={ramAlloc}
          tone="ram"
          hint={`${formatBytes(ramUsed)} of ${formatMB(memoryMb)}`}
        />
        <AllocRow
          label="Disk"
          used={diskUsed}
          allocated={diskAlloc}
          tone="disk"
          hint={`${formatBytes(diskUsed)} of ${formatMB(diskMb)}`}
        />
      </div>
    </section>
  );
}

function AllocRow({
  label,
  used,
  allocated,
  tone,
  hint,
}: {
  label: string;
  used: number;
  allocated: number;
  tone: "ram" | "disk";
  hint: string;
}) {
  const pct = Math.round(usageRatio(used, allocated) * 100);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12px] tracking-tight text-fg/45">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-fg/55">
          {hint}
          <span className="ml-2 text-fg/30">{pct}%</span>
        </span>
      </div>
      <UsageMeter used={used} allocated={allocated} tone={tone} />
    </div>
  );
}
