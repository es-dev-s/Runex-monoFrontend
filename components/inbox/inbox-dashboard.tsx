"use client";

import { github } from "@/lib/api";
import { loadGitHubCatalog } from "@/lib/github-catalog";
import { bootServices, type Boot, type BootNode } from "@/lib/boot";
import { formatCount } from "@/lib/inbox/format";
import type { NavId, Service } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { readShell } from "@/lib/remember";
import { AnimatePresence, LazyMotion } from "motion/react";
import { ChevronRight, Menu } from "lucide-react";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChromeProvider, usePresentedChrome } from "./chrome";
import { ActivityTimeline } from "./activity-timeline";
import { ServiceList } from "./email-list";
import { NotificationBell } from "./notification-bell";
import { PlatformPage } from "./platform-pages";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { DashboardShell, useDashboardDrawer } from "./dashboard-drawer";
import { Sidebar } from "./sidebar";
import { UpgradeBanner } from "./upgrade-banner";
import { HOME_WORKSPACE, useWorkspaces, WorkspaceBootProvider } from "@/lib/workspaces";
import { useSessionWatch } from "@/hooks/use-session-watch";

const loadMotion = () => import("motion/react").then((mod) => mod.domAnimation);

const NewProjectModal = dynamic(
  () => import("./compose-panel").then((mod) => mod.NewProjectModal),
  { ssr: false },
);

const sectionCopy: Record<
  Exclude<
    NavId,
    | "projects"
    | "activity"
    | "usage"
    | "people"
    | "general"
    | "plans"
    | "billing"
    | "audit"
    | "pinned"
    | "servers"
  >,
  { title: string; body: string }
> = {
  workspace: {
    title: "Workspace",
    body: "Production projects for this workspace.",
  },
  team: {
    title: "Team",
    body: "People with access to this workspace.",
  },
  logs: {
    title: "Logs",
    body: "Runtime output from your services.",
  },
  settings: {
    title: "Settings",
    body: "Domains, members, and billing.",
  },
};

export function InboxDashboard({ boot, workspaceRaw }: { boot: Boot; workspaceRaw: string | null }) {
  return (
    <WorkspaceBootProvider raw={workspaceRaw}>
    <ChromeProvider boot={boot}>
      <LazyMotion features={loadMotion} strict>
        <Suspense fallback={null}>
          <Shell />
        </Suspense>
      </LazyMotion>
    </ChromeProvider>
    </WorkspaceBootProvider>
  );
}

