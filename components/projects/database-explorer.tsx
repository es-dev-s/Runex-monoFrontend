"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Table2, X } from "lucide-react";
import { ApiError, NetworkError, projects, type DatabaseOverview, type DatabaseRowPage, type DatabaseTable, type EnvVar, type RedisKeyItem, type RedisKeyPage, type RedisKeyValue, type ServiceNode } from "@/lib/api";
import { ConnectionField } from "@/components/projects/connection-urls";
import { useLiveConnection } from "@/components/projects/database-variables";
import { DatabaseGrid, formatCount } from "@/components/projects/database-grid";
import { chromePanel } from "@/lib/chrome";
import { readTables, rememberTables } from "@/lib/panel-cache";
import { serviceLabel } from "@/lib/projects";
import { cn } from "@/lib/cn";

type TableRef = { schema: string; name: string };

type BoundPage = DatabaseRowPage & TableRef;

function sameTable(a: TableRef | null | undefined, b: TableRef | null | undefined) {
  return Boolean(a && b && a.schema === b.schema && a.name === b.name);
}

export function DatabaseExplorer({
  projectId,
  node,
}: {
  projectId: string;
  node: ServiceNode;
}) {
  const [studio, setStudio] = useState(false);
  const [picked, setPicked] = useState<TableRef | null>(null);
  const [redisKey, setRedisKey] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {node.kind === "redis" ? (
        <RedisBrowser
          projectId={projectId}
          nodeId={node.id}
          status={node.status}
          selection={redisKey}
          onSelect={setRedisKey}
          listOnly
          onOpen={() => setStudio(true)}
        />
      ) : (
        <PostgresBrowser
          projectId={projectId}
          nodeId={node.id}
          status={node.status}
          selection={picked}
          onSelect={setPicked}
          listOnly
          onOpen={() => setStudio(true)}
        />
      )}
      {studio ? (
        <DatabaseStudio
          projectId={projectId}
          node={node}
          selection={picked}
          onSelect={setPicked}
          redisKey={redisKey}
          onSelectKey={setRedisKey}
          onClose={() => setStudio(false)}
        />
      ) : null}
    </div>
  );
}

export function ConnectionCard({
  projectId,
  nodeId,
  status,
}: {
  projectId: string;
  nodeId: string;
  status?: string;
}) {
  const { info, platform, error } = useLiveConnection(projectId, nodeId, status);
  const view = info?.internalUrl || info?.publicUrl ? info : overviewFromVars(info, platform);

  if (!view && error) {
    return <p className="px-3 py-3 text-[11px] leading-relaxed tracking-tight text-fg/40">{error}</p>;
  }
  if (!view) {
    return (
      <p className="px-3 py-3 text-[12px] leading-relaxed tracking-tight text-fg/40">
        {status === "building" || nodeId.startsWith("draft_")
          ? "Starting. The connection URL appears the moment it is reserved."
          : "Connection details appear here as soon as the database is ready."}
      </p>
    );
  }

  const postgres = view.kind === "postgresql";
  return (
    <div className="flex flex-col gap-3.5 px-3 py-3">
      <div className="flex flex-col gap-2.5">
        <p className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">Private</p>
        <ConnectionField
          label="URL"
          value={view.internalUrl}
          secret
        />
        <div className="grid grid-cols-2 gap-2">
          <ConnectionField label="Host" value={view.host} />
          <ConnectionField label="Port" value={view.port ? String(view.port) : ""} />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <p className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">Public</p>
        <ConnectionField
          label="URL"
          value={view.publicUrl}
          secret
        />
        <div className="grid grid-cols-2 gap-2">
          <ConnectionField label="Public host" value={view.publicHost} />
          <ConnectionField label="Public port" value={view.publicPort ? String(view.publicPort) : ""} />
        </div>
      </div>
      {postgres ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ConnectionField label="User" value={view.user ?? ""} />
            <ConnectionField label="Database" value={view.database ?? ""} />
          </div>
          <ConnectionField label="Password" value={view.password ?? ""} secret />
        </>
      ) : (
        <ConnectionField label="Password" value={view.password ?? ""} secret />
      )}
    </div>
  );
}

