"use client";

import { createContext, useContext, type ReactNode } from "react";
import { emptyBoot, type Boot } from "@/lib/boot";
import { navIdSchema, type NavId } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";

const ChromeContext = createContext<Boot>(emptyBoot(false));

export function ChromeProvider({ boot, children }: { boot: Boot; children: ReactNode }) {
  return <ChromeContext.Provider value={boot}>{children}</ChromeContext.Provider>;
}

export function useBoot() {
  return useContext(ChromeContext);
}

/** The shell the user should see on this frame, including the saved screen during session restore. */
export function usePresentedChrome() {
  const boot = useBoot();
  const primed = usePlatformStore((state) => state.chromePrimed);
  const session = usePlatformStore((state) => state.session);
  const signedIn = usePlatformStore((state) => state.signedIn);
  const storeOpen = usePlatformStore((state) => state.openId);
  const storeNav = usePlatformStore((state) => state.activeNav);
  const storeSort = usePlatformStore((state) => state.sort);
  const storeList = usePlatformStore((state) => state.listView);
  const user = usePlatformStore((state) => state.user);
  const hold = !primed && session === "loading";
  const parsedNav = navIdSchema.safeParse(boot.activeNav);
  const activeNav: NavId = hold ? (parsedNav.success ? parsedNav.data : "projects") : storeNav;
  return {
    boot,
    showAccount: signedIn || session === "loading" || boot.known,
    openId: hold ? boot.openId : storeOpen,
    activeNav,
    sort: hold ? boot.sort : storeSort,
    listView: hold ? boot.listView : storeList,
    name: user?.name || user?.username || boot.name || boot.username,
    session,
  };
}
