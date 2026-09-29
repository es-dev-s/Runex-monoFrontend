/** Display helpers for the signed-in user. The user itself comes from the API. */

export function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

/** Up to two initials, falling back to the first character for single words. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Only allow same-origin relative paths (blocks //evil and absolute URLs). */
export function safeInternalPath(raw: string | null | undefined, fallback = "") {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return fallback;
  return raw;
}

