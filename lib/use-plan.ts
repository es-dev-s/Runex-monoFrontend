"use client";

import { usePlatformStore } from "@/lib/inbox/store";
import { derivePlan, type PlanView } from "@/lib/plan";
import { useMemo, useSyncExternalStore } from "react";

/*
 * A shared wall clock that ticks every 30 seconds and on tab focus, so trial
 * timers roll over at the right moment without each component running its own
 * interval. The server snapshot is 0, which renders the loading state and keeps
 * hydration identical.
 */
let now = 0;
const listeners = new Set<() => void>();
let timer: number | null = null;

function tick() {
  now = Date.now();
  listeners.forEach((listener) => listener());
}

function onVisible() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

function snapshot() {
  if (!now) now = Date.now();
  return now;
}

export function useNow() {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** The signed-in account's plan as the UI should show it, live to the minute. */
export function usePlanView(): PlanView {
  const plan = usePlatformStore((state) => state.user?.plan);
  const clock = useNow();
  return useMemo(() => derivePlan(plan, clock), [plan, clock]);
}
