import { packWidgets, type OverviewWidget, type WidgetRect, type ResizeAlignmentGuide } from "./layout";

export type WidgetPosition = { column: number; offset_y: number };
export type WidgetGeometryPatch = Partial<Pick<OverviewWidget,
  "width" | "max_height" | "frame_height" | "column" | "offset_y"
>>;
export type PlacedWidget = WidgetPosition & { width: number; height: number };
const gap = 14;
export const clampColumn = (column: number, width: number) =>
  Math.max(1, Math.min(13 - width, column));

function intersects(a: PlacedWidget, b: PlacedWidget) {
  // Arithmetic noise only; never use screen-pixel tolerance to allow a smaller gutter.
  return a.column < b.column + b.width - 1e-10 && b.column < a.column + a.width - 1e-10 &&
    a.offset_y < b.offset_y + b.height + gap &&
    b.offset_y < a.offset_y + a.height + gap;
}

/** Commit from the gesture's canonical snapshot, never its last rendered preview. */
export function arrangeWidgets(
  widgets: OverviewWidget[], positions: PlacedWidget[], index: number,
  patch: WidgetGeometryPatch, boardHeight: number,
): OverviewWidget[] {
  const source = positions[index];
  const desired = { ...source, ...patch, height: patch.frame_height ?? source.height };
  const obstacles = positions.filter((_, i) => i !== index);
  const fitted = patch.frame_height !== undefined
    ? constrainWidgetResize(desired, source, obstacles, boardHeight)
    : fitMovingWidget(desired, obstacles, source, boardHeight);
  const compacted = closeEmptyBands(positions.map((rect, i) => i === index ? fitted : rect));
  return widgets.map((widget, i) => ({ ...widget,
    ...(i === index ? { ...patch, width: fitted.width,
      ...(patch.frame_height !== undefined ? { frame_height: fitted.height, max_height: fitted.height } : {}) } : {}),
    column: compacted[i].column, offset_y: Math.round(compacted[i].offset_y),
  }));
}

/** Remove only bands empty across the WHOLE board, preserving each block's geometry. */
export function closeEmptyBands(rectangles: PlacedWidget[]): PlacedWidget[] {
  let end = 0, removed = 0;
  const result = rectangles.map(rect => ({ ...rect }));
  const ordered = rectangles.map((_, i) => i).sort((a, b) => rectangles[a].offset_y - rectangles[b].offset_y);
  for (const index of ordered) {
    const rect = rectangles[index];
    const available = rect.offset_y - end;
    if (available > gap) removed += available - (end === 0 ? 0 : gap);
    end = Math.max(end, rect.offset_y + rect.height);
    result[index].offset_y = Math.max(0, rect.offset_y - removed);
  }
  return result;
}

/** Resolve an occupied hover target without relocating any neighbor. */
export function fitMovingWidget(
  desired: PlacedWidget, obstacles: PlacedWidget[], fallback: PlacedWidget, boardHeight: number,
): PlacedWidget {
  const bounded = { ...desired,
    column: clampColumn(desired.column, desired.width),
    offset_y: Math.max(0, Math.min(boardHeight - desired.height, desired.offset_y)),
  };
  const free = (rect: PlacedWidget) => rect.column >= 1 && rect.column + rect.width <= 13 + 1e-6 &&
    rect.offset_y >= 0 && rect.offset_y + rect.height <= boardHeight + 1e-6 && !obstacles.some(other => intersects(rect, other));
  if (free(bounded)) return bounded;
  const xs = [...new Set([bounded.column, 1, 13 - bounded.width,
    ...obstacles.flatMap(rect => [rect.column - bounded.width, rect.column + rect.width])])]
    .filter(x => x >= 1 && x + bounded.width <= 13).sort((a,b) => Math.abs(a-bounded.column)-Math.abs(b-bounded.column)).slice(0,16);
  const ys = [...new Set([bounded.offset_y, 0, boardHeight - bounded.height,
    ...obstacles.flatMap(rect => [rect.offset_y - bounded.height - gap, rect.offset_y + rect.height + gap])])]
    .filter(y => y >= 0 && y + bounded.height <= boardHeight).sort((a,b) => Math.abs(a-bounded.offset_y)-Math.abs(b-bounded.offset_y)).slice(0,16);
  let best: PlacedWidget | undefined, distance = Infinity;
  for (const column of xs) for (const offset_y of ys) {
    const candidate = { ...bounded, column, offset_y };
    // Columns and vertical pixels use comparable units at a typical board width.
    const score = ((column - bounded.column) * 100) ** 2 + (offset_y - bounded.offset_y) ** 2;
    if (score < distance && free(candidate)) { best = candidate; distance = score; }
  }
  return best ?? { ...fallback };
}

