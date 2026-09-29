"use client";

import { useMemo } from "react";
import { ServiceIcon } from "@/components/projects/service-icon";
import type { ServiceNode } from "@/lib/api";
import {
  cardPreviewNodes,
  nodeMarkClass,
  serviceCaption,
  serviceLabel,
  statusTone,
} from "@/lib/projects";

type PillPosition = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
};

/** Same service keeps its side of the card, even when the list around it changes. */
function lane(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return hash % 2 === 0 ? -1 : 1;
}

function computeCardLayout(ids: string[]): PillPosition[] {
  const count = ids.length;
  if (count <= 0) return [];
  if (count === 1) {
    return [{ x: 0, y: lane(ids[0]) * 4, rotate: 0, scale: 1, z: 1 }];
  }
  if (count <= 5) {
    const mid = (count - 1) / 2;
    const spread = Math.min(44, 220 / (count - 1));
    return ids.map((id, i) => {
      const d = i - mid;
      return {
        x: d * spread,
        y: lane(id) * (8 + Math.min(Math.abs(d), 3) * 4),
        rotate: d * 1.4,
        scale: 1 - Math.min(count - 1 - i, 4) * 0.02,
        z: i,
      };
    });
  }
  const cols = count <= 8 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const gapX = cols === 2 ? 124 : 92;
  const gapY = count > 9 ? 40 : 46;
  const startY = -((rows - 1) * gapY) / 2;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i - row * cols;
    const colsInRow = row === rows - 1 ? count - row * cols : cols;
    const startX = -((colsInRow - 1) * gapX) / 2;
    return {
      x: startX + col * gapX,
      y: startY + row * gapY,
      rotate: 0,
      scale: 1,
      z: i,
    };
  });
}

const DOTS = {
  backgroundImage: "radial-gradient(var(--preview-dot) 1px, transparent 1px)",
  backgroundSize: "14px 14px",
  backgroundPosition: "8px 8px",
  WebkitMaskImage: "radial-gradient(ellipse 78% 78% at 50% 48%, #000 28%, transparent 88%)",
  maskImage: "radial-gradient(ellipse 78% 78% at 50% 48%, #000 28%, transparent 88%)",
} as const;

/**
 * Thumbnail of a project's canvas. The grid card fans the same
 * service pills the workspace uses; the list row keeps a compact chip cluster.
 */
export function ProjectCanvasFace({
  nodes,
  compact = false,
}: {
  nodes: ServiceNode[];
  compact?: boolean;
}) {
  const preview = useMemo(() => cardPreviewNodes(nodes), [nodes]);
  const positions = useMemo(() => computeCardLayout(preview.map((node) => node.id)), [preview]);
  const tight = preview.length > 5;

  if (compact) {
    return (
      <div
        aria-hidden="true"
        className="relative h-12 w-[108px] shrink-0 overflow-hidden rounded-[10px] bg-[#f3f3f5]"
      >
        <div className="pointer-events-none absolute inset-0" style={DOTS} />
        {preview.length === 0 ? (
          <span className="relative grid h-full place-items-center text-[10px] tracking-tight text-[#aeaeb2]">
            Empty
          </span>
        ) : (
          <span className="relative grid h-full place-items-center">
            <span className="flex items-center -space-x-1">
              {preview.slice(0, 4).map((node) => (
                <Chip key={node.id} node={node} />
              ))}
            </span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="relative h-[132px] overflow-hidden bg-[#f5f5f7]">
      <div className="pointer-events-none absolute inset-0" style={DOTS} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 55% at 50% 46%, var(--preview-glow), transparent 72%)",
        }}
      />
      {preview.length === 0 ? (
        <p className="relative grid h-full place-items-center text-[12px] tracking-tight text-[#8e8e93]">
          Empty canvas
        </p>
      ) : (
        <div className="relative h-full w-full">
          {preview.map((node, index) => {
            const pos = positions[index];
            if (!pos) return null;
            return <ServicePill key={node.id} node={node} pos={pos} compact={tight} />;
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ node }: { node: ServiceNode }) {
  const tone = statusTone(node.status);
  return (
    <span
      className={`relative grid size-7 place-items-center rounded-[8px] shadow-[0_0_0_2px_var(--preview-face),0_4px_10px_-6px_rgba(0,0,0,0.28)] ${nodeMarkClass(node)}`}
    >
      <ServiceIcon node={node} size={13} />
      <span
        className="absolute right-0 bottom-0 size-1.5 translate-x-px translate-y-px rounded-full ring-2 ring-[#f3f3f5]"
        style={{ backgroundColor: tone.dot }}
      />
    </span>
  );
}

function ServicePill({
  node,
  pos,
  compact,
}: {
  node: ServiceNode;
  pos: PillPosition;
  compact?: boolean;
}) {
  const tone = statusTone(node.status);
  return (
    <div
      className={
        compact
          ? "absolute top-1/2 left-1/2 flex items-center gap-1.5 rounded-[10px] border border-black/[0.06] bg-white py-1.5 pr-2.5 pl-1.5 shadow-[0_10px_22px_-14px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.04)]"
          : "absolute top-1/2 left-1/2 flex items-center gap-2 rounded-[11px] border border-black/[0.06] bg-white py-[7px] pr-3 pl-[7px] shadow-[0_12px_24px_-14px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.04)]"
      }
      style={{
        transform: `translate(-50%,-50%) translate(${pos.x}px, ${pos.y}px) rotate(${pos.rotate}deg) scale(${pos.scale})`,
        zIndex: pos.z,
      }}
    >
      <span
        className={`${compact ? "grid size-6 shrink-0 place-items-center rounded-[7px]" : "grid size-[26px] shrink-0 place-items-center rounded-[8px]"} ${nodeMarkClass(node)}`}
      >
        <ServiceIcon node={node} size={compact ? 13 : 14} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 leading-[1.1]">
        <span
          className={
            compact
              ? "max-w-[6.5rem] truncate text-[11.5px] font-medium tracking-[-0.01em] text-[#1d1d1f]"
              : "max-w-[8.5rem] truncate text-[12.5px] font-medium tracking-[-0.01em] text-[#1d1d1f]"
          }
        >
          {serviceLabel(node)}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-[#8e8e93]">
          <span
            className={tone.busy ? "size-[5px] shrink-0 animate-pulse rounded-full" : "size-[5px] shrink-0 rounded-full"}
            style={{ backgroundColor: tone.dot }}
          />
          {serviceCaption(node)}
        </span>
      </span>
    </div>
  );
}
