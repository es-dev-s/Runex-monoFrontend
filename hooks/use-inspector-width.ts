"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "harbor.inspectorWidth";
export const INSPECTOR_MIN = 340;
export const INSPECTOR_DEFAULT = 400;
export const INSPECTOR_MAX_RATIO = 0.4;

function clampWidth(width: number) {
  const max = Math.max(INSPECTOR_MIN, Math.round(window.innerWidth * INSPECTOR_MAX_RATIO));
  return Math.min(max, Math.max(INSPECTOR_MIN, Math.round(width)));
}

/**
 * Inspector width, persisted locally. Capped at 40% of the viewport so the
 * canvas stays usable; the drag handle is the left edge of the panel.
 */
export function useInspectorWidth() {
  const [width, setWidth] = useState(INSPECTOR_DEFAULT);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useLayoutEffect(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= INSPECTOR_MIN) {
      setWidth(clampWidth(stored));
    }
  }, []);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampWidth(current));
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      document.documentElement.classList.remove("runex-col-resize");
      document.body.style.userSelect = "";
    };
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { startX: event.clientX, startWidth: width };
      document.documentElement.classList.add("runex-col-resize");
      document.body.style.userSelect = "none";
    },
    [width],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current) return;
    setWidth(clampWidth(current.startWidth + (current.startX - event.clientX)));
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    document.documentElement.classList.remove("runex-col-resize");
    document.body.style.userSelect = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setWidth((current) => {
      window.localStorage.setItem(STORAGE_KEY, String(current));
      return current;
    });
  }, []);

  return { width, onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag };
}
