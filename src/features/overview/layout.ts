export type WidgetKind =
  | "total"
  | "new"
  | "processing"
  | "analyzed"
  | "duration"
  | "average"
  | "distribution"
  | "criteria"
  | "trend"
  | "listening"
  | "employees"
  | "departments"
  | "coverage"
  | "critical_missed"
  | "criterion"
  | "quality_delta"
  | "matrix"
  | "speech"
  | "observation";
export type WidgetPeriod = {
  mode: "all" | "current" | "rolling" | "custom";
  days?: number;
  from?: string;
  to?: string;
};
export type OverviewWidget = {
  id: string;
  observation_uuid?: string;
  criterion_key?: string;
  instruction_uuid?: string;
  employee_uuid?: string;
  kind: WidgetKind;
  width: number;
  height: number;
  /** Content grows naturally up to this ceiling; height is the legacy preset. */
  max_height?: number;
  /** An explicitly resized frame, independent of the amount of data. */
  frame_height?: number;
  /** Desktop position: one-based column and vertical offset in CSS pixels. */
  column?: number;
  offset_y?: number;
  composition?:
    | "standard"
    | "leading"
    | "centered"
    | "horizontal"
    | "chart-leading"
    | "inline";
  color: string;
  custom_light?: string;
  custom_dark?: string;
  period: WidgetPeriod;
  chart: boolean;
};
export type OverviewLayout = { version: number; widgets: OverviewWidget[] };
/** Empty count buckets are valid only when the server returned a total of zero. */
export function zeroCountSeries(from: string, to: string) {
  const start = Date.parse(from),
    end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [];
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(start + ((end - start) * index) / 7);
    const label =
      end - start <= 86_400_000
        ? date.toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : date.toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
          });
    return { label, value: 0, display: "0 звонков" };
  });
}
export function colorContrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const values = [1, 3, 5]
      .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export const extraColors = {
  sky: ["Небесный", "#247eab", "#78c4ef"],
  azure: ["Лазурный", "#2374c1", "#7bb5f4"],
  cobalt: ["Кобальтовый", "#3f5dc4", "#92a7f1"],
  sapphire: ["Сапфировый", "#4554a3", "#a0a9e5"],
  lavender: ["Лавандовый", "#8063b8", "#b9a0ed"],
  plum: ["Сливовый", "#8754a4", "#c797e2"],
  orchid: ["Орхидея", "#a04caa", "#d893e3"],
  magenta: ["Пурпурный", "#b1438c", "#e78fc8"],
  rose: ["Роза", "#b74d76", "#ed93b5"],
  raspberry: ["Малиновый", "#bc4065", "#ed83a4"],
  ruby: ["Рубиновый", "#b83d4c", "#ec8593"],
  terracotta: ["Терракотовый", "#b75b3c", "#eaa084"],
  orange: ["Апельсиновый", "#b96420", "#efab72"],
  apricot: ["Абрикосовый", "#ad7330", "#eac28b"],
  gold: ["Золотистый", "#997817", "#dfc969"],
  lemon: ["Лимонный", "#85801a", "#d7d36e"],
  lime: ["Лаймовый", "#6d862e", "#bfd574"],
  moss: ["Мох", "#567b39", "#a5c381"],
  leaf: ["Лиственный", "#387f40", "#88cc91"],
  emerald: ["Изумрудный", "#218453", "#78d3a1"],
  mint: ["Мятный", "#21816e", "#7cd3bc"],
  sea: ["Морская волна", "#22848a", "#79cdd2"],
  turquoise: ["Аквамарин", "#1c8190", "#71cedc"],
  ice: ["Ледяной", "#4b8499", "#a2cddc"],
  steel: ["Стальной", "#597c98", "#a5c1d8"],
  slate: ["Сланцевый", "#6b758e", "#b0bad1"],
  mauve: ["Пыльная сирень", "#8b6f8e", "#cbb0cf"],
  sand: ["Песочный", "#8c784f", "#cfbc96"],
  copper: ["Медный", "#a36c4b", "#d8ad91"],
  graphite: ["Графитовый", "#6e7379", "#b0b8c1"],
} as const;
export const palette = [
  "default",
  "blue",
  "violet",
  "green",
  "teal",
  "amber",
  "coral",
  "pink",
  "cyan",
  "indigo",
  "olive",
  ...Object.keys(extraColors),
  "custom",
] as const;
export const colorNames: Record<string, string> = {
  default: "Исходный",
  blue: "Синий",
  violet: "Фиолетовый",
  green: "Зелёный",
  teal: "Бирюзовый",
  amber: "Янтарный",
  coral: "Коралловый",
  pink: "Розовый",
  cyan: "Голубой",
  indigo: "Индиго",
  olive: "Оливковый",
  custom: "Свой цвет",
  ...Object.fromEntries(
    Object.entries(extraColors).map(([id, [name]]) => [id, name]),
  ),
};
export const compositions = [
  "standard",
  "leading",
  "centered",
  "horizontal",
  "chart-leading",
  "inline",
] as const;
export const compositionNames = {
  standard: "Классическая",
  leading: "Акцент слева",
  centered: "По центру",
  horizontal: "Текст и график рядом",
  "chart-leading": "График слева",
  inline: "Показатель в строку",
};
export function nextComposition(value: OverviewWidget["composition"], available: readonly typeof compositions[number][] = compositions) {
  return available[
    (available.indexOf(value ?? "standard") + 1) % available.length
  ];
}
/** Offer only arrangements that have a distinct rendering in the current frame. */
export function widgetCompositions(kind: WidgetKind, width: number, height: number, visual: boolean, metric: boolean): readonly typeof compositions[number][] {
  if (height < 150) return ["standard"];
  const base: typeof compositions[number][] = ["standard", "leading", "centered"];
  if (width < 440) return base;
  if (kind === "matrix") return [...base, "chart-leading"];
  if (kind === "speech") return [...base, "horizontal", "chart-leading"];
  if (visual) return [...base, "horizontal", "chart-leading", ...(metric ? ["inline" as const] : [])];
  return metric ? [...base, "inline"] : base;
}
export function widgetMaxHeight(w: OverviewWidget): number {
  return w.frame_height ?? w.max_height ?? w.height * 210 + (w.height - 1) * 14;
}
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type WidgetRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type ResizeAlignmentGuide = {
  axis: "x" | "y";
  position: number;
  start: number;
  end: number;
};
/** Shared snap decision and visible target; both must refer to the same sibling edge. */
export function getResizeAlignment(
  rect: WidgetRect,
  neighbors: WidgetRect[],
  edge: ResizeEdge,
  dx: number,
  dy: number,
) {
  const guides: ResizeAlignmentGuide[] = [];
  const nearest = (value: number, axes: Array<keyof WidgetRect>) =>
    neighbors.flatMap(rect => axes.map(axis => ({ rect, value: rect[axis] }))).reduce(
      (best, candidate) =>
        Math.abs(candidate.value - value) <= 32 &&
        (best === undefined ||
          Math.abs(candidate.value - value) < Math.abs(best.value - value))
          ? candidate
          : best,
      undefined as { rect: WidgetRect; value: number } | undefined,
    );
  if (/[ew]/.test(edge)) {
    const boundary = edge.includes("w") ? rect.left : rect.right;
    const target = nearest(boundary + dx, ["left", "right"]);
    if (target) {
      dx = target.value - boundary;
      guides.push({
        axis: "x",
        position: target.value,
        start: Math.min(rect.top, target.rect.top) - 8,
        end: Math.max(rect.bottom, target.rect.bottom) + 8,
      });
    }
  }
  if (/[ns]/.test(edge)) {
    const boundary = edge.includes("n") ? rect.top : rect.bottom;
    const target = nearest(boundary + dy, ["top", "bottom"]);
    if (target) {
      dy = target.value - boundary;
      guides.push({
        axis: "y",
        position: target.value,
        start: Math.min(rect.left, target.rect.left) - 8,
        end: Math.max(rect.right, target.rect.right) + 8,
      });
    }
  }
  return { dx, dy, guides };
}
/** Align the moving boundary with a nearby sibling (within 32px). */
export function alignResizeDelta(
  rect: WidgetRect,
  neighbors: WidgetRect[],
  edge: ResizeEdge,
  dx: number,
  dy: number,
) {
  const delta = getResizeAlignment(rect, neighbors, edge, dx, dy);
  return { dx: delta.dx, dy: delta.dy };
}
/** Sides change one axis; corners change both. Width snaps to the page grid. */
export function resizeWidget(
  w: OverviewWidget,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  columnStep: number,
) {
  const minWidth = 2;
  const width = /[ew]/.test(edge)
    ? Math.max(
        minWidth,
        Math.min(
          12,
          Math.round((w.width + (edge.includes("w") ? -dx : dx) / columnStep) * 10000) / 10000,
        ),
      )
    : w.width;
  const max_height = /[ns]/.test(edge)
    ? Math.max(
        88,
        Math.min(
          1200,
          Math.round(widgetMaxHeight(w) + (edge.includes("n") ? -dy : dy)),
        ),
      )
    : Math.round(widgetMaxHeight(w));
  return { width, max_height };
}
export const widgetInfo: Record<
  WidgetKind,
  { title: string; group: string; color: string; wide?: boolean; description?: string }
