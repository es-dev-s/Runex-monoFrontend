"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmTone } from "@/components/ui/confirm-dialog";
import { ApiError, NetworkError } from "@/lib/api";

type ConfirmRequest = {
  title: string;
  detail: string;
  confirmLabel: string;
  tone: ConfirmTone;
};

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionRef = useRef<(() => Promise<void>) | null>(null);

  const confirm = useCallback(
    (opts: {
      title: string;
      detail: string;
      confirmLabel?: string;
      tone?: ConfirmTone;
      action: () => Promise<void>;
    }) => {
      actionRef.current = opts.action;
      setError(null);
      setPending(false);
      setRequest({
        title: opts.title,
        detail: opts.detail,
        confirmLabel: opts.confirmLabel ?? "Continue",
        tone: opts.tone ?? "neutral",
      });
    },
    [],
  );

  const close = useCallback(() => {
    if (pending) return;
    setRequest(null);
    setError(null);
    actionRef.current = null;
  }, [pending]);

  const onConfirm = useCallback(async () => {
    if (!actionRef.current || pending) return;
    setPending(true);
    setError(null);
    try {
      await actionRef.current();
      setRequest(null);
      actionRef.current = null;
    } catch (cause) {
      setError(
        cause instanceof ApiError || cause instanceof NetworkError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "That action failed.",
      );
    } finally {
      setPending(false);
    }
  }, [pending]);

  return {
    confirm,
    dialog: request ? (
      <ConfirmDialog
        title={request.title}
        detail={request.detail}
        confirmLabel={request.confirmLabel}
        tone={request.tone}
        pending={pending}
        error={error}
        onClose={close}
        onConfirm={() => void onConfirm()}
      />
    ) : null,
  };
}
