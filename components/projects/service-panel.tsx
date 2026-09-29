"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";
import { humanizeHttpBody, looksLikeMarkup, projects as projectsApi, type ServiceNode } from "@/lib/api";
import type { DeployTab } from "@/components/projects/deploy-dialog";
import { DatabaseExplorer } from "@/components/projects/database-explorer";
import { DeploymentsList } from "@/components/projects/deployments-list";
import { LogStream } from "@/components/projects/log-stream";
import { ServiceIcon } from "@/components/projects/service-icon";
import { NodeUsageCard } from "@/components/projects/node-usage";
import { ServiceOverview } from "@/components/projects/service-overview";
import { ServiceSettings } from "@/components/projects/service-settings";
import { VariablesEditor } from "@/components/projects/variables-editor";
import type { StreamLog } from "@/hooks/use-project-stream";
import { useProjectUsage } from "@/hooks/use-usage";
import { cn } from "@/lib/cn";
import { findNodeUsage } from "@/lib/usage";
import { useConfirm } from "@/hooks/use-confirm";
import { useElapsedNow } from "@/hooks/use-elapsed-now";
import { isDatabaseNode, isEmptySlot, localServiceURL, nodeMarkClass, redeployDetail, serviceCaption, serviceLabel, servicePublicUrl, statusTone } from "@/lib/projects";
import { liveDeployClock } from "@/lib/relative-time";
import { readInspectorTab, rememberInspectorTab } from "@/lib/remember";

type Tab = "overview" | "database" | "deployments" | "logs" | "variables" | "usage" | "settings";

