"use client";

import { useState, type ReactNode } from "react";

/*
 * One motion system for the app. CSS uses the matching custom properties in
 * globals.css (--motion-fast / --motion-base / --motion-slow and --ease-out);
 * motion/react components import these.
 */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
export const DURATION = { fast: 0.12, base: 0.18, slow: 0.24 } as const;

/*
 * Entrance animations play only for UI that mounts after the shell's first
 * paint (a click or navigation), never for what a reload paints. The flag is
 * read once per mount, so later re-renders can never replay an entrance.
 */
let shellPainted = false;

export function markShellPainted() {
  shellPainted = true;
}

/** True when the calling component mounted after the first paint. Stable for the life of the mount. */
export function useEntrance() {
  const [enter] = useState(() => shellPainted);
  return enter;
}

/** Render-prop form, for an element that mounts conditionally inside a long-lived component. */
export function Entrance({ children }: { children: (enter: boolean) => ReactNode }) {
  return <>{children(useEntrance())}</>;
}

/** Wrapper that fades and lifts its content in once, on mount after first paint. */
export function EntranceFrame({ className = "", children }: { className?: string; children: ReactNode }) {
  const enter = useEntrance();
  return <div className={`${className} ${enter ? "runex-enter" : ""}`}>{children}</div>;
}
