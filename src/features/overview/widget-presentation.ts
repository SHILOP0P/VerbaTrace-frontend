type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
export function widgetRowCapacity(height: number, bars = false, total = Infinity, listening = false) {
  const rowHeight = height < 115 ? 22 : height < 150 ? 28 : bars ? 30 : height < 190 ? 34 : listening ? 64 : 48;
  const header = height < 115 ? 44 : height < 150 ? 60 : height < 190 ? 68 : 88;
  const gap = listening ? 6 : 4;
  const withoutPager = Math.max(1, Math.floor((height - header + gap) / (rowHeight + gap)));
  const capacity = total <= withoutPager ? withoutPager : Math.max(1, Math.floor((height - header - 20) / (rowHeight + gap)));
  return { rowHeight, capacity };
}
export function placeWidgetSettings(
  anchor: Rect,
  viewport: { width: number; top: number; bottom: number },
  contentHeight: number,
) {
  const margin = 12,
    gap = 12;
  const width = Math.min(340, viewport.width - margin * 2);
  const availableHeight = Math.max(80, viewport.bottom - viewport.top);
  const height = Math.min(contentHeight, availableHeight);
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));
  const alignedLeft = clamp(
    anchor.left,
    margin,
    viewport.width - width - margin,
  );
  if (viewport.width <= 620)
    return {
      left: (viewport.width - width) / 2,
      top: viewport.top + (availableHeight - height) / 2,
      width,
      maxHeight: availableHeight,
    };
  if (viewport.bottom - anchor.bottom - gap >= height)
    return {
      left: alignedLeft,
      top: anchor.bottom + gap,
      width,
      maxHeight: availableHeight,
    };
  if (anchor.top - viewport.top - gap >= height)
    return {
      left: alignedLeft,
      top: anchor.top - gap - height,
      width,
      maxHeight: availableHeight,
    };
  const top = clamp(
    anchor.top + (anchor.height - height) / 2,
    viewport.top,
    viewport.bottom - height,
  );
  if (anchor.right + gap + width <= viewport.width - margin)
    return { left: anchor.right + gap, top, width, maxHeight: availableHeight };
  if (anchor.left - gap - width >= margin)
    return {
      left: anchor.left - gap - width,
      top,
      width,
      maxHeight: availableHeight,
    };
  const below = viewport.bottom - anchor.bottom - gap,
    above = anchor.top - viewport.top - gap;
  const useBelow = below >= above;
  const maxHeight = Math.max(80, Math.max(below, above));
  return {
    left: alignedLeft,
    top: clamp(useBelow
      ? anchor.bottom + gap
      : Math.max(viewport.top, anchor.top - gap - Math.min(height, maxHeight)), viewport.top, viewport.bottom - maxHeight),
    width,
    maxHeight,
  };
}