/** Stop growth at an obstacle instead of pushing an unrelated card away. */
export function constrainWidgetResize(desired: PlacedWidget, source: PlacedWidget, obstacles: PlacedWidget[], boardHeight: number) {
  desired = { ...desired, column: clampColumn(desired.column, desired.width) };
  const free = (rect: PlacedWidget) => rect.column >= 1 && rect.column + rect.width <= 13 + 1e-6 &&
    rect.offset_y >= 0 && rect.offset_y + rect.height <= boardHeight + 1e-6 && !obstacles.some(other => intersects(rect, other));
  if (free(desired)) return desired;
  const between = (t: number): PlacedWidget => ({
    column: source.column + (desired.column - source.column) * t,
    offset_y: source.offset_y + (desired.offset_y - source.offset_y) * t,
    width: source.width + (desired.width - source.width) * t,
    height: source.height + (desired.height - source.height) * t,
  });
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (free(between(middle))) low = middle; else high = middle;
  }
  const result = between(low);
  const width = Math.floor(result.width * 10000) / 10000;
  const height = Math.floor(result.height);
  // Keep the opposite edge anchored when changing north/west edges.
  const rounded = { width, height,
    column: desired.column === source.column ? source.column : source.column + source.width - width,
    offset_y: desired.offset_y === source.offset_y ? source.offset_y : source.offset_y + source.height - height,
  };
  return free(rounded) ? rounded : { ...source };
}

/** Keep the edited card where it was dropped; move only colliding cards down. */
export function placeWidgets(
  widgets: OverviewWidget[],
  heights: number[],
  priority?: string,
): PlacedWidget[] {
  const legacy = packWidgets(widgets.map((w, i) => ({
    width: Math.ceil(w.width), height: Math.ceil((heights[i] + gap) / 22),
  })));
  const placed: PlacedWidget[] = [];
  const result: PlacedWidget[] = [];
  const order = widgets.map((_, i) => i).sort((a, b) =>
    Number(widgets[b].id === priority) - Number(widgets[a].id === priority) ||
    Number(widgets[b].column !== undefined) - Number(widgets[a].column !== undefined) || a - b,
  );
  for (const index of order) {
    const w = widgets[index];
    const rect: PlacedWidget = {
      column: clampColumn(w.column ?? legacy[index].column, w.width),
      offset_y: Math.max(0, w.offset_y ?? (legacy[index].row - 1) * 22),
      width: w.width,
      height: heights[index],
    };
    // Every pass clears at least one earlier rectangle; at most 40 cards exist.
    for (let pass = 0; pass < widgets.length; pass++) {
      const collisions = placed.filter((other) => intersects(rect, other));
      if (!collisions.length) break;
      rect.offset_y = Math.max(...collisions.map((other) => other.offset_y + other.height + gap));
    }
    placed.push(rect);
    result[index] = rect;
  }
  return result;
}

/** Pointer offsets preserve the exact grabbed point, including during scrolling. */
export function movedPosition(
  origin: WidgetPosition, width: number, dx: number, dy: number, columnStep: number,
): WidgetPosition {
  return {
    column: clampColumn(origin.column + dx / columnStep, width),
    offset_y: Math.max(0, Math.min(60000, Math.round(origin.offset_y + dy))),
  };
}

/** Nearby edges and gutters attract softly; the modifier increases their capture range. */
export function snapMovedRect(rect: WidgetRect, neighbors: WidgetRect[], dx: number, dy: number, align: boolean) {
  const guides: ResizeAlignmentGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const start = axis === "x" ? "left" : "top";
    const end = axis === "x" ? "right" : "bottom";
    const delta = axis === "x" ? dx : dy;
    const size = rect[end] - rect[start];
    const candidates = neighbors.flatMap(other => [
      { value: other[end] + gap, other, aligned: false, boundary: other[end] },
      { value: other[start] - gap - size, other, aligned: false, boundary: other[start] },
      ...[
        { value: other[start], other, aligned: true, boundary: other[start] },
        { value: other[end] - size, other, aligned: true, boundary: other[end] },
      ],
    ]).filter(candidate => Math.abs(candidate.value - rect[start] - delta) <= (align ? 24 : 8));
    candidates.sort((a, b) => Math.abs(a.value - rect[start] - delta) - Math.abs(b.value - rect[start] - delta));
    const target = candidates[0];
    if (!target) continue;
    if (axis === "x") dx = target.value - rect.left;
    else dy = target.value - rect.top;
    if (target.aligned) guides.push({ axis, position: target.boundary,
      start: axis === "x" ? Math.min(rect.top + dy, target.other.top) - 8 : Math.min(rect.left + dx, target.other.left) - 8,
      end: axis === "x" ? Math.max(rect.bottom + dy, target.other.bottom) + 8 : Math.max(rect.right + dx, target.other.right) + 8,
    });
  }
  return { dx, dy, guides };
}
