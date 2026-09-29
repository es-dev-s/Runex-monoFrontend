"use client";

import { ThemeSwitch, useTheme } from "@/components/theme-switch";
import type { NavId } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { useWorkspaces } from "@/lib/workspaces";
import { type ReactNode } from "react";
import { usePresentedChrome } from "./chrome";
import { WorkspaceUsage } from "./usage-page";

const SUPPORT = "support@runex.cloud";
const NOTICE = "Upgrades are temporarily unavailable due to high demand. We apologize for the inconvenience.";

export function PlatformPage({ nav }: { nav: NavId }) {
  return (
    <div key={nav} className="runex-canvas flex flex-col gap-3">
      {nav === "usage" ? <WorkspaceUsage /> : null}
      {nav === "people" ? <PeoplePage /> : null}
      {nav === "general" ? <GeneralPage /> : null}
      {nav === "plans" ? <PlansPage /> : null}
      {nav === "billing" ? <BillingPage /> : null}
    </div>
  );
}

function PeoplePage() {
  const user = usePlatformStore((state) => state.user);
  if (!user) return <Quiet title="People" body="Sign in to see this account." />;
  const label = user.name || user.username;
  const since = joined(user.createdAt);
  return (
    <Frame>
      <Panel>
        <PanelHead title="People" meta="1" />
        <div className="flex items-center gap-3 border-t border-[#f2f2f2] px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#161616] text-[12px] font-semibold text-white">
            {label.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">{label}</span>
            <span className="block truncate text-[12px] text-[#8e8e93]">{user.email}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[12px] font-medium text-[#3a3a3c]">Owner</span>
            {since ? (
              <span className="mt-0.5 block text-[12px] text-[#8e8e93]" suppressHydrationWarning>
                {since}
              </span>
            ) : null}
          </span>
        </div>
      </Panel>
    </Frame>
  );
}

function GeneralPage() {
  const user = usePlatformStore((state) => state.user);
  const count = usePlatformStore((state) => state.projects.length);
  const { name } = usePresentedChrome();
  const { active } = useWorkspaces(user?.id ?? "", name);
  const rows = [
    { label: "Name", value: user?.name || "—" },
    { label: "Username", value: user?.username || "—" },
    { label: "Email", value: user?.email || "—" },
    { label: "Workspace", value: active.name },
    { label: "Projects", value: String(count) },
  ];
  return (
    <Frame>
      <AppearancePanel />
      <Panel>
        <PanelHead title="Account" meta={user?.username || "Runex"} />
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 border-t border-[#f2f2f2] px-4 py-3">
              <dt className="text-[13px] text-[#8e8e93]">{row.label}</dt>
              <dd className="min-w-0 truncate text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </Frame>
  );
}

function PlansPage() {
  const rows = [
    { label: "Memory", value: "1 GB" },
    { label: "Disk", value: "5 GB" },
    { label: "Upgrades", value: "Unavailable" },
  ];
  return (
    <Frame support>
      <Panel>
        <PanelHead title="Included" meta="This account" />
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 border-t border-[#f2f2f2] px-4 py-3">
              <dt className="text-[13px] text-[#8e8e93]">{row.label}</dt>
              <dd className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f] tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </Frame>
  );
}

function BillingPage() {
  return (
    <Frame support>
      <Panel>
        <PanelHead title="Invoices" meta="None" />
        <p className="border-t border-[#f2f2f2] px-4 py-4 text-[13px] text-[#8e8e93]">No invoices on this account.</p>
      </Panel>
      <Panel>
        <PanelHead title="Payment" meta="None" />
        <p className="border-t border-[#f2f2f2] px-4 py-4 text-[13px] text-[#8e8e93]">No payment method on this account.</p>
      </Panel>
    </Frame>
  );
}

function AppearancePanel() {
  const { dark, toggle } = useTheme();
  return (
    <Panel>
      <PanelHead title="Appearance" meta={dark ? "Dark" : "Light"} />
      <div className="flex items-center justify-between gap-4 border-t border-[#f2f2f2] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">Dark mode</p>
          <p className="mt-0.5 text-[12px] text-[#8e8e93]">Matte near-black across the workspace.</p>
        </div>
        <ThemeSwitch checked={dark} onClick={toggle} />
      </div>
    </Panel>
  );
}

function Frame({ children, support = false }: { children: ReactNode; support?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-[13px] leading-5 tracking-[-0.011em] text-[#8e8e93]">{NOTICE}</p>
      {children}
      {support ? <SupportCard /> : null}
    </div>
  );
}

function SupportCard() {
  return (
    <section className="flex items-center justify-between gap-4 rounded-[18px] border border-[#ececec] bg-white px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">Support</p>
        <p className="mt-0.5 truncate text-[12px] text-[#8e8e93]">{SUPPORT}</p>
      </div>
      <a
        href={`mailto:${SUPPORT}?subject=${encodeURIComponent("Runex support")}`}
        className="inline-flex h-8 shrink-0 items-center rounded-full bg-[#1d1d1f] px-3 text-[13px] font-medium text-white"
      >
        Contact support
      </a>
    </section>
  );
}

function Quiet({ title, body }: { title: string; body: string }) {
  return (
    <Frame>
      <Panel>
        <PanelHead title={title} meta="" />
        <p className="border-t border-[#f2f2f2] px-4 py-4 text-[13px] text-[#8e8e93]">{body}</p>
      </Panel>
    </Frame>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="overflow-hidden rounded-[18px] border border-[#ececec] bg-white">{children}</section>;
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <h2 className="text-[13px] font-medium tracking-[-0.011em] text-[#1d1d1f]">{title}</h2>
      {meta ? <p className="shrink-0 text-[12px] text-[#8e8e93] tabular-nums">{meta}</p> : null}
    </div>
  );
}

function joined(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
