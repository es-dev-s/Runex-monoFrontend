"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, NetworkError, projects } from "@/lib/api";
import { GitHubSource, type GitHubDeployHandle } from "@/components/projects/github-source";
import { peekGitHub } from "@/lib/github-catalog";
import { isDraftId } from "@/lib/projects";
import { cn } from "@/lib/cn";

/**
 * Empty-canvas source step.
 * No GitHub account yet: connect. Connected: the repository list.
 */
export function FirstRunSource({
  projectId,
  nodeId,
  onDeployed,
  onDeploying,
  onFailed,
  compact = false,
}: {
  projectId: string;
  nodeId?: string;
  onDeployed: (nodeId: string) => void;
  onDeploying?: (repo: string) => void;
  onFailed?: (message: string) => void;
  compact?: boolean;
}) {
  const seeded = peekGitHub();
  const saving = isDraftId(projectId);
  const [phase, setPhase] = useState<"loading" | "ready" | "idle">(() =>
    seeded ? (seeded.status.connected && seeded.status.configured ? "ready" : "idle") : "loading",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canDeploy, setCanDeploy] = useState(false);
  const deployRef = useRef<(() => Promise<void>) | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  function report(message: string | null) {
    setError(message);
    if (message) onFailed?.(message);
  }

  function onReady(handle: GitHubDeployHandle | null) {
    deployRef.current = handle?.deploy ?? null;
    setCanDeploy(Boolean(handle?.canDeploy));
  }

  return (
    <Panel compact={compact}>
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2">
        <GitHubSource
          projectId={projectId}
          nodeId={nodeId}
          pending={pending}
          setPending={setPending}
          onError={report}
          onReady={onReady}
          onPhase={setPhase}
          onDeploying={onDeploying}
          onStaged={async (id, status) => {
            try {
              if (status !== "building") {
                await projects.deployNode(projectId, id, "manual", true);
              }
              if (!aliveRef.current) return;
              onDeployed(id);
            } catch (cause) {
              if (!aliveRef.current) return;
              if (cause instanceof ApiError && cause.code === "deploy_in_progress") {
                onDeployed(id);
                return;
              }
              report(
                cause instanceof ApiError || cause instanceof NetworkError
                  ? cause.message
                  : "Could not start the deploy.",
              );
              setPending(false);
            }
          }}
        />
      </div>

      {error ? (
        <p className="shrink-0 px-3 pb-1.5 text-[12px] leading-relaxed tracking-tight text-rose-700">
          {error}
        </p>
      ) : null}

      {phase === "ready" ? (
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-fg/[0.06] px-3 py-2.5">
        <button
          type="button"
          disabled={!canDeploy || pending || saving}
          onClick={() => void deployRef.current?.()}
          className="inline-flex h-8 min-w-[6.5rem] cursor-pointer items-center justify-center rounded-md bg-btn px-3 text-[12.5px] font-medium tracking-tight text-btn-fg transition-colors duration-150 ease-out hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-fg/20 disabled:text-fg/45"
        >
          {saving ? "Saving" : pending ? <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> : "Deploy"}
        </button>
      </footer>
      ) : null}
    </Panel>
  );
}

function Panel({
  compact,
  padded = false,
  children,
}: {
  compact: boolean;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-card text-fg ring-1 ring-fg/[0.08]",
        "shadow-[0_12px_36px_rgba(0,0,0,0.28)]",
        compact ? "min-h-0 w-full flex-1" : "h-[min(32rem,68dvh)] w-[min(25rem,calc(100vw-2.5rem))]",
        padded && "p-4",
      )}
    >
      {children}
    </div>
  );
}
