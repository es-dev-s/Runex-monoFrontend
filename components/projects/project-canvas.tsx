"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Plus, Scan, ZoomIn, ZoomOut } from "lucide-react";
import type { ServiceNode } from "@/lib/api";
import { ServiceIcon } from "@/components/projects/service-icon";
import { cn } from "@/lib/cn";
import { CANVAS_DOT, CANVAS_NODE, peekCoveredCards, serviceGrid, snapToDots, type Point } from "@/lib/project-layout";
import {
  readCanvasPositions,
  readCanvasView,
  rememberCanvasPositions,
  rememberCanvasView,
} from "@/lib/remember";
import { useElapsedNow } from "@/hooks/use-elapsed-now";
import { isEmptySlot, nodeMarkClass, serviceCaption, serviceHost, serviceLabel, statusTone } from "@/lib/projects";
import { liveDeployClock } from "@/lib/relative-time";

type NodePointerEvent = PointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>;
type SafariGestureEvent = Event & { scale: number; clientX: number; clientY: number };

const MIN_SCALE = 0.4;
const MAX_SCALE = 2.4;
const SCALE_STEP = 1.2;
const NODE_W = CANVAS_NODE.width;
const NODE_H = CANVAS_NODE.height;
const VIEW_PAD = 96;
const DOT_GAP = CANVAS_DOT;
const SETTLE_MS = 480;
const SETTLE_EASE = `transform ${SETTLE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
const EDGE_PAD = 20;
const TOP_PAD = 24;
const BOTTOM_PAD = 72;

type View = { scale: number; x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function zoomView(view: View, factor: number, originX: number, originY: number): View {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = scale / view.scale;
  return {
    scale,
    x: originX - (originX - view.x) * ratio,
    y: originY - (originY - view.y) * ratio,
  };
}

function viewTransform(view: View) {
  return `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
}

function graphBounds(points: Point[]) {
  if (points.length === 0) {
    return { minX: -80, maxX: 80, minY: -40, maxY: 40 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x - NODE_W / 2);
    maxX = Math.max(maxX, point.x + NODE_W / 2);
    minY = Math.min(minY, point.y - NODE_H / 2);
    maxY = Math.max(maxY, point.y + NODE_H / 2);
  }

  return { minX, maxX, minY, maxY };
}

