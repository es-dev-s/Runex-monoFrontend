"use client";

import { useEffect, useState } from "react";

/** Ticks once a second while `active` so deploy timers stay live. */
export function useElapsedNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return now;
}
