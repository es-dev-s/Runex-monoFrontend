"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const EASE = "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 380ms cubic-bezier(0.22, 1, 0.36, 1)";
const RADIUS = 16;

function isNarrow() {
  return window.matchMedia("(max-width: 767px)").matches;
}

export function useMaxMd() {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function sheetHeight(el: HTMLElement) {
  return el.parentElement?.clientHeight || window.innerHeight;
}

function restingOffset(height: number) {
  return Math.round(height * 0.22);
}

function scrimClip(box: DOMRect, radius: number) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const top = box.top;
  const left = box.left;
  const right = box.right;
  const bottom = Math.max(box.bottom, height);
  const curve = Math.max(0, Math.min(radius, (right - left) / 2));
  const hole =
    curve <= 0
      ? `M${left} ${top} H${right} V${bottom} H${left} Z`
      : `M${left + curve} ${top} H${right - curve} A${curve} ${curve} 0 0 1 ${right} ${top + curve} V${bottom} H${left} V${top + curve} A${curve} ${curve} 0 0 1 ${left + curve} ${top} Z`;
  return `path(evenodd, 'M0 0 H${width} V${height} H0 Z ${hole}')`;
}

/**
 * Phone sheet with three stops: full screen, the resting height, and closed.
 * Swipe up from rest to fill the screen. Swipe down from the top to rest.
 * Swipe down again to close. Desktop leaves the element alone.
 */
