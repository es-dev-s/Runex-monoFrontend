"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Database, Layers, Loader2, Upload } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";

export type CanvasAddAction = "github" | "upload" | "postgresql" | "redis";

const MENU_W = 228;
const MENU_H = 292;

/**
 * Canvas add menu. Right-click on empty canvas space — not a fake node —
 * to deploy another codebase or attach isolated Postgres / Redis.
 */
export function CanvasContextMenu({
  x,
  y,
  pending,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  pending?: Partial<Record<"postgresql" | "redis", true>>;
  onAction: (action: CanvasAddAction) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ top: y, left: x });
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const gutter = 10;
    const left = Math.min(Math.max(gutter, x), window.innerWidth - MENU_W - gutter);
    const top = Math.min(Math.max(gutter, y), window.innerHeight - MENU_H - gutter);
    setBox({ top, left });
  }, [x, y]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const opened = Date.now();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (Date.now() - opened < 160) return;
      const path = event.composedPath();
      if (menuRef.current && path.includes(menuRef.current)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Add to canvas"
      style={{ top: box.top, left: box.left, width: MENU_W }}
      className={cn(
        chromePanel,
        "fixed z-[90] p-1.5 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
        visible ? "scale-100 opacity-100" : "scale-[0.97] opacity-0",
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-[0.14em] text-fg/32 uppercase">
        Service
      </p>
      <MenuRow
        icon={<GithubMark size={14} />}
        label="GitHub"
        detail="Clone and deploy a repository"
        onSelect={() => onAction("github")}
      />
      <MenuRow
        icon={<Upload size={14} strokeWidth={1.75} />}
        label="Upload .zip"
        detail="A local folder, archived"
        onSelect={() => onAction("upload")}
      />
      <span aria-hidden="true" className="mx-2 my-1.5 block h-px bg-fg/[0.07]" />
      <p className="px-2.5 pt-0.5 pb-1 text-[10px] font-medium tracking-[0.14em] text-fg/32 uppercase">
        Data
      </p>
      <MenuRow
        icon={<Database size={14} strokeWidth={1.75} />}
        label="Postgres"
        detail="Isolated database on this project"
        busy={Boolean(pending?.postgresql)}
        disabled={Boolean(pending?.postgresql)}
        onSelect={() => onAction("postgresql")}
      />
      <MenuRow
        icon={<Layers size={14} strokeWidth={1.75} />}
        label="Redis"
        detail="Isolated cache on this project"
        busy={Boolean(pending?.redis)}
        disabled={Boolean(pending?.redis)}
        onSelect={() => onAction("redis")}
      />
    </div>,
    document.body,
  );
}

function MenuRow({
  icon,
  label,
  detail,
  busy,
  disabled,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  busy?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onSelect();
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-out",
        disabled ? "cursor-progress opacity-55" : "hover:bg-fg/[0.06]",
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-fg/[0.04] text-fg/70 ring-1 ring-fg/[0.06]">
        {busy ? <Loader2 size={13} strokeWidth={1.9} className="animate-spin text-fg/55" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium tracking-tight text-fg">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] tracking-tight text-fg/38">{detail}</span>
      </span>
    </button>
  );
}
