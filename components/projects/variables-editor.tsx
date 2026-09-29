"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { ApiError, variables, type EnvVar } from "@/lib/api";
import { copyText } from "@/components/projects/connection-urls";
import { DatabaseVariables } from "@/components/projects/database-variables";
import { ImportSecretsDialog } from "@/components/projects/import-secrets-dialog";
import { RawEnvDialog } from "@/components/projects/raw-env-dialog";
import { cn } from "@/lib/cn";
import { formatEnv, isEnvKey, type EnvPair } from "@/lib/envfile";
import { readVariables, rememberVariables } from "@/lib/panel-cache";

const SOURCE_LABEL: Record<string, string> = {
  user: "Custom",
  detected: "Detected",
  platform: "Runex",
};

type Draft = { id: string; key: string; value: string };

let draftSeq = 0;

export function VariablesEditor({
  projectId,
  nodeId,
  database = false,
  status,
  onApplied,
}: {
  projectId: string;
  nodeId: string;
  database?: boolean;
  status?: string;
  onApplied?: () => void;
}) {
  const cachedVars = readVariables(projectId, nodeId);
  const [items, setItems] = useState<EnvVar[]>(() => cachedVars?.items ?? []);
  const [platformKeys, setPlatformKeys] = useState<string[]>(() => cachedVars?.platform ?? []);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const draftsRef = useRef(drafts);
  const [loading, setLoading] = useState(() => !cachedVars);
  const pendingRef = useRef<Record<string, true>>({});
  const [pending, setPending] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const appliedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  function mark(id: string, on: boolean) {
    if (on) pendingRef.current[id] = true;
    else delete pendingRef.current[id];
    setPending({ ...pendingRef.current });
  }

  function mergeServer(current: EnvVar[], server: EnvVar[]) {
    const held = new Set(
      current.filter((row) => pendingRef.current[row.id]).map((row) => row.key),
    );
    return server
      .filter((item) => item.source !== "platform")
      .map((row) => (held.has(row.key) ? (current.find((item) => item.key === row.key) ?? row) : row));
  }

  const load = useCallback(
    async (signal: AbortSignal, quiet = false) => {
      const ticket = ++generation.current;
      if (!quiet) setLoading(true);
      try {
        const next = await variables.list(projectId, nodeId, signal);
        if (signal.aborted || ticket !== generation.current) return;
        const platform = next.filter((item) => item.source === "platform").map((item) => item.key);
        const custom = next.filter((item) => item.source !== "platform");
        setPlatformKeys(platform);
        setItems((current) => {
          const merged = mergeServer(current, custom);
          rememberVariables(projectId, nodeId, merged, platform);
          return merged;
        });
        setError(null);
      } catch (cause) {
        if (signal.aborted) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof ApiError ? cause.message : "Could not load variables.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [projectId, nodeId],
  );

  useEffect(() => {
    const hit = readVariables(projectId, nodeId);
    setItems(hit?.items ?? []);
    setPlatformKeys(hit?.platform ?? []);
    setDrafts([]);
    setError(null);
    setLoading(!hit);
    const controller = new AbortController();
    void load(controller.signal, Boolean(hit));
    return () => {
      controller.abort();
      if (appliedTimer.current) clearTimeout(appliedTimer.current);
    };
  }, [load, nodeId, projectId]);

  useEffect(() => {
    if (database || status !== "building") return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void load(controller.signal, true);
    }, 1500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [database, load, status]);

  function addRow() {
    setError(null);
    setDrafts((current) => [...current, { id: `draft-${++draftSeq}`, key: "", value: "" }]);
  }

  async function saveDraft(id: string, source?: HTMLElement) {
    const draft = draftsRef.current.find((row) => row.id === id);
    if (!draft && !source) return;
    const row = source?.closest("li");
    const keyInput = row?.querySelector<HTMLInputElement>('input[placeholder="KEY"]');
    const valueInput = row?.querySelector<HTMLInputElement>('input[placeholder="value"]');
    const key = (keyInput?.value ?? draft?.key ?? "").trim();
    const value = valueInput?.value ?? draft?.value ?? "";
    if (!key) return;
    if (!isEnvKey(key)) {
      setError("Keys must start with a letter or underscore and contain only letters, numbers, and underscores.");
      return;
    }
    if (pendingRef.current[id]) return;
    mark(id, true);
    setError(null);
    try {
      const next = await variables.upsert(projectId, { key, value }, nodeId);
      mark(id, false);
      setItems((current) => mergeServer(current, next));
      setDrafts((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save the variable.");
    } finally {
      mark(id, false);
    }
  }

  async function saveExisting(item: EnvVar, value: string) {
    if (value === item.value || pendingRef.current[item.id]) return;
    mark(item.id, true);
    setError(null);
    try {
      const next = await variables.upsert(projectId, { key: item.key, value }, nodeId);
      mark(item.id, false);
      setItems((current) => mergeServer(current, next));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save the variable.");
    } finally {
      mark(item.id, false);
    }
  }

  async function remove(id: string) {
    if (pendingRef.current[id]) return;
    mark(id, true);
    setError(null);
    let snapshot: EnvVar[] = [];
    setItems((current) => {
      snapshot = current;
      return current.filter((item) => item.id !== id);
    });
    try {
      await variables.remove(projectId, id);
    } catch (cause) {
      setItems(snapshot);
      setError(cause instanceof ApiError ? cause.message : "Could not delete the variable.");
    } finally {
      mark(id, false);
    }
  }

  async function apply() {
    if (pendingRef.current.apply) return;
    mark("apply", true);
    setError(null);
    try {
      await variables.apply(projectId, nodeId);
      setApplied(true);
      if (appliedTimer.current) clearTimeout(appliedTimer.current);
      appliedTimer.current = setTimeout(() => setApplied(false), 2500);
      onApplied?.();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not restart the service.");
    } finally {
      mark("apply", false);
    }
  }

  function takeCustom(next: EnvVar[]) {
    generation.current += 1;
    const platform = next.filter((item) => item.source === "platform").map((item) => item.key);
    const custom = next.filter((item) => item.source !== "platform");
    rememberVariables(projectId, nodeId, custom, platform);
    setPlatformKeys(platform);
    setItems(custom);
  }

  async function importRaw(_raw: string, pairs: EnvPair[]) {
    if (pairs.length === 0) return;
    if (pendingRef.current.raw) return;
    mark("raw", true);
    setError(null);
    try {
      try {
        takeCustom(await variables.importRaw(projectId, _raw, nodeId));
      } catch (cause) {
        if (!(cause instanceof ApiError) || (cause.status !== 404 && cause.status !== 405)) throw cause;
        let next: EnvVar[] = [];
        for (const pair of pairs) {
          next = await variables.upsert(projectId, { key: pair.key, value: pair.value }, nodeId);
        }
        takeCustom(next);
      }
      setRawOpen(false);
      setDrafts([]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add those variables.");
    } finally {
      mark("raw", false);
    }
  }

  async function importSecrets(pairs: EnvPair[]) {
    if (pairs.length === 0) return;
    if (pendingRef.current.secrets) return;
    mark("secrets", true);
    setError(null);
    try {
      try {
        takeCustom(await variables.importRaw(projectId, formatEnv(pairs), nodeId));
      } catch (cause) {
        if (!(cause instanceof ApiError) || (cause.status !== 404 && cause.status !== 405)) throw cause;
        let next: EnvVar[] = [];
        for (const pair of pairs) {
          next = await variables.upsert(projectId, { key: pair.key, value: pair.value }, nodeId);
        }
        takeCustom(next);
      }
      setSecretsOpen(false);
      setDrafts([]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not import those secrets.");
    } finally {
      mark("secrets", false);
    }
  }

  async function copyAll() {
    const ok = await copyText(formatEnv(items.map((item) => ({ key: item.key, value: item.value }))));
    if (!ok) return;
    setCopiedAll(true);
    window.setTimeout(() => setCopiedAll(false), 1400);
  }

  const applying = Boolean(pending.apply);

  if (database) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DatabaseVariables projectId={projectId} nodeId={nodeId} status={status} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_3.5rem] gap-2 border-b border-fg/[0.06] bg-card px-3 py-2">
          <span className="text-[11px] font-medium tracking-tight text-fg/35">Variable</span>
          <span className="text-[11px] font-medium tracking-tight text-fg/35">Value</span>
          <span className="text-[11px] font-medium tracking-tight text-fg/35">Source</span>
          <span />
        </div>
        {items.length === 0 && drafts.length === 0 ? (
          loading ? null : (
          <div className="px-3 py-8 text-center">
            <p className="text-[13px] font-medium tracking-tight text-fg/75">No variables yet.</p>
            <p className="mt-1 text-[12px] tracking-tight text-fg/40">
              Paste a .env or add keys one at a time. Detected keys from the codebase show up here.
            </p>
          </div>
          )
        ) : (
          <ul>
            {items.map((item) => (
              <VariableRow
                key={item.id}
                name={item.key}
                value={item.value}
                source={SOURCE_LABEL[item.source] ?? item.source}
                locked={item.source === "platform"}
                disabled={Boolean(pending[item.id])}
                onSave={(value) => void saveExisting(item, value)}
                onRemove={() => void remove(item.id)}
              />
            ))}
            {drafts.map((draft) => (
              <li
                key={draft.id}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_3.5rem] items-center gap-2 border-b border-fg/[0.04] px-3 py-1.5"
              >
                <input
                  autoFocus
                  value={draft.key}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((row) =>
                        row.id === draft.id ? { ...row, key: event.target.value } : row,
                      ),
                    )
                  }
                  placeholder="KEY"
                  spellCheck={false}
                  className="h-8 min-w-0 rounded-md bg-fg/[0.04] px-2 font-mono text-[11px] text-fg ring-1 ring-fg/[0.08] outline-none placeholder:text-fg/25 focus:ring-fg/18"
                />
                <input
                  value={draft.value}
                  onChange={(event) =>
                    setDrafts((current) =>
                      current.map((row) =>
                        row.id === draft.id ? { ...row, value: event.target.value } : row,
                      ),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveDraft(draft.id, event.currentTarget);
                  }}
                  onBlur={(event) => void saveDraft(draft.id, event.currentTarget)}
                  placeholder="value"
                  spellCheck={false}
                  className="h-8 min-w-0 rounded-md bg-fg/[0.04] px-2 font-mono text-[11px] text-fg ring-1 ring-fg/[0.08] outline-none placeholder:text-fg/25 focus:ring-fg/18"
                />
                <span className="truncate text-[10px] tracking-tight text-fg/30">New</span>
                <button
                  type="button"
                  aria-label="Discard variable"
                  onClick={() => setDrafts((current) => current.filter((row) => row.id !== draft.id))}
                  className="grid size-7 cursor-pointer place-items-center rounded text-fg/30 hover:text-rose-700"
                >
                  <Trash2 size={12} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-fg/[0.06] p-3">
        {error && !rawOpen && !secretsOpen ? (
          <p role="alert" className="mb-2 text-[11px] leading-relaxed tracking-tight text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium tracking-tight text-fg/70 transition-colors duration-150 ease-out hover:bg-fg/[0.06] hover:text-fg"
          >
            <Plus size={13} strokeWidth={1.75} />
            New variable
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRawOpen(true);
            }}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium tracking-tight text-fg/70 transition-colors duration-150 ease-out hover:bg-fg/[0.06] hover:text-fg"
          >
            <FileText size={13} strokeWidth={1.75} />
            Raw Editor
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSecretsOpen(true);
            }}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium tracking-tight text-fg/70 transition-colors duration-150 ease-out hover:bg-fg/[0.06] hover:text-fg"
          >
            <KeyRound size={13} strokeWidth={1.75} />
            Import secrets
          </button>
          <button
            type="button"
            onClick={() => void copyAll()}
            disabled={items.length === 0}
            className={cn(
              "ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium tracking-tight transition-colors duration-150 ease-out",
              items.length === 0
                ? "text-fg/20"
                : "cursor-pointer text-fg/70 hover:bg-fg/[0.06] hover:text-fg",
            )}
          >
            {copiedAll ? <Check size={13} strokeWidth={2} className="text-emerald-700" /> : <Copy size={13} strokeWidth={1.75} />}
            {copiedAll ? "Copied" : "Copy all"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void apply()}
          disabled={applying}
          className={cn(
            "mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[12px] font-medium tracking-tight transition-colors duration-150 ease-out",
            applied
              ? "bg-emerald-400/15 text-emerald-800"
              : "bg-fg/[0.06] text-fg/75 ring-1 ring-fg/[0.08] hover:bg-fg/[0.1] hover:text-fg",
            applying ? "cursor-progress opacity-70" : "cursor-pointer",
          )}
        >
          {applied ? (
            <>
              <Check size={12} strokeWidth={2} />
              Restarted with new values
            </>
          ) : (
            "Restart service to apply"
          )}
        </button>
      </div>
      {rawOpen ? (
        <RawEnvDialog
          current={items.map((item) => ({ key: item.key, value: item.value }))}
          managedKeys={platformKeys}
          pending={Boolean(pending.raw)}
          error={error}
          onClose={() => {
            if (!pending.raw) setRawOpen(false);
          }}
          onAdd={(raw, pairs) => void importRaw(raw, pairs)}
        />
      ) : null}
      {secretsOpen ? (
        <ImportSecretsDialog
          currentKeys={items.map((item) => item.key)}
          managedKeys={platformKeys}
          pending={Boolean(pending.secrets)}
          error={error}
          onClose={() => {
            if (!pending.secrets) setSecretsOpen(false);
          }}
          onImport={(pairs) => void importSecrets(pairs)}
        />
      ) : null}
    </div>
  );
}

function VariableRow({
  name,
  value,
  source,
  locked,
  disabled,
  onSave,
  onRemove,
}: {
  name: string;
  value: string;
  source: string;
  locked?: boolean;
  disabled: boolean;
  onSave: (value: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <li className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_4.5rem_3.5rem] items-center gap-2 border-b border-fg/[0.04] px-3 py-1.5">
      <span className="truncate font-mono text-[11px] font-medium text-fg/85" title={name}>
        {name}
      </span>
      <input
        value={draft}
        disabled={disabled || locked}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onSave(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
        }}
        spellCheck={false}
        className="h-8 min-w-0 rounded-md bg-transparent px-2 font-mono text-[11px] text-fg/80 outline-none ring-1 ring-transparent hover:bg-fg/[0.03] focus:bg-fg/[0.04] focus:ring-fg/18 disabled:hover:bg-transparent"
      />
      <span className="truncate text-[10px] tracking-tight text-fg/30" title={source}>
        {source}
      </span>
      <span className="flex justify-end gap-0.5">
        <CopyButton name={name} value={draft} />
        {locked ? null : (
          <button
            type="button"
            aria-label={`Delete ${name}`}
            onClick={onRemove}
            disabled={disabled}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded text-fg/25 opacity-100 transition-[opacity,color] duration-150 ease-out hover:text-rose-700 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
        )}
      </span>
    </li>
  );
}

function CopyButton({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      aria-label={`Copy ${name}`}
      onClick={() => void copy()}
      disabled={!value}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded transition-[opacity,color] duration-150 ease-out",
        value
          ? "cursor-pointer text-fg/25 opacity-100 hover:text-fg/80 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          : "text-fg/10",
      )}
    >
      {copied ? <Check size={12} strokeWidth={2} className="text-emerald-700" /> : <Copy size={12} strokeWidth={1.75} />}
    </button>
  );
}