> = {
  coverage: { title: "Охват анализом", group: "Звонки", color: "green", description: "Кольцо и количество звонков" },
  critical_missed: { title: "Критичные пропуски", group: "Качество звонков", color: "coral", description: "Счётчик пропущенных критичных критериев" },
  criterion: { title: "Выполнение критерия", group: "Качество звонков", color: "blue", wide: true, description: "Процент, распределение и динамика · выбор критерия" },
  quality_delta: { title: "Изменение качества", group: "Качество звонков", color: "teal", description: "Изменение в баллах и график оценки" },
  matrix: { title: "Сотрудники × критерии", group: "Компания и отделы", color: "indigo", wide: true, description: "Тепловая матрица · выбор инструкции" },
  speech: { title: "Речь сотрудника", group: "Речь", color: "violet", wide: true, description: "Доля речи, темп, паузы и монолог" },
  observation: { title: "Наблюдение", group: "Наблюдения", color: "teal" },
  total: { title: "Всего звонков", group: "Звонки", color: "blue" },
  new: { title: "Новые звонки", group: "Звонки", color: "violet" },
  processing: {
    title: "Звонки в обработке",
    group: "Звонки",
    color: "default",
  },
  analyzed: { title: "С анализом", group: "Звонки", color: "green" },
  duration: { title: "Средняя длительность", group: "Звонки", color: "teal" },
  average: {
    title: "Средняя оценка",
    group: "Качество звонков",
    color: "default",
  },
  distribution: {
    title: "Распределение оценок",
    group: "Качество звонков",
    color: "blue",
    wide: true,
  },
  criteria: {
    title: "Слабые критерии",
    group: "Качество звонков",
    color: "coral",
    wide: true,
  },
  trend: {
    title: "Динамика качества",
    group: "Качество звонков",
    color: "teal",
    wide: true,
  },
  listening: {
    title: "Стоит послушать",
    group: "Качество звонков",
    color: "violet",
    wide: true,
  },
  employees: {
    title: "Сотрудники",
    group: "Компания и отделы",
    color: "indigo",
    wide: true,
  },
  departments: {
    title: "Отделы",
    group: "Компания и отделы",
    color: "cyan",
    wide: true,
  },
};
export function newWidget(kind: WidgetKind): OverviewWidget {
  const frames: Partial<Record<WidgetKind, number>> = { coverage: 240, critical_missed: 190, criterion: 320, quality_delta: 260, matrix: 360, speech: 380 };
  return {
    id: crypto.randomUUID(),
    kind,
    width: widgetInfo[kind].wide ? 6 : 4,
    height: widgetInfo[kind].wide ? 2 : 1,
    color: widgetInfo[kind].color,
    chart: true,
    ...(frames[kind] ? { frame_height: frames[kind], max_height: frames[kind] } : {}),
    period:
      kind === "processing"
        ? { mode: "current" }
        : kind === "new"
          ? { mode: "rolling", days: 1 }
          : frames[kind] || widgetInfo[kind].wide || kind === "observation"
            ? { mode: "rolling", days: 30 }
            : { mode: "all" },
  };
}
export function defaultWidgets(): OverviewWidget[] {
  return (
    [
      "total",
      "new",
      "processing",
      "analyzed",
      "duration",
      "average",
      "distribution",
      "criteria",
      "trend",
      "listening",
    ] as WidgetKind[]
  ).map((kind) => ({ ...newWidget(kind), id: `default-${kind}` }));
}
export function periodLabel(p: WidgetPeriod): string {
  return p.mode === "all"
    ? "За всё время"
    : p.mode === "current"
      ? "Сейчас"
      : p.mode === "custom"
        ? `${p.from} — ${p.to}`
        : `Последние ${p.days} дн.`;
}
export function periodFilters(
  p: WidgetPeriod,
  now = new Date(),
): { from?: string; to?: string } {
  if (p.mode === "all" || p.mode === "current") return {};
  if (p.mode === "custom") {
    const end = new Date(`${p.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return {
      from: new Date(`${p.from}T00:00:00`).toISOString(),
      to: end.toISOString(),
    };
  }
  return {
    from: new Date(now.getTime() - (p.days ?? 30) * 86400000).toISOString(),
    to: now.toISOString(),
  };
}
/** Ordered first-fit packing: no overlaps and no visual order reversal. */
export function packWidgets(
  widgets: Array<{ width: number; height: number }>,
): Array<{ column: number; row: number }> {
  const occupied = new Set<string>();
  let cursor = 0;
  return widgets.map((w) => {
    for (let slot = cursor; ; slot++) {
      const x = slot % 12,
        y = Math.floor(slot / 12);
      if (x + w.width > 12) continue;
      let free = true;
      for (let dy = 0; dy < w.height && free; dy++)
        for (let dx = 0; dx < w.width; dx++)
          if (occupied.has(`${x + dx}:${y + dy}`)) {
            free = false;
            break;
          }
      if (!free) continue;
      for (let dy = 0; dy < w.height; dy++)
        for (let dx = 0; dx < w.width; dx++)
          occupied.add(`${x + dx}:${y + dy}`);
      cursor = slot + w.width;
      return { column: x + 1, row: y + 1 };
    }
  });
}
