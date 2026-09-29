/** dotenv parse/format aligned with Runex's backend envfile package. */

export type EnvPair = { key: string; value: string };

export const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isEnvKey(key: string) {
  return ENV_KEY.test(key);
}

export function parseEnv(raw: string): {
  pairs: EnvPair[];
  ignored: number;
} {
  const text = raw.replace(/^\uFEFF/, "");
  const pairs: EnvPair[] = [];
  const index = new Map<string, number>();
  let ignored = 0;

  for (const original of text.split("\n")) {
    const line = original.replace(/\r$/, "");
    let trim = line.trim();
    if (!trim || trim.startsWith("#")) continue;
    if (trim.startsWith("export ")) trim = trim.slice(7).trim();
    const split = splitKV(trim);
    if (!split || !isEnvKey(split.key)) {
      ignored += 1;
      continue;
    }
    const existing = index.get(split.key);
    if (existing !== undefined) {
      pairs[existing] = split;
      continue;
    }
    index.set(split.key, pairs.length);
    pairs.push(split);
  }

  return { pairs, ignored };
}

export function formatEnv(pairs: EnvPair[]): string {
  return pairs
    .filter((pair) => isEnvKey(pair.key))
    .map((pair) => `${pair.key}=${quoteIfNeeded(pair.value)}`)
    .join("\n");
}

function splitKV(line: string): EnvPair | null {
  const idx = line.indexOf("=");
  if (idx <= 0) return null;
  const key = line.slice(0, idx).trim();
  const value = unquote(line.slice(idx + 1).trim());
  return { key, value };
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const start = value[0];
    const end = value[value.length - 1];
    if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
      return value.slice(1, -1).replace(/\\"/g, '"');
    }
  }
  const comment = value.indexOf(" #");
  if (comment >= 0) return value.slice(0, comment).trim();
  return value;
}

function quoteIfNeeded(value: string): string {
  if (!value) return "";
  if (/[\s#"'`]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
  return value;
}
