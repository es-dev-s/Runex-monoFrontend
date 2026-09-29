"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Lock, Search } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { GitHubAccountBar } from "@/components/projects/github-account";
import {
  ApiError,
  NetworkError,
  deploy,
  github,
  type GitHubRepo,
  type GitHubStatus,
} from "@/lib/api";
import { chromeRow } from "@/lib/chrome";
import { cn } from "@/lib/cn";
import { loadGitHubCatalog, peekGitHub } from "@/lib/github-catalog";

export type GitHubDeployHandle = {
  canDeploy: boolean;
  deploy: () => Promise<void>;
};

/**
 * Repository picker for deploy-from-GitHub.
 *
 * GitHub is not an identity provider: the Runex session already exists.
 * Connecting installs the App and grants repository access.
 * Branch and auto-deploy live on the service sidebar after the first deploy.
 */
export function GitHubSource({
  projectId,
  nodeId,
  pending,
  setPending,
  onError,
  onStaged,
  onReady,
  onDeploying,
  deployOnSelect = false,
  manageHost,
  onPhase,
}: {
  projectId: string;
  nodeId?: string;
  pending: boolean;
  setPending: (value: boolean) => void;
  onError: (message: string | null) => void;
  onStaged: (nodeId: string, status: string) => void;
  onReady?: (handle: GitHubDeployHandle | null) => void;
  /** Fires as soon as a deploy is requested, before GitHub responds. */
  onDeploying?: (repo: string) => void;
  /** Optional: choosing a repository starts the deploy immediately. */
  deployOnSelect?: boolean;
  manageHost?: HTMLElement | null;
  /** loading while GitHub status is unknown, ready once repositories can be chosen. */
  onPhase?: (phase: "loading" | "ready" | "idle") => void;
}) {
  const seed = peekGitHub();
  const [status, setStatus] = useState<GitHubStatus | null>(seed?.status ?? null);
  const [repos, setRepos] = useState<GitHubRepo[]>(seed?.repos ?? []);
  const [installationId, setInstallationId] = useState<number | undefined>(
    seed?.installationId || undefined,
  );
  const [repo, setRepo] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!seed);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const pendingRef = useRef(false);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const onDeployingRef = useRef(onDeploying);
  const onStagedRef = useRef(onStaged);
  const onPhaseRef = useRef(onPhase);
  const installAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      installAbortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onDeployingRef.current = onDeploying;
  }, [onDeploying]);
  useEffect(() => {
    onStagedRef.current = onStaged;
  }, [onStaged]);
  useEffect(() => {
    onPhaseRef.current = onPhase;
  }, [onPhase]);

  const publishPhase = useCallback((next: GitHubStatus | null, failed: boolean) => {
    if (!next) {
      onPhaseRef.current?.("loading");
      return;
    }
    onPhaseRef.current?.(next.connected && next.configured && !failed ? "ready" : "idle");
  }, []);

  const load = useCallback(async (signal: AbortSignal, installId?: number, force = false) => {
    const cached = peekGitHub();
    const switching = Boolean(installId && cached && installId !== cached.installationId);
    if (!cached || switching) {
      setLoading(!cached);
      if (switching) setListing(true);
    }
    setListError(null);
    onErrorRef.current(null);
    try {
      if (switching && installId) {
        const list = await github.repos(installId, signal);
        if (signal.aborted || !aliveRef.current) return;
        setRepos(list.repos ?? []);
        setInstallationId(list.installationId || installId);
        setListError(null);
        return;
      }
      const catalog = await loadGitHubCatalog(force);
      if (signal.aborted || !aliveRef.current) return;
      setStatus(catalog.status);
      setRepos(catalog.repos);
      setInstallationId(catalog.installationId || catalog.status.installations?.[0]?.id);
      setListError(null);
      publishPhase(catalog.status, false);
    } catch (cause) {
      if (signal.aborted || !aliveRef.current) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      const hadRepos = (peekGitHub()?.repos.length ?? 0) > 0;
      if (!hadRepos) setRepos([]);
      const message =
        cause instanceof ApiError || cause instanceof NetworkError
          ? cause.message
          : "Could not reach GitHub.";
      if (
        cause instanceof ApiError &&
        (cause.code === "github_reconnect" ||
          cause.code === "github_repos" ||
          cause.status === 409 ||
          cause.status === 502)
      ) {
        if (!hadRepos) setListError(message);
        publishPhase(peekGitHub()?.status ?? null, true);
        return;
      }
      onErrorRef.current(message);
      publishPhase(peekGitHub()?.status ?? null, true);
    } finally {
      if (!signal.aborted && aliveRef.current) {
        setLoading(false);
        setListing(false);
      }
    }
  }, [publishPhase]);

  useEffect(() => {
    const cached = peekGitHub();
    if (cached) publishPhase(cached.status, false);
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, publishPhase]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter(
      (item) =>
        item.fullName.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
    );
  }, [repos, query]);

  async function connect(path = `${window.location.pathname}?source=github`) {
    try {
      const url = await github.installURL(path);
      window.location.href = url;
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "Could not open GitHub.");
    }
  }

  async function onInstallChange(id: number) {
    installAbortRef.current?.abort();
    const controller = new AbortController();
    installAbortRef.current = controller;
    setInstallationId(id);
    setRepo("");
    setQuery("");
    setListing(true);
    setListError(null);
    try {
      const list = await github.repos(id, controller.signal);
      if (controller.signal.aborted || !aliveRef.current) return;
      setRepos(list.repos ?? []);
      setInstallationId(list.installationId || id);
    } catch (cause) {
      if (controller.signal.aborted || !aliveRef.current) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setRepos([]);
      const message =
        cause instanceof ApiError || cause instanceof NetworkError
          ? cause.message
          : "Could not list GitHub repositories.";
      if (
        cause instanceof ApiError &&
        (cause.code === "github_reconnect" ||
          cause.code === "github_repos" ||
          cause.status === 409 ||
          cause.status === 502)
      ) {
        setListError(message);
        return;
      }
      onError(message);
    } finally {
      if (!controller.signal.aborted && aliveRef.current) setListing(false);
    }
  }

  const onDeploy = useCallback(
    async (picked?: GitHubRepo) => {
      if (pendingRef.current) return;
      const target = picked?.fullName || repo;
      const branch =
        picked?.defaultBranch ||
        repos.find((item) => item.fullName === target)?.defaultBranch;
      if (!target) {
        onErrorRef.current("Choose a repository first.");
        return;
      }
      pendingRef.current = true;
      setRepo(target);
      setPending(true);
      onErrorRef.current(null);
      onDeployingRef.current?.(target);
      try {
        const staged = await deploy.github(projectId, {
          repo: target,
          branch: branch || undefined,
          nodeId,
          installationId,
          autoDeploy: true,
        });
        if (!aliveRef.current) return;
        onStagedRef.current(staged.node.id, staged.status);
      } catch (cause) {
        if (!aliveRef.current) return;
        pendingRef.current = false;
        onErrorRef.current(
          cause instanceof ApiError || cause instanceof NetworkError
            ? cause.message
            : "Could not start the deploy.",
        );
        setPending(false);
      }
    },
    [installationId, nodeId, projectId, repo, repos, setPending],
  );

  const connected = Boolean(status?.connected) && !listError;
  useEffect(() => {
    if (!connected) {
      onReadyRef.current?.(null);
      return;
    }
    onReadyRef.current?.({
      canDeploy: Boolean(repo) && !pending,
      deploy: () => onDeploy(),
    });
  }, [connected, onDeploy, pending, repo]);

  useEffect(() => {
    return () => onReadyRef.current?.(null);
  }, []);

  if (loading && !status) {
    return null;
  }

  if (!status) {
    return (
      <ConnectGitHub
        title="Connect GitHub"
        detail="Could not load GitHub status. Connect the app to authorize repositories, or try again."
        onConnect={() => void connect()}
      />
    );
  }

  if (!status.configured) {
    return (
      <div className="grid min-h-[11rem] flex-1 place-items-center px-2">
        <p className="max-w-sm text-center text-[13px] leading-relaxed tracking-tight text-fg/45">
          GitHub is not configured on this Runex instance. Add the GitHub App credentials on the
          control plane to enable repository deploys.
        </p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <ConnectGitHub
        title="Connect GitHub"
        detail="Install the Runex GitHub App to list your repositories. You can add another account anytime."
        onConnect={() => void connect()}
      />
    );
  }

  const installations = status.installations ?? [];
  const activeInstallId = installationId ?? installations[0]?.id;
  const selectedRepo = repos.find((item) => item.fullName === repo);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="shrink-0 px-0.5">
        <GitHubAccountBar
          installations={installations}
          installationId={installationId}
          appSlug={status.slug}
          onInstallChange={(id) => void onInstallChange(id)}
          onAdd={() => void connect()}
          manageHost={manageHost}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-panel ring-1 ring-fg/[0.08]">
        <label className="relative block shrink-0 border-b border-fg/[0.06]">
          <Search
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg/28"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories"
            disabled={pending}
            className="h-9 w-full bg-transparent pr-3 pl-8 text-[13px] tracking-tight text-fg outline-none placeholder:text-fg/28 disabled:opacity-55"
          />
        </label>

        {pending && repo ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] bg-fg/[0.03] px-2.5 py-2 text-[12px] tracking-tight text-fg/70">
            <Loader2 size={13} strokeWidth={1.75} className="animate-spin text-fg/65" />
            <span className="min-w-0 truncate">
              Deploying <span className="text-fg">{selectedRepo?.name || repo}</span>
              {selectedRepo?.defaultBranch ? (
                <span className="text-fg/35"> · {selectedRepo.defaultBranch}</span>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {listing ? (
            <div className="grid place-items-center py-10">
              <Loader2 size={14} strokeWidth={1.75} className="animate-spin text-fg/30" />
            </div>
          ) : listError ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[13px] font-medium tracking-tight text-fg">
                Could not list repositories
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed tracking-tight text-fg/40">
                {listError}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void load(new AbortController().signal, activeInstallId, true)}
                  className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-btn px-3 text-[12px] font-medium tracking-tight text-btn-fg"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium tracking-tight text-fg/80 ring-1 ring-fg/[0.12]"
                >
                  Reconnect
                  <ExternalLink size={11} strokeWidth={1.75} className="opacity-55" />
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[12px] tracking-tight text-fg/40">
                {repos.length === 0
                  ? "No repositories granted to this GitHub account."
                  : "No repositories match that search."}
              </p>
              {repos.length === 0 ? (
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-btn px-3 text-[12px] font-medium tracking-tight text-btn-fg"
                >
                  Grant repositories
                  <ExternalLink size={11} strokeWidth={1.75} className="opacity-55" />
                </button>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5 p-1.5">
              {filtered.map((item) => {
                const selected = item.fullName === repo;
                const deploying = pending && selected;
                return (
                  <li key={item.fullName}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (deployOnSelect) {
                          void onDeploy(item);
                          return;
                        }
                        setRepo(item.fullName);
                        onErrorRef.current(null);
                      }}
                      className={cn(
                        chromeRow,
                        "group gap-2 rounded-md px-2 py-1.5",
                        selected && "bg-fg/[0.07] text-fg hover:bg-fg/[0.07]",
                        pending && "cursor-progress opacity-70",
                      )}
                    >
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13px] font-medium tracking-tight text-fg">
                          {item.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] tracking-tight text-fg/35">
                          {item.owner}
                          {item.defaultBranch ? (
                            <>
                              <span className="text-fg/20"> · </span>
                              {item.defaultBranch}
                            </>
                          ) : null}
                        </span>
                      </span>
                      {item.private ? (
                        <Lock size={11} strokeWidth={1.75} className="shrink-0 text-fg/28" />
                      ) : null}
                      {deploying ? (
                        <Loader2
                          size={12}
                          strokeWidth={1.75}
                          className="shrink-0 animate-spin text-fg/55"
                        />
                      ) : deployOnSelect ? (
                        <span className="shrink-0 text-[11px] font-medium tracking-tight text-fg/30 transition-colors group-hover:text-fg/80">
                          Deploy
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectGitHub({
  title,
  detail,
  onConnect,
}: {
  title: string;
  detail: string;
  onConnect: () => void;
}) {
  return (
    <div className="grid min-h-[11rem] flex-1 place-items-center">
      <div className="w-full max-w-sm px-2 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-fg/[0.04] text-fg/55 ring-1 ring-fg/[0.07]">
          <GithubMark size={18} />
        </span>
        <p className="mt-3.5 text-[13px] font-medium tracking-tight text-fg">{title}</p>
        <p className="mx-auto mt-1.5 text-[12px] leading-relaxed tracking-tight text-fg/40">
          {detail}
        </p>
        <button
          type="button"
          onClick={onConnect}
          className="mt-4 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-btn px-3.5 text-[13px] font-medium tracking-tight text-btn-fg transition-colors duration-150 ease-out hover:bg-brand-hover"
        >
          <GithubMark size={14} />
          Connect GitHub
          <ExternalLink size={12} strokeWidth={1.75} className="opacity-55" />
        </button>
      </div>
    </div>
  );
}
