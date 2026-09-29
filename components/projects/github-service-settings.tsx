"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, NetworkError, github, projects as projectsApi, type GitHubBranch, type GitHubInstallation, type ServiceNode } from "@/lib/api";
import { GitHubAccountBar } from "@/components/projects/github-account";
import { MenuSelect } from "@/components/ui/menu-select";
import { cn } from "@/lib/cn";

function repoParts(ref: string | null | undefined) {
  const raw = (ref ?? "").trim();
  const [owner, name] = raw.split("/");
  if (!owner || !name) return null;
  return { owner, name, fullName: `${owner}/${name}` };
}

export function GitHubServiceSettings({
  projectId,
  node,
  pending,
  onBusy,
  onChanged,
  onError,
}: {
  projectId: string;
  node: ServiceNode;
  pending: Record<string, true>;
  onBusy: (action: string, active: boolean) => void;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const repo = repoParts(node.sourceRef);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [statusSlug, setStatusSlug] = useState("");
  const [installations, setInstallations] = useState<GitHubInstallation[]>([]);
  const currentInstallId = node.githubInstallationId ?? installations[0]?.id;
  const locks = useRef(new Set<string>());

  const loadStatus = useCallback(async (signal: AbortSignal) => {
    try {
      const next = await github.status(signal);
      if (signal.aborted) return;
      setStatusSlug(next.slug ?? "");
      setInstallations(next.installations ?? []);
    } catch {
      if (!signal.aborted) setInstallations([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus]);

  useEffect(() => {
    if (!repo) {
      setBranches([]);
      return;
    }
    const controller = new AbortController();
    github
      .branches(repo.owner, repo.name, node.githubInstallationId ?? undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setBranches(result.branches ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setBranches([]);
      });
    return () => controller.abort();
  }, [node.githubInstallationId, repo?.name, repo?.owner]);

  const options = useMemo(() => {
    const names = new Set(branches.map((item) => item.name));
    const current = node.githubBranch?.trim();
    const list = branches.map((item) => ({
      value: item.name,
      label: item.name,
      hint: item.default ? "default" : undefined,
    }));
    if (current && !names.has(current)) {
      list.unshift({ value: current, label: current, hint: undefined });
    }
    return list;
  }, [branches, node.githubBranch]);

  async function connectAnother() {
    try {
      const url = await github.installURL(window.location.pathname);
      window.location.href = url;
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : "Could not open GitHub.");
    }
  }

  async function setBranch(next: string) {
    if (!next || next === node.githubBranch || locks.current.has("branch")) return;
    locks.current.add("branch");
    onBusy("branch", true);
    onError(null);
    try {
      await projectsApi.updateNode(projectId, node.id, { githubBranch: next });
      onChanged();
    } catch (cause) {
      onError(
        cause instanceof ApiError || cause instanceof NetworkError
          ? cause.message
          : "Could not update the branch.",
      );
    } finally {
      locks.current.delete("branch");
      onBusy("branch", false);
    }
  }

  async function setAutoDeploy(next: boolean) {
    if (locks.current.has("auto")) return;
    locks.current.add("auto");
    onBusy("auto", true);
    onError(null);
    try {
      await projectsApi.updateNode(projectId, node.id, { autoDeploy: next });
      onChanged();
    } catch (cause) {
      onError(
        cause instanceof ApiError || cause instanceof NetworkError
          ? cause.message
          : "Could not update auto-deploy.",
      );
    } finally {
      locks.current.delete("auto");
      onBusy("auto", false);
    }
  }

  const currentAccount =
    installations.find((item) => item.id === currentInstallId) ??
    (currentInstallId ? { id: currentInstallId, account: "GitHub", type: "User", createdAt: "", updatedAt: "" } : null);

  return (
    <div className="flex flex-col gap-4">
      <GitHubAccountBar
        locked
        installations={installations.length > 0 ? installations : currentAccount ? [currentAccount] : []}
        installationId={currentInstallId}
        appSlug={statusSlug}
        onAdd={() => void connectAnother()}
      />

      {repo ? (
        <MenuSelect
          label="Branch"
          value={node.githubBranch || ""}
          disabled={Boolean(pending.branch) || options.length === 0}
          placeholder="Select a branch"
          options={options}
          onChange={(next) => void setBranch(next)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium tracking-tight text-fg">Deploy on push</p>
          <p className="mt-0.5 text-[12px] tracking-tight text-fg/40">
            Rebuilds when {node.githubBranch || "the branch"} is pushed.
          </p>
        </div>
        <Toggle
          checked={Boolean(node.autoDeploy)}
          disabled={Boolean(pending.auto)}
          label="Deploy on push"
          onChange={(next) => void setAutoDeploy(next)}
        />
      </div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center overflow-hidden rounded-full p-[2px] transition-colors duration-150 ease-out",
        checked ? "bg-accent" : "bg-fg/15",
        disabled ? "cursor-progress opacity-60" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden="true"
        className="block size-4 rounded-full bg-fg transition-transform duration-150 ease-out"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0px)" }}
      />
    </button>
  );
}

