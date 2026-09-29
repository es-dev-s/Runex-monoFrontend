"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import type { UsagePoint } from "@/lib/api";
import { formatBytes, formatClock } from "@/lib/usage";

export const RAM_TONE = "#6BA8FF";
export const DISK_TONE = "#3DDC97";
export const CPU_TONE = "#F5C451";
/** Brand-aligned premium orange for Memory/Disk trend charts (logo #FD4E00). */
export const TREND_ORANGE = "#FD4E00";
export const TREND_ORANGE_SOFT = "rgba(253,78,0,0.4)";
const RAM = RAM_TONE;
const DISK = DISK_TONE;

export const TONES = {
  ram: { color: RAM_TONE, glow: "rgba(107,168,255,0.42)", soft: "rgba(107,168,255,0.16)" },
  disk: { color: DISK_TONE, glow: "rgba(61,220,151,0.4)", soft: "rgba(61,220,151,0.16)" },
  cpu: { color: CPU_TONE, glow: "rgba(245,196,81,0.4)", soft: "rgba(245,196,81,0.16)" },
} as const;

const MAX_COLS = 48;
const Y_FRACS = [1, 0.5, 0] as const;

export function UsageChart({
  series,
  metric,
  allocated = 0,
  className,
}: {
  series: UsagePoint[];
  metric: "ram" | "disk";
  allocated?: number;
  className?: string;
}) {
  const gid = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const yTitle = metric === "ram" ? "Memory" : "Disk";

  const points = useMemo(() => {
    const clean = series.filter((item) => Number.isFinite(item.t) && item.t > 0);
    return downsample(clean, MAX_COLS);
  }, [series]);

  const values = useMemo(
    () => points.map((item) => (metric === "ram" ? item.ram : item.disk)),
    [metric, points],
  );
  const peak = values.length > 0 ? Math.max(0, ...values) : 0;
  const max = Math.max(1, allocated, peak);

  const columns = useMemo(
    () =>
      values.map((value, index) => {
        const clamped = Math.min(Math.max(0, value), max);
        return {
          value: clamped,
          ratio: clamped / max,
          t: points[index]?.t ?? 0,
        };
      }),
    [max, points, values],
  );

  const xTicks = useMemo(() => {
    if (columns.length === 0) return [];
    return tickIndexes(columns.length).map((index) => ({
      index,
      label: formatClock(columns[index].t),
    }));
  }, [columns]);

  // SVG viewBox geometry
  const vbW = 640;
  const vbH = 180;
  const padL = 0;
  const padR = 0;
  const padT = 10;
  const padB = 8;
  const innerW = vbW - padL - padR;
  const innerH = vbH - padT - padB;

  const coords = useMemo(() => {
    if (columns.length === 0) return [] as { x: number; y: number }[];
    if (columns.length === 1) {
      const y = padT + innerH * (1 - columns[0].ratio);
      return [
        { x: padL, y },
        { x: padL + innerW, y },
      ];
    }
    return columns.map((col, index) => ({
      x: padL + (index / (columns.length - 1)) * innerW,
      y: padT + innerH * (1 - col.ratio),
    }));
  }, [columns, innerH, innerW]);

  const linePath = useMemo(() => {
    if (coords.length === 0) return "";
    return coords
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
  }, [coords]);

  const areaPath = useMemo(() => {
    if (coords.length === 0) return "";
    const base = padT + innerH;
    const first = coords[0];
    const last = coords[coords.length - 1];
    return `${linePath} L${last.x.toFixed(2)} ${base} L${first.x.toFixed(2)} ${base} Z`;
  }, [coords, innerH, linePath]);

  const active = hover != null && hover >= 0 && hover < columns.length ? hover : null;
  const activeCol = active != null ? columns[active] : null;
  const activeCoord = active != null && coords.length > 0
    ? coords[Math.min(active, coords.length - 1)]
    : null;

  useEffect(() => {
    if (hover != null && hover >= columns.length) setHover(null);
  }, [columns.length, hover]);

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const el = plotRef.current;
    if (!el || columns.length === 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = event.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, x / rect.width));
    const index = Math.min(columns.length - 1, Math.max(0, Math.round(ratio * (columns.length - 1))));
    setHover(index);
  }

  function onPointerLeave() {
    setHover(null);
  }

  const tipLeft =
    active != null && columns.length > 0 ? `${((active + 0.5) / columns.length) * 100}%` : "50%";

  return (
    <div
      className={cn("relative flex w-full min-w-0 select-none overflow-hidden", className)}
      style={{ height: 168 }}
      role="img"
      aria-label={`${yTitle} used versus ${formatBytes(allocated || max)} reserved over time`}
    >
      <div className="flex w-9 shrink-0 flex-col justify-between pb-5 pt-1 pr-1.5 sm:w-10">
        {Y_FRACS.map((frac) => (
          <span key={frac} className="font-mono text-[9px] leading-none tabular-nums text-fg/28 sm:text-[10px]">
            {formatBytes(max * frac, 1)}
          </span>
        ))}
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          ref={plotRef}
          className="absolute inset-x-0 top-0 bottom-5 cursor-crosshair overflow-hidden"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          {columns.length === 0 ? (
            <div className="grid h-full w-full place-items-center text-[12px] tracking-tight text-fg/28">
              Waiting for samples
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${vbW} ${vbH}`}
              className="h-full w-full overflow-hidden"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TREND_ORANGE} stopOpacity="0.28" />
                  <stop offset="55%" stopColor={TREND_ORANGE} stopOpacity="0.08" />
                  <stop offset="100%" stopColor={TREND_ORANGE} stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`${gid}-stroke`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FFB087" />
                  <stop offset="50%" stopColor={TREND_ORANGE} />
                  <stop offset="100%" stopColor="#FD4E00" />
                </linearGradient>
              </defs>

              {Y_FRACS.map((frac) => {
                const y = padT + innerH * (1 - frac);
                return (
                  <line
                    key={frac}
                    x1={padL}
                    x2={padL + innerW}
                    y1={y}
                    y2={y}
                    stroke="rgba(0,0,0,0.08)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {areaPath ? <path d={areaPath} fill={`url(#${gid}-fill)`} /> : null}
              {linePath ? (
                <path
                  d={linePath}
                  fill="none"
                  stroke={`url(#${gid}-stroke)`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}

              {activeCoord ? (
                <>
                  <line
                    x1={activeCoord.x}
                    x2={activeCoord.x}
                    y1={padT}
                    y2={padT + innerH}
                    stroke="rgba(0,0,0,0.28)"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={activeCoord.x}
                    cy={activeCoord.y}
                    r="4"
                    fill="#1a1a1a"
                    stroke={TREND_ORANGE}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              ) : null}
            </svg>
          )}

          {active != null && activeCol ? (
            <div
              className="pointer-events-none absolute z-20 max-w-[calc(100%-0.5rem)]"
              style={{
                left: tipLeft,
                top: 6,
                transform: tooltipShift(active, columns.length),
              }}
            >
              <div className="min-w-[7.75rem] overflow-hidden rounded-lg bg-white text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]">
                <div className="h-[2px] w-full bg-accent" />
                <div className="px-2.5 py-2">
                  <p className="text-[10px] leading-none tracking-tight text-fg/45">
                    {formatChartDay(activeCol.t)}
                  </p>
                  <p className="mt-1.5 text-[14px] font-medium leading-none tracking-tight text-fg tabular-nums">
                    {formatShare(activeCol.value, max)}
                  </p>
                  <p className="mt-1.5 font-mono text-[10px] leading-none tabular-nums text-fg/40">
                    {formatBytes(activeCol.value)} / {formatBytes(max)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-end overflow-hidden">
          {xTicks.map((tick) => (
            <span
              key={`${tick.index}-${tick.label}`}
              className="absolute -translate-x-1/2 font-mono text-[9px] tabular-nums text-fg/28 sm:text-[10px]"
              style={{ left: `${((tick.index + 0.5) / Math.max(columns.length, 1)) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function tooltipShift(index: number, count: number): string {
  if (count <= 1) return "translateX(-50%)";
  const ratio = (index + 0.5) / count;
  if (ratio < 0.22) return "translateX(0)";
  if (ratio > 0.78) return "translateX(-100%)";
  return "translateX(-50%)";
}

function downsample(points: UsagePoint[], max: number): UsagePoint[] {
  if (points.length <= max) return points;
  const last = points.length - 1;
  const out: UsagePoint[] = [];
  let prev = -1;
  for (let i = 0; i < max; i += 1) {
    const idx = Math.round((i / (max - 1)) * last);
    if (idx === prev) continue;
    out.push(points[idx]);
    prev = idx;
  }
  if (out[out.length - 1] !== points[last]) out.push(points[last]);
  return out;
}

function tickIndexes(count: number): number[] {
  if (count <= 1) return [0];
  if (count === 2) return [0, 1];
  if (count <= 5) return Array.from({ length: count }, (_, i) => i);
  return [0, Math.round((count - 1) * 0.33), Math.round((count - 1) * 0.66), count - 1];
}


function formatShare(value: number, allocated: number): string {
  if (!(allocated > 0) || !Number.isFinite(value)) return "0%";
  const pct = Math.max(0, (value / allocated) * 100);
  if (pct <= 0) return "0%";
  if (pct < 10) return `${pct.toFixed(2)}%`;
  if (pct < 100) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

function formatChartDay(unix: number): string {
  if (!Number.isFinite(unix) || unix <= 0) return "";
  const date = new Date(unix * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UsageMeter({
  used,
  allocated,
  tone = "ram",
}: {
  used: number;
  allocated: number;
  tone?: "ram" | "disk" | "cpu";
}) {
  const ratio = allocated > 0 ? Math.min(1, Math.max(0, used / allocated)) : 0;
  const { color, soft } = TONES[tone];
  const hot = ratio >= 0.9;
  const fill = hot ? "#FF6B6B" : color;
  const width = Math.max(ratio * 100, ratio > 0 ? 2 : 0);

  return (
    <div
      className="h-1 overflow-hidden rounded-full"
      style={{ backgroundColor: soft ? soft.replace("0.16", "0.1") : "rgba(0,0,0,0.06)" }}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${width}%`,
          backgroundColor: fill,
        }}
      />
    </div>
  );
}

/** 270° dual ring: outer = memory headroom, inner = disk headroom. */
export function UsageRing({
  ramRatio,
  diskRatio,
  score,
  loading,
}: {
  ramRatio: number;
  diskRatio: number;
  score: number;
  loading?: boolean;
}) {
  const gid = useId();
  const [ready, setReady] = useState(false);
  // Cropped viewBox: full width, less empty space under the open gauge.
  const vbW = 220;
  const vbH = 188;
  const cx = 110;
  const cy = 108;
  const ramHead = ready ? 1 - Math.min(1, Math.max(0, ramRatio)) : 0;
  const diskHead = ready ? 1 - Math.min(1, Math.max(0, diskRatio)) : 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="block h-[9.75rem] w-[11.5rem] shrink-0 overflow-visible"
      role="img"
      aria-label={`Headroom ${loading ? "loading" : score} percent. Memory ${formatBytesLabel(ramHead)} free, disk ${formatBytesLabel(diskHead)} free.`}
    >
      <defs>
        <linearGradient id={`${gid}-ram`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FD4E00" />
          <stop offset="42%" stopColor="#FF7A3D" />
          <stop offset="78%" stopColor="#FFB65C" />
          <stop offset="100%" stopColor="#FFD28A" />
        </linearGradient>
        <linearGradient id={`${gid}-disk`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#E04500" />
          <stop offset="55%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#FDBA74" />
        </linearGradient>
      </defs>
      <Arc
        cx={cx}
        cy={cy}
        r={78}
        sweep={ramHead}
        stroke={`url(#${gid}-ram)`}
        width={11}
        track="rgba(253,78,0,0.12)"
      />
      <Arc
        cx={cx}
        cy={cy}
        r={61}
        sweep={diskHead}
        stroke={`url(#${gid}-disk)`}
        width={8}
        track="rgba(251,146,60,0.10)"
      />
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        fill="white"
        fontSize="42"
        fontWeight="500"
        letterSpacing="-0.05em"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {loading ? "—" : score}
      </text>
    </svg>
  );
}

function formatBytesLabel(headroom: number): string {
  return `${Math.round(headroom * 100)}%`;
}

function Arc({
  cx,
  cy,
  r,
  sweep,
  stroke,
  width,
  track,
}: {
  cx: number;
  cy: number;
  r: number;
  sweep: number;
  stroke: string;
  width: number;
  track: string;
}) {
  const c = 2 * Math.PI * r;
  const frac = 0.75; // 270°
  const trackLen = c * frac;
  const filled = trackLen * Math.min(1, Math.max(0, sweep));
  // Start at lower-left so the open gap sits at the bottom (gauge/semicircle feel).
  const rotate = `rotate(135 ${cx} ${cy})`;
  const ease = "stroke-dasharray 1.05s cubic-bezier(0.16, 1, 0.3, 1)";
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={track}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={`${trackLen} ${c}`}
        transform={rotate}
      />
      {filled > 0.4 ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform={rotate}
          style={{ transition: ease }}
        />
      ) : null}
    </g>
  );
}

export function LoadSparkline({
  series,
  ramAlloc,
  diskAlloc,
}: {
  series: UsagePoint[];
  ramAlloc: number;
  diskAlloc: number;
}) {
  const values = series.map((point) =>
    Math.max(
      ramAlloc > 0 ? Math.min(1, point.ram / ramAlloc) : 0,
      diskAlloc > 0 ? Math.min(1, point.disk / diskAlloc) : 0,
    ),
  );
  const stamps = series.map((point) => point.t).filter((t) => Number.isFinite(t) && t > 0);
  const first = stamps[0];
  const last = stamps[stamps.length - 1];
  const slots = values.length > 0 ? values : Array.from({ length: 24 }, () => 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 items-end gap-[2px]">
        {slots.map((value, index) => {
          const fill =
            value <= 0
              ? "rgba(0,0,0,0.06)"
              : value >= 0.9
                ? "#FF6520"
                : value > 0.55
                  ? "#FD4E00"
                  : value > 0.2
                    ? "#FF8A4A"
                    : "rgba(253,78,0,0.45)";
          return (
            <span
              key={index}
              className="usage-spark-bar min-w-[2px] flex-1 rounded-[2px]"
              style={{
                height: `${value > 0 ? Math.max(10, value * 100) : 8}%`,
                backgroundColor: fill,
                animationDelay: `${index * 16}ms`,
                transition: "height 600ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex h-3 shrink-0 justify-between font-mono text-[10px] leading-3 tabular-nums text-fg/28">
        <span>{first ? formatClock(first) : ""}</span>
        <span>Load</span>
        <span>{last ? formatClock(last) : ""}</span>
      </div>
    </div>
  );
}
