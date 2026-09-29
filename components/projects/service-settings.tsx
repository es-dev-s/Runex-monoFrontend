"use client";

import { useRef, useState, type ReactNode } from "react";
import { CircleStop, ExternalLink, Loader2, Play, RotateCw, Trash2 } from "lucide-react";
import { ApiError, projects as projectsApi, type NodeUsage, type ServiceNode, type UsageLimits } from "@/lib/api";
import type { DeployTab } from "@/components/projects/deploy-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import { GitHubServiceSettings } from "@/components/projects/github-service-settings";
import { CustomDomains } from "@/components/projects/custom-domains";
import { ServiceAllocation } from "@/components/projects/service-allocation";
import { cn } from "@/lib/cn";
import { isDatabaseNode, isEmptySlot, redeployDetail, serviceLabel } from "@/lib/projects";

export function ServiceSettings({
  projectId,
  node,
  usage,
  limits,
  onChanged,
  onClose,
  onRemove,
  onDeploySource,
  onRevealLogs,
  onBuildStart,
}: {
  projectId: string;
  node: ServiceNode;
  usage?: NodeUsage | null;
  limits?: UsageLimits | null;
  onChanged: () => void;
  onClose: () => void;
  onRemove?: () => void;
  onDeploySource: (tab?: DeployTab) => void;
  onRevealLogs?: () => void;
  onBuildStart?: (nodeId: string) => void;
}) {
  const pendingRef = useRef<Record<string, true>>({});
  const [pending, setPending] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const empty = isEmptySlot(node);
  const database = isDatabaseNode(node);
  const building = node.status === "building";
  const name = serviceLabel(node);

  function setAction(action: string, active: boolean) {
    if (active) pendingRef.current[action] = true;
    else delete pendingRef.current[action];
    setPending({ ...pendingRef.current });
  }

  async function run(action: string, fn: () => Promise<unknown>) {
    if (pendingRef.current[action]) return;
    setAction(action, true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That action failed.");
      throw cause;
    } finally {
      setAction(action, false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {dialog}
      {database ? null : (
      <section>
        <p className="text-[11px] font-medium tracking-tight text-fg/35 uppercase">Source</p>
        <div className="mt-2 flex flex-col gap-2">
          {empty ? (
            <p className="text-[12px] leading-relaxed tracking-tight text-fg/40">
              Nothing deployed yet. Choose GitHub or an upload to start.
            </p>
          ) : (
            <p className="text-[13px] tracking-tight text-fg/80">
              {node.sourceType === "github" ? node.sourceRef || "GitHub" : node.sourceRef || node.sourceType}
            </p>
          )}
          <button
            type="button"
            onClick={() => onDeploySource(node.sourceType === "github" ? "github" : "upload")}
            className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-md bg-fg/[0.06] px-2.5 text-[12px] font-medium tracking-tight text-fg/80 ring-1 ring-fg/[0.08] transition-colors duration-150 ease-out hover:bg-fg/[0.1] hover:text-fg"
          >
            <ExternalLink size={12} strokeWidth={1.9} />
            Change source
          </button>
        </div>
      </section>
      )}

      {database ? null : node.sourceType === "github" ? (
        <section className="mt-6">
          <GitHubServiceSettings
            projectId={projectId}
            node={node}
            pending={pending}
            onBusy={setAction}
            onChanged={onChanged}
            onError={setError}
          />
        </section>
      ) : null}

      {database ? null : (
        <CustomDomains
          projectId={projectId}
          nodeId={node.id}
          platformUrl={node.platformUrl || (node.primaryKind === "custom" ? "" : node.url)}
          onVisitChange={onChanged}
        />
      )}

      <ServiceAllocation
        projectId={projectId}
        node={node}
        live={usage}
        limits={limits}
        onChanged={onChanged}
      />

      <section className="mt-6">
        <p className="text-[11px] font-medium tracking-tight text-fg/35 uppercase">Actions</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {database ? (
            node.status === "running" ? (
              <Action
                label="Stop"
                busy={Boolean(pending.stop)}
                onClick={() =>
                  confirm({
                    title: "Stop this database?",
                    detail: `${name} will go offline. Data on the isolated volume stays in place.`,
                    confirmLabel: "Stop",
                    tone: "danger",
                    action: () => run("stop", () => projectsApi.stop(projectId, node.id)),
                  })
                }
              >
                <CircleStop size={12} strokeWidth={1.9} />
              </Action>
            ) : (
              <Action
                label="Start"
                busy={Boolean(pending.start)}
                onClick={() =>
                  confirm({
                    title: "Start this database?",
                    detail: `Runex will start the isolated ${name} container.`,
                    confirmLabel: "Start",
                    action: async () => {
                      onBuildStart?.(node.id);
                      await run("start", () => projectsApi.start(projectId, node.id));
                    },
                  })
                }
              >
                <Play size={12} strokeWidth={1.9} />
              </Action>
            )
          ) : empty ? (
            <Action label="Deploy a source" onClick={() => onDeploySource()} primary>
              <Play size={12} strokeWidth={1.9} />
            </Action>
          ) : building ? (
            <Action
              label="Cancel build"
              busy={Boolean(pending.cancel)}
              onClick={() =>
                confirm({
                  title: "Cancel this deploy?",
                  detail: `Runex will stop building ${name}. If a previous version is live, it stays online.`,
                  confirmLabel: "Cancel deploy",
                  tone: "danger",
                  action: () => run("cancel", () => projectsApi.cancelDeploy(projectId, node.id)),
                })
              }
            >
              <CircleStop size={12} strokeWidth={1.9} />
            </Action>
          ) : (
            <>
              <Action
                label={node.status === "ready" ? "Deploy" : "Redeploy"}
                busy={Boolean(pending.deploy)}
                primary
                onClick={() =>
                  confirm({
                    title: node.status === "ready" ? "Deploy this service?" : "Redeploy this service?",
                    detail: redeployDetail(node),
                    confirmLabel: node.status === "ready" ? "Deploy" : "Redeploy",
                    action: async () => {
                      onBuildStart?.(node.id);
                      await run("deploy", () => projectsApi.deployNode(projectId, node.id));
                      onRevealLogs?.();
                    },
                  })
                }
              >
                <RotateCw size={12} strokeWidth={1.9} />
              </Action>
              {node.status === "running" ? (
                <Action
                  label="Stop"
                  busy={Boolean(pending.stop)}
                  onClick={() =>
                    confirm({
                      title: "Stop this service?",
                      detail: `${name} will go offline. Configuration and variables stay in place so you can start it again.`,
                      confirmLabel: "Stop",
                      tone: "danger",
                      action: () => run("stop", () => projectsApi.stop(projectId, node.id)),
                    })
                  }
                >
                  <CircleStop size={12} strokeWidth={1.9} />
                </Action>
              ) : node.status === "stopped" ? (
                <Action
                  label="Start"
                  busy={Boolean(pending.start)}
                  onClick={() =>
                    confirm({
                      title: "Start this service?",
                      detail: `Runex will start ${name} with its current image and variables.`,
                      confirmLabel: "Start",
                      action: async () => {
                      onBuildStart?.(node.id);
                      await run("start", () => projectsApi.start(projectId, node.id));
                    },
                    })
                  }
                >
                <Play size={12} strokeWidth={1.9} />
              </Action>
              ) : null}
            </>
          )}
        </div>
      </section>

      {error ? (
        <p role="alert" className="mt-4 text-[11px] tracking-tight text-rose-700">
          {error}
        </p>
      ) : null}

      <section className="mt-8 border-t border-fg/[0.06] pt-4">
        <p className="text-[11px] font-medium tracking-tight text-fg/35 uppercase">Danger</p>
        <button
          type="button"
          disabled={Boolean(pending.remove)}
          onClick={() =>
            confirm({
              title: database ? "Remove this database?" : "Remove this service?",
              detail: database
                ? `This deletes ${name} and its isolated volume. Other services on this canvas stay running.`
                : `This deletes ${name}, its container, its variables, and any custom domains. Other nodes on this canvas are not touched. If this is the last node, the project is removed too.`,
              confirmLabel: "Remove",
              tone: "danger",
              action: async () => {
                if (pendingRef.current.remove) return;
                onClose();
                onRemove?.();
              },
            })
          }
          className={cn(
            "mt-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium tracking-tight text-rose-700 transition-colors duration-150 ease-out hover:bg-rose-500/10 hover:text-rose-800",
            pending.remove ? "cursor-progress opacity-60" : "cursor-pointer",
          )}
        >
          {pending.remove ? (
            <Loader2 size={12} strokeWidth={2} className="animate-spin" />
          ) : (
            <Trash2 size={12} strokeWidth={1.9} />
          )}
          Remove {database ? "database" : "service"}
        </button>
      </section>
    </div>
  );
}

function Action({
  label,
  onClick,
  children,
  busy,
  primary,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  busy?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium tracking-tight transition-colors duration-150 ease-out",
        primary
          ? "bg-btn text-btn-fg hover:bg-brand-hover"
          : "bg-fg/[0.06] text-fg/75 ring-1 ring-fg/[0.08] hover:bg-fg/[0.1] hover:text-fg",
        busy ? "cursor-progress opacity-60" : "cursor-pointer",
      )}
    >
      {busy ? <Loader2 size={12} strokeWidth={2} className="animate-spin" /> : children}
      {label}
    </button>
  );
}