function fitView(width: number, height: number, points: Point[], rightInset = 0): View {
  const { minX, maxX, minY, maxY } = graphBounds(points);
  const graphWidth = Math.max(1, maxX - minX);
  const graphHeight = Math.max(1, maxY - minY);
  const usableW = Math.max(1, width - rightInset);
  const scale = clamp(
    Math.min((usableW - VIEW_PAD * 2) / graphWidth, (height - VIEW_PAD * 2) / graphHeight, 1),
    MIN_SCALE,
    MAX_SCALE,
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    scale,
    x: usableW / 2 - cx * scale,
    y: height / 2 - cy * scale,
  };
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

/** Pan only — never zoom — so a node stays in the uncovered canvas. */
function revealInSafeArea(
  view: View,
  point: Point,
  width: number,
  height: number,
  rightInset: number,
): View {
  const halfW = (NODE_W * view.scale) / 2;
  const halfH = (NODE_H * view.scale) / 2;
  const screenX = view.x + point.x * view.scale;
  const screenY = view.y + point.y * view.scale;
  const pad = 28;
  const minX = EDGE_PAD + halfW;
  const maxX = width - rightInset - pad - halfW;
  const minY = TOP_PAD + halfH;
  const maxY = height - BOTTOM_PAD - halfH;
  const nx = maxX < minX ? screenX : clamp(screenX, minX, maxX);
  const ny = maxY < minY ? screenY : clamp(screenY, minY, maxY);
  if (nx === screenX && ny === screenY) return view;
  return { ...view, x: view.x + (nx - screenX), y: view.y + (ny - screenY) };
}

function graphContinues(prevKey: string | null, nextKey: string) {
  if (prevKey === null) return false;
  const prevAt = prevKey.indexOf(":");
  const nextAt = nextKey.indexOf(":");
  if (prevAt < 0 || nextAt < 0) return false;
  if (prevKey.slice(0, prevAt) !== nextKey.slice(0, nextAt)) return false;
  const prevIds = prevKey.slice(prevAt + 1);
  const nextIds = nextKey.slice(nextAt + 1);
  if (!prevIds || !nextIds) return false;
  const prev = new Set(prevIds.split(","));
  return nextIds.split(",").some((id) => prev.has(id));
}

function mergePositions(
  current: Record<string, Point>,
  stored: Record<string, Point>,
  nodes: ServiceNode[],
) {
  const grid = serviceGrid(nodes.length);
  const next: Record<string, Point> = {};
  nodes.forEach((node, index) => {
    const placed = node.x !== 0 || node.y !== 0;
    next[node.id] =
      current[node.id] ??
      stored[node.id] ??
      (placed ? { x: node.x, y: node.y } : (grid[index] ?? { x: 0, y: 0 }));
  });
  return next;
}

/** Keep the node fully inside the visible canvas, including after zoom. */
function clampToViewport(
  world: Point,
  view: View,
  width: number,
  height: number,
  rightInset = 0,
): Point {
  const halfW = (NODE_W * view.scale) / 2;
  const halfH = (NODE_H * view.scale) / 2;
  const minX = EDGE_PAD + halfW;
  const maxX = width - Math.max(EDGE_PAD, rightInset + 16) - halfW;
  const minY = TOP_PAD + halfH;
  const maxY = height - BOTTOM_PAD - halfH;
  const screenX = view.x + world.x * view.scale;
  const screenY = view.y + world.y * view.scale;
  const cx = maxX < minX ? Math.max(minX, (width - rightInset) / 2) : clamp(screenX, minX, maxX);
  const cy = maxY < minY ? height / 2 : clamp(screenY, minY, maxY);
  return {
    x: (cx - view.x) / view.scale,
    y: (cy - view.y) / view.scale,
  };
}

function nodeZ(
  id: string,
  stack: string[],
  dragging: boolean,
  selected: boolean,
  hovered: boolean,
) {
  const index = Math.max(0, stack.indexOf(id));
  if (dragging) return 10_000;
  if (selected) return 5_000 + index;
  if (hovered) return 1_000 + index;
  return 10 + index;
}

function nodeLayerTransform(x: number, y: number) {
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
}

export function ProjectCanvas({
  projectId,
  nodes,
  selectedId,
  onSelect,
  onDeselect,
  onAdd,
  onCanvasMenu,
  onMove,
  emptyOverlay,
  chromeInsetRight = 0,
}: {
  projectId: string;
  nodes: ServiceNode[];
  selectedId: string | null;
  onSelect: (node: ServiceNode) => void;
  onDeselect?: () => void;
  onAdd: () => void;
  onCanvasMenu?: (event: { clientX: number; clientY: number; world: Point }) => void;
  onMove?: (nodeId: string, x: number, y: number) => void;
  emptyOverlay?: ReactNode;
  chromeInsetRight?: number;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const scaleLabelRef = useRef<HTMLParagraphElement>(null);
  const panRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const nodeDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origin: Point;
    pointerId: number | null;
    el: HTMLElement | null;
  } | null>(null);
  const dragRafRef = useRef(0);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const positionsRef = useRef<Record<string, Point>>({});
  const restoredView = readCanvasView(projectId);
  const [view, setView] = useState<View>(() => restoredView ?? { scale: 1, x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [panning, setPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>([]);
  const [settlingIds, setSettlingIds] = useState<string[]>([]);
  const viewRef = useRef(view);
  const onMoveRef = useRef(onMove);
  const onDeselectRef = useRef(onDeselect);
  const onCanvasMenuRef = useRef(onCanvasMenu);
  const ownedViewRef = useRef(Boolean(restoredView));
  const fittedForRef = useRef<string | null>(null);
  const insetRef = useRef(chromeInsetRight);
  const selectedIdRef = useRef(selectedId);
  const animRef = useRef<number | null>(null);
  const interactRef = useRef(false);
  const persistViewTimer = useRef<number | null>(null);
  const projectIdRef = useRef(projectId);
  const stackRef = useRef<string[]>([]);
  const settleTimerRef = useRef<number | null>(null);
  const gestureRef = useRef(false);
  const pointersRef = useRef(new Map<number, { x: number; y: number; type: string }>());
  const pinchRef = useRef<{
    startDist: number;
    startMidX: number;
    startMidY: number;
    originClientX: number;
    originClientY: number;
    startView: View;
  } | null>(null);
  const paintRef = useRef<(next: View) => void>(() => {});
  const gestureApi = useRef({
    beginPinch: () => {},
    movePinch: () => {},
    endPinch: () => {},
  });

  const longPressRef = useRef<number | null>(null);
  const nodeKey = nodes.map((node) => node.id).join(",");
  const now = useElapsedNow(nodes.some((node) => node.status === "building"));

  useEffect(() => {
    if (gestureRef.current) return;
    viewRef.current = view;
  }, [view]);

  useLayoutEffect(() => {
    if (!gestureRef.current || !worldRef.current) return;
    worldRef.current.style.transform = viewTransform(viewRef.current);
  });

  function paintView(next: View) {
    viewRef.current = next;
    if (worldRef.current) worldRef.current.style.transform = viewTransform(next);
    if (scaleLabelRef.current) {
      scaleLabelRef.current.textContent = `${Math.round(next.scale * 100)}%`;
    }
  }
  paintRef.current = paintView;

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    onDeselectRef.current = onDeselect;
  }, [onDeselect]);

  useEffect(() => {
    onCanvasMenuRef.current = onCanvasMenu;
  }, [onCanvasMenu]);

  useEffect(() => {
    insetRef.current = chromeInsetRight;
  }, [chromeInsetRight]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const persistView = useCallback(
    (next?: View) => {
      if (persistViewTimer.current) window.clearTimeout(persistViewTimer.current);
      persistViewTimer.current = window.setTimeout(() => {
        rememberCanvasView(projectId, next ?? viewRef.current);
      }, 80);
    },
    [projectId],
  );

  const persistPositions = useCallback(
    (next: Record<string, Point>) => {
      rememberCanvasPositions(projectId, next);
    },
    [projectId],
  );

  const cancelViewAnim = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  const animateViewTo = useCallback(
    (next: View) => {
      cancelViewAnim();
      const from = viewRef.current;
      if (from.x === next.x && from.y === next.y && from.scale === next.scale) return;
      const start = performance.now();
      const dur = 220;
      const step = (now: number) => {
        const t = easeOutCubic(Math.min(1, (now - start) / dur));
        paintRef.current({
          scale: from.scale + (next.scale - from.scale) * t,
          x: from.x + (next.x - from.x) * t,
          y: from.y + (next.y - from.y) * t,
        });
        if (t < 1) animRef.current = requestAnimationFrame(step);
        else {
          animRef.current = null;
          gestureRef.current = false;
          setView(viewRef.current);
        }
      };
      gestureRef.current = true;
      animRef.current = requestAnimationFrame(step);
    },
    [cancelViewAnim],
  );

  const resetView = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    cancelViewAnim();
    ownedViewRef.current = false;
    const next = fitView(
      surface.clientWidth,
      surface.clientHeight,
      Object.values(positionsRef.current),
      insetRef.current,
    );
    gestureRef.current = false;
    paintRef.current(next);
    setView(next);
    persistView(next);
  }, [cancelViewAnim, persistView]);

  useLayoutEffect(() => {
    if (fittedForRef.current && !fittedForRef.current.startsWith(`${projectId}:`)) {
      positionsRef.current = {};
      const saved = readCanvasView(projectId);
      ownedViewRef.current = Boolean(saved);
      if (saved) setView(saved);
    }

    const merged = mergePositions(positionsRef.current, readCanvasPositions(projectId), nodes);
    positionsRef.current = merged;
    setPositions(merged);
    if (nodes.length > 0) persistPositions(merged);
    setStack((current) => {
      const ids = nodes.map((node) => node.id);
      const kept = current.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      const next = [...missing, ...kept];
      stackRef.current = next;
      return next;
    });

    const surface = surfaceRef.current;
    if (!surface) return;

    const graphKey = `${projectId}:${nodeKey}`;
    const shouldFit = !graphContinues(fittedForRef.current, graphKey);
    fittedForRef.current = graphKey;

    if (!shouldFit) return;

    const saved = readCanvasView(projectId);
    if (saved) {
      ownedViewRef.current = true;
      setView(saved);
      return;
    }

    const apply = () => {
      if (ownedViewRef.current) return true;
      if (surface.clientWidth < 8 || surface.clientHeight < 8) return false;
      const next = fitView(
        surface.clientWidth,
        surface.clientHeight,
        Object.values(positionsRef.current),
        insetRef.current,
      );
      setView(next);
      persistView(next);
      return true;
    };

    if (apply()) return;
    const observer = new ResizeObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(surface);
    return () => observer.disconnect();
    // nodeKey is the graph identity. `nodes` also changes on live status frames,
    // which must not reset the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey, projectId]);

  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;

    let wheelTimer = 0;
    let wheelRaf = 0;
    let pending: View | null = null;
    let safariStart: View | null = null;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const surface = surfaceRef.current;
      if (!surface) return;
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const rect = surface.getBoundingClientRect();
      const delta =
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * rect.height : event.deltaY;
      const factor = Math.exp(-delta * 0.0015);
      const base = pending ?? viewRef.current;
      pending = zoomView(base, factor, event.clientX - rect.left, event.clientY - rect.top);
      gestureRef.current = true;
      ownedViewRef.current = true;
      if (!wheelRaf) {
        wheelRaf = requestAnimationFrame(() => {
          wheelRaf = 0;
          if (!pending) return;
          paintRef.current(pending);
          pending = null;
        });
      }
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        gestureRef.current = false;
        setView({ ...viewRef.current });
        rememberCanvasView(projectIdRef.current, viewRef.current);
      }, 120);
    };

    const blockNativeZoom = (event: Event) => {
      event.preventDefault();
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      if (pinchRef.current) return;
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      safariStart = { ...viewRef.current };
      gestureRef.current = true;
      ownedViewRef.current = true;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      if (pinchRef.current || !safariStart) return;
      const gesture = event as SafariGestureEvent;
      const surface = surfaceRef.current;
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      paintRef.current(
        zoomView(
          safariStart,
          gesture.scale || 1,
          gesture.clientX - rect.left,
          gesture.clientY - rect.top,
        ),
      );
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      if (!safariStart || pinchRef.current) {
        safariStart = null;
        return;
      }
      safariStart = null;
      gestureRef.current = false;
      setView({ ...viewRef.current });
      rememberCanvasView(projectIdRef.current, viewRef.current);
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("gesturestart", onGestureStart, { passive: false });
    node.addEventListener("gesturechange", onGestureChange, { passive: false });
    node.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("gesturestart", onGestureStart);
      node.removeEventListener("gesturechange", onGestureChange);
      node.removeEventListener("gestureend", onGestureEnd);
      window.clearTimeout(wheelTimer);
      if (wheelRaf) cancelAnimationFrame(wheelRaf);
    };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      cancelViewAnim();
      ownedViewRef.current = true;
      const originX = (surface.clientWidth - insetRef.current) / 2;
      const originY = surface.clientHeight / 2;
      const next = zoomView(viewRef.current, factor, originX, originY);
      animateViewTo(next);
      persistView(next);
    },
    [animateViewTo, cancelViewAnim, persistView],
  );

  useEffect(() => {
    const surface = surfaceRef.current;
    const selectionChanged = selectedIdRef.current !== selectedId;
    selectedIdRef.current = selectedId;
    if (!surface || !selectedId || !interactRef.current) return;
    const point = positionsRef.current[selectedId];
    if (!point) return;
    const next = revealInSafeArea(
      viewRef.current,
      point,
      surface.clientWidth,
      surface.clientHeight,
      chromeInsetRight,
    );
    if (next === viewRef.current) return;
    if (selectionChanged) animateViewTo(next);
    else setView(next);
    persistView(next);
  }, [selectedId, chromeInsetRight, animateViewTo, persistView]);

  function commitNodeDrag(clientX: number, clientY: number) {
    const nodeDrag = nodeDragRef.current;
    const surface = surfaceRef.current;
    if (!nodeDrag || !surface) return;
    const currentView = viewRef.current;
    const dx = (clientX - nodeDrag.startX) / currentView.scale;
    const dy = (clientY - nodeDrag.startY) / currentView.scale;
    if (Math.abs(clientX - nodeDrag.startX) > 3 || Math.abs(clientY - nodeDrag.startY) > 3) {
      movedRef.current = true;
    }
    const next = clampToViewport(
      { x: nodeDrag.origin.x + dx, y: nodeDrag.origin.y + dy },
      currentView,
      surface.clientWidth,
      surface.clientHeight,
      insetRef.current,
    );
    positionsRef.current = { ...positionsRef.current, [nodeDrag.id]: next };
    if (nodeDrag.el) nodeDrag.el.style.transform = nodeLayerTransform(next.x, next.y);
    setPositions((current) => ({ ...current, [nodeDrag.id]: next }));
  }

  function applyNodeDrag(clientX: number, clientY: number) {
    pendingPointerRef.current = { x: clientX, y: clientY };
    if (dragRafRef.current) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = 0;
      const pending = pendingPointerRef.current;
      if (pending) commitNodeDrag(pending.x, pending.y);
    });
  }

  function flushNodeDrag() {
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = 0;
    }
    const pending = pendingPointerRef.current;
    pendingPointerRef.current = null;
    if (pending && nodeDragRef.current) commitNodeDrag(pending.x, pending.y);
  }

  function applyPan(clientX: number, clientY: number) {
    const pan = panRef.current;
    if (!pan || nodeDragRef.current) return;
    const dx = clientX - pan.x;
    const dy = clientY - pan.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedRef.current = true;
      ownedViewRef.current = true;
      cancelViewAnim();
      if (longPressRef.current != null) {
        window.clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
    }
    gestureRef.current = true;
    paintRef.current({ scale: viewRef.current.scale, x: pan.originX + dx, y: pan.originY + dy });
  }

  function finishGesture() {
    document.documentElement.classList.remove("runex-grabbing");
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    flushNodeDrag();
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag) {
      if (nodeDrag.el && nodeDrag.pointerId != null) {
        try {
          if (nodeDrag.el.hasPointerCapture(nodeDrag.pointerId)) {
            nodeDrag.el.releasePointerCapture(nodeDrag.pointerId);
          }
        } catch {
          /* already released */
        }
      }
      const raw = positionsRef.current[nodeDrag.id];
      if (raw) {
        const surface = surfaceRef.current;
        const landed =
          movedRef.current && surface
            ? clampToViewport(
                snapToDots(raw),
                viewRef.current,
                surface.clientWidth,
                surface.clientHeight,
                insetRef.current,
              )
            : raw;
        const placed =
          landed.x === raw.x && landed.y === raw.y
            ? positionsRef.current
            : { ...positionsRef.current, [nodeDrag.id]: landed };
        const peeked = peekCoveredCards(placed, nodeDrag.id, stackRef.current);
        const next = { ...peeked.next };
        if (surface) {
          for (const id of peeked.moved) {
            const covered = next[id];
            if (!covered) continue;
            next[id] = clampToViewport(
              snapToDots(covered),
              viewRef.current,
              surface.clientWidth,
              surface.clientHeight,
              insetRef.current,
            );
          }
        }
        const settleIds = [
          ...(landed.x !== raw.x || landed.y !== raw.y ? [nodeDrag.id] : []),
          ...peeked.moved,
        ];
        positionsRef.current = next;
        if (settleIds.length > 0) {
          setSettlingIds(settleIds);
          if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
          settleTimerRef.current = window.setTimeout(() => {
            setSettlingIds([]);
            settleTimerRef.current = null;
          }, SETTLE_MS + 40);
          // Paint the ease on the free position first. A second frame then
          // moves the card onto the dot, so it glides instead of jumping.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setPositions(positionsRef.current);
            });
          });
        }
        if (movedRef.current || peeked.moved.length > 0) {
          rememberCanvasPositions(projectIdRef.current, next);
        }
        if (movedRef.current) {
          onMoveRef.current?.(nodeDrag.id, landed.x, landed.y);
        }
      }
      nodeDragRef.current = null;
      setDraggingId(null);
      return;
    }
    if (panRef.current) {
      const click = !movedRef.current;
      panRef.current = null;
      setPanning(false);
      gestureRef.current = false;
      setView({ ...viewRef.current });
      rememberCanvasView(projectIdRef.current, viewRef.current);
      if (click) onDeselectRef.current?.();
    }
  }

  const finishRef = useRef(finishGesture);
  finishRef.current = finishGesture;

  gestureApi.current.beginPinch = () => {
    const touches = [...pointersRef.current.values()].filter((point) => point.type === "touch");
    const surface = surfaceRef.current;
    if (touches.length < 2 || !surface) return;
    const [first, second] = touches;
    if (!first || !second) return;
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    panRef.current = null;
    if (nodeDragRef.current) {
      nodeDragRef.current = null;
      setDraggingId(null);
    }
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
    document.documentElement.classList.remove("runex-grabbing");
    setPanning(false);
    const rect = surface.getBoundingClientRect();
    const midX = (first.x + second.x) / 2;
    const midY = (first.y + second.y) / 2;
    pinchRef.current = {
      startDist: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
      startMidX: midX - rect.left,
      startMidY: midY - rect.top,
      originClientX: midX,
      originClientY: midY,
      startView: { ...viewRef.current },
    };
    gestureRef.current = true;
    movedRef.current = true;
    ownedViewRef.current = true;
  };
  gestureApi.current.movePinch = () => {
    const pinch = pinchRef.current;
    const surface = surfaceRef.current;
    if (!pinch || !surface) return;
    const touches = [...pointersRef.current.values()].filter((point) => point.type === "touch");
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) return;
    const midX = (first.x + second.x) / 2;
    const midY = (first.y + second.y) / 2;
    const dist = Math.max(1, Math.hypot(first.x - second.x, first.y - second.y));
    const zoomed = zoomView(pinch.startView, dist / pinch.startDist, pinch.startMidX, pinch.startMidY);
    paintView({
      ...zoomed,
      x: zoomed.x + (midX - pinch.originClientX),
      y: zoomed.y + (midY - pinch.originClientY),
    });
  };
  gestureApi.current.endPinch = () => {
    pinchRef.current = null;
    gestureRef.current = false;
    panRef.current = null;
    setPanning(false);
    setView({ ...viewRef.current });
    rememberCanvasView(projectIdRef.current, viewRef.current);
  };

  useEffect(() => {
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const surface = surfaceRef.current;
      if (!surface?.contains(event.target as Node)) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-canvas-chrome]")) return;
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      });
      const touches = [...pointersRef.current.values()].filter((point) => point.type === "touch");
      if (touches.length >= 2) {
        event.stopPropagation();
        gestureApi.current.beginPinch();
      }
    };
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const known = pointersRef.current.get(event.pointerId);
      if (known) {
        pointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          type: known.type,
        });
      }
      if (pinchRef.current) {
        gestureApi.current.movePinch();
        return;
      }
      if (nodeDragRef.current) applyNodeDrag(event.clientX, event.clientY);
      else applyPan(event.clientX, event.clientY);
    };
    const onMouseMove = (event: globalThis.MouseEvent) => {
      if (pinchRef.current || nodeDragRef.current) {
        if (nodeDragRef.current) applyNodeDrag(event.clientX, event.clientY);
        return;
      }
      applyPan(event.clientX, event.clientY);
    };
    const onUp = (event: Event) => {
      if (event instanceof PointerEvent) pointersRef.current.delete(event.pointerId);
      if (pinchRef.current) {
        const touches = [...pointersRef.current.values()].filter((point) => point.type === "touch");
        if (touches.length >= 2) return;
        gestureApi.current.endPinch();
        return;
      }
      finishRef.current();
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      if (longPressRef.current != null) window.clearTimeout(longPressRef.current);
      document.documentElement.classList.remove("runex-grabbing");
    };
  }, []);

  function onSurfacePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || nodeDragRef.current || pinchRef.current) return;
    interactRef.current = true;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
    movedRef.current = false;
    document.documentElement.classList.add("runex-grabbing");
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch" && onCanvasMenuRef.current) {
      const clientX = event.clientX;
      const clientY = event.clientY;
      if (longPressRef.current != null) window.clearTimeout(longPressRef.current);
      longPressRef.current = window.setTimeout(() => {
        longPressRef.current = null;
        panRef.current = null;
        document.documentElement.classList.remove("runex-grabbing");
        setPanning(false);
        const world = screenToWorld(clientX, clientY);
        if (world) onCanvasMenuRef.current?.({ clientX, clientY, world });
      }, 480);
    }
  }

  function onNodePointerDown(event: NodePointerEvent, node: ServiceNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const el = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const pointerId = "pointerId" in event ? event.pointerId : null;
    startNodeDrag(node, event.clientX, event.clientY, el, pointerId);
    if (el && pointerId != null) {
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* capture is optional; window listeners still drive the drag */
      }
    }
  }

  function startNodeDrag(
    node: ServiceNode,
    clientX: number,
    clientY: number,
    el: HTMLElement | null,
    pointerId: number | null,
  ) {
    interactRef.current = true;
    const origin = positionsRef.current[node.id] ?? { x: node.x, y: node.y };
    nodeDragRef.current = {
      id: node.id,
      startX: clientX,
      startY: clientY,
      origin,
      pointerId,
      el,
    };
    movedRef.current = false;
    document.documentElement.classList.add("runex-grabbing");
    setDraggingId(node.id);
    setHoveredId(null);
    setStack((current) => {
      const next = [...current.filter((id) => id !== node.id), node.id];
      stackRef.current = next;
      return next;
    });
    onSelect(node);
  }

  function screenToWorld(clientX: number, clientY: number): Point | null {
    const surface = surfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    const current = viewRef.current;
    return {
      x: (clientX - rect.left - current.x) / current.scale,
      y: (clientY - rect.top - current.y) / current.scale,
    };
  }

  function onSurfaceContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target;
    if (target instanceof Element && target.closest("[data-canvas-node]")) return;
    const world = screenToWorld(event.clientX, event.clientY);
    if (!world) return;
    onCanvasMenuRef.current?.({ clientX: event.clientX, clientY: event.clientY, world });
  }

  return (
    <div
      data-canvas-surface
      className="relative h-full min-h-0 w-full overflow-hidden bg-panel"
      onContextMenu={onSurfaceContextMenu}
    >
      <div
        ref={surfaceRef}
        className={cn(
          "absolute inset-0 touch-none select-none",
          draggingId ? "cursor-grabbing" : panning ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onSurfacePointerDown}
        onMouseDown={(event) => {
          if (event.button !== 0 || nodeDragRef.current || pinchRef.current) return;
          panRef.current = {
            x: event.clientX,
            y: event.clientY,
            originX: viewRef.current.x,
            originY: viewRef.current.y,
          };
          movedRef.current = false;
          document.documentElement.classList.add("runex-grabbing");
          setPanning(true);
        }}
        style={{
          overscrollBehavior: "none",
          backgroundColor: "var(--canvas-fill)",
          touchAction: "none",
        }}
      >
        <div
          ref={worldRef}
          className="absolute top-0 left-0 origin-top-left will-change-transform"
          style={{ transform: viewTransform(view) }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: -6000,
              top: -6000,
              width: 12000,
              height: 12000,
              backgroundImage:
                "radial-gradient(circle at center, var(--canvas-dot) 1px, transparent 1.15px)",
              backgroundSize: `${DOT_GAP}px ${DOT_GAP}px`,
            }}
          />
          {nodes.map((node) => {
            const point = positions[node.id];
            if (!point) return null;
            const dragging = node.id === draggingId;
            const selected = node.id === selectedId;
            const hovered = node.id === hoveredId && !draggingId;

            return (
              <CanvasNode
                key={node.id}
                node={node}
                selected={selected}
                dragging={dragging}
                hovered={hovered}
                blocked={Boolean(draggingId) && !dragging}
                settle={settlingIds.includes(node.id)}
                zIndex={nodeZ(node.id, stack, dragging, selected, hovered)}
                x={point.x}
                y={point.y}
                now={now}
                onHover={(active) => {
                  if (draggingId) return;
                  setHoveredId(active ? node.id : (current) => (current === node.id ? null : current));
                }}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                onSelect={() => {
                  if (movedRef.current) return;
                  onSelect(node);
                }}
              />
            );
          })}
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-5">
          <div className="pointer-events-auto">
            {emptyOverlay ?? (
              <div className="text-center">
                <p className="text-[14px] font-medium tracking-tight text-fg">This canvas is empty</p>
                <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed tracking-tight text-fg/40">
                  <span className="md:hidden">
                    Long-press the canvas, or tap below, to add a service, Postgres, or Redis. Each one stays isolated.
                  </span>
                  <span className="hidden md:inline">
                    Right-click the canvas to add a service, Postgres, or Redis. Each one stays isolated.
                  </span>
                </p>
                <button
                  type="button"
                  onClick={onAdd}
                  className="mt-5 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-btn px-3.5 text-[13px] font-medium tracking-tight text-btn-fg transition-colors duration-150 ease-out hover:bg-brand-hover"
                >
                  <Plus size={14} strokeWidth={1.75} />
                  Deploy a service
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {nodes.length > 0 ? (
        <button
          type="button"
          data-canvas-chrome
          aria-label="Add to canvas"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            const surface = surfaceRef.current;
            const rect = surface?.getBoundingClientRect();
            const world = rect
              ? screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2)
              : { x: 0, y: 0 };
            onCanvasMenuRef.current?.({
              clientX: event.clientX,
              clientY: event.clientY,
              world: world ?? { x: 0, y: 0 },
            });
          }}
          className="absolute bottom-3 left-3 z-10 inline-flex h-10 items-center gap-1.5 rounded-xl bg-card-elevated/95 px-3 text-[13px] font-medium tracking-tight text-fg ring-1 ring-fg/[0.12] backdrop-blur-md md:hidden"
        >
          <Plus size={14} strokeWidth={1.75} />
          Add
        </button>
      ) : null}

      <div
        data-canvas-chrome
        className="harbor-zoom-dock absolute bottom-3 z-10 flex flex-col items-center rounded-xl bg-card/92 p-0.5 ring-1 ring-fg/[0.08] backdrop-blur-md"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CanvasControl label="Zoom in" onClick={() => zoomBy(SCALE_STEP)}>
          <ZoomIn size={14} strokeWidth={1.75} />
        </CanvasControl>
        <p
          ref={scaleLabelRef}
          className="py-1 font-mono text-[10px] tracking-tight tabular-nums text-fg/45"
        >
          {Math.round(view.scale * 100)}%
        </p>
        <CanvasControl label="Zoom out" onClick={() => zoomBy(1 / SCALE_STEP)}>
          <ZoomOut size={14} strokeWidth={1.75} />
        </CanvasControl>
        <span aria-hidden="true" className="my-1 h-px w-4 bg-fg/10" />
        <CanvasControl label="Reset view" onClick={resetView}>
          <Scan size={14} strokeWidth={1.75} />
        </CanvasControl>
      </div>
    </div>
  );
}

