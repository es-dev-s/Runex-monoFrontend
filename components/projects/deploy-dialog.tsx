"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { FileArchive, FileCode, Loader2, Upload } from "lucide-react";
import { ApiError, NetworkError, deploy, projects } from "@/lib/api";
import { GithubMark } from "@/components/icons/github-mark";
import { GitHubSource, type GitHubDeployHandle } from "@/components/projects/github-source";
import { chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";

export type DeployTab = "upload" | "github";

function isDeployFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") || name.endsWith(".html") || name.endsWith(".htm");
}

/**
 * Stages a source onto a service, then immediately kicks the build.
 *
 * The backend separates these: the deploy/* endpoints only unpack and detect,
 * and the node deploy endpoint builds. Doing both here means one click does
 * what the user means by "deploy".
 */
export function DeployDialog({
  projectId,
  nodeId,
  adding = false,
  initialTab = "upload",
  onClose,
  onDeployed,
  onDeploying,
  onDeployFailed,
}: {
  projectId: string;
  /** Targets an existing service; omit to let the backend pick a free slot or create one. */
  nodeId?: string;
  adding?: boolean;
  initialTab?: DeployTab;
  onClose: () => void;
  onDeployed: (nodeId: string) => void;
  onDeploying?: (repo: string) => void;
  onDeployFailed?: () => void;
}) {
  const [tab, setTab] = useState<DeployTab>(initialTab);
  const [pending, setPending] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [githubCanDeploy, setGithubCanDeploy] = useState(false);
  const [manageHost, setManageHost] = useState<HTMLDivElement | null>(null);
  const githubDeploy = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab !== "github") {
      setGithubCanDeploy(false);
      githubDeploy.current = null;
    }
  }, [tab]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function describe(cause: unknown) {
    if (cause instanceof ApiError || cause instanceof NetworkError) return cause.message;
    return "The deploy could not be started.";
  }

  async function build(stagedNodeId: string, reuseSource = false) {
    try {
      await projects.deployNode(projectId, stagedNodeId, "manual", reuseSource);
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.code !== "deploy_in_progress") throw cause;
    }
    onDeployed(stagedNodeId);
    setPending(false);
    setStarted(true);
  }

  async function onUpload(file: File) {
    if (pending) return;
    if (!isDeployFile(file)) {
      setError("Use a .zip of the project folder, or a single .html file.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const staged = file.name.toLowerCase().endsWith(".zip")
        ? await deploy.zip(projectId, file, nodeId)
        : await deploy.html(projectId, file, nodeId);
      await build(staged.node.id);
    } catch (cause) {
      setError(describe(cause));
      setPending(false);
    }
  }

  const onGithubReady = useCallback((handle: GitHubDeployHandle | null) => {
    githubDeploy.current = handle?.deploy ?? null;
    setGithubCanDeploy(Boolean(handle?.canDeploy));
  }, []);

  const github = tab === "github";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center px-3 md:px-5">
      <button
        type="button"
        aria-label="Close"
        onClick={() => !pending && onClose()}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={adding ? "Add a service" : "Deploy a service"}
        className={cn(
          chromePanel,
          "relative flex h-[min(40rem,calc(100dvh-1.25rem))] w-full max-w-[34rem] flex-col md:h-[min(40rem,calc(100dvh-2rem))]",
        )}
      >
        <header className="shrink-0 px-5 pt-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="min-w-0 text-[15px] font-medium tracking-tight text-fg">
              {github ? "GitHub" : adding ? "Upload a service" : "Upload a project"}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {github ? <div ref={setManageHost} className="flex h-8 items-center" /> : null}
              <SourceToggle tab={tab} onChange={setTab} />
            </div>
          </div>
        </header>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden px-5",
            github ? "mt-2.5" : "mt-3",
          )}
        >
          {github ? (
            <GitHubSource
              projectId={projectId}
              nodeId={nodeId}
              pending={pending}
              setPending={setPending}
              onError={(message) => {
                setError(message);
                if (message) onDeployFailed?.();
              }}
              onStaged={(id, status) => {
                if (status === "building") {
                  onDeployed(id);
                  setPending(false);
                  setStarted(true);
                  return;
                }
                void build(id, true);
              }}
              onReady={onGithubReady}
              onDeploying={onDeploying}
              manageHost={manageHost}
            />
          ) : (
            <UploadDropZone pending={pending} onFile={(file) => void onUpload(file)} />
          )}
        </div>

        {started ? (
          <p role="status" className="shrink-0 px-5 pt-3 text-[12px] leading-relaxed tracking-tight text-fg/70">
            Deployment started. It keeps running if you leave or refresh.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="shrink-0 px-5 pt-3 text-[12px] leading-relaxed tracking-tight text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-fg/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-[13px] tracking-tight text-fg/60 transition-colors duration-150 ease-out hover:bg-fg/[0.06] hover:text-fg disabled:opacity-50"
          >
            Close
          </button>
          {github ? (
            <button
              type="button"
              onClick={() => void githubDeploy.current?.()}
              disabled={pending || !githubCanDeploy}
              className={cn(
                "inline-flex h-9 min-w-[10.5rem] items-center justify-center gap-1.5 rounded-lg bg-btn px-3.5 text-[13px] font-medium tracking-tight text-btn-fg transition-colors duration-150 ease-out hover:bg-brand-hover",
                pending || !githubCanDeploy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              )}
            >
              {pending ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : null}
              Deploy from GitHub
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UploadDropZone({
  pending,
  onFile,
}: {
  pending: boolean;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [over, setOver] = useState(false);

  function resetDrag() {
    dragDepth.current = 0;
    setOver(false);
  }

  function onDragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (pending) return;
    dragDepth.current += 1;
    setOver(true);
  }

  function onDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const transfer = event.dataTransfer;
    if (transfer) transfer.dropEffect = pending ? "none" : "copy";
  }

  function onDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setOver(false);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    resetDrag();
    if (pending) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.html,.htm,application/zip,text/html"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "grid min-h-[12rem] w-full flex-1 place-items-center content-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-[border-color,background-color] duration-150 ease-out",
          pending ? "cursor-progress border-fg/12 opacity-70" : "cursor-pointer",
          !pending && over
            ? "border-fg/40 bg-fg/[0.05]"
            : "border-fg/12 hover:border-fg/25 hover:bg-fg/[0.02]",
        )}
      >
        {pending ? (
          <Loader2 size={18} strokeWidth={1.75} className="animate-spin text-fg/50" />
        ) : (
          <span className="flex items-center gap-2">
            <FileKind icon={<FileArchive size={16} strokeWidth={1.6} />} label=".zip" />
            <FileKind icon={<FileCode size={16} strokeWidth={1.6} />} label=".html" />
          </span>
        )}
        <span className="grid gap-1">
          <span className="text-[13px] font-medium tracking-tight text-fg">
            {pending
              ? "Uploading and building…"
              : over
                ? "Drop to upload"
                : "Drop a .zip or .html, or click to choose"}
          </span>
          <span className="text-[12px] tracking-tight text-fg/35">
            The whole project folder, zipped — or a single HTML file.
          </span>
        </span>
      </button>
    </div>
  );
}

function FileKind({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-fg/[0.04] px-2.5 text-[12px] tracking-tight text-fg/70 ring-1 ring-fg/[0.08]">
      <span className="text-fg/55">{icon}</span>
      {label}
    </span>
  );
}

function SourceToggle({
  tab,
  onChange,
}: {
  tab: DeployTab;
  onChange: (tab: DeployTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Source"
      className="inline-flex shrink-0 items-center rounded-md bg-fg/[0.04] p-px ring-1 ring-fg/[0.08]"
    >
      <ToggleTab
        active={tab === "upload"}
        label="Upload"
        onClick={() => onChange("upload")}
      >
        <Upload size={12} strokeWidth={1.75} />
      </ToggleTab>
      <ToggleTab
        active={tab === "github"}
        label="GitHub"
        onClick={() => onChange("github")}
      >
        <GithubMark size={12} />
      </ToggleTab>
    </div>
  );
}

function ToggleTab({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[5px] px-2 text-[12px] tracking-tight transition-colors duration-150 ease-out",
        active ? "bg-fg/10 text-fg" : "text-fg/45 hover:text-fg/80",
      )}
    >
      {children}
      {label}
    </button>
  );
}
