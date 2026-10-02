"use client";

import { RunexLogo } from "@/components/inbox/runex-logo";
import { admin, auth, type AdminAccount } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/api/client";
import { formatBytes } from "@/lib/usage";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export function AdminHome({ granted = false }: { granted?: boolean }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [selfId, setSelfId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<AdminAccount | null>(null);
  const [busyId, setBusyId] = useState("");
  const [live, setLive] = useState(false);
  const [allowed, setAllowed] = useState(granted);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void auth
      .me(controller.signal)
      .then((me) => {
        if (me.role !== "admin") {
          setAllowed(false);
          router.replace("/app");
          return;
        }
        setAllowed(true);
        setSelfId(me.id);
        const source = new EventSource("/v1/admin/live", { withCredentials: true });
        sourceRef.current = source;
        source.onmessage = (event) => {
          try {
            const body = JSON.parse(event.data) as { users?: AdminAccount[] };
            setAccounts(body.users ?? []);
            setLive(true);
            setError("");
          } catch {
            setError("Could not read the live update.");
          }
        };
        source.onerror = () => setLive(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.isUnauthorized) {
          router.replace("/sign-in");
          return;
        }
        router.replace("/app");
      });
    return () => {
      controller.abort();
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [router]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = accounts ?? [];
    if (!needle) return rows;
    return rows.filter((row) => {
      const projects = (row.projects ?? []).map((project) =>
        `${project.name} ${(project.domains ?? []).map((domain) => domain.host).join(" ")}`,
      );
      return `${row.username} ${row.email} ${projects.join(" ")}`.toLowerCase().includes(needle);
    });
  }, [accounts, query]);

  const signedIn = accounts?.filter((row) => row.signedIn && !row.revokedAt).length ?? 0;
  const revoked = accounts?.filter((row) => row.revokedAt).length ?? 0;

  if (!allowed) return null;

  async function commit(row: AdminAccount, action: "revoke" | "restore") {
    setBusyId(row.id);
    setError("");
    try {
      const next = action === "revoke" ? await admin.revoke(row.id) : await admin.restore(row.id);
      setAccounts((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? []);
      setPending(null);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof NetworkError ? cause.message : "Could not update that account.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-canvas text-fg">
      <header className="sticky top-0 z-10 border-b border-line bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <RunexLogo className="h-7 w-7" />
          <span className="text-[15px] font-semibold tracking-[-0.03em]">Runex</span>
          <span className="text-[13px] text-fg/45">Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <a href="/app" className="rounded-full px-3 py-1.5 text-[13px] text-fg/70 transition-colors hover:bg-hover hover:text-fg">
              Projects
            </a>
            <button
              type="button"
              onClick={() => {
                void auth.logout().finally(() => router.replace("/sign-in"));
              }}
              className="rounded-full bg-btn px-3 py-1.5 text-[13px] text-btn-fg"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[32px] leading-none font-semibold tracking-[-0.045em]">People</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ${live ? "text-emerald-800" : "text-fg/40"}`}>
                <span className={`size-1.5 rounded-full ${live ? "bg-emerald-700" : "bg-fg/30"}`} />
                {live ? "Live" : "Connecting"}
              </span>
            </div>
            <p className="mt-2 text-[15px] text-fg/55">Accounts, usage, and domains update as people sign in.</p>
          </div>
          <label className="block w-full sm:w-72">
            <span className="sr-only">Search accounts</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or email"
              className="h-10 w-full rounded-xl border border-line bg-card px-3 text-[14px] outline-none placeholder:text-fg/35 focus:border-brand"
            />
          </label>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="Accounts" value={accounts?.length} />
          <Stat label="Signed in" value={accounts ? signedIn : undefined} />
          <Stat label="Revoked" value={accounts ? revoked : undefined} />
        </dl>

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-card">
          {accounts === null ? (
            <p className="px-4 py-10 text-center text-[14px] text-fg/45">Loading accounts…</p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-[14px] text-fg/45">No accounts match that search.</p>
          ) : (
            <ul>
              {shown.map((row) => (
                <li key={row.id} className="flex flex-col gap-3 border-b border-hairline px-4 py-4 last:border-b-0 sm:flex-row sm:items-start">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-btn text-[13px] text-btn-fg">
                    {row.username.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-medium tracking-[-0.02em]">{row.username}</span>
                      {row.role === "admin" ? (
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-brand">Admin</span>
                      ) : null}
                      <Status row={row} />
                      <span className="text-[12px] text-fg/45">{formatDays(row.days)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-fg/55">{row.email}</p>
                    <p className="mt-1 text-[12px] tabular-nums text-fg/55">
                      RAM {formatBytes(row.ramUsedBytes)} · CPU {formatCpu(row.cpuPercent)}
                    </p>
                    <ProjectList row={row} />
                  </div>
                  <div className="flex items-center gap-3 sm:ml-4 sm:pt-1">
                    <time className="text-[12px] text-fg/40" dateTime={row.createdAt}>
                      {formatJoined(row.createdAt)}
                    </time>
                    {row.id === selfId ? (
                      <span className="text-[13px] text-fg/40">You</span>
                    ) : row.revokedAt ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void commit(row, "restore")}
                        className="rounded-full border border-line px-3 py-1.5 text-[13px] transition-colors hover:bg-hover disabled:opacity-50"
                      >
                        Restore access
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setPending(row)}
                        className="rounded-full border border-line px-3 py-1.5 text-[13px] text-rose-700 transition-colors hover:bg-hover disabled:opacity-50"
                      >
                        Revoke access
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {pending ? (
        <div className="fixed inset-0 z-20 grid place-items-end bg-black/40 p-4 sm:place-items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="revoke-title" className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl">
            <h2 id="revoke-title" className="text-[18px] font-semibold tracking-[-0.03em]">
              Revoke access
            </h2>
            <p className="mt-2 text-[14px] leading-6 text-fg/65">
              <span className="font-medium text-fg">{pending.username}</span> ({pending.email}) will be signed out and will not be able to sign in until you restore access.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} className="rounded-full px-3 py-1.5 text-[13px] text-fg/70 hover:bg-hover">
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === pending.id}
                onClick={() => void commit(pending, "revoke")}
                className="rounded-full bg-btn px-3 py-1.5 text-[13px] text-btn-fg disabled:opacity-50"
              >
                Revoke access
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-3 py-3 sm:px-4">
      <dt className="text-[12px] text-fg/45">{label}</dt>
      <dd className="mt-1 text-[22px] font-semibold tracking-[-0.04em]">{value ?? "–"}</dd>
    </div>
  );
}

function ProjectList({ row }: { row: AdminAccount }) {
  const projects = row.projects ?? [];
  if (projects.length === 0) {
    return <p className="mt-2 text-[12px] text-fg/40">No deployments yet.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {projects.map((project) => (
        <li key={project.id} className="rounded-xl bg-canvas px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium tracking-[-0.01em]">{project.name}</span>
            <span className="text-[12px] tabular-nums text-fg/45">
              RAM {formatBytes(project.ramUsedBytes)} · CPU {formatCpu(project.cpuPercent)}
            </span>
          </div>
          {project.domains?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {project.domains.map((domain) => (
                <a
                  key={`${domain.kind}-${domain.host}`}
                  href={domain.url || `https://${domain.host}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line bg-card px-2 py-0.5 text-[12px] text-fg/70 hover:text-fg"
                >
                  {domain.host}
                  {domain.kind === "custom" && domain.status && domain.status !== "active" ? ` · ${domain.status}` : ""}
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-fg/35">No domain yet.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function formatDays(days: number) {
  if (!days || days <= 1) return "1 day";
  return `${days} days`;
}

function formatCpu(value: number) {
  if (!value) return "0%";
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function Status({ row }: { row: AdminAccount }) {
  if (row.revokedAt) {
    return <span className="text-[12px] font-medium text-rose-700">Revoked</span>;
  }
  if (row.signedIn) {
    return <span className="text-[12px] font-medium text-emerald-800">Signed in</span>;
  }
  return <span className="text-[12px] text-fg/40">Signed out</span>;
}

function formatJoined(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