function overviewFromVars(info: DatabaseOverview | null, platform: EnvVar[] | null): DatabaseOverview | null {
  const value = (key: string) => platform?.find((item) => item.key === key)?.value ?? "";
  const redis = info?.kind === "redis" || Boolean(value("REDIS_URL") || value("REDIS_PUBLIC_URL"));
  const internalUrl = value(redis ? "REDIS_URL" : "DATABASE_URL");
  const publicUrl = value(redis ? "REDIS_PUBLIC_URL" : "DATABASE_PUBLIC_URL");
  if (!internalUrl && !publicUrl) return info?.internalUrl || info?.publicUrl ? info : null;
  return {
    kind: redis ? "redis" : "postgresql",
    status: info?.status ?? "",
    internalUrl: internalUrl || info?.internalUrl || "",
    publicUrl: publicUrl || info?.publicUrl || "",
    host: value(redis ? "REDISHOST" : "PGHOST") || info?.host || "",
    publicHost: info?.publicHost ?? "",
    port: Number(value(redis ? "REDISPORT" : "PGPORT")) || info?.port || 0,
    publicPort: info?.publicPort ?? 0,
    user: value("PGUSER") || info?.user,
    password: value(redis ? "REDIS_PASSWORD" : "PGPASSWORD") || info?.password,
    database: value("PGDATABASE") || info?.database,
    version: info?.version,
    keys: info?.keys,
    memory: info?.memory,
  };
}

