"use client";

import type { DatabaseColumn } from "@/lib/api";
import { cn } from "@/lib/cn";

export function DatabaseGrid({
  columns,
  rows,
  sort,
  onSort,
  empty,
}: {
  columns: DatabaseColumn[];
  rows: Record<string, unknown>[];
  sort?: string;
  onSort?: (column: string) => void;
  empty?: string;
}) {
  if (columns.length === 0) {
    return <p className="px-4 py-10 text-center text-[12px] tracking-tight text-fg/32">{empty ?? "No columns"}</p>;
  }

  const [sortCol, sortDir] = parseSort(sort);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((column) => (
              <th
                key={column.name}
                className="border-b border-fg/[0.08] bg-card px-3 py-2 font-medium"
              >
                <button
                  type="button"
                  disabled={!onSort}
                  onClick={() => onSort?.(column.name)}
                  className={cn(
                    "flex max-w-[14rem] items-center gap-1.5 text-left",
                    onSort ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  <span className="truncate text-[11px] tracking-tight text-fg/70">{column.name}</span>
                  {column.pk ? (
                    <span className="rounded bg-fg/[0.06] px-1 font-mono text-[9px] text-fg/35">PK</span>
                  ) : null}
                  {sortCol === column.name ? (
                    <span className="font-mono text-[9px] text-fg/40">{sortDir === "desc" ? "↓" : "↑"}</span>
                  ) : null}
                </button>
                <p className="mt-0.5 truncate font-mono text-[10px] font-normal tracking-tight text-fg/28">
                  {column.type}
                </p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-[12px] tracking-tight text-fg/32"
              >
                {empty ?? "No rows in this page"}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="hover:bg-fg/[0.025]">
                {columns.map((column) => (
                  <td
                    key={column.name}
                    className="max-w-[18rem] truncate border-b border-fg/[0.045] px-3 py-1.5 font-mono text-[11px] text-fg/78"
                    title={cellTitle(row[column.name])}
                  >
                    <Cell value={row[column.name]} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function parseSort(sort?: string): [string, string] {
  if (!sort) return ["", "asc"];
  const [col, dir] = sort.split(":");
  return [col ?? "", dir === "desc" ? "desc" : "asc"];
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-fg/22">null</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-fg/70">{value ? "true" : "false"}</span>;
  }
  if (typeof value === "object") {
    return <span>{safeString(value)}</span>;
  }
  return <span>{String(value)}</span>;
}

function cellTitle(value: unknown) {
  if (value === null || value === undefined) return "";
  return safeString(value);
}

function safeString(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatCount(n: number) {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(n >= 10_000_000_000_000 ? 0 : 1)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  return n.toLocaleString("en-US");
}