export function useBottomSheet(active: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const stageRef = useRef<"default" | "full">("default");
  const scrimRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const closeTimer = useRef(0);
  const followId = useRef(0);
  onCloseRef.current = onClose;

  function stopFollow() {
    cancelAnimationFrame(followId.current);
  }

  function syncScrim(animate: boolean) {
    const scrim = scrimRef.current;
    const el = ref.current;
    if (!scrim) return;
    if (!el || !isNarrow()) {
      scrim.style.opacity = "0";
      scrim.style.pointerEvents = "none";
      return;
    }
    const height = sheetHeight(el);
    const progress = height <= 0 ? 0 : 1 - offsetRef.current / height;
    const shown = progress > 0.02;
    scrim.style.transition = animate ? "opacity 380ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    scrim.style.opacity = shown ? String(Math.min(1, progress / 0.78)) : "0";
    scrim.style.pointerEvents = shown ? "auto" : "none";
    applyClip();
  }

  function applyClip() {
    const scrim = scrimRef.current;
    const el = ref.current;
    if (!scrim || !el) return;
    const radius = Number.parseFloat(el.style.borderTopLeftRadius) || 0;
    const clip = scrimClip(el.getBoundingClientRect(), radius);
    scrim.style.clipPath = clip;
    scrim.style.setProperty("-webkit-clip-path", clip);
  }

  function followScrim() {
    const until = performance.now() + 480;
    const step = () => {
      if (performance.now() > until) return;
      applyClip();
      followId.current = requestAnimationFrame(step);
    };
    step();
  }

  function paint(offset: number, animate: boolean) {
    const el = ref.current;
    if (!el) return;
    if (!isNarrow()) {
      el.style.transform = "";
      el.style.transition = "";
      el.style.borderTopLeftRadius = "";
      el.style.borderTopRightRadius = "";
      el.style.boxShadow = "";
      syncScrim(false);
      return;
    }
    offsetRef.current = offset;
    const radius = offset < 12 ? 0 : RADIUS;
    el.style.transition = animate ? EASE : "none";
    el.style.transform = `translate3d(0, ${offset}px, 0)`;
    el.style.borderTopLeftRadius = `${radius}px`;
    el.style.borderTopRightRadius = `${radius}px`;
    el.style.boxShadow = radius > 0 ? "0 -10px 28px rgba(0,0,0,0.08)" : "none";
    stopFollow();
    if (animate) {
      syncScrim(true);
      const done = () => stopFollow();
      el.addEventListener("transitionend", done, { once: true });
      followScrim();
      return;
    }
    syncScrim(false);
  }

  function dismiss() {
    const el = ref.current;
    if (!el || !isNarrow()) {
      onCloseRef.current();
      return;
    }
    const height = sheetHeight(el);
    paint(height, true);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(closeTimer.current);
      onCloseRef.current();
    };
    el.addEventListener("transitionend", done, { once: true });
    closeTimer.current = window.setTimeout(done, 440);
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const onChange = () => {
      if (media.matches) return;
      const el = ref.current;
      if (!el) return;
      el.style.transform = "";
      el.style.transition = "";
      el.style.borderTopLeftRadius = "";
      el.style.borderTopRightRadius = "";
      el.style.boxShadow = "";
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!active || !isNarrow()) return;
    const el = ref.current;
    if (!el) return;
    const height = sheetHeight(el);
    const rest = restingOffset(height);
    stageRef.current = "default";
    el.style.transition = "none";
    el.style.transform = `translate3d(0, ${height}px, 0)`;
    el.style.boxShadow = "none";
    offsetRef.current = height;
    el.getBoundingClientRect();
    paint(rest, true);
  }, [active]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    const drag = {
      id: -1,
      y: 0,
      offset: 0,
      mode: "undecided" as "undecided" | "sheet" | "content",
      scroller: null as HTMLElement | null,
      moved: false,
      lastY: 0,
      lastT: 0,
      velocity: 0,
    };
    let tracking = false;

    function scrollerFrom(target: EventTarget | null) {
      let node = target instanceof Element ? target : null;
      while (node && node !== el) {
        if (node instanceof HTMLElement) {
          const overflow = getComputedStyle(node).overflowY;
          if (/(auto|scroll)/.test(overflow) && node.scrollHeight > node.clientHeight + 1) return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    function settle(dy: number, velocity: number) {
      const height = sheetHeight(el!);
      const rest = restingOffset(height);
      const fromFull = stageRef.current === "full";
      if (fromFull) {
        stageRef.current = dy > 56 || velocity > 0.55 ? "default" : "full";
        paint(stageRef.current === "full" ? 0 : rest, true);
        return;
      }
      if (dy < -48 || velocity < -0.45) {
        stageRef.current = "full";
        paint(0, true);
        return;
      }
      if (dy > 72 || velocity > 0.65) {
        dismiss();
        return;
      }
      stageRef.current = "default";
      paint(rest, true);
    }

    function onDown(event: PointerEvent) {
      if (!isNarrow() || event.button !== 0) return;
      tracking = true;
      drag.id = event.pointerId;
      drag.y = event.clientY;
      drag.offset = offsetRef.current;
      drag.mode =
        event.target instanceof Element && event.target.closest("[data-sheet-handle]")
          ? "sheet"
          : "undecided";
      drag.scroller = scrollerFrom(event.target);
      drag.moved = false;
      drag.lastY = event.clientY;
      drag.lastT = performance.now();
      drag.velocity = 0;
    }

    function onMove(event: PointerEvent) {
      if (!tracking || event.pointerId !== drag.id || !isNarrow()) return;
      const dy = event.clientY - drag.y;
      const now = performance.now();
      drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastT);
      drag.lastY = event.clientY;
      drag.lastT = now;
      if (drag.mode === "undecided") {
        if (Math.abs(dy) < 8) return;
        const atTop = !drag.scroller || drag.scroller.scrollTop <= 0;
        if (dy < 0 && stageRef.current !== "full") drag.mode = "sheet";
        else if (dy > 0 && atTop) drag.mode = "sheet";
        else drag.mode = "content";
      }
      if (drag.mode !== "sheet") return;
      drag.moved = true;
      if (drag.scroller) drag.scroller.scrollTop = 0;
      const height = sheetHeight(el!);
      const next = Math.min(height, Math.max(0, drag.offset + dy));
      paint(next, false);
    }

    function onUp(event: PointerEvent) {
      if (!tracking || event.pointerId !== drag.id) return;
      tracking = false;
      if (drag.mode !== "sheet" || !drag.moved) return;
      settle(event.clientY - drag.y, drag.velocity);
    }

    function onClick(event: MouseEvent) {
      if (!drag.moved) return;
      event.preventDefault();
      event.stopPropagation();
      drag.moved = false;
    }

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
      window.clearTimeout(closeTimer.current);
    };
  }, [active]);

  useEffect(() => () => stopFollow(), []);

  return { ref, scrimRef, requestClose: dismiss };
}

export function SheetScrim({
  scrimRef,
  onClose,
  label,
}: {
  scrimRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  label: string;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <button
      ref={scrimRef}
      type="button"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-[65] cursor-default border-0 bg-black/30 p-0 opacity-0 md:hidden"
    />,
    document.body,
  );
}

export function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const sheet = useBottomSheet(true, onClose);
  return (
    <>
      <SheetScrim scrimRef={sheet.scrimRef} onClose={sheet.requestClose} label="Close" />
      <div
        ref={sheet.ref}
        className="sheet-frame absolute inset-x-0 bottom-0 z-30 flex h-full min-h-0 flex-col overflow-hidden rounded-t-2xl bg-white"
      >
        <div data-sheet-handle className="flex shrink-0 cursor-grab justify-center pt-2.5 pb-1 active:cursor-grabbing">
          <span className="h-1 w-10 rounded-full bg-black/15" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </>
  );
}