function Shell() {
  const services = usePlatformStore((state) => state.services);
  const listed = usePlatformStore((state) => state.listed);
  const deployOpen = usePlatformStore((state) => state.deployOpen);
  const error = usePlatformStore((state) => state.error);
  const projects = usePlatformStore((state) => state.projects);
  const user = usePlatformStore((state) => state.user);
  const setNav = usePlatformStore((state) => state.setNav);
  const bootstrap = usePlatformStore((state) => state.bootstrap);
  const chrome = usePresentedChrome();
  const { showAccount, openId, activeNav, sort, session, boot, name } = chrome;
  const { active: workspace, saved, ready } = useWorkspaces(user?.id ?? "", name);
  const router = useRouter();
  const [motionOn, setMotionOn] = useState(false);
  useSessionWatch(session === "in");

  useLayoutEffect(() => {
    usePlatformStore.getState().hydrateCachedBoard();
    const state = usePlatformStore.getState();
    if (state.chromePrimed) return;
    const saved = readShell()?.listView;
    const listView = saved === "list" || saved === "grid" ? saved : "grid";
    usePlatformStore.setState({
      openId: boot.openId,
      activeNav: chrome.activeNav,
      sort: boot.sort,
      listView,
      chromePrimed: true,
    });
  }, [boot.openId, boot.sort, chrome.activeNav]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMotionOn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    void bootstrap();
    void loadGitHubCatalog().catch(() => {
      /* The canvas retries. A prefetch miss must not block the shell. */
    });
  }, [bootstrap]);

  useEffect(() => {
    if (session === "out") router.replace("/sign-in?next=/app");
  }, [router, session]);

  useEffect(() => {
    if (activeNav === "activity") setNav("audit");
  }, [activeNav, setNav]);

  useEffect(() => {
    if (session !== "in" || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const installation = Number(params.get("installation_id") || "0");
    const flag = params.get("github");
    if (!flag && !(installation > 0)) return;
    void github.complete(installation > 0 ? installation : undefined).finally(() => {
      window.history.replaceState(null, "", "/");
    });
  }, [session]);

  const visible = visibleServices(services, activeNav, sort);
  const productionCount = services.filter((service) => service.scope === "production").length;
  const serverCount = services.filter((service) => service.target === "server").length;

  const auditView = activeNav === "audit" || activeNav === "activity";
  const listView =
    activeNav === "projects" ||
    activeNav === "pinned" ||
    activeNav === "servers";
  const showBanner = activeNav === "projects";

  const opened = projects.find((project) => project.id === openId) ?? null;
  const cachedName =
    boot.openId === openId
      ? boot.openName || boot.projects.find((project) => project.id === openId)?.name || ""
      : boot.projects.find((project) => project.id === openId)?.name || "";
  const projectTitle = openId ? opened?.name || cachedName || "Project" : null;
  const bootWorkspace = new Map(boot.projects.map((project) => [project.id, project.workspaceId]));
  const inWorkspace = (row: Service) => {
    if (activeNav !== "projects") return true;
    if (!ready) return false;
    const placed = (row.projectId && saved.projects[row.projectId]) || bootWorkspace.get(row.projectId ?? "") || HOME_WORKSPACE;
    return placed === workspace.id;
  };
  const preview =
    activeNav === "projects" && ready ? orderedBoot(bootServices(boot.projects), sort).filter(inWorkspace) : [];
  const visibleOrPreview = projectRows(visible.filter(inWorkspace), preview, listed, activeNav);
  const heading = headingFor(activeNav, visible.length, serverCount);
  const listLabel =
    activeNav === "pinned"
      ? "Pinned"
      : activeNav === "servers"
        ? "Servers"
        : "Projects";

  return (
    <DashboardShell rail={<Sidebar />} drawer={<MobileRail />}>
    <div data-motion={motionOn ? "on" : "off"} className="flex min-h-0 flex-1 flex-col">
      <main className="flex min-h-0 flex-1 flex-col bg-background">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#f2f2f2] px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <MenuButton />
            <Breadcrumb
              page={showAccount ? heading.title : "Runex"}
              project={projectTitle}
              onBack={() => setNav(activeNav)}
            />
          </div>
          {showAccount ? <NotificationBell /> : null}
        </header>

        <AnimatePresence>
          {deployOpen ? <NewProjectModal key="new-project" /> : null}
        </AnimatePresence>

        {error ? (
          <p className="border-b border-[#f2f2f2] bg-[#fff6f5] px-4 py-2 text-[12px] text-[#b42318]">
            {error}
          </p>
        ) : null}

        {session !== "in" && !showAccount ? (
          <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
            <div className="h-24 rounded-[16px] bg-[#f6f6f6]" />
            <div className="h-72 rounded-[16px] bg-[#f6f6f6]" />
          </div>
        ) : openId ? (
          <div className="relative min-h-0 flex-1">
            <ProjectWorkspace key={openId} projectId={openId} />
          </div>
        ) : (
        <div
          className={
            auditView || listView
              ? "flex min-h-0 flex-1 flex-col px-2.5 pt-2 pb-2.5"
              : "min-h-0 flex-1 overflow-y-auto px-3 pt-2.5 pb-6"
          }
        >
          <div className={auditView || listView ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-3"}>
            {auditView ? (
              <ActivityTimeline />
            ) : listView ? (
              <ServiceList
                services={visibleOrPreview}
                faces={bootFaces(boot)}
                label={listLabel}
                banner={showBanner ? <UpgradeBanner /> : undefined}
              />
            ) : isPlatform(activeNav) ? (
              <PlatformPage nav={activeNav} />
            ) : activeNav === "workspace" ? (
              <section className="rounded-[18px] border border-[#ececec] bg-white px-6 py-8">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1c1c1c]">
                  Runex
                </h2>
                <p className="mt-1 text-[14px] leading-5 text-[#8a8a8a]">
                  {formatCount(productionCount)} projects in production.
                </p>
              </section>
            ) : (
              <section className="rounded-[18px] border border-[#ececec] bg-white px-6 py-16 text-center">
                <h2 className="text-[15px] font-semibold text-[#1c1c1c]">
                  {sectionCopy[activeNav].title}
                </h2>
                <p className="mt-1 text-sm text-[#8e8e8e]">
                  {sectionCopy[activeNav].body}
                </p>
              </section>
            )}
          </div>
        </div>
        )}
      </main>
    </div>
    </DashboardShell>
  );
}

