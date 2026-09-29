"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ApiError, projects, variables as variablesApi, type DatabaseOverview, type EnvVar } from "@/lib/api";
import { ConnectionField, copyText } from "@/components/projects/connection-urls";
import { cn } from "@/lib/cn";
import { readConnection, readPlatformVars, rememberConnection, rememberPlatformVars, rememberVariables } from "@/lib/panel-cache";

export function useLiveConnection(projectId: string, nodeId: string, status?: string) {
  const [info, setInfo] = useState<DatabaseOverview | null>(() => readConnection(projectId, nodeId));
  const [platform, setPlatform] = useState<EnvVar[] | null>(() => readPlatformVars(projectId, nodeId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nodeId.startsWith("draft_")) return;
    const known = readConnection(projectId, nodeId);
    const knownVars = readPlatformVars(projectId, nodeId);
    setInfo(known);
    setPlatform(knownVars);
    const controller = new AbortController();
    let timer = 0;
    let pulling = false;

    const pull = () => {
      if (pulling) return;
      pulling = true;
      const varsDone = variablesApi
        .list(projectId, nodeId, controller.signal)
        .then((vars) => {
          if (controller.signal.aborted) return false;
          const platformVars = vars.filter((item) => item.source === "platform");
          rememberPlatformVars(projectId, nodeId, platformVars);
          rememberVariables(
            projectId,
            nodeId,
            vars.filter((item) => item.source !== "platform"),
            platformVars.map((item) => item.key),
          );
          setPlatform(platformVars);
          setError(null);
          return hasPublicURL(platformVars);
        })
        .catch((cause) => {
          if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return false;
          if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) return false;
          setError(cause instanceof ApiError ? cause.message : "Could not load connection variables.");
          return false;
        });
      const overviewDone = projects
        .database(projectId, nodeId, controller.signal)
        .then((overview) => {
          if (controller.signal.aborted) return;
          rememberConnection(projectId, nodeId, overview);
          setInfo(overview);
          setError(null);
        })
        .catch((cause) => {
          if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
          if (cause instanceof ApiError && (cause.status === 409 || cause.status === 404)) return;
        });
      void Promise.all([varsDone, overviewDone]).then(([ready]) => {
        pulling = false;
        if (controller.signal.aborted) return;
        const waiting = status === "building" || status === "idle" || ready !== true;
        timer = window.setTimeout(pull, waiting ? 1000 : 4000);
      });
    };

    pull();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [projectId, nodeId, status]);

  return { info, platform, error };
}

function hasPublicURL(platform: EnvVar[]) {
  return platform.some((item) => /PUBLIC_URL$/.test(item.key) && item.value);
}

