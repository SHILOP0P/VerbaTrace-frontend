import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

type Side = "left" | "right";
type Widths = Record<Side, number>;
type Panels = { open: boolean; expanded: boolean; historyOpen: boolean; inspectorOpen: boolean };
const storageKey = "vt.assistant.panel-widths.v1";
const defaults: Widths = { left: 230, right: 340 };
const minimum: Widths = { left: 160, right: 240 };
const maximum: Widths = { left: 600, right: 720 };
const conversationMinimum = 320;
const clamp = (value: number, min: number, max: number) => Math.round(Math.min(Math.max(min, max), Math.max(min, value)));

function restore(): Widths {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    return {
      left: Number.isFinite(value?.left) ? clamp(value.left, minimum.left, maximum.left) : defaults.left,
      right: Number.isFinite(value?.right) ? clamp(value.right, minimum.right, maximum.right) : defaults.right
    };
  } catch { return defaults; }
}

export function useAssistantPanelWidths(workspace: RefObject<HTMLElement | null>, panels: Panels) {
  const [preferred, setPreferred] = useState<Widths>(restore);
  const [layout, setLayout] = useState({ width: 0, docked: true });
  const [resizing, setResizing] = useState(false);
  const ids = { left: useId(), right: useId() };
  const drag = useRef<{ side: Side; x: number; width: number; pointerId: number } | null>(null);

  useLayoutEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const media = window.matchMedia("(min-width: 901px)");
    const measure = () => {
      const next = { width: root.clientWidth, docked: media.matches };
      setLayout(previous => previous.width === next.width && previous.docked === next.docked ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    media.addEventListener("change", measure);
    return () => { observer.disconnect(); media.removeEventListener("change", measure); };
  }, [workspace, panels.open, panels.expanded]);

  // Fit the displayed widths without overwriting the user's saved preference.
  // Returning to a larger window restores the preferred space for each panel.
  const available = layout.width || 1200;
  const leftMax = layout.docked
    ? Math.min(maximum.left, available - conversationMinimum - (panels.inspectorOpen ? minimum.right : 48))
    : Math.min(maximum.left, available - 64);
  const left = clamp(preferred.left, minimum.left, leftMax);
  const rightMax = layout.docked
    ? Math.min(maximum.right, available - conversationMinimum - (panels.historyOpen ? left : 0))
    : Math.min(maximum.right, available - 48);
  const widths = { left, right: clamp(preferred.right, minimum.right, rightMax) };
  const latest = useRef({ preferred, widths });
  latest.current = { preferred, widths };
  const limits = (side: Side) => ({
    min: minimum[side],
    max: Math.max(minimum[side], side === "right" ? rightMax : Math.min(leftMax, layout.docked ? available - conversationMinimum - (panels.inspectorOpen ? widths.right : 48) : leftMax))
  });
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(latest.current.preferred)); } catch { /* Keep in-memory preferences if storage is unavailable. */ } };
  const update = (side: Side, value: number) => {
    const bound = limits(side);
    const next = { ...latest.current.preferred, [side]: clamp(value, bound.min, bound.max) };
    latest.current = { ...latest.current, preferred: next };
    setPreferred(next);
  };
  const stop = () => { if (drag.current) { drag.current = null; setResizing(false); save(); } };
  useEffect(() => { stop(); }, [panels.open, panels.expanded, panels.historyOpen, panels.inspectorOpen]);

  const separator = (side: Side) => ({
    role: "separator", tabIndex: 0, "aria-orientation": "vertical" as const,
    "aria-label": side === "left" ? "Ширина списка чатов" : "Ширина правой панели",
    "aria-controls": ids[side], "aria-valuenow": widths[side], "aria-valuemin": minimum[side], "aria-valuemax": limits(side).max,
    "aria-valuetext": `${widths[side]} пикселей`,
    title: "Перетащите или используйте стрелки; Home — минимум, End — максимум",
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = { side, x: event.clientX, width: widths[side], pointerId: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
      setResizing(true);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const active = drag.current;
      if (active?.side === side && active.pointerId === event.pointerId) update(side, active.width + (event.clientX - active.x) * (side === "left" ? 1 : -1));
    },
    onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      const bound = limits(side);
      let value = widths[side];
      if (event.key === "Home") value = bound.min;
      else if (event.key === "End") value = bound.max;
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") value += (event.key === "ArrowRight" ? 20 : -20) * (side === "left" ? 1 : -1);
      else if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); stop(); return; }
      else return;
      event.preventDefault(); update(side, value); save();
    }
  });
  return { widths, ids, resizing, separator };
}