const SERVICE_TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Logs" },
  { id: "variables", label: "Variables" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

const DATABASE_TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "database", label: "Database" },
  { id: "variables", label: "Variables" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

function readTab(nodeId: string): Tab | null {
  const stored = readInspectorTab(nodeId);
  if (stored === "overview" || stored === "database" || stored === "deployments" || stored === "logs" || stored === "variables" || stored === "usage" || stored === "settings") {
    return stored;
  }
  return null;
}

function writeTab(nodeId: string, tab: Tab) {
  rememberInspectorTab(nodeId, tab);
}

/**
 * Right-hand inspector for a selected service. Width is owned by the workspace
 * so the user can drag it up to 40% of the viewport.
 *
 * Callers must key this on the node id so changing selection remounts the
 * panel. The last tab is restored so coming back feels like home.
 */
export function ServicePanel({
  projectId,
  node,
  logs,
  live,
  revealLogs = 0,
  onClose,
  onChanged,
  onDeploySource,
  onBuildStart,
  onRemove,
}: {
  projectId: string;
  node: ServiceNode;
  logs: StreamLog[];
  live: boolean;
  revealLogs?: number;
  onClose: () => void;
  onChanged: () => void;
  onRemove?: () => void;
  onDeploySource: (tab?: DeployTab) => void;
  onBuildStart?: (nodeId: string) => void;
}) {
  const empty = isEmptySlot(node);
  const database = isDatabaseNode(node);
  const tabs = database ? DATABASE_TABS : SERVICE_TABS;
  const [tab, setTab] = useState<Tab>(() => {
    const stored = readTab(node.id);
    if (database) return stored === "database" || stored === "overview" || stored === "variables" || stored === "usage" || stored === "settings" ? stored : "database";
    return stored && stored !== "database" ? stored : "overview";
  });
  const [seenReveal, setSeenReveal] = useState(revealLogs);
  if (revealLogs !== seenReveal) {
    setSeenReveal(revealLogs);
    if (revealLogs > 0 && !database) {
      setTab("logs");
      writeTab(node.id, "logs");
    }
  }
  const platformURL = node.url ? servicePublicUrl(node.url) : "";
  const visitURL = platformURL || localServiceURL(node);
  const tone = statusTone(node.status);
  const now = useElapsedNow(tone.busy);
  const elapsed = database ? "" : liveDeployClock(node.status, node.startedAt, now);

  const { confirm, dialog } = useConfirm();
  const nodeLogs = useMemo(
    () => logs.filter((line) => !line.nodeId || line.nodeId === node.id),
    [logs, node.id],
  );

  function requestDeploy() {
    const first = node.status === "ready";
    confirm({
      title: first ? "Deploy this service?" : "Redeploy this service?",
      detail: redeployDetail(node),
      confirmLabel: first ? "Deploy" : "Redeploy",
      action: async () => {
        onBuildStart?.(node.id);
        await projectsApi.deployNode(projectId, node.id);
        openTab("logs");
        onChanged();
      },
    });
  }
  const { data: usageSnap, reload: reloadUsage } = useProjectUsage(projectId);
  const nodeUsage = findNodeUsage(usageSnap, node.id);

  useEffect(() => {
    if (node.status !== "building") return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void reloadUsage();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [node.status, reloadUsage]);

  function handleChanged() {
    onChanged();
    void reloadUsage();
  }

  function openTab(next: Tab) {
    setTab(next);
    writeTab(node.id, next);
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card">
      {dialog}
      <div data-sheet-handle className="flex shrink-0 cursor-grab touch-none justify-center py-2.5 active:cursor-grabbing md:hidden" aria-hidden="true">
        <span className="h-1 w-10 rounded-full bg-fg/20" />
      </div>
      <header className="flex shrink-0 items-start gap-2.5 border-b border-fg/[0.06] px-3.5 py-3">
        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[9px] ${nodeMarkClass(node)}`}>
          <ServiceIcon node={node} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium tracking-tight text-fg">
            {serviceLabel(node)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] tracking-tight text-fg/40">
            <span
              aria-hidden="true"
              className={cn("size-1.5 shrink-0 rounded-full", tone.busy && "animate-pulse")}
              style={{ backgroundColor: empty ? "var(--idle-dot)" : tone.dot }}
            />
            <span className="truncate">{serviceCaption(node)}</span>
            {elapsed ? (
              <span className="font-mono text-[12px] font-medium tabular-nums text-[#9A6700]">{elapsed}</span>
            ) : null}
            {node.framework ? (
              <>
                <span aria-hidden="true" className="text-fg/15">
                  ·
                </span>
                <span className="truncate">{node.framework}</span>
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-fg/35 transition-colors duration-150 ease-out hover:bg-fg/[0.06] hover:text-fg md:size-7"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </header>

      {visitURL && !database ? (
        <a
          href={visitURL}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 border-b border-fg/[0.06] px-3.5 py-2 font-mono text-[11px] text-[#1d4ed8] transition-colors duration-150 ease-out hover:text-[#1e3a8a]"
        >
          {node.primaryKind === "custom" ? (
            <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium tracking-[0.12em] text-emerald-800 uppercase">
              Primary
            </span>
          ) : null}
          <span className="truncate">{visitURL}</span>
          <ExternalLink size={11} strokeWidth={1.75} className="shrink-0 opacity-70" />
        </a>
      ) : null}

      {node.error && !looksLikeMarkup(node.error) ? (
        <p className="shrink-0 border-b border-rose-200 bg-rose-50 px-3.5 py-2 text-[11px] leading-relaxed tracking-tight text-rose-700">
          {humanizeHttpBody(0, node.error, node.error)}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label="Service details"
        className="flex shrink-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden [touch-action:pan-x] scrollbar-none border-b border-fg/[0.06] px-1.5"
      >
        {tabs.map((item) => (
          <PanelTab
            key={item.id}
            active={tab === item.id}
            onClick={() => openTab(item.id)}
            live={item.id === "logs" ? live : undefined}
          >
            {item.label}
          </PanelTab>
        ))}
      </div>

      {tab === "overview" ? (
        <ServiceOverview projectId={projectId} node={node} onDeploySource={onDeploySource} onDeploy={requestDeploy} />
      ) : tab === "database" ? (
        <DatabaseExplorer projectId={projectId} node={node} />
      ) : tab === "deployments" ? (
        <DeploymentsList projectId={projectId} nodeId={node.id} status={node.status} />
      ) : tab === "logs" ? (
        <LogStream
          logs={nodeLogs}
          empty={
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <p className="text-[13px] font-medium tracking-tight text-fg/80">
                {node.status === "ready" ? "No build has run yet" : "No build output yet"}
              </p>
              <p className="mt-1.5 max-w-[18rem] text-[12px] leading-relaxed tracking-tight text-fg/40">
                {live
                  ? "New lines appear here as soon as a deploy starts. Older builds stay in this list."
                  : "The live stream is disconnected. Saved build output still loads when the control plane answers."}
              </p>
              {node.status === "ready" ? (
                <button
                  type="button"
                  onClick={requestDeploy}
                  className="mt-4 inline-flex h-8 cursor-pointer items-center rounded-md bg-btn px-3 text-[12px] font-medium tracking-tight text-btn-fg hover:bg-brand-hover"
                >
                  Deploy
                </button>
              ) : null}
            </div>
          }
        />
      ) : tab === "variables" ? (
        <VariablesEditor
          projectId={projectId}
          nodeId={node.id}
          database={database}
          status={node.status}
          onApplied={handleChanged}
        />
      ) : tab === "usage" ? (
        <NodeUsageCard live={nodeUsage} status={node.status} />
      ) : (
        <ServiceSettings
          projectId={projectId}
          node={node}
          usage={nodeUsage}
          limits={usageSnap?.limits}
          onChanged={handleChanged}
          onClose={onClose}
          onRemove={onRemove}
          onDeploySource={onDeploySource}
          onRevealLogs={() => openTab("logs")}
          onBuildStart={onBuildStart}
        />
      )}
    </aside>
  );
}

function PanelTab({
  active,
  onClick,
  children,
  live,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[12px] font-medium tracking-tight transition-colors duration-150 ease-out md:min-w-0 md:flex-1 md:truncate md:px-1.5 md:py-2 md:text-center",
        active ? "border-fg/20 text-fg" : "border-transparent text-fg/40 hover:text-fg/75",
      )}
    >
      {children}
      {live !== undefined ? (
        <span
          aria-label={live ? "Streaming" : "Disconnected"}
          className={cn(
            "ml-1.5 inline-block size-1.5 rounded-full align-middle",
            live ? "bg-emerald-400" : "bg-fg/20",
          )}
        />
      ) : null}
    </button>
  );
}
