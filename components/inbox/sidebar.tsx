"use client";

import type { ComponentType, ReactNode } from "react";
import type { NavId } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { usePresentedChrome } from "./chrome";
import { ChartColumn, CreditCard, Folder, Layers, Plus, Settings, Users } from "lucide-react";
import { ProfileMenu } from "./profile-menu";
import { RunexLogo } from "./runex-logo";
import { WorkspaceSwitcher } from "./workspace-switcher";

const primary = [
  { id: "projects", label: "Projects", icon: Folder },
  { id: "usage", label: "Usage", icon: ChartColumn },
  { id: "people", label: "People", icon: Users },
] as const satisfies readonly NavItem[];

const more = [
  { id: "general", label: "General", icon: Settings },
  { id: "plans", label: "Plans", icon: Layers },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "audit", label: "Audit logs", icon: AuditMark },
] as const satisfies readonly NavItem[];

type Glyph = ComponentType<{
  size?: number;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
  "aria-hidden"?: boolean;
}>;

type NavItem = { id: NavId; label: string; icon: Glyph };

/** A small timeline, the same shape as the audit log. */
function AuditMark({
  size = 15,
}: {
  size?: number;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
  "aria-hidden"?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M4.25 4.45v1.7M4.25 8.85v1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4.25" cy="3.15" r="1.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4.25" cy="7.5" r="1.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4.25" cy="11.85" r="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.2 3.15h5M7.2 7.5h3.6M7.2 11.85h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Sidebar({
  sheet = false,
  onNavigate,
}: {
  sheet?: boolean;
  onNavigate?: () => void;
}) {
  const deployOpen = usePlatformStore((state) => state.deployOpen);
  const setNav = usePlatformStore((state) => state.setNav);
  const setDeployOpen = usePlatformStore((state) => state.setDeployOpen);
  const { activeNav, showAccount, openId } = usePresentedChrome();
  const collapsed = !sheet && openId !== null;
  const go = (nav: NavId) => {
    setNav(nav);
    onNavigate?.();
  };

  return (
    <aside
      className={
        sheet
          ? "relative z-20 flex h-full w-full shrink-0 flex-col overflow-y-auto bg-[var(--rail)] px-2 py-3 shadow-[inset_-1px_0_0_var(--line)]"
          : `relative z-20 hidden shrink-0 flex-col bg-[var(--rail)] px-2 py-3 shadow-[inset_-1px_0_0_var(--line)] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex ${
              collapsed ? "w-12" : "w-[216px]"
            }`
      }
    >
      <RailButton label="Runex" collapsed={collapsed} onClick={() => go("projects")}>
        <RunexLogo className="h-[22px] w-[22px]" />
      </RailButton>

      {showAccount ? <WorkspaceSwitcher collapsed={collapsed} sheet={sheet} /> : null}

      {showAccount ? (
        <button
          type="button"
          aria-pressed={deployOpen}
          aria-label={collapsed ? "New project" : undefined}
          onClick={() => {
            go("projects");
            setDeployOpen(true);
          }}
          className={`group relative mt-1.5 flex h-8 items-center rounded-lg bg-[#1d1d1f] text-[13px] font-normal tracking-[-0.006em] text-white transition-colors duration-150 ease-out hover:bg-black ${
            collapsed ? "w-8" : "w-full"
          }`}
        >
          <RailIcon>
            <Plus size={15} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          </RailIcon>
          {collapsed ? null : <RailName>New project</RailName>}
          <RailTip label="New project" show={collapsed} />
        </button>
      ) : null}

      <nav aria-label="Workspace" className="mt-4 flex min-h-0 w-full flex-1 flex-col">
        <ul className="flex flex-col gap-0.5">
          {primary.map((item) => (
            <li key={item.id}>
              <NavButton
                item={item}
                active={activeNav === item.id}
                collapsed={collapsed}
                onClick={() => go(item.id)}
              />
            </li>
          ))}
        </ul>

        {collapsed ? (
          <div className="flex h-7 items-center justify-center" aria-hidden>
            <span className="h-px w-4 rounded-full bg-black/15" />
          </div>
        ) : (
          <p className="pt-4 pb-1 pl-8 text-[11px] font-normal tracking-[-0.006em] text-[#aeaeb2]">
            More
          </p>
        )}

        <ul className="flex flex-col gap-0.5">
          {more.map((item) => (
            <li key={item.id}>
              <NavButton
                item={item}
                active={activeNav === item.id}
                collapsed={collapsed}
                onClick={() => go(item.id)}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-3 border-t border-black/[0.06] pt-2">
        <ProfileMenu />
      </div>
    </aside>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <RailButton label={item.label} collapsed={collapsed} active={active} onClick={onClick}>
      <Icon size={15} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
    </RailButton>
  );
}

function RailButton({
  label,
  collapsed,
  active = false,
  onClick,
  children,
}: {
  label: string;
  collapsed: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={`group relative flex h-8 w-full min-w-0 items-center rounded-lg text-left text-[13px] font-normal tracking-[-0.006em] transition-colors duration-150 ease-out ${
        active
          ? "bg-black/[0.05] text-[#1d1d1f]"
          : "text-[#6e6e73] hover:bg-black/[0.04] hover:text-[#3a3a3c]"
      }`}
    >
      <RailIcon>{children}</RailIcon>
      {collapsed ? null : <RailName>{label}</RailName>}
      <RailTip label={label} show={collapsed} />
    </button>
  );
}

function RailIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-8 shrink-0 place-items-center">{children}</span>;
}

function RailName({ children }: { children: string }) {
  return <span className="min-w-0 flex-1 truncate pr-2">{children}</span>;
}

function RailTip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-full z-30 -translate-y-1/2 pl-2">
      <span className="block h-6 rounded-full border border-black/[0.06] bg-white px-2 text-[12px] leading-6 font-normal tracking-[-0.006em] whitespace-nowrap text-[#3a3a3c] opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-75 group-focus-visible:opacity-100">
        {label}
      </span>
    </span>
  );
}
