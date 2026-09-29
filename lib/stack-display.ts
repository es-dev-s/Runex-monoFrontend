import type { Language, StackItem } from "@/lib/api";

const FALLBACK_COLOR: Record<string, string> = {
  go: "#00ADD8",
  golang: "#00ADD8",
  typescript: "#3178C6",
  javascript: "#F1E05A",
  python: "#3572A5",
  html: "#E34C26",
  css: "#563D7C",
  rust: "#DEA584",
  java: "#B07219",
  php: "#4F5D95",
  ruby: "#701516",
  "next.js": "#FFFFFF",
  nextjs: "#FFFFFF",
  react: "#61DAFB",
  fastapi: "#009688",
  "node.js": "#339933",
  nodejs: "#339933",
  express: "#339933",
  postgresql: "#336791",
  postgres: "#336791",
  redis: "#DC382D",
  vite: "#646CFF",
};

const KIND_ORDER = ["runtime", "framework", "database", "library"] as const;

const KIND_LABEL: Record<(typeof KIND_ORDER)[number], string> = {
  framework: "Framework",
  runtime: "Runtime",
  database: "Database",
  library: "Libraries",
};

export function stackColor(name: string, color?: string | null) {
  const trimmed = color?.trim();
  if (trimmed && trimmed !== "#000000") return trimmed;
  return FALLBACK_COLOR[name.trim().toLowerCase()] ?? "#8B949E";
}

export function formatLanguageShare(percentage: number) {
  if (!Number.isFinite(percentage) || percentage <= 0) return "0%";
  if (percentage < 1) return "<1%";
  if (percentage < 10) return `${percentage.toFixed(1)}%`;
  return `${Math.round(percentage)}%`;
}

export function notableLanguages(languages: Language[] | null | undefined) {
  return (languages ?? [])
    .filter((item) => item.name.trim() && item.percentage > 0)
    .slice(0, 8);
}

export function groupedStack(stack: StackItem[] | null | undefined) {
  const items = (stack ?? []).filter((item) => {
    const kind = item.kind.trim().toLowerCase();
    return item.name.trim() && kind !== "language" && kind !== "infra";
  });
  const seen = new Set<string>();

  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    items: items.filter((item) => {
      if (item.kind.trim().toLowerCase() !== kind) return false;
      const key = item.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}
