export type Point = { x: number; y: number };

export const CANVAS_NODE = {
  width: 240,
  height: 62,
} as const;

/** World spacing of the canvas dots. Cards settle onto this grid. */
export const CANVAS_DOT = 18;

/** Rim that stays visible when one card is stacked on another. One dot, so a cascade stays on the grid. */
export const CARD_PEEK = {
  x: CANVAS_DOT,
  y: CANVAS_DOT,
} as const;

export function snapToDots(point: Point): Point {
  return {
    x: Math.round(point.x / CANVAS_DOT) * CANVAS_DOT,
    y: Math.round(point.y / CANVAS_DOT) * CANVAS_DOT,
  };
}

export function serviceGrid(count: number, gapX = 280, gapY = 140): Point[] {
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const height = (rows - 1) * gapY;

  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const columnsInRow = row === rows - 1 ? count - row * columns : columns;
    const rowWidth = (columnsInRow - 1) * gapX;

    return snapToDots({
      x: column * gapX - rowWidth / 2,
      y: row * gapY - height / 2,
    });
  });
}

export function cardsOverlap(a: Point, b: Point) {
  return Math.abs(a.x - b.x) < CANVAS_NODE.width && Math.abs(a.y - b.y) < CANVAS_NODE.height;
}

/** True when `front` hides `behind` enough that no useful edge is showing. */
export function isBuried(behind: Point, front: Point, peek = CARD_PEEK) {
  if (!cardsOverlap(behind, front)) return false;
  const dx = Math.abs(behind.x - front.x);
  const dy = Math.abs(behind.y - front.y);
  if (dx < peek.x && dy < peek.y) return true;
  const overlap =
    (CANVAS_NODE.width - dx) * (CANVAS_NODE.height - dy) / (CANVAS_NODE.width * CANVAS_NODE.height);
  return overlap > 0.82;
}

/**
 * Keep the dropped card where it landed. Slide buried cards into a shallow
 * cascade so a rim of each one stays visible — like a deck, not a collision.
 */
export function peekCoveredCards(
  positions: Record<string, Point>,
  topId: string,
  order: string[],
): { next: Record<string, Point>; moved: string[] } {
  const top = positions[topId];
  if (!top) return { next: positions, moved: [] };

  const seen = new Set<string>();
  const buried: string[] = [];
  for (const id of order) {
    if (id === topId || seen.has(id)) continue;
    const point = positions[id];
    if (!point || !isBuried(point, top)) continue;
    seen.add(id);
    buried.push(id);
  }
  for (const id of Object.keys(positions)) {
    if (id === topId || seen.has(id)) continue;
    const point = positions[id];
    if (!point || !isBuried(point, top)) continue;
    buried.push(id);
  }
  if (buried.length === 0) return { next: positions, moved: [] };

  let sx = 0;
  let sy = 0;
  for (const id of buried) {
    const point = positions[id];
    if (!point) continue;
    sx += point.x - top.x;
    sy += point.y - top.y;
  }
  const signX = sx === 0 ? 1 : Math.sign(sx);
  const signY = sy === 0 ? 1 : Math.sign(sy);

  const next = { ...positions };
  const moved: string[] = [];
  buried.forEach((id, index) => {
    const layer = buried.length - index;
    const point = {
      x: top.x + signX * CARD_PEEK.x * layer,
      y: top.y + signY * CARD_PEEK.y * layer,
    };
    const prev = next[id];
    if (!prev || prev.x !== point.x || prev.y !== point.y) {
      next[id] = point;
      moved.push(id);
    }
  });
  return { next, moved };
}
