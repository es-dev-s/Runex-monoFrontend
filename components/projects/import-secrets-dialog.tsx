"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";
import { isEnvKey, type EnvPair } from "@/lib/envfile";
import { useSecretsVault, type DecryptedItem } from "@/hooks/use-secrets";

const ALL = "all";
const LOOSE = "loose";

export function ImportSecretsDialog({
  currentKeys,
  managedKeys,
  pending,
  error,
  onClose,
  onImport,
}: {
  currentKeys: string[];
  managedKeys: string[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onImport: (pairs: EnvPair[]) => void;
}) {
  const titleId = useId();
  const vault = useSecretsVault();
  const [scope, setScope] = useState(ALL);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [aliases, setAliases] = useState<Record<string, string>>({});

  const managed = useMemo(() => new Set(managedKeys), [managedKeys]);
  const existing = useMemo(() => new Set(currentKeys), [currentKeys]);

  const scoped = useMemo(() => {
    return vault.items.filter((item) => {
      if (item.corrupt) return false;
      if (scope === ALL) return true;
      if (scope === LOOSE) return !item.groupId;
      return item.groupId === scope;
    });
  }, [vault.items, scope]);

  const ready = useMemo(() => {
    return scoped.flatMap((item) => {
      const key = importKey(item, aliases);
      if (!isEnvKey(key) || managed.has(key) || !item.value) return [];
      return [{ id: item.id, key, value: item.value, exists: existing.has(key) }];
    });
  }, [scoped, aliases, managed, existing]);

  const chosen = ready.filter((row) => selected[row.id]);
  const canImport = chosen.length > 0 && !pending && vault.unlocked;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, pending]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center px-3 md:px-5">
      <button
        type="button"
        aria-label="Dismiss"
        disabled={pending}
        onClick={() => !pending && onClose()}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          chromePanel,
          "relative flex max-h-[min(42rem,calc(100dvh-1.25rem))] w-full max-w-[36rem] flex-col md:max-h-[min(42rem,calc(100dvh-2rem))]",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-fg/[0.06] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-[15px] font-medium tracking-tight text-fg">
              Import secrets
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed tracking-tight text-fg/42">
              Add keys from your vault to this service. Key/value secrets land as variables. A value-only secret needs a
              name first.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={pending}
            onClick={onClose}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-fg/35 hover:bg-fg/[0.06] hover:text-fg"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {vault.bundleLoading ? null : vault.needsAttach ? (
            <Empty
              title="Attach this vault first"
              detail="Open Secrets once to attach the old passphrase vault to this login. Then import here."
              href="/secrets"
            />
          ) : !vault.unlocked ? (
            <Empty title="Could not open the vault" detail={vault.error ?? "Sign in again, then retry."} />
          ) : vault.items.length === 0 ? (
            <Empty title="No secrets yet" detail="Save a key in Secrets, then import it into this service." href="/secrets" />
          ) : (
            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[12.5rem_minmax(0,1fr)] md:grid-rows-1">
              <aside className="flex gap-1.5 overflow-x-auto border-b border-fg/[0.06] px-3 py-2 md:block md:overflow-y-auto md:border-r md:border-b-0 md:px-0 md:py-2">
                <ScopeRow
                  active={scope === ALL}
                  count={vault.items.length}
                  onClick={() => setScope(ALL)}
                >
                  All secrets
                </ScopeRow>
                <ScopeRow
                  active={scope === LOOSE}
                  count={vault.items.filter((item) => !item.groupId).length}
                  onClick={() => setScope(LOOSE)}
                >
                  Ungrouped
                </ScopeRow>
                {vault.groups.map((group) => (
                  <ScopeRow
                    key={group.id}
                    active={scope === group.id}
                    count={vault.items.filter((item) => item.groupId === group.id).length}
                    onClick={() => setScope(group.id)}
                  >
                    {group.name}
                  </ScopeRow>
                ))}
              </aside>
              <div className="min-h-0 overflow-y-auto px-3 py-2">
                {scoped.length === 0 ? (
                  <p className="px-2 py-8 text-center text-[12px] text-fg/35">No secrets in this group.</p>
                ) : (
                  <ul>
                    {scoped.map((item) => {
                      const key = importKey(item, aliases);
                      const locked = isEnvKey(key) && managed.has(key);
                      const named = isEnvKey(key);
                      const checked = Boolean(selected[item.id]);
                      return (
                        <li key={item.id} className="flex items-start gap-2 rounded-lg px-1.5 py-2 hover:bg-fg/[0.03]">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked || !named || !item.value}
                            onChange={() => setSelected((cur) => ({ ...cur, [item.id]: !cur[item.id] }))}
                            className="mt-1.5 accent-accent"
                          />
                          <div className="min-w-0 flex-1">
                            {item.kind === "kv" ? (
                              <p className="truncate font-mono text-[12px] text-fg/80">{item.key}</p>
                            ) : (
                              <input
                                value={aliases[item.id] ?? ""}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setAliases((cur) => ({ ...cur, [item.id]: next }));
                                  if (isEnvKey(next) && !managed.has(next)) {
                                    setSelected((cur) => ({ ...cur, [item.id]: true }));
                                  }
                                }}
                                placeholder="NAME_THIS_KEY"
                                spellCheck={false}
                                className="h-8 w-full rounded-md bg-fg/[0.04] px-2 font-mono text-[11px] text-fg outline-none ring-1 ring-fg/[0.08] placeholder:text-fg/25 focus:ring-fg/18"
                              />
                            )}
                            <p className="mt-0.5 font-mono text-[11px] text-fg/30">{mask(item.value)}</p>
                          </div>
                          <span className="shrink-0 pt-1 text-[10px] tracking-tight text-fg/30">
                            {locked ? "Runex" : !named ? "Name" : existing.has(key) ? "Update" : "New"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {error ? (
          <p role="alert" className="border-t border-fg/[0.06] px-5 py-2 text-[12px] text-rose-700">
            {error}
          </p>
        ) : null}

        <footer className="flex shrink-0 items-center justify-end gap-1.5 border-t border-fg/[0.06] px-5 py-3.5">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13px] text-fg/55 hover:bg-fg/[0.06] hover:text-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canImport}
            onClick={() => onImport(chosen.map((row) => ({ key: row.key, value: row.value })))}
            className={cn(
              "inline-flex h-8 min-w-[7.5rem] items-center justify-center gap-1.5 rounded-lg bg-btn px-3 text-[13px] font-medium text-btn-fg hover:bg-brand-hover",
              canImport ? "cursor-pointer" : "cursor-not-allowed opacity-40",
              pending && "cursor-progress opacity-70",
            )}
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : null}
            Import {chosen.length || ""}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function importKey(item: DecryptedItem, aliases: Record<string, string>) {
  if (item.kind === "kv") return item.key.trim();
  return (aliases[item.id] ?? "").trim();
}

function mask(value: string) {
  if (!value) return "—";
  return "•".repeat(Math.min(22, Math.max(8, value.length)));
}

function ScopeRow({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center justify-between gap-3 rounded-md px-2.5 text-left text-[12px] md:h-auto md:w-full md:rounded-none md:py-2",
        active ? "bg-fg/[0.07] text-fg" : "text-fg/50 hover:bg-fg/[0.04] hover:text-fg",
      )}
    >
      <span className="truncate">{children}</span>
      <span className="text-[10px] text-fg/28">{count}</span>
    </button>
  );
}

function Empty({ title, detail, href }: { title: string; detail: string; href?: string }) {
  return (
    <div className="grid h-48 place-items-center px-6 text-center">
      <div>
        <p className="text-[13px] text-fg/55">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-fg/35">{detail}</p>
        {href ? (
          <Link href={href} className="mt-3 inline-block text-[12px] text-fg/70 underline-offset-4 hover:underline">
            Open Secrets
          </Link>
        ) : null}
      </div>
    </div>
  );
}
