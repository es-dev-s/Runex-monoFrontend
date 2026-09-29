"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, Globe, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ApiError, domains as domainsApi, type CustomDomain, type CustomDomainList, type CustomDomainRecord } from "@/lib/api";
import { ConnectionField, copyText } from "@/components/projects/connection-urls";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import { servicePublicUrl } from "@/lib/projects";

const DEFAULT_CNAME_TARGET = "cname.runex.cloud";

export function CustomDomains({
  projectId,
  nodeId,
  platformUrl,
  onVisitChange,
}: {
  projectId: string;
  nodeId: string;
  platformUrl?: string | null;
  onVisitChange?: () => void;
}) {
  const [items, setItems] = useState<CustomDomain[]>([]);
  const [generated, setGenerated] = useState(platformUrl ?? "");
  const [platformEnabled, setPlatformEnabled] = useState(true);
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [primaryKind, setPrimaryKind] = useState("");
  const [cnameTarget, setCnameTarget] = useState(DEFAULT_CNAME_TARGET);
  const [hostname, setHostname] = useState("");
  const [setupId, setSetupId] = useState<string | null>(null);
  const [inflight, setInflight] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const inflightRef = useRef<Set<string>>(new Set());
  const loadGen = useRef(0);
  const visitKey = useRef("");

  const busy = useCallback((key: string) => Boolean(inflight[key]), [inflight]);

  const begin = useCallback((key: string) => {
    inflightRef.current.add(key);
    setInflight((current) => ({ ...current, [key]: true }));
  }, []);

  const end = useCallback((key: string) => {
    inflightRef.current.delete(key);
    setInflight((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const applyState = useCallback(
    (next: CustomDomainList, opts?: { keepPlatform?: boolean }) => {
      setItems((current) => {
        if (next.domains) return mergeDomains(current, next.domains, inflightRef.current);
        if (next.domain) {
          const incoming = current.some((item) => item.id === next.domain!.id)
            ? current.map((item) => (item.id === next.domain!.id ? next.domain! : item))
            : [...current, next.domain];
          return mergeDomains(current, incoming, inflightRef.current);
        }
        return current;
      });
      const fullList = next.domains !== undefined;
      if (fullList && !opts?.keepPlatform && !inflightRef.current.has("platform")) {
        setGenerated(next.platformUrl ?? "");
        setPlatformEnabled(next.platformUrlEnabled !== false);
      } else if (next.platformUrl !== undefined && !opts?.keepPlatform && !inflightRef.current.has("platform")) {
        setGenerated(next.platformUrl);
        setPlatformEnabled(next.platformUrlEnabled !== false);
      }
      if (fullList || next.primaryUrl !== undefined) setPrimaryUrl(next.primaryUrl ?? "");
      if (fullList || next.primaryKind !== undefined) setPrimaryKind(next.primaryKind ?? "");
      if (fullList || next.cnameTarget || next.domain?.cnameTarget) setCnameTarget(resolveCnameTarget(next));
      if (fullList || next.primaryUrl !== undefined || next.primaryKind !== undefined || next.platformUrlEnabled !== undefined) {
        const key = `${next.primaryUrl ?? ""}|${next.primaryKind ?? ""}|${next.platformUrlEnabled !== false}`;
        if (visitKey.current && visitKey.current !== key) onVisitChange?.();
        visitKey.current = key;
      }
    },
    [onVisitChange],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const gen = ++loadGen.current;
      const next = await domainsApi.list(projectId, nodeId, signal);
      if (signal?.aborted || gen !== loadGen.current) return;
      applyState(next);
    },
    [applyState, nodeId, projectId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof ApiError ? cause.message : "Could not load domains.");
      }
    });
    return () => {
      controller.abort();
      loadGen.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const pending = items.some((item) => item.status === "pending" || item.status === "verifying" || item.status === "error");
    if (!pending) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [items, load]);

  async function add() {
    const value = hostname.trim();
    if (!value || inflightRef.current.has("add")) return;
    begin("add");
    setError(null);
    const known = new Set(items.map((item) => item.id));
    try {
      const next = await domainsApi.add(projectId, nodeId, value);
      applyState(next);
      setHostname("");
      const added = next.domain ?? (next.domains ?? []).find((item) => !known.has(item.id));
      if (added) setSetupId(added.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add that domain.");
    } finally {
      end("add");
    }
  }

  async function verify(id: string) {
    const key = `verify:${id}`;
    if (inflightRef.current.has(key) || inflightRef.current.has(`remove:${id}`)) return;
    begin(key);
    setError(null);
    try {
      const next = await domainsApi.verify(projectId, nodeId, id);
      applyState(next);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not check DNS yet.");
    } finally {
      end(key);
    }
  }

  async function generatePlatform() {
    if (inflightRef.current.has("platform")) return;
    begin("platform");
    setError(null);
    try {
      const next = await domainsApi.enablePlatform(projectId, nodeId);
      applyState(next);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not generate the Runex URL.");
    } finally {
      end("platform");
    }
  }

  const setup = items.find((item) => item.id === setupId) ?? null;
  const connected = items.filter((item) => item.status === "active");
  const primary = connected.find((item) => item.primary) ?? connected[0];
  const visit = primary?.url || primaryUrl;
  const customPrimary = Boolean(primary) || primaryKind === "custom";

  return (
    <section className="mt-6">
      {dialog}
      <p className="text-[11px] font-medium tracking-tight text-fg/35 uppercase">Domains</p>
      <p className="mt-1.5 text-[12px] leading-relaxed tracking-tight text-fg/42">
        Add your domain, then create the TXT and a Cloudflare Proxied CNAME to
        <span className="text-fg/70"> {cnameTarget}</span>. When it connects, it becomes the
        primary URL and the Runex URL is revoked. You can generate the Runex URL again anytime.
      </p>

      {visit && customPrimary ? (
        <div className="mt-3 rounded-lg bg-emerald-400/[0.06] px-3 py-2.5 ring-1 ring-emerald-300/15">
          <p className="text-[10px] font-medium tracking-[0.14em] text-emerald-800 uppercase">Primary URL</p>
          <a
            href={servicePublicUrl(visit)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex max-w-full items-center gap-1.5 text-[13px] tracking-tight text-[#047857] hover:text-[#065f46]"
          >
            <span className="truncate">{servicePublicUrl(visit)}</span>
            <ExternalLink size={12} strokeWidth={1.75} className="shrink-0 opacity-70" />
          </a>
          <p className="mt-1 text-[11px] leading-relaxed tracking-tight text-fg/40">
            Visitors should use this domain. It is the live URL for this service.
          </p>
        </div>
      ) : null}

      {platformEnabled && generated ? (
        <div className="mt-3">
          <ConnectionField
            label={customPrimary ? "Runex URL" : "Generated URL"}
            value={servicePublicUrl(generated)}
            hint={customPrimary ? "Optional secondary URL" : undefined}
          />
          {customPrimary ? (
            <button
              type="button"
              disabled={busy("platform")}
              onClick={() =>
                confirm({
                  title: "Revoke the Runex URL?",
                  detail: "The generated Runex URL will stop serving this app. Your custom domain stays primary. You can generate this URL again anytime.",
                  confirmLabel: "Revoke Runex URL",
                  tone: "danger",
                  action: async () => {
                    begin("platform");
                    setError(null);
                    try {
                      const next = await domainsApi.revokePlatform(projectId, nodeId);
                      applyState(next);
                    } catch (cause) {
                      setError(cause instanceof ApiError ? cause.message : "Could not revoke the Runex URL.");
                      throw cause;
                    } finally {
                      end("platform");
                    }
                  },
                })
              }
              className={cn(
                "mt-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium tracking-tight text-rose-700 hover:bg-rose-500/10 hover:text-rose-800",
                busy("platform") ? "cursor-progress opacity-60" : "cursor-pointer",
              )}
            >
              {busy("platform") ? <Loader2 size={11} strokeWidth={2} className="animate-spin" /> : null}
              Revoke Runex URL
            </button>
          ) : null}
        </div>
      ) : customPrimary ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-fg/[0.03] px-3 py-2.5 ring-1 ring-fg/[0.06]">
          <p className="text-[12px] leading-relaxed tracking-tight text-fg/45">
            Runex URL is revoked. This service is reachable on your custom domain.
          </p>
          <button
            type="button"
            disabled={busy("platform")}
            onClick={() => void generatePlatform()}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-fg/[0.06] px-2.5 text-[11px] font-medium tracking-tight text-fg/80 ring-1 ring-fg/[0.08] hover:bg-fg/[0.1] hover:text-fg",
              busy("platform") ? "cursor-progress opacity-60" : "cursor-pointer",
            )}
          >
            {busy("platform") ? <Loader2 size={11} strokeWidth={2} className="animate-spin" /> : <RefreshCw size={11} strokeWidth={1.9} />}
            Generate Runex URL
          </button>
        </div>
      ) : generated ? (
        <div className="mt-3">
          <ConnectionField label="Generated URL" value={servicePublicUrl(generated)} />
        </div>
      ) : null}

      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="app.example.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 w-full rounded-lg bg-fg/[0.04] px-3 text-base tracking-tight text-fg outline-none ring-1 ring-fg/[0.08] placeholder:text-fg/28 focus:ring-fg/20"
        />
        <button
          type="submit"
          disabled={busy("add") || !hostname.trim()}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-btn px-3 text-[14px] font-medium tracking-tight text-btn-fg",
            busy("add") || !hostname.trim() ? "cursor-progress opacity-60" : "cursor-pointer hover:bg-brand-hover",
          )}
        >
          {busy("add") ? <Loader2 size={12} strokeWidth={2} className="animate-spin" /> : <Globe size={12} strokeWidth={1.9} />}
          Add domain
        </button>
      </form>

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg bg-fg/[0.03] px-3 py-3 ring-1 ring-fg/[0.06]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[13px] tracking-tight text-fg/88">{item.hostname}</p>
                    {item.status === "active" && (item.primary || item.id === primary?.id) ? (
                      <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium tracking-[0.12em] text-emerald-800 uppercase">
                        Primary
                      </span>
                    ) : null}
                  </div>
                  <StatusLine item={item} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Ghost
                    label="Verify"
                    busy={busy(`verify:${item.id}`)}
                    onClick={() => void verify(item.id)}
                  >
                    <RefreshCw size={12} strokeWidth={1.9} />
                  </Ghost>
                  <Ghost
                    label="Remove"
                    danger
                    busy={busy(`remove:${item.id}`)}
                    onClick={() =>
                      confirm({
                        title: "Remove this domain?",
                        detail:
                          item.status === "active" && connected.length < 2
                            ? `${item.hostname} will stop routing here. Runex will restore the generated URL so this service stays reachable.`
                            : `${item.hostname} will stop routing to this service.`,
                        confirmLabel: "Remove domain",
                        tone: "danger",
                        action: async () => {
                          const key = `remove:${item.id}`;
                          begin(key);
                          setError(null);
                          try {
                            await domainsApi.remove(projectId, nodeId, item.id);
                            setItems((current) => current.filter((domain) => domain.id !== item.id));
                            setSetupId((current) => (current === item.id ? null : current));
                          } catch (cause) {
                            setError(cause instanceof ApiError ? cause.message : "Could not remove that domain.");
                            throw cause;
                          } finally {
                            end(key);
                          }
                        },
                      })
                    }
                  >
                    <Trash2 size={12} strokeWidth={1.9} />
                  </Ghost>
                </div>
              </div>

              {item.status === "active" && item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-[12px] tracking-tight text-[#1d4ed8] hover:text-[#1e3a8a]"
                >
                  <span className="truncate">{item.url}</span>
                  <ExternalLink size={11} strokeWidth={1.75} className="shrink-0 opacity-70" />
                </a>
              ) : null}

              {item.error && item.status !== "active" ? (
                <p className="mt-2 text-[11px] leading-relaxed tracking-tight text-amber-800">{item.error}</p>
              ) : null}

              <button
                type="button"
                onClick={() => setSetupId(item.id)}
                className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-md bg-fg/[0.05] px-2.5 text-[12px] font-medium tracking-tight text-fg/75 ring-1 ring-fg/[0.07] transition-colors duration-150 ease-out hover:bg-fg/[0.1] hover:text-fg"
              >
                {item.status === "active" ? "DNS records" : "DNS setup"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <AnimatePresence>
        {setup ? <DnsDialog key={setup.id} item={setup} onClose={() => setSetupId(null)} /> : null}
      </AnimatePresence>

      {error ? (
        <p role="alert" className="mt-3 text-[11px] tracking-tight text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}


function resolveCnameTarget(next: CustomDomainList): string {
  const fromList = (next.cnameTarget ?? next.domain?.cnameTarget ?? "").trim();
  if (fromList) return fromList;
  for (const domain of next.domains ?? []) {
    const fromDomain = (domain.cnameTarget ?? "").trim();
    if (fromDomain) return fromDomain;
  }
  for (const domain of next.domains ?? []) {
    const record = (domain.records ?? []).find((entry) => entry.type === "CNAME" && entry.value?.trim());
    if (record?.value?.trim()) return record.value.trim();
  }
  return DEFAULT_CNAME_TARGET;
}

function mergeDomains(current: CustomDomain[], incoming: CustomDomain[], inflight: Set<string>) {
  const local = new Map(current.map((item) => [item.id, item]));
  return incoming
    .filter((item) => !inflight.has(`remove:${item.id}`))
    .map((item) => {
      if (inflight.has(`verify:${item.id}`)) {
        return local.get(item.id) ?? item;
      }
      return item;
    });
}

function DnsDialog({ item, onClose }: { item: CustomDomain; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6">
      <m.button
        type="button"
        aria-label="Close DNS setup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/30"
      />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dns-setup-title"
        initial={{ y: "42%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "28%", opacity: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex max-h-[min(82dvh,36rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_40px_rgba(0,0,0,0.16)] md:max-w-[28rem] md:rounded-2xl md:pb-0"
      >
        <div className="flex shrink-0 justify-center pt-2.5 md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-fg/20" />
        </div>
        <header className="flex shrink-0 items-start gap-3 px-4 pt-3 pb-3 md:px-5 md:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id="dns-setup-title" className="text-[15px] font-medium tracking-tight text-fg">
              {item.status === "active" ? "DNS records" : "DNS setup"}
            </h2>
            <p className="mt-1 truncate text-[12px] tracking-tight text-fg/45">{item.hostname}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-fg/45 transition-colors hover:bg-fg/[0.06] hover:text-fg"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5 md:pb-5">
          <ol className="flex flex-col gap-2">
            {item.records.map((record) => (
              <RecordRow key={`${record.purpose}-${record.name}`} record={record} />
            ))}
          </ol>
          <p className="mt-3 text-[12px] leading-relaxed tracking-tight text-fg/45">
            On Cloudflare, leave the CNAME proxied (orange cloud). Runex authorizes that target so Error 1014 does not appear.
          </p>
        </div>
      </m.div>
    </div>,
    document.body,
  );
}

function StatusLine({ item }: { item: CustomDomain }) {
  const tone =
    item.status === "active"
      ? "text-emerald-800"
      : item.status === "error"
        ? "text-amber-800"
        : "text-fg/45";
  const label =
    item.status === "active"
      ? "Connected"
      : item.status === "verifying"
        ? "Checking DNS"
        : item.status === "error"
          ? "Needs attention"
          : "Add the records below";
  return <p className={cn("mt-0.5 text-[11px] tracking-tight", tone)}>{label}</p>;
}

function RecordRow({ record }: { record: CustomDomainRecord }) {
  const [copied, setCopied] = useState<"host" | "value" | null>(null);

  async function copy(which: "host" | "value", value: string) {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <li className="rounded-xl bg-fg/[0.04] px-3 py-2.5 ring-1 ring-fg/[0.06]">
      <span className="text-[10px] font-medium tracking-[0.12em] text-fg/40 uppercase">{record.type}</span>
      <CopyCell label="Host" value={record.host} copied={copied === "host"} onCopy={() => void copy("host", record.host)} />
      <CopyCell label="Value" value={record.value} copied={copied === "value"} onCopy={() => void copy("value", record.value)} mono />
      {record.hint ? <p className="mt-1.5 text-[11px] leading-relaxed tracking-tight text-fg/40">{record.hint}</p> : null}
    </li>
  );
}

function CopyCell({
  label,
  value,
  copied,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="mt-1.5 flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-card px-2.5 py-2 text-left ring-1 ring-fg/[0.06] transition-colors hover:bg-fg/[0.03]"
    >
      <span className="w-10 shrink-0 text-[10px] font-medium tracking-tight text-fg/35 uppercase">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate text-[12px] text-fg/80", mono && "font-mono")}>{value}</span>
      {copied ? (
        <Check size={13} strokeWidth={2} className="shrink-0 text-emerald-800" />
      ) : (
        <Copy size={13} strokeWidth={1.75} className="shrink-0 text-fg/35" />
      )}
    </button>
  );
}

function Ghost({
  label,
  onClick,
  children,
  busy,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium tracking-tight transition-colors duration-150 ease-out",
        danger
          ? "text-rose-700 hover:bg-rose-500/10 hover:text-rose-800"
          : "bg-fg/[0.05] text-fg/70 ring-1 ring-fg/[0.07] hover:bg-fg/[0.1] hover:text-fg",
        busy ? "cursor-progress opacity-60" : "cursor-pointer",
      )}
    >
      {busy ? <Loader2 size={11} strokeWidth={2} className="animate-spin" /> : children}
      {label}
    </button>
  );
}
