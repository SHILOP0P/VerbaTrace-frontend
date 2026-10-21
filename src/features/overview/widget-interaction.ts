import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  type OverviewWidget,
  type ResizeAlignmentGuide,
} from "./layout";
import { placeWidgets, closeEmptyBands } from "./widget-geometry";
import { bindWidgetInteraction, type Preview, type GestureOptions } from "./widget-gestures";
export { resizeEdges, edgeNames } from "./widget-gestures";

type Options = GestureOptions & {
  board: RefObject<HTMLDivElement | null>;
  enabled: boolean;
};

/** Native touch listeners stay non-passive only on the board, so a short swipe scrolls normally. */
export function useWidgetInteraction(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [preview, setPreview] = useState<Preview>();
  const [drag, setDrag] = useState<string>();
  const [target, setTarget] = useState<string>();
  const [resizing, setResizing] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const [guides, setGuides] = useState<ResizeAlignmentGuide[]>([]);
  useEffect(() => {
    const board = options.board.current;
    if (!options.enabled || !board) return;
    return bindWidgetInteraction(board, () => latest.current, {
      setPreview,
      setDrag,
      setTarget,
      setResizing,
      setAnnouncement,
      setGuides,
    });
  }, [options.enabled, options.board]);
  return { preview, drag, target, resizing, announcement, guides };
}

/** Natural legacy sizes remain intact until the user explicitly sizes a frame. */
export function useWidgetPacking(
  board: RefObject<HTMLDivElement | null>,
  widgets: OverviewWidget[],
  active: boolean,
  priority?: string,
) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const ids = widgets.map((w) => w.id).join(",");
  useLayoutEffect(() => {
    if (!active || !board.current) return;
    let frame = 0;
    const measure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setViewport(window.innerWidth);
        const next: Record<string, number> = {};
        board.current
          ?.querySelectorAll<HTMLElement>("[data-widget-id]")
          .forEach((el) => {
            next[el.dataset.widgetId!] = el.getBoundingClientRect().height;
          });
        setHeights((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(board.current);
    board.current
      .querySelectorAll("[data-widget-id]")
      .forEach((el) => observer.observe(el));
    window.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [board, ids, active]);
  const sizes = widgets.map((w) => w.frame_height ?? Math.ceil(heights[w.id] ?? 210));
  // A gesture freezes every neighbor at its starting coordinates.
  let positions = priority ? widgets.map((w,i) => ({ column: w.column ?? 1,
    offset_y: w.offset_y ?? 0, width: w.width, height: sizes[i] }))
    : closeEmptyBands(placeWidgets(widgets, sizes));
  if (viewport <= 620) {
    let top = 0;
    const mobile = [...positions];
    positions.map((_, i) => i).sort((a, b) =>
      positions[a].offset_y - positions[b].offset_y || positions[a].column - positions[b].column,
    ).forEach((i) => {
      mobile[i] = { column: 1, offset_y: top, width: 12, height: sizes[i] };
      top += sizes[i] + 14;
    });
    positions = mobile;
  }
  return { positions, height: Math.max(0, ...positions.map(p => p.offset_y + p.height)) };
}
