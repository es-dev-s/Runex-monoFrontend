"use client";

import { ApiError, auth } from "@/lib/api";
import { usePlatformStore } from "@/lib/inbox/store";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Signs the open dashboard out as soon as an administrator revokes it, and
 * refreshes the account when its plan changes (marked paid, trial restarted,
 * or the trial ran out), so locks and plan labels update without a reload.
 */
export function useSessionWatch(active: boolean) {
  const router = useRouter();
  const logout = usePlatformStore((state) => state.logout);

  useEffect(() => {
    if (!active) return;
    let closed = false;
    const source = new EventSource("/v1/auth/watch", { withCredentials: true });

    const leave = () => {
      if (closed) return;
      closed = true;
      source.close();
      void logout().finally(() => router.replace("/sign-in"));
    };

    source.onmessage = (event) => {
      try {
        const body = JSON.parse(event.data) as { kind?: string };
        if (body.kind === "revoked") leave();
        if (body.kind === "plan") {
          void auth
            .me()
            .then((fresh) =>
              usePlatformStore.setState((state) =>
                state.user && state.user.id === fresh.id ? { user: { ...state.user, ...fresh } } : {},
              ),
            )
            .catch(() => {});
        }
      } catch {
        /* Ignore a malformed keepalive. */
      }
    };
    source.onerror = () => {
      void auth.me().catch((cause) => {
        if (cause instanceof ApiError && cause.isUnauthorized) leave();
      });
    };

    return () => {
      closed = true;
      source.close();
    };
  }, [active, logout, router]);
}