function MobileRail() {
  const drawer = useDashboardDrawer();
  return <Sidebar sheet onNavigate={() => drawer?.close()} />;
}

function MenuButton() {
  const drawer = useDashboardDrawer();
  const open = drawer?.open ?? false;
  return (
    <button
      type="button"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-[#1a1a1a] md:hidden"
      onClick={() => drawer?.toggle()}
    >
      <Menu size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function Breadcrumb({
  page,
  project,
  onBack,
}: {
  page: string;
  project: string | null;
  onBack: () => void;
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex h-5 min-w-0 items-center gap-1.5 text-[13px] leading-5 tracking-[-0.011em]">
        <li className="min-w-0">
          {project ? (
            <button
              type="button"
              onClick={onBack}
              className="truncate font-medium leading-5 text-[#8a8a8a] transition-colors hover:text-[#1a1a1a]"
            >
              {page}
            </button>
          ) : (
            <h1 className="truncate font-medium leading-5 text-[#1a1a1a]">{page}</h1>
          )}
        </li>
        {project ? (
          <li className="flex min-w-0 items-center gap-1.5">
            <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-[#c8c8c8]" aria-hidden />
            <h1 className="truncate font-medium leading-5 text-[#1a1a1a]">{project}</h1>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

function headingFor(activeNav: NavId, visibleCount: number, serverCount: number) {
  if (activeNav === "pinned") {
    return { title: "Pinned", count: `${formatCount(visibleCount)} services` };
  }
  if (activeNav === "servers") {
    return { title: "Servers", count: `${formatCount(serverCount)} servers` };
  }
  if (activeNav === "projects") {
    return { title: "Projects", count: `${formatCount(visibleCount)} services` };
  }
  if (activeNav === "usage") return { title: "Usage", count: "" };
  if (activeNav === "people") return { title: "People", count: "" };
  if (activeNav === "general") return { title: "General", count: "" };
  if (activeNav === "plans") return { title: "Plans", count: "" };
  if (activeNav === "billing") return { title: "Billing", count: "" };
  if (activeNav === "audit" || activeNav === "activity") return { title: "Audit logs", count: "" };
  if (activeNav === "workspace") {
    return { title: "Workspace", count: "" };
  }
  return { title: sectionCopy[activeNav].title, count: "" };
}

function isPlatform(nav: NavId): nav is "usage" | "people" | "general" | "plans" | "billing" {
  return nav === "usage" || nav === "people" || nav === "general" || nav === "plans" || nav === "billing";
}

function orderedBoot(preview: Service[], sort: "newest" | "oldest") {
  return sort === "oldest" ? preview.slice().reverse() : preview;
}

function bootFaces(boot: Boot): Record<string, BootNode[]> {
  const faces: Record<string, BootNode[]> = {};
  for (const project of boot.projects) {
    if (project.nodes) faces[project.id] = project.nodes;
  }
  return faces;
}

function projectRows(visible: Service[], preview: Service[], listed: boolean, activeNav: NavId) {
  if (activeNav !== "projects" || listed || visible.length > 0 || preview.length === 0) return visible;
  return preview;
}

function visibleServices(services: Service[], activeNav: NavId, sort: "newest" | "oldest") {
  const filtered =
    activeNav === "pinned"
      ? services.filter((service) => service.pinned && service.scope === "production")
      : activeNav === "servers"
        ? services.filter((service) => service.target === "server")
        : activeNav === "activity"
          ? services.filter((service) => service.scope === "activity")
          : activeNav === "projects"
            ? services.filter((service) => service.scope === "production")
            : [];

  const ordered = [...filtered].sort((a, b) => b.order - a.order);
  return sort === "newest" ? ordered : ordered.reverse();
}
