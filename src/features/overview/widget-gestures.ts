import {
  getResizeAlignment,
  resizeWidget,
  widgetMaxHeight,
  type OverviewWidget,
  type ResizeEdge,
  type WidgetRect,
  type ResizeAlignmentGuide,
} from "./layout";
import { movedPosition, snapMovedRect, fitMovingWidget, constrainWidgetResize, type PlacedWidget, type WidgetGeometryPatch, type WidgetPosition } from "./widget-geometry";

const interactive =
  "button, a, input, select, textarea, [role=button], [contenteditable=true]";
export const resizeEdges: ResizeEdge[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];
export const edgeNames: Record<ResizeEdge, string> = {
  n: "Верхняя грань",
  s: "Нижняя грань",
  e: "Правая грань",
  w: "Левая грань",
  ne: "Верхний правый угол",
  nw: "Верхний левый угол",
  se: "Нижний правый угол",
  sw: "Нижний левый угол",
};
export type Preview = { id: string; positions?: Record<string, WidgetPosition>; canvasHeight?: number } & WidgetGeometryPatch;
type Gesture = {
  widget: OverviewWidget;
  x: number;
  y: number;
  currentX: number;
  currentY: number;
  edge?: ResizeEdge;
  touch: boolean;
  active: boolean;
  moved: boolean;
  target?: string;
  columnStep: number;
  timer?: number;
  preview?: Preview;
  selectOnly: boolean;
  selectionMade?: boolean;
  align: boolean;
  rect: WidgetRect;
  origin: WidgetPosition;
  boardTop: number;
  boardHeight: number;
  positions?: Record<string, WidgetPosition>;
  neighbors: WidgetRect[];
  obstacles: PlacedWidget[];
  source: PlacedWidget;
  geometry: PlacedWidget[];
};
export type GestureOptions = {
  widgets: OverviewWidget[];
  selected?: string;
  onSelect: (id: string | undefined) => void;
  getGeometry: () => PlacedWidget[];
  onArrange: (id: string, patch: WidgetGeometryPatch, geometry?: PlacedWidget[]) => void;
  onMove: (id: string, target: string) => void;
  onScroll: (y: number) => void;
};
type Emit = {
  setPreview: (value: Preview | undefined) => void;
  setDrag: (value: string | undefined) => void;
  setTarget: (value: string | undefined) => void;
  setResizing: (value: string | undefined) => void;
  setAnnouncement: (value: string) => void;
  setGuides: (value: ResizeAlignmentGuide[]) => void;
};
/** Pointer and touch controller; one persisted mutation after a completed gesture. */
export function bindWidgetInteraction(
  board: HTMLDivElement,
  getOptions: () => GestureOptions,
  emit: Emit,
) {
  let gesture: Gesture | undefined;
  let frame = 0,
    scrollFrame = 0,
    suppressClickUntil = 0;
  function neighbors(card: Element) {
    return Array.from(board.querySelectorAll<HTMLElement>("[data-widget-id]"))
      .filter((el) => el !== card)
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.bottom > 0 && rect.top < window.innerHeight);
  }
  function matchingGuides(
    rect: WidgetRect,
    widget: OverviewWidget,
    preview: Pick<OverviewWidget, "width" | "max_height">,
    columnStep: number,
    guides: ResizeAlignmentGuide[],
    edge: ResizeEdge = "se",
  ) {
    return guides.filter(
      (guide) =>
        Math.abs(
          guide.position -
            (guide.axis === "x"
              ? edge.includes("w") ? rect.left - (preview.width - widget.width) * columnStep : rect.right + (preview.width - widget.width) * columnStep
              : edge.includes("n") ? rect.top - preview.max_height! + widgetMaxHeight(widget) : rect.bottom + preview.max_height! - widgetMaxHeight(widget)),
        ) <= 1,
    );
  }
  function paint() {
    frame = 0;
    const g = gesture;
    if (!g?.active) return;
    if (g.edge) {
      const card = Array.from(
        board.querySelectorAll<HTMLElement>("[data-widget-id]"),
      ).find((el) => el.dataset.widgetId === g.widget.id);
      const raw = { dx: g.currentX - g.x, dy: g.currentY - g.y };
      const snapped =
        card
          ? getResizeAlignment(
              g.rect,
              g.neighbors,
              g.edge,
              g.currentX - g.x,
              g.currentY - g.y,
            )
          : { ...raw, guides: [] };
      const snapX = g.align || Math.abs(snapped.dx - raw.dx) <= 8;
      const snapY = g.align || Math.abs(snapped.dy - raw.dy) <= 8;
      const delta = { dx: snapX ? snapped.dx : raw.dx, dy: snapY ? snapped.dy : raw.dy,
        guides: snapped.guides.filter(guide => guide.axis === "x" ? snapX : snapY) };
      const size = resizeWidget(g.widget, g.edge, delta.dx, delta.dy, g.columnStep);
      const mobile = window.innerWidth <= 620;
      if (mobile) size.width = g.widget.width;
      else size.width = Math.min(size.width, g.edge.includes("w")
        ? g.origin.column + g.widget.width - 1 : 13 - g.origin.column);
      if (!mobile && g.edge.includes("n"))
        size.max_height = Math.min(size.max_height, widgetMaxHeight(g.widget) + g.origin.offset_y);
      if (!g.edge.includes("n"))
        size.max_height = Math.min(size.max_height, Math.floor(g.boardHeight - g.origin.offset_y));
      g.preview = {
        id: g.widget.id, positions: g.positions, canvasHeight: g.boardHeight, ...size, frame_height: size.max_height,
        ...(!mobile ? {
          column: g.origin.column + (g.edge.includes("w") ? g.widget.width - size.width : 0),
          offset_y: g.origin.offset_y + (g.edge.includes("n") ? widgetMaxHeight(g.widget) - size.max_height : 0),
        } : {}),
      };
      if (!mobile) {
        const fitted = constrainWidgetResize({ column: g.preview.column!, offset_y: g.preview.offset_y!,
          width: size.width, height: size.max_height }, g.source, g.obstacles, g.boardHeight);
        Object.assign(g.preview, { column: fitted.column, offset_y: fitted.offset_y,
          width: fitted.width, max_height: fitted.height, frame_height: fitted.height });
        size.width = fitted.width; size.max_height = fitted.height;
      }
      emit.setPreview(g.preview);
      emit.setGuides(
        matchingGuides(g.rect, g.widget, size, g.columnStep, delta.guides, g.edge),
      );
    } else {
      if (window.innerWidth > 620) {
        const delta = snapMovedRect(g.rect, g.neighbors, g.currentX - g.x,
          g.currentY - g.y + g.boardTop - board.getBoundingClientRect().top, g.align);
        const position = movedPosition(
          g.origin, g.widget.width, delta.dx, delta.dy, g.columnStep,
        );
        position.offset_y = Math.min(position.offset_y, Math.floor(g.boardHeight - (g.rect.bottom - g.rect.top)));
        const fitted = fitMovingWidget({ ...g.source, ...position }, g.obstacles, g.source, g.boardHeight);
        position.column = fitted.column; position.offset_y = fitted.offset_y;
        g.preview = { id: g.widget.id, positions: g.positions, canvasHeight: g.boardHeight, ...position };
        emit.setPreview(g.preview);
        emit.setGuides(delta.guides.filter(guide => guide.axis === "x"
          ? Math.abs((position.column - g.origin.column) * g.columnStep - delta.dx) < 1
          : Math.abs(position.offset_y - g.origin.offset_y - delta.dy) < 1));
      }
      const hit = document
        .elementFromPoint(g.currentX, g.currentY)
        ?.closest<HTMLElement>("[data-widget-id]");
      g.target = hit && board?.contains(hit) ? hit.dataset.widgetId : undefined;
      emit.setTarget(g.target);
    }
  }
  function scroll() {
    if (!gesture?.active || gesture.edge) return;
    getOptions().onScroll(gesture.currentY);
    paint();
    scrollFrame = requestAnimationFrame(scroll);
  }
  function activate() {
    const g = gesture;
    if (!g) return;
    g.active = true;
    if (g.edge) emit.setResizing(g.widget.id);
    else {
      emit.setDrag(g.widget.id);
      emit.setAnnouncement(
        "Переместите виджет в нужное место обзора.",
      );
      scrollFrame = requestAnimationFrame(scroll);
    }
  }
  function finish(commit: boolean) {
    const g = gesture;
    if (!g) {
      emit.setGuides([]);
      return;
    }
    if (g.timer) window.clearTimeout(g.timer);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(scrollFrame);
    if (g.selectionMade) suppressClickUntil = Date.now() + 500;
    if (g.active) {
      paint();
      suppressClickUntil = Date.now() + 500;
      if (commit && g.moved && g.preview) {
        const { id, positions: _positions, canvasHeight: _canvasHeight, ...patch } = g.preview;
        getOptions().onArrange(id, patch, g.geometry);
        emit.setAnnouncement(g.edge ? "Размер виджета изменён." : "Положение виджета изменено.");
      } else if (commit && !g.edge && window.innerWidth <= 620 && g.target && g.target !== g.widget.id) {
        getOptions().onMove(g.widget.id, g.target);
        emit.setAnnouncement("Положение виджета изменено.");
      } else
        emit.setAnnouncement(
          commit ? "Положение не изменилось." : "Изменение отменено.",
        );
    }
    gesture = undefined;
    emit.setPreview(undefined);
    emit.setDrag(undefined);
    emit.setTarget(undefined);
    emit.setResizing(undefined);
    emit.setGuides([]);
  }
  function start(
    element: EventTarget | null,
    x: number,
    y: number,
    touch: boolean,
    pointer: boolean,
    align = false,
  ) {
    if (!(element instanceof Element) || gesture) return false;
    const card = element.closest<HTMLElement>("[data-widget-id]");
    if (!card || !board?.contains(card)) return false;
    const edge = element.closest<HTMLElement>("[data-resize-edge]")?.dataset
      .resizeEdge as ResizeEdge | undefined;
    if (
      (touch && pointer && !edge) ||
      (!pointer && edge) ||
      (!edge && element.closest(interactive))
    )
      return false;
    const widget = getOptions().widgets.find(
      (w) => w.id === card.dataset.widgetId,
    );
    if (!widget) return false;
    const selectOnly = getOptions().selected !== widget.id;
    if (edge && selectOnly) return false;
    const rect = card.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();
    const columnStep = (board.clientWidth + 14) / 12;
    const options = getOptions();
    const geometry = options.getGeometry().map(rect => ({ ...rect }));
    const index = options.widgets.findIndex(w => w.id === widget.id);
    const source = geometry[index];
    gesture = {
      widget: edge ? { ...widget, frame_height: Math.max(88, source.height) } : widget,
      x,
      y,
      currentX: x,
      currentY: y,
      edge,
      touch,
      active: false,
      moved: false,
      columnStep,
      selectOnly,
      align,
      rect,
      boardTop: boardRect.top,
      boardHeight: boardRect.bottom - boardRect.top,
      neighbors: neighbors(card),
      source,
      geometry,
      obstacles: geometry.filter((_, i) => i !== index),
      origin: { column: source.column, offset_y: source.offset_y },
      positions: window.innerWidth <= 620 ? undefined : Object.fromEntries(
        options.widgets.map((w, i) => [w.id, { column: geometry[i].column, offset_y: geometry[i].offset_y }]),
      ),
    };
    if (selectOnly) {
      if (touch)
        gesture.timer = window.setTimeout(() => {
          if (!gesture) return;
          gesture.selectionMade = true;
          getOptions().onSelect(widget.id);
          emit.setAnnouncement(
            "Виджет выбран. Теперь его можно переместить обычным движением.",
          );
        }, 450);
      else getOptions().onSelect(widget.id);
    } else if (edge) activate();
    return true;
  }
  function move(x: number, y: number, align = false) {
    const g = gesture;
    if (!g) return;
    g.currentX = x;
    g.currentY = y;
    g.align = align;
    const distance = Math.hypot(x - g.x, y - g.y);
    if (g.selectOnly) {
      if (g.touch && distance > 8 && !g.selectionMade) finish(false);
      return;
    }
    if (!g.active) {
      if (distance < 6) return;
      activate();
    }
    g.moved ||= distance > 2;
    if (!frame) frame = requestAnimationFrame(paint);
  }
  const pointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) {
      finish(false);
      return;
    }
    if (e.button !== 0) return;
    if (
      start(
        e.target,
        e.clientX,
        e.clientY,
        e.pointerType === "touch",
        true,
        e.ctrlKey || e.metaKey,
      ) &&
      gesture?.edge
    )
      e.preventDefault();
  };
  const pointerMove = (e: PointerEvent) => {
    if (!gesture || (gesture.touch && !gesture.edge)) return;
    move(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
    if (gesture?.active) e.preventDefault();
  };
  const pointerUp = () => {
    if (gesture && (!gesture.touch || gesture.edge)) finish(true);
  };
  const pointerCancel = () => {
    if (gesture && (!gesture.touch || gesture.edge)) finish(false);
  };
  const touchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      finish(false);
      return;
    }
    const t = e.touches[0];
    start(e.target, t.clientX, t.clientY, true, false);
  };
  const touchMove = (e: TouchEvent) => {
    if (!gesture?.touch || gesture.edge) return;
    if (e.touches.length !== 1) {
      finish(false);
      return;
    }
    const t = e.touches[0];
    move(t.clientX, t.clientY);
    if (gesture?.active && e.cancelable) e.preventDefault();
  };
  const touchEnd = () => {
    if (gesture?.touch && !gesture.edge) finish(true);
  };
  const cancel = () => finish(false);
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (e.defaultPrevented || document.querySelector('.select-menu-portal')) return;
      finish(false);
      getOptions().onSelect(undefined);
    }
    if (e.key === "Control" || e.key === "Meta") {
      if (gesture) {
        gesture.align = e.type === "keydown";
        if (!frame) frame = requestAnimationFrame(paint);
      } else if (e.type === "keyup") emit.setGuides([]);
      else if (!gesture) {
        const card = Array.from(
          board.querySelectorAll<HTMLElement>("[data-widget-id]"),
        ).find((el) => el.dataset.widgetId === getOptions().selected);
        const widget = getOptions().widgets.find(
          (w) => w.id === getOptions().selected,
        );
        if (card && widget) {
          const rect = card.getBoundingClientRect();
          const alignment = getResizeAlignment(
            rect,
            neighbors(card),
            "se",
            0,
            0,
          );
          const columnStep = (board.clientWidth + 14) / 12;
          const preview = resizeWidget(
            widget,
            "se",
            alignment.dx,
            alignment.dy,
            columnStep,
          );
          emit.setGuides(
            matchingGuides(rect, widget, preview, columnStep, alignment.guides),
          );
        }
      }
    }
  };
  const outside = (e: PointerEvent) => {
    if (
      e.target instanceof Element &&
      !board.contains(e.target) &&
      !e.target.closest(".overview-widget-settings, .select-menu-portal-root")
    ) {
      finish(false);
      getOptions().onSelect(undefined);
    }
  };
  const click = (e: MouseEvent) => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const context = (e: Event) => {
    if (gesture?.touch) e.preventDefault();
  };
  const geometryChanged = () => {
    if (gesture?.edge) finish(false);
    else emit.setGuides([]);
  };
  board.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove, { passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerCancel);
  board.addEventListener("touchstart", touchStart, { passive: true });
  board.addEventListener("touchmove", touchMove, { passive: false });
  board.addEventListener("touchend", touchEnd);
  board.addEventListener("touchcancel", cancel);
  board.addEventListener("click", click, true);
  board.addEventListener("contextmenu", context);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", key);
  window.addEventListener("keyup", key);
  window.addEventListener("scroll", geometryChanged, true);
  window.addEventListener("resize", cancel);
  document.addEventListener("pointerdown", outside);
  return () => {
    finish(false);
    board.removeEventListener("pointerdown", pointerDown);
    window.removeEventListener("pointermove", pointerMove);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerCancel);
    board.removeEventListener("touchstart", touchStart);
    board.removeEventListener("touchmove", touchMove);
    board.removeEventListener("touchend", touchEnd);
    board.removeEventListener("touchcancel", cancel);
    board.removeEventListener("click", click, true);
    board.removeEventListener("contextmenu", context);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", key);
    window.removeEventListener("keyup", key);
    window.removeEventListener("scroll", geometryChanged, true);
    window.removeEventListener("resize", cancel);
    document.removeEventListener("pointerdown", outside);
  };
}
