"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, NetworkError, secrets } from "@/lib/api";
import type { SecretGroupRecord, SecretItemRecord, SecretVaultMeta, SecretsBundle } from "@/lib/api";
import {
  decodeDek,
  decryptSecret,
  decryptText,
  encodeDek,
  encryptSecret,
  encryptText,
  unwrapDek,
  wipeBytes,
  type SecretKind,
  type SecretPlaintext,
} from "@/lib/secrets-crypto";

export type DecryptedGroup = {
  id: string;
  name: string;
  createdAt: string;
  record: SecretGroupRecord;
};

export type DecryptedItem = {
  id: string;
  groupId: string;
  kind: SecretKind;
  key: string;
  value: string;
  createdAt: string;
  record: SecretItemRecord;
  corrupt?: boolean;
};

export function useSecretsVault() {
  const dekRef = useRef<Uint8Array | null>(null);
  const [bundleLoading, setBundleLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vault, setVault] = useState<SecretVaultMeta>({ exists: false });
  const [groups, setGroups] = useState<DecryptedGroup[]>([]);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [unlocked, setUnlocked] = useState(false);

  const hydrate = useCallback(async (dek: Uint8Array, bundle?: SecretsBundle) => {
    const next = bundle ?? (await secrets.bundle());
    setVault({ ...next.vault, dek: undefined });
    const openedGroups: DecryptedGroup[] = [];
    for (const group of next.groups ?? []) {
      try {
        openedGroups.push({
          id: group.id,
          name: await decryptText(dek, group.nameIv, group.nameCt),
          createdAt: group.createdAt,
          record: group,
        });
      } catch {
        openedGroups.push({ id: group.id, name: "Unreadable group", createdAt: group.createdAt, record: group });
      }
    }
    const openedItems: DecryptedItem[] = [];
    for (const item of next.items ?? []) {
      try {
        const plain = await decryptSecret(dek, item.bodyIv, item.bodyCt);
        openedItems.push({
          id: item.id,
          groupId: item.groupId ?? "",
          kind: plain.kind,
          key: plain.key ?? "",
          value: plain.value,
          createdAt: item.createdAt,
          record: item,
        });
      } catch {
        openedItems.push({
          id: item.id,
          groupId: item.groupId ?? "",
          kind: "value",
          key: "",
          value: "",
          createdAt: item.createdAt,
          record: item,
          corrupt: true,
        });
      }
    }
    dekRef.current = dek;
    setGroups(openedGroups);
    setItems(openedItems);
    setUnlocked(true);
  }, []);

  const inflight = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const loadBundle = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setBundleLoading(true);
    try {
      const next = await secrets.bundle(controller.signal);
      if (controller.signal.aborted) return null;
      setVault({ ...next.vault, dek: undefined });
      if (next.vault.unlock === "session" && next.vault.dek) {
        await hydrate(decodeDek(next.vault.dek), next);
        if (controller.signal.aborted) return null;
        setError(null);
        return next;
      }
      setUnlocked(false);
      setGroups([]);
      setItems([]);
      return next;
    } catch (cause) {
      if (controller.signal.aborted) return null;
      if (cause instanceof DOMException && cause.name === "AbortError") return null;
      setError(asMessage(cause, "Could not load the vault."));
      return null;
    } finally {
      if (!controller.signal.aborted) setBundleLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    void loadBundle();
    return () => {
      inflight.current?.abort();
      wipeBytes(dekRef.current);
      dekRef.current = null;
    };
  }, [loadBundle]);

  async function attachLegacy(passphrase: string) {
    if (busyRef.current) return false;
    if (!vault.exists || !vault.salt || !vault.wrapIv || !vault.wrappedDek) {
      setError("This vault is already tied to your login.");
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const dek = await unwrapDek(passphrase, vault.salt, vault.wrapIv, vault.wrappedDek, vault.kdfIters);
      await secrets.attach(encodeDek(dek));
      await hydrate(dek);
      return true;
    } catch (cause) {
      if (cause instanceof ApiError || cause instanceof NetworkError) {
        setError(asMessage(cause, "Could not attach the vault to this login."));
      } else {
        setError("That passphrase does not open this vault.");
      }
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function addGroup(name: string) {
    const dek = dekRef.current;
    if (!dek || busyRef.current) return null;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name the group.");
      return null;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await encryptText(dek, trimmed);
      const created = await secrets.createGroup({ nameIv: blob.iv, nameCt: blob.ct });
      await hydrate(dek);
      return created.group.id;
    } catch (cause) {
      setError(asMessage(cause, "Could not create the group."));
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function renameGroup(id: string, name: string) {
    const dek = dekRef.current;
    if (!dek || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await encryptText(dek, name.trim());
      await secrets.renameGroup(id, { nameIv: blob.iv, nameCt: blob.ct });
      await hydrate(dek);
      return true;
    } catch (cause) {
      setError(asMessage(cause, "Could not rename the group."));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removeGroup(id: string) {
    const dek = dekRef.current;
    if (!dek || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await secrets.removeGroup(id);
      await hydrate(dek);
      return true;
    } catch (cause) {
      setError(asMessage(cause, "Could not delete the group."));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function addItems(rows: SecretPlaintext[], groupId?: string) {
    const dek = dekRef.current;
    if (!dek || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const encrypted = [];
      for (const row of rows) {
        const blob = await encryptSecret(dek, row);
        encrypted.push({ groupId: groupId || undefined, bodyIv: blob.iv, bodyCt: blob.ct });
      }
      await secrets.createItems(encrypted);
      try {
        await hydrate(dek);
      } catch (cause) {
        setError(asMessage(cause, "Saved. Reload if the list looks stale."));
      }
      return true;
    } catch (cause) {
      setError(asMessage(cause, "Could not save secrets."));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function updateItem(id: string, plain: SecretPlaintext, groupId?: string) {
    const dek = dekRef.current;
    if (!dek || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const blob = await encryptSecret(dek, plain);
      await secrets.updateItem(id, { groupId: groupId || "", bodyIv: blob.iv, bodyCt: blob.ct });
      try {
        await hydrate(dek);
      } catch (cause) {
        setError(asMessage(cause, "Updated. Reload if the list looks stale."));
      }
      return true;
    } catch (cause) {
      setError(asMessage(cause, "Could not update the secret."));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    const dek = dekRef.current;
    if (!dek || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await secrets.removeItem(id);
      await hydrate(dek);
      return true;
    } catch (cause) {
      setError(asMessage(cause, "Could not delete the secret."));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return {
    vault,
    groups,
    items,
    unlocked,
    needsAttach: vault.exists && vault.unlock === "passphrase" && !unlocked,
    bundleLoading,
    busy,
    error,
    setError,
    attachLegacy,
    addGroup,
    renameGroup,
    removeGroup,
    addItems,
    updateItem,
    removeItem,
    reload: loadBundle,
  };
}

function asMessage(cause: unknown, fallback: string) {
  if (cause instanceof ApiError || cause instanceof NetworkError) return cause.message;
  return fallback;
}
