/** Browser-only AES-256-GCM for the Secrets vault. Bodies stay ciphertext on the server. */

export const VAULT_KDF = "pbkdf2-sha256";
export const VAULT_KDF_ITERS = 600_000;
export const VAULT_MIN_PASSPHRASE = 12;

export type EncryptedBlob = { iv: string; ct: string };

export type SecretKind = "kv" | "value";

export type SecretPlaintext = {
  kind: SecretKind;
  key?: string;
  value: string;
};

export function decodeDek(value: string): Uint8Array {
  const bytes = fromB64(value);
  if (bytes.length !== 32) throw new Error("invalid dek");
  return bytes;
}

export function encodeDek(bytes: Uint8Array): string {
  return toB64(bytes);
}

export function wipeBytes(bytes: Uint8Array | null) {
  if (!bytes) return;
  crypto.getRandomValues(bytes);
  bytes.fill(0);
}

export function passphraseIssues(pass: string, confirm?: string): string | null {
  if (pass.length < VAULT_MIN_PASSPHRASE) {
    return `Use at least ${VAULT_MIN_PASSPHRASE} characters.`;
  }
  if (pass.length > 200) return "Passphrase is too long.";
  if (confirm !== undefined && pass !== confirm) return "Passphrases do not match.";
  return null;
}

export async function createWrappedDek(passphrase: string): Promise<{
  dek: Uint8Array;
  salt: string;
  wrapIv: string;
  wrappedDek: string;
  kdf: typeof VAULT_KDF;
  kdfIters: typeof VAULT_KDF_ITERS;
}> {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(passphrase, salt, VAULT_KDF_ITERS);
  const wrapped = await encryptBytes(kek, dek);
  return {
    dek,
    salt: toB64(salt),
    wrapIv: wrapped.iv,
    wrappedDek: wrapped.ct,
    kdf: VAULT_KDF,
    kdfIters: VAULT_KDF_ITERS,
  };
}

export async function unwrapDek(
  passphrase: string,
  saltB64: string,
  wrapIv: string,
  wrappedDek: string,
  iters = VAULT_KDF_ITERS,
): Promise<Uint8Array> {
  const salt = fromB64(saltB64);
  const kek = await deriveKek(passphrase, salt, iters);
  return decryptBytes(kek, wrapIv, wrappedDek);
}

export async function wrapDek(
  passphrase: string,
  dek: Uint8Array,
): Promise<{ salt: string; wrapIv: string; wrappedDek: string; kdf: string; kdfIters: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(passphrase, salt, VAULT_KDF_ITERS);
  const wrapped = await encryptBytes(kek, dek);
  return {
    salt: toB64(salt),
    wrapIv: wrapped.iv,
    wrappedDek: wrapped.ct,
    kdf: VAULT_KDF,
    kdfIters: VAULT_KDF_ITERS,
  };
}

export async function encryptText(dek: Uint8Array, value: string): Promise<EncryptedBlob> {
  const key = await aesKey(dek);
  return encryptBytes(key, new TextEncoder().encode(value));
}

export async function decryptText(dek: Uint8Array, iv: string, ct: string): Promise<string> {
  const key = await aesKey(dek);
  const bytes = await decryptBytes(key, iv, ct);
  return new TextDecoder().decode(bytes);
}

export async function encryptSecret(dek: Uint8Array, secret: SecretPlaintext): Promise<EncryptedBlob> {
  return encryptText(dek, JSON.stringify(secret));
}

export async function decryptSecret(dek: Uint8Array, iv: string, ct: string): Promise<SecretPlaintext> {
  const parsed = JSON.parse(await decryptText(dek, iv, ct)) as SecretPlaintext;
  if (parsed.kind !== "kv" && parsed.kind !== "value") {
    throw new Error("Unrecognized secret payload");
  }
  return {
    kind: parsed.kind,
    key: typeof parsed.key === "string" ? parsed.key : "",
    value: typeof parsed.value === "string" ? parsed.value : "",
  };
}

async function deriveKek(passphrase: string, salt: Uint8Array, iters: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const saltCopy = new Uint8Array(salt);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltCopy, iterations: iters, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function aesKey(dek: Uint8Array): Promise<CryptoKey> {
  const copy = new Uint8Array(dek);
  return crypto.subtle.importKey("raw", copy, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new Uint8Array(data);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

async function decryptBytes(key: CryptoKey, ivB64: string, ctB64: string): Promise<Uint8Array> {
  const iv = new Uint8Array(fromB64(ivB64));
  const ct = new Uint8Array(fromB64(ctB64));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(pt);
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
