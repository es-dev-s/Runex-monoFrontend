/**
 * Mirrors backend/internal/api/envvalidate.go for database URLs, and applies
 * the same strictness to Redis URLs before they are saved.
 * The server remains authoritative for postgres keys.
 */

const POSTGRES_KEYS = new Set([
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRESQL_URL",
  "PLATFORM_DATABASE_URL",
  "DATABASE_PRIVATE_URL",
  "DATABASE_PUBLIC_URL",
]);

const REDIS_KEYS = new Set([
  "REDIS_URL",
  "REDIS_PUBLIC_URL",
  "REDIS_PRIVATE_URL",
  "CACHE_URL",
]);

export function validateEnvValue(key: string, value: string) {
  const name = key.trim().toUpperCase();
  const raw = value.trim();
  if (!name) return "Name the variable.";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key.trim())) {
    return "Use letters, numbers, and underscores. Start with a letter or underscore.";
  }
  if (POSTGRES_KEYS.has(name)) return validatePostgres(raw);
  if (REDIS_KEYS.has(name)) return validateRedis(raw);
  return "";
}

function validatePostgres(value: string) {
  if (!value) return "";
  if (/[\s]/.test(value)) {
    return "DATABASE_URL cannot contain spaces. Use a full postgres:// or postgresql:// URL.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "DATABASE_URL must be a valid postgres:// or postgresql:// URL.";
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return "DATABASE_URL must use the postgres:// or postgresql:// scheme.";
  }
  if (!url.hostname) return "DATABASE_URL must include a host.";
  return "";
}

function validateRedis(value: string) {
  if (!value) return "";
  if (/[\s]/.test(value)) {
    return "Redis URLs cannot contain spaces. Use redis:// or rediss://.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Use a valid redis:// or rediss:// URL.";
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return "Redis URLs must use the redis:// or rediss:// scheme.";
  }
  if (!url.hostname) return "The Redis URL must include a host.";
  return "";
}