function CanvasNode({
  node,
  selected,
  dragging,
  hovered,
  blocked,
  settle,
  zIndex,
  x,
  y,
  now,
  onSelect,
  onHover,
  onPointerDown,
}: {
  node: ServiceNode;
  selected: boolean;
  dragging: boolean;
  hovered: boolean;
  blocked: boolean;
  settle: boolean;
  zIndex: number;
  x: number;
  y: number;
  now: number;
  onSelect: () => void;
  onHover: (active: boolean) => void;
  onPointerDown: (event: NodePointerEvent) => void;
}) {
  const empty = isEmptySlot(node);
  const tone = statusTone(node.status);
  const elapsed = liveDeployClock(node.status, node.startedAt, now);
  const host = !empty ? serviceHost(node.url) : "";

  return (
    <div
      data-canvas-node={node.id}
      className={cn(
        "absolute top-0 left-0 isolate touch-none select-none [-webkit-user-drag:none]",
        blocked && "pointer-events-none",
      )}
      style={{
        width: NODE_W,
        zIndex,
        transform: nodeLayerTransform(x, y),
        willChange: dragging || settle ? "transform" : undefined,
        transition: dragging ? "none" : settle ? SETTLE_EASE : undefined,
      }}
      onPointerDown={onPointerDown}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStart={(event) => event.preventDefault()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        className="w-full"
        style={{
          transform: dragging ? "translateY(-1px) scale(1.02)" : "scale(1)",
          transition: dragging
            ? "box-shadow 160ms ease"
            : "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms ease",
        }}
      >
        <button
          type="button"
          draggable={false}
          onClick={onSelect}
          onDragStart={(event) => event.preventDefault()}
          aria-label={[serviceLabel(node), tone.label, host, elapsed].filter(Boolean).join(" ")}
          aria-pressed={selected}
          aria-grabbed={dragging}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left",
            dragging ? "cursor-grabbing" : "cursor-grab",
            empty
              ? "border border-dashed border-fg/16 bg-card/90 hover:border-fg/28 hover:bg-card"
              : "bg-white shadow-[0_10px_28px_-16px_rgba(0,0,0,0.28)] ring-1 ring-black/[0.06] hover:ring-black/[0.12]",
            hovered && !selected && !empty && "shadow-[0_16px_36px_-16px_rgba(0,0,0,0.32)]",
            dragging && "shadow-[0_22px_44px_-16px_rgba(0,0,0,0.38)] ring-black/20",
            selected && empty && "border-[#1d1d1f]/50 bg-white",
            selected &&
              !empty &&
              "bg-white shadow-[0_16px_36px_-16px_rgba(0,0,0,0.32)] ring-[1.5px] ring-[#1d1d1f] hover:ring-[#1d1d1f]",
          )}
        >
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${nodeMarkClass(node)}`}>
            <ServiceIcon node={node} size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="block min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-fg">
                {serviceLabel(node)}
              </span>
              {elapsed ? (
                <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-[#9A6700]">
                  {elapsed}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] tracking-tight text-fg/42">
              <span
                aria-hidden="true"
                className={cn("size-1.5 shrink-0 rounded-full", tone.busy && "animate-pulse")}
                style={{ backgroundColor: empty ? "var(--idle-dot)" : tone.dot }}
              />
              <span className="min-w-0 truncate">
                {serviceCaption(node)}
                {host ? ` · ${host}` : ""}
              </span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function CanvasControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 cursor-pointer place-items-center rounded-lg text-fg/55 transition-colors duration-150 ease-out hover:bg-fg/[0.07] hover:text-fg md:size-8"
    >
      {children}
    </button>
  );
}