function PostgresBrowser({
  projectId,
  nodeId,
  status,
  selection,
  onSelect,
  listOnly = false,
  onOpen,
  wide = false,
}: {
  projectId: string;
  nodeId: string;
  status?: string;
  selection: TableRef | null;
  onSelect: (table: TableRef) => void;
  listOnly?: boolean;
  onOpen?: () => void;
  wide?: boolean;
}) {
  const [tables, setTables] = useState<DatabaseTable[]>(() => readTables(projectId, nodeId));
  const [page, setPage] = useState<BoundPage | null>(null);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("");
  const [offset, setOffset] = useState(0);
  const [afterStack, setAfterStack] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [loadingTables, setLoadingTables] = useState(() => readTables(projectId, nodeId).length === 0);
  const [warming, setWarming] = useState(status === "building");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const fetchGen = useRef(0);
  const warmingSince = useRef(Date.now());
  const limit = wide ? 100 : 50;
  const after = afterStack[afterStack.length - 1] ?? "";
  const selectedKey = selection ? `${selection.schema}.${selection.name}` : "";
  const fetchRows = !listOnly;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!selectedKey) return;
    setOffset(0);
    setAfterStack([""]);
    setSort("");
    setQuery("");
    setDebouncedQuery("");
    setError(null);
  }, [selectedKey]);

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    let busy = false;
    const pull = (quiet = false) => {
      if (busy && quiet) return;
      busy = true;
      if (!quiet) setLoadingTables(true);
      void projects
        .databaseTables(projectId, nodeId, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          rememberTables(projectId, nodeId, next);
          setTables(next);
          setError(null);
          if (status === "building" && next.length === 0 && Date.now() - warmingSince.current < 90_000) {
            setWarming(true);
            timer = window.setTimeout(() => pull(true), 1200);
            return;
          }
          setWarming(false);
          if (!listOnly && !selection && next[0]) {
            onSelect({ schema: next[0].schema, name: next[0].name });
          }
        })
        .catch((cause) => {
          if (controller.signal.aborted || isAbort(cause)) return;
          if (status !== "stopped" && status !== "failed" && (isStartingCause(cause) || status === "building")) {
            if (Date.now() - warmingSince.current > 90_000) {
              setWarming(false);
              setError("The database is taking longer than expected. Try again in a moment.");
              return;
            }
            setWarming(true);
            setError(null);
            timer = window.setTimeout(() => pull(true), 1200);
            return;
          }
          setWarming(false);
          setError(describe(cause));
        })
        .finally(() => {
          busy = false;
          if (!controller.signal.aborted) setLoadingTables(false);
        });
    };
    const cached = readTables(projectId, nodeId);
    if (cached.length > 0) {
      setTables(cached);
      setLoadingTables(false);
    }
    pull(cached.length > 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [projectId, nodeId, status]);

  useEffect(() => {
    if (!fetchRows || !selection) return;
    const gen = ++fetchGen.current;
    const controller = new AbortController();
    const table = selection;
    const fetchPage = () => {
      void projects
        .databaseRows(
          projectId,
          nodeId,
          {
            table: table.name,
            schema: table.schema,
            limit,
            offset: after ? 0 : offset,
            sort,
            q: debouncedQuery,
            after: after || undefined,
          },
          controller.signal,
        )
        .then((next) => {
          if (gen !== fetchGen.current || controller.signal.aborted) return;
          setPage({ ...next, schema: table.schema, name: table.name });
          setError(null);
        })
        .catch((cause) => {
          if (gen !== fetchGen.current || controller.signal.aborted || isAbort(cause) || isStartingCause(cause)) return;
          setError(describe(cause));
        })
    };
    fetchPage();
    return () => {
      fetchGen.current += 1;
      controller.abort();
    };
  }, [fetchRows, projectId, nodeId, selection?.schema, selection?.name, limit, offset, after, sort, debouncedQuery]);

  const visible = tables.filter((table) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return `${table.schema}.${table.name}`.toLowerCase().includes(needle);
  });

  function choose(table: DatabaseTable) {
    const next = { schema: table.schema, name: table.name };
    if (!sameTable(selection, next)) onSelect(next);
    onOpen?.();
  }

  function toggleSort(column: string) {
    setOffset(0);
    setAfterStack([""]);
    setSort((current) => {
      if (current === `${column}:asc`) return `${column}:desc`;
      return `${column}:asc`;
    });
  }

  const live = page && sameTable(page, selection) ? page : null;
  const keyset = Boolean(live?.keyset);
  const rangeStart = live
    ? keyset
      ? (afterStack.length - 1) * limit + (live.rows.length ? 1 : 0)
      : (live.offset ?? 0) + (live.rows.length ? 1 : 0)
    : 0;
  const rangeEnd = live
    ? keyset
      ? (afterStack.length - 1) * limit + live.rows.length
      : (live.offset ?? 0) + live.rows.length
    : 0;
  const estimate = Math.max(live?.estimatedRows ?? 0, rangeEnd);

  return (
    <div className={cn("flex min-h-0 flex-1 overflow-hidden", wide ? "flex-col md:flex-row" : "flex-col")}>
      <div
        className={cn(
          "flex min-h-0 flex-col border-fg/[0.06]",
          wide
            ? "max-h-[42%] w-full shrink-0 border-b md:max-h-none md:w-64 md:border-r md:border-b-0"
            : "min-h-0 flex-1",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="relative min-w-0 flex-1">
            <Search size={11} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg/28" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Tables"
              className="h-7 w-full rounded-md bg-fg/[0.04] pr-2 pl-6 text-[12px] text-fg outline-none ring-1 ring-fg/[0.07] placeholder:text-fg/28 focus:ring-fg/16"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {warming || status === "building" ? (
            <StartingState engine="PostgreSQL" />
          ) : error && listOnly ? (
            <p className="px-3 py-8 text-center text-[12px] leading-relaxed tracking-tight text-fg/40">{error}</p>
          ) : loadingTables ? null : visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] tracking-tight text-fg/32">
              {tables.length === 0 ? "No tables yet" : "No matching tables"}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 p-1">
              {visible.map((table) => {
                const active = sameTable(selection, table);
                return (
                  <li key={`${table.schema}.${table.name}`}>
                    <button
                      type="button"
                      onClick={() => choose(table)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out",
                        active ? "bg-fg/[0.06] text-fg" : "hover:bg-fg/[0.05] text-fg/85",
                      )}
                    >
                      <Table2 size={12} strokeWidth={1.75} className="shrink-0 text-fg/30" />
                      <span className="min-w-0 flex-1 truncate text-[12px] tracking-tight text-fg/85">
                        {table.schema === "public" ? table.name : `${table.schema}.${table.name}`}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-fg/28">
                        {formatCount(table.estimatedRows)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {listOnly && !loadingTables && tables.length > 0 ? (
          <p className="shrink-0 border-t border-fg/[0.06] px-3 py-2 text-[11px] tracking-tight text-fg/28">
            Click a table to open it
          </p>
        ) : null}
      </div>

      {listOnly ? null : (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selection ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-fg/[0.06] px-3 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg/70">
              {selection.schema}.{selection.name}
            </p>
            <div className="relative">
              <Search size={11} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg/28" />
              <input
                value={query}
                onChange={(event) => {
                  setOffset(0);
                  setAfterStack([""]);
                  setQuery(event.target.value);
                }}
                placeholder="Filter rows"
                className="h-7 w-[7.5rem] rounded-md bg-fg/[0.04] pr-2 pl-6 text-[12px] text-fg outline-none ring-1 ring-fg/[0.07] placeholder:text-fg/28 focus:ring-fg/16 md:w-36"
              />
            </div>
          </div>
        ) : null}
        {error && !warming ? (
          <p className="px-3 py-2 text-[11px] leading-relaxed tracking-tight text-fg/40">{error}</p>
        ) : null}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <DatabaseGrid
            columns={live?.columns ?? []}
            rows={live?.rows ?? []}
            sort={sort}
            onSort={toggleSort}
            empty={selection ? "No rows in this page" : "Select a table"}
          />
        </div>
        {live ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-fg/[0.06] px-3 py-2">
            <p className="text-[11px] tracking-tight text-fg/38">
              {rangeStart ? `${rangeStart}–${rangeEnd}` : "0"} of{" "}
              {live.hasMore && estimate <= rangeEnd
                ? `${formatCount(Math.max(estimate, 1))}+`
                : `${live.exact ? "" : "~"}${formatCount(estimate)}`}
              {live.truncated ? " · truncated" : ""}
            </p>
            <div className="flex gap-1">
              <Pager
                label="Previous"
                disabled={keyset ? afterStack.length <= 1 : offset <= 0}
                onClick={() => {
                  if (keyset) setAfterStack((current) => current.slice(0, -1));
                  else setOffset(Math.max(0, offset - limit));
                }}
              />
              <Pager
                label="Next"
                disabled={!live.hasMore}
                onClick={() => {
                  if (keyset && live.nextAfter) setAfterStack((current) => [...current, live.nextAfter ?? ""]);
                  else setOffset(offset + limit);
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}

function RedisBrowser({
  projectId,
  nodeId,
  status,
  selection,
  onSelect,
  listOnly = false,
  onOpen,
  wide = false,
}: {
  projectId: string;
  nodeId: string;
  status?: string;
  selection: string | null;
  onSelect: (name: string) => void;
  listOnly?: boolean;
  onOpen?: () => void;
  wide?: boolean;
}) {
  const [page, setPage] = useState<RedisKeyPage | null>(null);
  const [stack, setStack] = useState<number[]>([0]);
  const [matchInput, setMatchInput] = useState("*");
  const [match, setMatch] = useState("*");
  const [value, setValue] = useState<RedisKeyValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [warming, setWarming] = useState(status === "building");
  const warmingSince = useRef(Date.now());
  const cursor = stack[stack.length - 1] ?? 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMatch(matchInput.trim() || "*");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [matchInput]);

  useEffect(() => {
    setStack([0]);
  }, [match]);

  const load = useCallback(
    async (signal: AbortSignal, at: number) => {
      setLoading(true);
      try {
        const next = await projects.databaseKeys(projectId, nodeId, { match, cursor: at, limit: 50 }, signal);
        if (signal.aborted) return;
        setPage(next);
        setWarming(false);
        setError(null);
        return true;
      } catch (cause) {
        if (signal.aborted || isAbort(cause)) return false;
        if (status !== "stopped" && status !== "failed" && (isStartingCause(cause) || status === "building")) {
          if (Date.now() - warmingSince.current > 90_000) {
            setWarming(false);
            setError("The database is taking longer than expected. Try again in a moment.");
            return false;
          }
          setWarming(true);
          setError(null);
          return false;
        }
        setWarming(false);
        setError(describe(cause));
        return false;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [projectId, nodeId, match, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const pull = () => {
      void load(controller.signal, cursor).then((ready) => {
        if (controller.signal.aborted) return;
        if (status === "building" && Date.now() - warmingSince.current < 90_000) {
          timer = window.setTimeout(pull, 1500);
          return;
        }
        if (ready === false) timer = window.setTimeout(pull, 1200);
      });
    };
    pull();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [load, cursor, status]);

  useEffect(() => {
    if (listOnly || !selection) {
      if (!selection) setValue(null);
      return;
    }
    const controller = new AbortController();
    void projects
      .databaseKey(projectId, nodeId, selection, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setValue(next);
      })
      .catch((cause) => {
        if (controller.signal.aborted || isAbort(cause)) return;
        setError(describe(cause));
      });
    return () => controller.abort();
  }, [listOnly, projectId, nodeId, selection]);

  const keys: RedisKeyItem[] = page?.keys ?? [];

  return (
    <div className={cn("flex min-h-0 flex-1 overflow-hidden", wide ? "flex-col md:flex-row" : "flex-col")}>
      <div
        className={cn(
          "flex min-h-0 flex-col border-fg/[0.06]",
          wide
            ? "max-h-[42%] w-full shrink-0 border-b md:max-h-none md:w-72 md:border-r md:border-b-0"
            : "min-h-0 flex-1",
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            value={matchInput}
            onChange={(event) => setMatchInput(event.target.value || "*")}
            placeholder="Search keys"
            className="h-7 min-w-0 flex-1 rounded-md bg-fg/[0.04] px-2 font-mono text-[11px] text-fg outline-none ring-1 ring-fg/[0.07] placeholder:text-fg/28 focus:ring-fg/16"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {warming || status === "building" ? (
            <StartingState engine="Redis" />
          ) : error && listOnly ? (
            <p className="px-3 py-8 text-center text-[12px] leading-relaxed tracking-tight text-fg/40">{error}</p>
          ) : loading ? null : keys.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] tracking-tight text-fg/32">
              {match === "*" ? "No keys yet" : "No keys in this scan"}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 p-1">
              {keys.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item.name);
                      onOpen?.();
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-out",
                      selection === item.name ? "bg-fg/[0.06] text-fg" : "hover:bg-fg/[0.05]",
                    )}
                  >
                    <span className="rounded bg-fg/[0.06] px-1 font-mono text-[9px] tracking-tight text-fg/40 uppercase">
                      {item.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg/80">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-1 border-t border-fg/[0.06] px-3 py-2">
          <Pager
            label="Previous"
            disabled={stack.length <= 1}
            onClick={() => setStack((current) => current.slice(0, -1))}
          />
          <Pager
            label="Next"
            disabled={!page?.hasMore}
            onClick={() => page && setStack((current) => [...current, page.cursor])}
          />
        </div>
      </div>
      {listOnly ? null : (
      <div className="min-h-0 min-w-0 flex-1 overflow-auto px-3 py-3">
        {error && !warming ? <p className="mb-2 text-[11px] text-fg/40">{error}</p> : null}
        {value ? (
          <div>
            <p className="font-mono text-[12px] text-fg/80">{value.name}</p>
            <p className="mt-1 text-[11px] tracking-tight text-fg/35">
              {value.type}
              {value.ttl > 0 ? ` · TTL ${value.ttl}s` : ""}
              {value.truncated ? " · truncated" : ""}
            </p>
            <pre className="mt-3 overflow-auto rounded-lg bg-fg/[0.03] p-3 font-mono text-[11px] leading-relaxed text-fg/75 ring-1 ring-fg/[0.06]">
              {formatValue(value.value)}
            </pre>
          </div>
        ) : (
          <p className="py-10 text-center text-[12px] tracking-tight text-fg/32">Select a key</p>
        )}
      </div>
      )}
    </div>
  );
}

function Pager({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-7 rounded-md px-2 text-[11px] font-medium tracking-tight ring-1 ring-fg/[0.08]",
        disabled ? "cursor-default text-fg/20" : "cursor-pointer text-fg/65 hover:bg-fg/[0.06] hover:text-fg",
      )}
    >
      {label}
    </button>
  );
}

function isStartingCause(cause: unknown) {
  if (!(cause instanceof ApiError)) return false;
  if (cause.code === "database_stopped") return false;
  return cause.code === "database_starting" || cause.code === "database" || cause.isTransient;
}

function describe(cause: unknown) {
  if (isAbort(cause) || isStartingCause(cause)) return "";
  if (cause instanceof ApiError) {
    if (cause.code === "database_stopped") return "Start the database to browse its data.";
    return cause.message;
  }
  if (cause instanceof NetworkError) return cause.message;
  return "Could not load database data.";
}

function StartingState({ engine }: { engine: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <span className="size-1.5 animate-pulse rounded-full bg-[#F5C451] shadow-[0_0_10px_rgba(245,196,81,0.55)]" />
      <p className="text-[12px] font-medium tracking-tight text-amber-800">Starting {engine}</p>
      <p className="max-w-[220px] text-[11px] leading-relaxed tracking-tight text-fg/38">
        {engine === "Redis" ? "Keys appear when the instance is ready." : "Tables appear when the instance is ready."}
      </p>
    </div>
  );
}

function isAbort(cause: unknown) {
  return (
    (cause instanceof DOMException && cause.name === "AbortError") ||
    (cause instanceof Error && cause.name === "AbortError")
  );
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DatabaseStudio({
  projectId,
  node,
  selection,
  onSelect,
  redisKey,
  onSelectKey,
  onClose,
}: {
  projectId: string;
  node: ServiceNode;
  selection: TableRef | null;
  onSelect: (table: TableRef) => void;
  redisKey: string | null;
  onSelectKey: (name: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center px-2 py-2 md:px-4 md:py-5">
      <button
        type="button"
        aria-label="Close database studio"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
      />
      <div className={cn(chromePanel, "relative flex h-[min(94dvh,860px)] w-[min(1180px,calc(100vw-1rem))] flex-col md:h-[min(88vh,860px)] md:w-[min(1180px,94vw)]")}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-fg/[0.07] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium tracking-tight text-fg">{serviceLabel(node)}</p>
            <p className="mt-0.5 text-[11px] tracking-tight text-fg/38">
              {node.kind === "redis" ? "Redis" : "PostgreSQL"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-7 cursor-pointer place-items-center rounded-md text-fg/40 hover:bg-fg/[0.06] hover:text-fg"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </header>
        {node.kind === "redis" ? (
          <RedisBrowser
            projectId={projectId}
            nodeId={node.id}
            status={node.status}
            selection={redisKey}
            onSelect={onSelectKey}
            wide
          />
        ) : (
          <PostgresBrowser
            projectId={projectId}
            nodeId={node.id}
            status={node.status}
            selection={selection}
            onSelect={onSelect}
            wide
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
