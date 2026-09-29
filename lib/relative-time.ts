const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact relative timestamp, e.g. `just now`, `4m ago`, `3h ago`. */
export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 8) return "just now";
  if (seconds < MINUTE) return `${seconds}s ago`;
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  const days = Math.floor(seconds / DAY);
  if (days < 14) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Live stopwatch for an in-flight deploy, e.g. `0:09` or `3:42`. */
export function formatElapsed(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  // Skip the `0:00` frame so reloads never flash a fake clock.
  if (seconds < 1) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** Stopwatch only while a deploy is actually in flight. */
export function formatBuildClock(iso: string | null | undefined, now = Date.now()) {
  return formatElapsed(iso, now);
}

/** Node caption clock. Idle/running/failed never show a time, even if `startedAt` lingered. */
export function liveDeployClock(
  status: string | null | undefined,
  startedAt: string | null | undefined,
  now = Date.now(),
) {
  if (status !== "building") return "";
  return formatElapsed(startedAt, now);
}