export function DatabaseVariables({
  projectId,
  nodeId,
  status,
}: {
  projectId: string;
  nodeId: string;
  status?: string;
}) {
  const { info, platform, error } = useLiveConnection(projectId, nodeId, status);
  const [copied, setCopied] = useState(false);

  const rows = useMemo(
    () =>
      connectionRows(info, platform ?? []).filter(
        (row) => row.key !== featuredURL(info, platform, false) && row.key !== featuredURL(info, platform, true),
      ),
    [info, platform],
  );
  const dotenv = connectionRows(info, platform ?? [])
    .map((row) => `${row.key}=${row.value}`)
    .join("\n");

  async function copyAll() {
    if (!dotenv) return;
    const ok = await copyText(dotenv);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const ready = Boolean(info?.internalUrl || info?.publicUrl || (platform && platform.length > 0));
  if (!ready && error) {
    return <p className="px-3 py-3 text-[11px] leading-relaxed tracking-tight text-rose-700">{error}</p>;
  }
  if (!ready) {
    return (
      <section className="border-b border-fg/[0.06] px-3 py-3">
        <h3 className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">Connection</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed tracking-tight text-fg/40">
          {status === "building" || status === "idle" || nodeId.startsWith("draft_")
            ? "Starting. The connection URL appears the moment it is reserved."
            : "Connection details appear here as soon as the database is ready."}
        </p>
      </section>
    );
  }

  return (
    <section className="border-b border-fg/[0.06]">
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <h3 className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">Connection</h3>
        <button
          type="button"
          onClick={() => void copyAll()}
          disabled={!dotenv}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium tracking-tight transition-colors duration-150 ease-out",
            dotenv
              ? "cursor-pointer text-fg/55 hover:bg-fg/[0.06] hover:text-fg"
              : "text-fg/20",
          )}
        >
          {copied ? <Check size={12} strokeWidth={2} className="text-emerald-800" /> : <Copy size={12} strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy all"}
        </button>
      </div>
      <p className="px-3 pt-1 text-[11px] leading-relaxed tracking-tight text-fg/35">
        Full URLs for this node. Copy one field, or copy every variable as KEY=value.
      </p>
      <div className="flex flex-col gap-3.5 px-3 py-3">
        <ConnectionField
          label={featuredURL(info, platform, false)}
          value={featuredValue(info, platform, false)}
          secret
        />
        <ConnectionField
          label={featuredURL(info, platform, true)}
          value={featuredValue(info, platform, true)}
          secret
        />
      </div>
      {rows.length > 0 ? (
        <ul className="border-t border-fg/[0.05]">
          {rows.map((row) => (
            <CopyRow key={row.key} name={row.key} value={row.value} secret={row.secret} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CopyRow({ name, value, secret }: { name: string; value: string; secret: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <li className="flex items-center gap-2 border-t border-fg/[0.04] px-3 py-2 first:border-t-0">
      <span className="w-[6.5rem] shrink-0 truncate font-mono text-[11px] text-fg/70 md:w-[9.5rem]" title={name}>
        {name}
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg/55" title={secret ? undefined : value}>
        {secret ? mask(value) : value || "—"}
      </code>
      <button
        type="button"
        aria-label={`Copy ${name}`}
        onClick={() => void copy()}
        disabled={!value}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-md transition-colors duration-150 ease-out md:size-7",
          value ? "cursor-pointer text-fg/35 hover:bg-fg/[0.06] hover:text-fg/80" : "text-fg/15",
        )}
      >
        {copied ? <Check size={12} strokeWidth={2} className="text-emerald-800" /> : <Copy size={12} strokeWidth={1.75} />}
      </button>
    </li>
  );
}

function connectionKind(info: DatabaseOverview | null, platform: EnvVar[] | null) {
  if (info?.kind === "redis" || info?.kind === "postgresql") return info.kind;
  if (platform?.some((item) => item.key.startsWith("REDIS"))) return "redis";
  return "postgresql";
}

function featuredURL(info: DatabaseOverview | null, platform: EnvVar[] | null, publicURL: boolean) {
  const redis = connectionKind(info, platform) === "redis";
  if (publicURL) return redis ? "REDIS_PUBLIC_URL" : "DATABASE_PUBLIC_URL";
  return redis ? "REDIS_URL" : "DATABASE_URL";
}

function featuredValue(info: DatabaseOverview | null, platform: EnvVar[] | null, publicURL: boolean) {
  const key = featuredURL(info, platform, publicURL);
  const stored = platform?.find((item) => item.key === key)?.value;
  if (stored) return stored;
  if (!info) return "";
  return publicURL ? info.publicUrl : info.internalUrl;
}

function connectionRows(info: DatabaseOverview | null, platform: EnvVar[]) {
  const byKey = new Map<string, { key: string; value: string; secret: boolean }>();
  for (const row of overviewRows(info)) {
    byKey.set(row.key, row);
  }
  for (const item of platform) {
    if (!item.key || !item.value) continue;
    byKey.set(item.key, {
      key: item.key,
      value: item.value,
      secret: isSecretKey(item.key),
    });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function overviewRows(info: DatabaseOverview | null) {
  if (!info) return [];
  if (info.kind === "redis") {
    return compactRows([
      { key: "REDIS_URL", value: info.internalUrl, secret: true },
      { key: "REDIS_PUBLIC_URL", value: info.publicUrl, secret: true },
      { key: "REDISHOST", value: info.host, secret: false },
      { key: "REDISPORT", value: info.port ? String(info.port) : "", secret: false },
      { key: "REDIS_PASSWORD", value: info.password ?? "", secret: true },
    ]);
  }
  return compactRows([
    { key: "DATABASE_URL", value: info.internalUrl, secret: true },
    { key: "DATABASE_PUBLIC_URL", value: info.publicUrl, secret: true },
    { key: "PGHOST", value: info.host, secret: false },
    { key: "PGPORT", value: info.port ? String(info.port) : "", secret: false },
    { key: "PGUSER", value: info.user ?? "", secret: false },
    { key: "PGPASSWORD", value: info.password ?? "", secret: true },
    { key: "PGDATABASE", value: info.database ?? "", secret: false },
  ]);
}

function compactRows(rows: { key: string; value: string; secret: boolean }[]) {
  return rows.filter((row) => row.value);
}

function isSecretKey(key: string) {
  return /PASSWORD|SECRET|URL/i.test(key);
}

function mask(value: string) {
  if (!value) return "—";
  if (value.length <= 12) return "•".repeat(Math.min(value.length, 8));
  return `${value.slice(0, 7)}••••${value.slice(-4)}`;
}
