import { SelectControl } from "../../shared/ui/primitives";
import type { Observation } from "../observations/types";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  Phone,
  Plus,
  RefreshCw,
  Radar,
  Settings2,
  Undo2,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { api } from "../../api";
import { useOverviewLayout } from "./use-overview-layout";
import { WidgetAlignmentGuides } from "./WidgetAlignmentGuides";
import { WidgetRows } from "./WidgetRows";
import { AdvancedWidget, AdvancedWidgetPreview } from "./AdvancedWidgets";
import { WidgetSourceSettings } from "./WidgetSourceSettings";
import { WidgetCompositionButton } from "./WidgetCompositionButton";
import { analyticsWidgetKinds, analyticsWidgetAvailable, loadAnalyticsWidgets, type AnalyticsWidgetData } from "./analytics-widget-data";
import type {
  AnalyticsOverviewResponse,
  AnalyticsSummary,
  AnalyticsEmployeesResponse,
  AnalyticsDepartmentsResponse,
  AnalyticsCapabilities,
  AppPage,
} from "../../types";
import { cssClass } from "../../shared/lib/css-styles";
import { useWorkspaceCompanyId } from "../../shared/lib/workspace-company";
import { formatDuration } from "../../shared/lib/formatters";
import { PageSkeleton } from "../../shared/ui/page-loading";
import { TrendChart } from "../../shared/ui/analytics-ui";
import { HoverHint } from "../../shared/ui/hover-hint";
import { WorthListening, type OpenCallAt } from "../analytics/AnalyticsPage";
import {
  MiniSparkline,
  MetricCard,
  ScoreKpiCard,
  buildOverviewChartSeries,
  overviewScore,
} from "./overview-components";
import {
  colorNames,
  colorContrast,
  zeroCountSeries,
  defaultWidgets,
  newWidget,
  palette,
  extraColors,
  resizeWidget,
  alignResizeDelta,
  widgetMaxHeight,
  periodFilters,
  periodLabel,
  widgetInfo,
  type OverviewWidget,
  type WidgetKind,
} from "./layout";
import "./overview-widgets.css";
import { placeWidgetSettings } from "./widget-presentation";
import { placeWidgets, arrangeWidgets, movedPosition, type PlacedWidget, type WidgetGeometryPatch } from "./widget-geometry";
import {
  edgeNames,
  resizeEdges,
  useWidgetInteraction,
  useWidgetPacking,
} from "./widget-interaction";

type Props = {
  callsVersion: string;
  onNavigate?: (page: AppPage) => void;
  onOpenCall?: OpenCallAt;
};
type Data = {
  period?: { from?: string; to?: string };
  observations?: Observation[];
  overview: AnalyticsOverviewResponse | null;
  summary: AnalyticsSummary | null;
  employees?: AnalyticsEmployeesResponse;
  departments?: AnalyticsDepartmentsResponse;
  error?: string;
  advanced?: Record<string, AnalyticsWidgetData>;
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось получить данные";
const broadKinds = new Set<WidgetKind>([
  "distribution",
  "criteria",
  "trend",
  "listening",
  "employees",
  "departments",
  "critical_missed", "criterion", "quality_delta", "matrix", "speech",
]);
const metricIcons = {
  total: BarChart3,
  new: Phone,
  processing: Activity,
  analyzed: CheckCircle2,
  duration: Clock3,
  observation: Radar,
};
function paletteStyle(color: string) {
  const entry = extraColors[color as keyof typeof extraColors];
  return entry
    ? { "--ow-palette-light": entry[1], "--ow-palette-dark": entry[2] }
    : {};
}

function scrollWidgetIntoView(board: HTMLDivElement | null, id: string) {
  window.requestAnimationFrame(() =>
    board?.querySelector(`[data-widget-id="${id}"]`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    }),
  );
}

function scrollDuringDrag(board: HTMLElement | null, y: number) {
  // Some pages own their scrolling surface; others use the document.
  for (let node = board?.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      !/(auto|scroll)/.test(style.overflowY) ||
      node.scrollHeight <= node.clientHeight
    )
      continue;
    const rect = node.getBoundingClientRect();
    const top = Math.max(0, rect.top),
      bottom = Math.min(window.innerHeight, rect.bottom);
    if (y < top + 65) node.scrollBy(0, -18);
    else if (y > bottom - 65) node.scrollBy(0, 18);
    return;
  }
  if (y < 65) window.scrollBy(0, -18);
  else if (y > window.innerHeight - 65) window.scrollBy(0, 18);
}

export function CustomOverview(props: Props) {
  const company = useWorkspaceCompanyId();
  return (
    <WorkspaceOverview
      key={company ?? "personal"}
      {...props}
      workspace={company || "personal"}
    />
  );
}


function WorkspaceOverview({
  workspace,
  callsVersion,
  onNavigate,
  onOpenCall,
}: Props & { workspace: string }) {
  const layout = useOverviewLayout(workspace);
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [setting, setSetting] = useState<string>();
  const [activeWidget, setActiveWidget] = useState<string>();
  const [geometryHistory, setGeometryHistory] = useState<OverviewWidget[][]>([]);
  const [data, setData] = useState<Record<string, Data>>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [team, setTeam] = useState(false);
  const [management, setManagement] = useState(false);
  const [capabilities, setCapabilities] = useState<AnalyticsCapabilities>();
  const [catalogObservations, setCatalogObservations] = useState<Observation[]>(
    [],
  );
  const board = useRef<HTMLDivElement>(null);
  const widgets = layout.value?.widgets ?? [];
  const interaction = useWidgetInteraction({
    board,
    enabled: editing && !catalog && !layout.blocked,
    widgets,
    getGeometry: () => positions,
    selected: activeWidget,
    onSelect: (id) => {
      setActiveWidget(id);
      if (id !== setting) setSetting(undefined);
    },
    onMove: move,
    onArrange: arrange,
    onScroll: (y) => scrollDuringDrag(board.current, y),
  });
  const visibleWidgets = widgets.map((w) => {
    const preview = interaction.preview;
    if (!preview) return w;
    const { positions: _positions, canvasHeight: _canvasHeight, id: _id, ...patch } = preview;
    return { ...w, ...preview.positions?.[w.id], ...(preview.id === w.id ? patch : {}) };
  });
  const { positions, height: boardHeight } = useWidgetPacking(
    board,
    visibleWidgets,
    !catalog && !!layout.value,
    interaction.preview?.id,
  );
  // Presentation and ordering never refetch the analytical data.
  const querySignature = JSON.stringify(
    widgets.map((w) => JSON.stringify([w.kind, w.period, ...(analyticsWidgetKinds.has(w.kind) ? [w.id, w.criterion_key, w.instruction_uuid, w.employee_uuid] : [])])).sort(),
  );
  useEffect(() => {
    let stop = false;
    api
      .getAnalyticsCapabilities(
        workspace === "personal"
          ? { scope: "personal" }
          : { company_uuid: workspace },
      )
      .then((v) => {
        if (stop) return;
        setCapabilities(v);
        setTeam(
          v.scope === "personal"
            ? v.personal_progress_enabled
            : v.team_analytics_enabled || v.role === "employee",
        );
        setManagement(
          v.scope !== "personal" &&
            v.role !== "employee" &&
            v.team_analytics_enabled,
        );
      })
      .catch(() => {
        if (!stop) {
          setTeam(false);
          setManagement(false);
        }
      });
    return () => {
      stop = true;
    };
  }, [workspace]);
  useEffect(() => {
    if (!layout.value) return;
    let cancelled = false;
    setLoading(true);
    const now = new Date();
    const scope =
      workspace === "personal"
        ? { scope: "personal" as const }
        : { company_uuid: workspace };
    const groups = new Map<string, OverviewWidget[]>();
    for (const w of widgets) {
      const key = JSON.stringify(w.period);
      groups.set(key, [...(groups.get(key) ?? []), w]);
    }
    const queue = [...groups.entries()];
    const next: Record<string, Data> = {};
    async function worker() {
      while (queue.length && !cancelled) {
        const [key, group] = queue.shift()!;
        const filters = { ...scope, ...periodFilters(group[0].period, now) };
        const summaryRequest = team && group.some(w => ["average", "trend", "listening", "critical_missed", "quality_delta"].includes(w.kind))
          ? api.getAnalyticsSummary(filters) : undefined;
        try {
          const [overview, summary, employees, departments, observations, advanced] =
            await Promise.all([
              api.getAnalyticsOverview(filters),
              summaryRequest?.catch(() => null) ?? null,
              management && group.some((w) => w.kind === "employees")
                ? api.getAnalyticsEmployees(filters)
                : undefined,
              management && group.some((w) => w.kind === "departments")
                ? api.getAnalyticsDepartments(filters)
                : undefined,
              group.some((w) => w.kind === "observation")
                ? api.getObservations(filters).then((v) => v.items)
                : undefined,
              loadAnalyticsWidgets(group, filters, capabilities, api, summaryRequest),
            ]);
          next[key] = {
            period: { from: filters.from, to: filters.to },
            overview,
            summary,
            employees,
            departments,
            observations,
            advanced,
          };
        } catch (e) {
          next[key] = { overview: null, summary: null, error: errorText(e) };
        }
      }
    }
    void Promise.all([worker(), worker()]).then(() => {
      if (!cancelled) {
        setData(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    workspace,
    callsVersion,
    querySignature,
    refresh,
    team,
    management,
    capabilities,
    Boolean(layout.value),
  ]);
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);
  useEffect(() => {
    if (!widgets.some((w) => w.kind === "processing")) return;
    let pending = false;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || pending) return;
      pending = true;
      try {
        const overview = await api.getAnalyticsOverview(
          workspace === "personal"
            ? { scope: "personal" }
            : { company_uuid: workspace },
        );
        if (!stopped)
          setData((current) => ({
            ...current,
            [JSON.stringify({ mode: "current" })]: { overview, summary: null },
          }));
      } catch {
      } finally {
        pending = false;
      }
    }, 15000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [workspace, widgets.some((w) => w.kind === "processing")]);
  function update(id: string, patch: Partial<OverviewWidget>) {
    layout.change(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }
  function arrange(id: string, patch: WidgetGeometryPatch, snapshot: PlacedWidget[] = positions) {
    const index = widgets.findIndex(w => w.id === id);
    if (index < 0) return;
    const canvasHeight = board.current?.getBoundingClientRect().height ?? boardHeight + (editing ? 160 : 0);
    const top = window.innerWidth <= 620 ? snapshot[index].offset_y : patch.offset_y ?? snapshot[index].offset_y;
    if (patch.frame_height !== undefined) {
      patch = { ...patch, frame_height: Math.max(88, Math.min(patch.frame_height, Math.floor(canvasHeight - top))) };
      patch.max_height = patch.frame_height;
    } else if (patch.offset_y !== undefined) {
      patch = { ...patch, offset_y: Math.min(patch.offset_y, Math.max(0, Math.floor(canvasHeight - snapshot[index].height))) };
    }
    setGeometryHistory(history => [...history.slice(-9), widgets]);
    if (window.innerWidth <= 620) {
      update(id, patch);
      return;
    }
    const next = arrangeWidgets(widgets, snapshot, index, patch, canvasHeight);
    // The preview already shows the final geometry. Do not measure it mid-FLIP.
    if (snapshot !== positions) layout.change(next);
    else animateChange(() => layout.change(next));
  }
  function move(id: string, before: string) {
    if (id === before) return;
    const targetIndex = widgets.findIndex((w) => w.id === before);
    const sourceIndex = widgets.findIndex((w) => w.id === id);
    if (sourceIndex < 0 || targetIndex < 0) return;
    setGeometryHistory(history => [...history.slice(-9), widgets]);
    // Mobile shows a compact list. Swapping its two desktop slots preserves widths.
    const desktop = placeWidgets(widgets, positions.map(p => p.height));
    const next = widgets.map((w, i) => ({ ...w,
      column: desktop[i === sourceIndex ? targetIndex : i === targetIndex ? sourceIndex : i].column,
      offset_y: desktop[i === sourceIndex ? targetIndex : i === targetIndex ? sourceIndex : i].offset_y,
    }));
    [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
    animateChange(() => layout.change(next));
  }
  function undoGeometry() {
    const previous = geometryHistory.at(-1);
    if (!previous) return;
    setGeometryHistory(history => history.slice(0, -1));
    layout.change(widgets.map(w => {
      const old = previous.find(item => item.id === w.id);
      if (!old) return w;
      const { width: _width, max_height: _cap, frame_height: _frame, column: _column, offset_y: _offset, ...rest } = w;
      return { ...rest, width: old.width,
        ...(old.max_height !== undefined ? { max_height: old.max_height } : {}),
        ...(old.frame_height !== undefined ? { frame_height: old.frame_height } : {}),
        ...(old.column !== undefined ? { column: old.column, offset_y: old.offset_y } : {}),
      };
    }));
  }
  function animateChange(change: () => void) {
    const before = new Map(
      [
        ...(board.current?.querySelectorAll<HTMLElement>("[data-widget-id]") ??
          []),
      ].map((el) => [el.dataset.widgetId!, el.getBoundingClientRect()]),
    );
    flushSync(change);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const el of board.current?.querySelectorAll<HTMLElement>(
      "[data-widget-id]",
    ) ?? []) {
      const old = before.get(el.dataset.widgetId!);
      if (!old) continue;
      const next = el.getBoundingClientRect();
      if (old.x !== next.x || old.y !== next.y)
        el.animate(
          [
            { transform: `translate(${old.x - next.x}px,${old.y - next.y}px)` },
            { transform: "translate(0,0)" },
          ],
          { duration: 220, easing: "ease-out" },
        );
    }
  }
  useEffect(() => {
    if (!catalog) return;
    let stopped = false;
    api
      .getObservations(
        workspace === "personal"
          ? { scope: "personal" }
          : { company_uuid: workspace },
      )
      .then((v) => {
        if (!stopped) setCatalogObservations(v.items);
      })
      .catch(() => {
        if (!stopped) setCatalogObservations([]);
      });
    return () => {
      stopped = true;
    };
  }, [catalog, workspace]);
  function addObservation(item: Observation) {
    const w = { ...newWidget("observation"), observation_uuid: item.id };
    layout.change([...widgets, w]);
    setActiveWidget(w.id);
    setCatalog(false);
    setEditing(true);
    window.requestAnimationFrame(() =>
      scrollWidgetIntoView(board.current, w.id),
    );
  }
  function add(kind: WidgetKind) {
    const w = newWidget(kind);
    layout.change([...widgets, w]);
    setActiveWidget(w.id);
    setCatalog(false);
    setEditing(true);
    window.requestAnimationFrame(() =>
      scrollWidgetIntoView(board.current, w.id),
    );
  }
  const selected = widgets.find((w) => w.id === setting);
  if (!layout.value)
    return (
      <section className="app-page">
        {layout.error ? (
          <div className="form-error" role="alert">
            {layout.error}
            <button
              className="ghost-button small"
              onClick={() => void layout.reload()}
            >
              Повторить
            </button>
          </div>
        ) : (
          <PageSkeleton page="overview" />
        )}
      </section>
    );
  if (catalog)
    return (
      <section className="app-page overview-catalog">
        <header>
          <button className="ghost-button" onClick={() => setCatalog(false)}>
            <ArrowLeft size={18} />К обзору
          </button>
          <h1>Добавить виджеты</h1>
          <p>
            Выберите блок. Затем его можно переместить и настроить на обзоре.
          </p>
        </header>
        {[
          "Звонки",
          "Качество звонков",
          ...(team ? ["Речь"] : []),
          ...(management ? ["Компания и отделы"] : []),
        ].map((group) => (
          <section key={group}>
            <h2>{group}</h2>
            <div className="overview-catalog-row">
              {(Object.keys(widgetInfo) as WidgetKind[])
                .filter(
                  (k) =>
                    widgetInfo[k].group === group &&
                    (!analyticsWidgetKinds.has(k) || analyticsWidgetAvailable(k, capabilities)) &&
                    (team || !["criteria", "trend", "listening"].includes(k)),
                )
                .map((kind) => (
                  <button
                    className={`overview-catalog-card ow-color-${widgetInfo[kind].color}`}
                    key={kind}
                    onClick={() => add(kind)}
                  >
                    <WidgetPreview kind={kind} />
                    <strong>{widgetInfo[kind].title}</strong>
                    <small>
                      {widgetInfo[kind].description ?? (widgetInfo[kind].wide
                        ? "Широкий блок · ½ страницы"
                        : "Карточка · ⅓ страницы")}
                    </small>
                    <span>
                      <Plus size={16} />
                      Добавить
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
        {catalogObservations.length > 0 && (
          <section>
            <h2>Наблюдения</h2>
            <div className="overview-catalog-row">
              {catalogObservations.map((item) => (
                <button
                  className="overview-catalog-card ow-color-teal"
                  key={item.id}
                  onClick={() => addObservation(item)}
                >
                  <span className="overview-catalog-preview">
                    <Radar size={36} />
                  </span>
                  <strong>{item.title}</strong>
                  <small>Случаи и динамика · собственный период</small>
                  <span>
                    <Plus size={16} />
                    Добавить
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </section>
    );
  return (
    <section className="app-page dashboard-page custom-overview">
      <header className="overview-toolbar">
        <div>
          <h1>Обзор</h1>
          <span className="overview-save-status" role="status">
            {layout.error
              ? "Изменения пока не сохранены · редактирование доступно"
              : layout.saving
                ? "Сохраняется…"
                : editing
                  ? "Изменения сохраняются автоматически"
                  : ""}
          </span>
        </div>
        <div>
          <button
            className="icon-button"
            disabled={loading}
            aria-label="Обновить обзор"
            onClick={() => setRefresh((n) => n + 1)}
          >
            <RefreshCw size={18} />
          </button>
          {editing && (
            <>
              {geometryHistory.length > 0 && <button className="ghost-button small"
                onClick={undoGeometry} disabled={layout.blocked} aria-label="Отменить изменение размера или положения">
                <Undo2 size={16}/>Отменить
              </button>}
              <button
                className="ghost-button small"
                onClick={() => setCatalog(true)}
                disabled={layout.blocked}
              >
                <Plus size={16} />
                Добавить виджет
              </button>
              <button
                className="ghost-button small"
                onClick={() => {
                  if (
                    window.confirm(
                      "Восстановить исходное расположение виджетов в этом пространстве?",
                    )
                  )
                    layout.change(defaultWidgets());
                }}
                disabled={layout.blocked}
              >
                Восстановить
              </button>
            </>
          )}
          <button
            className={editing ? "primary-button small" : "ghost-button small"}
            onClick={() => {
              setEditing(!editing);
              setSetting(undefined);
              setActiveWidget(undefined);
            }}
          >
            {editing ? <Check size={16} /> : <Settings2 size={16} />}{" "}
            {editing ? "Готово" : "Настроить обзор"}
          </button>
        </div>
      </header>
      {layout.error && (
        <div className="overview-save-recovery glass-panel" role="alert">
          <div>
            <strong>Не удалось сохранить обзор</strong>
            <p>{layout.error}</p>
            {layout.conflict && <small>«Сохранить мою раскладку» заменит расположение и настройки виджетов, сохранённые в другом окне. «Загрузить сохранённую» отменит ваши несохранённые изменения.</small>}
          </div>
          <div className="overview-save-recovery-actions">
            <button className="ghost-button small" disabled={layout.saving || layout.blocked} onClick={() => void layout.retry(layout.conflict)}>
              {layout.conflict ? "Сохранить мою раскладку" : "Повторить сохранение"}
            </button>
            {layout.conflict && <button className="ghost-button small" disabled={layout.saving || layout.blocked} onClick={() => void layout.reload()}>Загрузить сохранённую</button>}
          </div>
        </div>
      )}
      {widgets.length === 0 && (
        <div className="glass-panel overview-empty">
          <h2>Добавьте нужные показатели</h2>
          <button className="primary-button" onClick={() => setCatalog(true)}>
            <Plus size={16} />
            Добавить виджет
          </button>
        </div>
      )}
      <div
        className={`overview-widget-grid${editing ? " is-editing" : ""} ${cssClass({ height: `${Math.max(boardHeight + (editing ? 160 : 0), interaction.preview?.canvasHeight ?? 0)}px` })}`}
        ref={board}
      >
        {visibleWidgets.map((w, index) => {
          const position = positions[index];
          const custom =
            w.color === "custom"
              ? {
                  "--ow-custom-light": w.custom_light,
                  "--ow-custom-dark": w.custom_dark,
                }
              : {};
          return (
            <article
              key={w.id}
              data-widget-id={w.id}
              data-kind={w.kind}
              data-density={
                widgetMaxHeight(w) < 115
                  ? "minimal"
                  : widgetMaxHeight(w) < 150
                    ? "brief"
                    : widgetMaxHeight(w) < 190
                      ? "compact"
                      : "full"
              }
              aria-label={widgetInfo[w.kind].title}
              tabIndex={editing ? 0 : undefined}
              aria-describedby={
                editing ? "overview-interaction-help" : undefined
              }
              onKeyDown={(e) => {
                if (!editing || e.target !== e.currentTarget || layout.blocked)
                  return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveWidget(w.id);
                  return;
                }
                if (
                  activeWidget === w.id &&
                  e.altKey &&
                  ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  if (window.innerWidth <= 620) {
                    const other = widgets[index + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1)];
                    if (other) move(w.id, other.id);
                  } else arrange(w.id, movedPosition(position, w.width,
                    e.key === "ArrowLeft" ? -((board.current!.clientWidth + 14) / 12) : e.key === "ArrowRight" ? (board.current!.clientWidth + 14) / 12 : 0,
                    e.key === "ArrowUp" ? -16 : e.key === "ArrowDown" ? 16 : 0,
                    (board.current!.clientWidth + 14) / 12));
                }
              }}
              data-frame={w.frame_height ? "sized" : undefined}
              className={`overview-widget ow-composition-${w.composition ?? "standard"} ow-color-${w.color}${extraColors[w.color as keyof typeof extraColors] ? " ow-color-extended" : ""}${editing && activeWidget === w.id ? " is-selected" : ""}${interaction.drag === w.id ? " is-dragging" : ""}${interaction.resizing === w.id ? " is-resizing" : ""} ${cssClass({ left: `calc(${(position.column - 1) * 100 / 12}% + ${(position.column - 1) * 14 / 12}px)`, top: `${position.offset_y}px`, width: `calc(${position.width * 100 / 12}% + ${(position.width / 12 - 1) * 14}px)`, height: w.frame_height ? `${w.frame_height}px` : "auto", "--ow-mobile-order": `${Math.round(position.offset_y)}`, "--ow-max-height": `${widgetMaxHeight(w)}px`, ...paletteStyle(w.color), ...custom })}`}
            >
              {editing && activeWidget === w.id && (
                <div className="overview-widget-controls">
                  <WidgetCompositionButton widget={w} disabled={layout.blocked}
                    onChange={composition => update(w.id, { composition })} />
                  <HoverHint
                    label="Настройки виджета"
                    detail={analyticsWidgetKinds.has(w.kind) ? "Источник, палитра и период" : "Палитра и период"}
                    focusable={false}
                  >
                    <button
                      className="icon-button"
                      aria-label={`Настроить: ${widgetInfo[w.kind].title}`}
                      aria-expanded={setting === w.id}
                      onClick={() =>
                        setSetting(setting === w.id ? undefined : w.id)
                      }
                      disabled={layout.blocked}
                    >
                      <Settings2 size={16} />
                    </button>
                  </HoverHint>
                  <HoverHint
                    label="Убрать с обзора"
                    detail="Исходные данные сохранятся"
                    focusable={false}
                  >
                    <button
                      className="icon-button"
                      aria-label={`Убрать: ${widgetInfo[w.kind].title}`}
                      disabled={layout.blocked}
                      onClick={() => {
                        setSetting(undefined);
                        layout.change(
                          widgets.filter((item) => item.id !== w.id),
                        );
                      }}
                    >
                      <X size={16} />
                    </button>
                  </HoverHint>
                </div>
              )}
              <div
                className="overview-widget-scroll"
                tabIndex={0}
                aria-label={`Содержимое: ${widgetInfo[w.kind].title}`}
              >
                <span className="overview-widget-period">
                  {periodLabel(w.period)}
                </span>
                <WidgetContent
                  widget={w}
                  editing={editing}
                  data={data[JSON.stringify(w.period)]}
                  loading={loading}
                  team={team}
                  management={management}
                  onConfigure={() => { setEditing(true); setActiveWidget(w.id); setSetting(w.id); }}
                  onOpenCall={onOpenCall}
                />
              </div>
              {editing &&
                activeWidget === w.id &&
                resizeEdges.map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    data-resize-edge={edge}
                    className={`overview-resize-handle resize-${edge}`}
                    aria-label={`${edgeNames[edge]}: ${widgetInfo[w.kind].title}`}
                    tabIndex={edge === "se" ? 0 : -1}
                    disabled={layout.blocked}
                    onKeyDown={(e) => {
                      if (
                        ![
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(e.key)
                      )
                        return;
                      e.preventDefault();
                      e.stopPropagation();
                      const columnStep = ((board.current?.clientWidth ?? 1186) + 14) / 12;
                      let dx = e.key === "ArrowLeft" ? -columnStep : e.key === "ArrowRight" ? columnStep : 0;
                      let dy = e.key === "ArrowUp" ? -16 : e.key === "ArrowDown" ? 16 : 0;
                      const card = e.currentTarget.closest<HTMLElement>("[data-widget-id]");
                      if ((e.ctrlKey || e.metaKey) && card && board.current) {
                        ({ dx, dy } = alignResizeDelta(card.getBoundingClientRect(), Array.from(board.current.querySelectorAll<HTMLElement>("[data-widget-id]")).filter(el => el !== card).map(el => el.getBoundingClientRect()), "se", dx, dy));
                      }
                      const size = resizeWidget(
                          { ...w, frame_height: card?.getBoundingClientRect().height ?? widgetMaxHeight(w) },
                          "se",
                          dx,
                          dy,
                          columnStep,
                        );
                      if (window.innerWidth <= 620) size.width = w.width;
                      else size.width = Math.min(size.width, 13 - position.column);
                      arrange(w.id, { ...size, frame_height: size.max_height });
                    }}
                  />
                ))}
              {interaction.resizing === w.id && (
                <span className="overview-resize-readout" role="status">
                  {Math.round(position.width * ((board.current?.clientWidth ?? 1186) + 14) / 12 - 14)} × {widgetMaxHeight(w)} px
                </span>
              )}
            </article>
          );
        })}
      </div>
      {editing && (
        <WidgetAlignmentGuides guides={interaction.guides}/>
      )}
      {editing && (
        <p id="overview-interaction-help" className="overview-interaction-help">
          Нажмите на карточку, чтобы выбрать её; на телефоне — удерживайте.
          Выбранную карточку можно перетащить или изменить за грань и угол.
          Магниты помогают выровнять края и отступы; Ctrl (⌘ на Mac) усиливает привязку.
          Клавиатура: Enter — выбрать, Alt + стрелки — положение, стрелки на
          нижнем правом углу — размер.
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {interaction.announcement}
      </span>
      {selected && (
        <WidgetSettings
          key={selected.id}
          widget={selected}
          workspace={workspace}
          capabilities={capabilities}
          anchor={board.current?.querySelector<HTMLElement>(
            `[data-widget-id="${selected.id}"]`,
          )}
          onChange={(patch) => update(selected.id, patch)}
          onClose={() => setSetting(undefined)}
        />
      )}
    </section>
  );
}

function WidgetContent({
  widget: w,
  editing,
  data,
  loading,
  team,
  management,
  onOpenCall,
  onConfigure,
}: {
  widget: OverviewWidget;
  editing: boolean;
  data?: Data;
  loading: boolean;
  team: boolean;
  management: boolean;
  onOpenCall?: OpenCallAt;
  onConfigure: () => void;
}) {
  if (analyticsWidgetKinds.has(w.kind)) return <AdvancedWidget widget={w} overview={data?.overview ?? null}
    data={data?.advanced?.[w.id]} error={data?.error} loading={loading && !data} onConfigure={editing ? undefined : onConfigure} />;
  if (data?.error)
    return (
      <div className="overview-widget-body">
        <WidgetHeading>{widgetInfo[w.kind].title}</WidgetHeading>
        <p className="form-error" role="alert">
          {data.error}
        </p>
      </div>
    );
  const overview = data?.overview ?? null;
  const summary = data?.summary ?? null;
  const points = buildOverviewChartSeries(overview);
  const score = overviewScore(overview);
  const chart = (p: typeof points.totalCalls) => (w.chart ? p : undefined);
  const number = (v: number | undefined) =>
    v === undefined ? "—" : v.toLocaleString("ru-RU");
  const MetricIcon =
    metricIcons[w.kind as keyof typeof metricIcons] ?? BarChart3;
  const metric = (
    value: ReactNode,
    p?: typeof points.totalCalls,
    note = "в выбранной области",
  ) => (
    <MetricCard
      title={widgetInfo[w.kind].title}
      icon={<MetricIcon size={18} />}
      value={value}
      points={p}
      note={note}
      live={w.kind === "processing" && (overview?.calls_processing ?? 0) > 0}
      loading={loading && !data}
    />
  );
  if (w.kind === "observation") {
    const item = data?.observations?.find((o) => o.id === w.observation_uuid);
    return (
      <section className="overview-widget-body">
        <WidgetHeading icon={<Radar size={18} />}>{item?.title ?? "Наблюдение"}</WidgetHeading>
        {item ? (
          <>
            <strong className="ow-observation-count">
              {item.kind === "criterion" ? item.stats.average_score == null ? "—" : item.stats.average_score.toLocaleString("ru-RU", {maximumFractionDigits: 1}) : item.stats.matches}
            </strong>
            <p className="kpi-note">
              {item.kind === "criterion" ? `${item.stats.scored ?? 0} звонков · оценка из 100` : `${item.stats.checked} проверено${item.stats.checked ? ` · ${(100 * item.stats.matches / item.stats.checked).toLocaleString("ru-RU", {maximumFractionDigits: 1})}% совпадений` : ""}`}
            </p>
            {w.chart && item.kind === "criterion" && item.stats.score_trend?.length ? <MiniSparkline tone="neutral" points={item.stats.score_trend.map(p => ({label: p.date, value: p.score, display: `${p.score.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из 100 · ${p.calls} звонков`}))}/> : w.chart && item.stats.trend.length > 0 && (
              <MiniSparkline
                tone="neutral"
                points={item.stats.trend.map((p) => ({
                  label: p.date,
                  value: p.matches,
                  display: `${p.matches} случаев`,
                }))}
              />
            )}
          </>
        ) : (
          <WidgetEmpty message={loading ? "Загрузка…" : "Наблюдение удалено или недоступно."} summary={loading ? "Загрузка…" : "Недоступно"}/>
        )}
      </section>
    );
  }
  switch (w.kind) {
    case "total":
      return metric(number(overview?.calls_total), chart(points.totalCalls));
    case "new":
      return metric(
        number(overview?.calls_total),
        chart(
          overview?.calls_total === 0 &&
            points.totalCalls.length === 0 &&
            data?.period?.from &&
            data?.period?.to
            ? zeroCountSeries(data.period.from, data.period.to)
            : points.totalCalls,
        ),
        "загружено за выбранный период",
      );
    case "processing":
      return metric(
        number(overview?.calls_processing),
        undefined,
        (overview?.calls_processing ?? 0) > 0
          ? "звонки обрабатываются"
          : "сейчас ничего не выполняется",
      );
    case "analyzed":
      return metric(
        number(overview?.calls_analyzed),
        chart(points.analyzedCalls),
        "готовый результат анализа",
      );
    case "duration":
      return metric(
        overview?.average_duration_seconds == null
          ? "Нет данных"
          : formatDuration(Math.round(overview.average_duration_seconds)),
        chart(points.duration),
      );
    case "average":
      return (
        <ScoreKpiCard
          fluidGauge
          score={
            score.score === null ? null : (score.score / score.scale) * 100
          }
          summary={w.period.mode === "all" ? null : summary}
          loading={loading && !data}
        />
      );
  }
  let content: ReactNode = null;
  if (loading && !data)
    content = (
      <WidgetEmpty message="Загрузка показателей…" summary="Загрузка…"/>
    );
  else if (!management && (w.kind === "employees" || w.kind === "departments"))
    content = (
      <WidgetEmpty message="Нет доступа к этим показателям в текущем пространстве." summary="Нет доступа"/>
    );
  else if (!team && ["criteria", "trend", "listening"].includes(w.kind))
    content = (
      <WidgetEmpty message="Эта аналитика недоступна в текущем пространстве или тарифе." summary="Аналитика недоступна"/>
    );
  else if (w.kind === "trend")
    content = summary?.trend.length ? (
      <TrendChart
        points={summary.trend}
        markers={summary.markers}
        label="Средний балл"
      />
    ) : (
      <WidgetEmpty message={summary ? "За период нет оценённых звонков." : "Нет данных за выбранный период."} summary={summary ? "Нет оценок" : "Нет данных"}/>
    );
  else if (w.kind === "listening")
    content =
      summary?.worth_listening?.length && onOpenCall ? (
        <WidgetRows widget={w} className="overview-listening">
          {summary.worth_listening.map(item => <WorthListening key={item.call_uuid} items={[item]} onOpenCall={onOpenCall}/>)}
        </WidgetRows>
      ) : (
        <WidgetEmpty message={summary && onOpenCall ? "Слабых звонков и критичных пропусков за период нет." : "Нет доступных звонков за период."} summary={summary && onOpenCall ? "Проблемных звонков нет" : "Нет доступных звонков"}/>
      );
  else if (w.kind === "criteria")
    content = (
      <WidgetRows widget={w} className="analytics-list">
        {overview?.top_weak_criteria?.length ? (
          overview.top_weak_criteria.map((v) => (
            <div className="analytics-list-row" key={v.code}>
              <div>
                <strong>{v.title}</strong>
                <small>
                  {v.missed_count} пропущено · {v.partially_met_count} частично
                </small>
              </div>
              <span>
                {v.average_score == null ? "—" : v.average_score.toFixed(1)}
              </span>
            </div>
          ))
        ) : (
          <WidgetEmpty message="Нет слабых критериев за выбранный период." summary="Слабых критериев нет"/>
        )}
      </WidgetRows>
    );
  else if (w.kind === "distribution") {
    const d = overview?.score_distribution;
    const rows = d
      ? ([
          ["Критично", d.critical],
          ["Слабо", d.weak],
          ["Норма", d.normal],
          ["Хорошо", d.good],
          ["Отлично", d.excellent],
        ] as [string, number][])
      : [];
    const maxCount = Math.max(0, ...rows.map(row => row[1]));
    content = (
      <>
      <WidgetRows widget={w} className="overview-bars">
        {rows.length ? (
          rows.map(([label, count]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{count}</b>
              <i
                className={cssClass({
                  width: `${overview?.calls_analyzed ? (100 * count) / overview.calls_analyzed : 0}%`,
                })}
              />
            </div>
          ))
        ) : (
          <WidgetEmpty message="Нет оценок за выбранный период." summary="Нет оценок"/>
        )}
      </WidgetRows>
      {rows.length > 0 && <div className="overview-distribution-mini">
        {maxCount === 0 ? <WidgetEmpty message="Нет оценок за выбранный период." summary="Нет оценок"/> : rows.map(([label, count]) => <HoverHint key={label} label={`${label}: ${count}`}>
          <span className="overview-distribution-mini-bar">
            <b>{count}</b><i className={cssClass({height: `${maxCount ? count / maxCount * 16 : 0}px`})}/>
          </span>
        </HoverHint>)}
      </div>}
      </>
    );
  } else {
    const rows =
      w.kind === "employees"
        ? data?.employees?.employees.map((v) => ({
            id: v.user_uuid,
            title: v.full_name,
            calls: v.calls,
            score: v.avg_score,
          }))
        : data?.departments?.departments.map((v) => ({
            id: v.department_uuid,
            title: v.name,
            calls: v.calls,
            score: v.avg_score,
          }));
    content = (
      <WidgetRows widget={w} className="analytics-list">
        {rows?.length ? (
          rows.map((v) => (
            <div className="analytics-list-row" key={v.id}>
              <div>
                <strong>{v.title}</strong>
                <small>
                  {v.calls} звонков{v.calls < 5 ? " · малая выборка" : ""}
                </small>
              </div>
              <span>{v.score == null ? "—" : v.score.toFixed(1)}</span>
            </div>
          ))
        ) : (
          <WidgetEmpty message="Нет данных за выбранный период." summary="Нет данных"/>
        )}
      </WidgetRows>
    );
  }
  return (
    <section className="overview-widget-body">
      <WidgetHeading>{widgetInfo[w.kind].title}</WidgetHeading>
      {content}
    </section>
  );
}

function WidgetEmpty({ message, summary }: { message: string; summary: string }) {
  return <p className="analysis-empty ow-empty">
    <span className="ow-empty-detail">{message}</span>
    <span className="ow-empty-summary"><span aria-hidden="true">{summary}</span><span className="sr-only">{message}</span></span>
  </p>;
}

function WidgetHeading({ children, icon = <BarChart3 size={18} /> }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <h3>
      <span>{children}</span>
      <span className="metric-icon">
        {icon}
      </span>
    </h3>
  );
}

function WidgetPreview({ kind }: { kind: WidgetKind }) {
  if (analyticsWidgetKinds.has(kind)) return <AdvancedWidgetPreview kind={kind} />;
  if (["criteria", "employees", "departments", "listening"].includes(kind))
    return (
      <span
        className="overview-catalog-preview preview-table"
        aria-hidden="true"
      >
        {[0, 1, 2].map((row) => (
          <span key={row}>
            <i />
            <i />
            <i />
          </span>
        ))}
      </span>
    );
  if (kind === "distribution")
    return (
      <span
        className="overview-catalog-preview preview-bars"
        aria-hidden="true"
      >
        {[35, 65, 90, 55, 75].map((height, i) => (
          <i key={i} className={cssClass({ height: `${height}%` })} />
        ))}
      </span>
    );
  if (kind === "average")
    return (
      <span
        className="overview-catalog-preview preview-gauge"
        aria-hidden="true"
      >
        <svg viewBox="0 0 160 90">
          <path d="M30 76 A57 57 0 1 1 130 76" />
          <path d="M80 58 L112 30" />
        </svg>
      </span>
    );
  if (kind === "processing")
    return (
      <span
        className="overview-catalog-preview preview-status"
        aria-hidden="true"
      >
        <Activity size={32} />
        <i />
        <i />
        <i />
      </span>
    );
  const Icon = metricIcons[kind as keyof typeof metricIcons] ?? BarChart3;
  return (
    <span className="overview-catalog-preview" aria-hidden="true">
      <Icon size={30} />
      <svg viewBox="0 0 160 45">
        <path d="M0 34 Q20 34 30 20 T60 18 T90 30 T125 10 T160 17" />
      </svg>
    </span>
  );
}

function WidgetSettings({
  widget: w,
  anchor,
  onChange,
  onClose,
  workspace,
  capabilities,
}: {
  widget: OverviewWidget;
  anchor?: HTMLElement | null;
  onChange: (patch: Partial<OverviewWidget>) => void;
  onClose: () => void;
  workspace: string;
  capabilities?: AnalyticsCapabilities;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    left: 16,
    top: 16,
    maxHeight: 500,
    width: 340,
  });
  const [customLight, setLight] = useState(w.custom_light ?? "#3B82F6");
  const [customDark, setDark] = useState(w.custom_dark ?? "#6EA6E6");
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor || !panel.current) return;
      const rect = anchor.getBoundingClientRect();
      const headerBottom =
        document.querySelector(".app-header")?.getBoundingClientRect().bottom ??
        0;
      const navigation = document
        .querySelector(".mobile-bottom-nav")
        ?.getBoundingClientRect();
      const bottomBound =
        navigation && navigation.height > 0
          ? Math.min(window.innerHeight - 12, navigation.top - 10)
          : window.innerHeight - 12;
      const minTop = Math.max(
        12,
        Math.min(headerBottom + 8, bottomBound - 100),
      );
      setPosition(
        placeWidgetSettings(
          rect,
          { width: window.innerWidth, top: minTop, bottom: bottomBound },
          panel.current.scrollHeight,
        ),
      );
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useEffect(() => {
    const dismiss = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") {
          e.stopPropagation();
          if (e.defaultPrevented || document.querySelector('.select-menu-portal')) return;
          onClose();
        }
      } else if (
        e.target instanceof Node &&
        !panel.current?.contains(e.target) &&
        !anchor?.contains(e.target) &&
        !(
          e.target instanceof Element &&
          e.target.closest(".select-menu-portal-root")
        )
      )
        onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={panel}
      className={`overview-widget-settings vt-portal ${cssClass({ left: position.left, top: position.top, maxHeight: position.maxHeight, "--ow-panel-width": `${position.width}px` })}`}
      role="dialog"
      aria-label={`Настройки: ${widgetInfo[w.kind].title}`}
    >
      <header>
        <strong>{widgetInfo[w.kind].title}</strong>
        <button
          className="icon-button"
          aria-label="Закрыть настройки"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      {analyticsWidgetKinds.has(w.kind) && <WidgetSourceSettings widget={w} workspace={workspace} capabilities={capabilities} onChange={onChange} />}
      <fieldset>
        <legend>Цвет графика и иконки</legend>
        <div className="overview-color-list">
          {palette.map((color) => (
            <HoverHint key={color} label={colorNames[color]} focusable={false}>
            <button
              className={`overview-color ow-color-${color}${extraColors[color as keyof typeof extraColors] ? " ow-color-extended" : ""} ${cssClass(paletteStyle(color))}`}
              type="button"
              aria-label={colorNames[color]}
              aria-pressed={w.color === color}
              onClick={() =>
                onChange({
                  color,
                  ...(color === "custom"
                    ? { custom_light: customLight, custom_dark: customDark }
                    : {}),
                })
              }
            >
              {w.color === color ? <Check size={14} /> : null}
            </button>
            </HoverHint>
          ))}
        </div>
        {w.color === "custom" && (
          <>
            <label>
              Светлая тема
              <input
                type="color"
                value={customLight}
                onChange={(e) => {
                  setLight(e.target.value);
                  onChange({ custom_light: e.target.value });
                }}
              />
            </label>
            <label>
              Тёмная тема
              <input
                type="color"
                value={customDark}
                onChange={(e) => {
                  setDark(e.target.value);
                  onChange({ custom_dark: e.target.value });
                }}
              />
            </label>
            {(colorContrast(customLight, "#fffdfb") < 3 ||
              colorContrast(customDark, "#1a1612") < 3) && (
              <div className="overview-color-warning" role="status">
                <p>
                  Выбранный цвет может сливаться с фоном графика. Его можно
                  сохранить или выбрать более заметный вариант.
                </p>
                {colorContrast(customLight, "#fffdfb") < 3 && (
                  <button
                    className="ghost-button small"
                    onClick={() => {
                      setLight("#3B82F6");
                      onChange({ custom_light: "#3B82F6" });
                    }}
                  >
                    Синий для светлой темы
                  </button>
                )}
                {colorContrast(customDark, "#1a1612") < 3 && (
                  <button
                    className="ghost-button small"
                    onClick={() => {
                      setDark("#6EA6E6");
                      onChange({ custom_dark: "#6EA6E6" });
                    }}
                  >
                    Синий для тёмной темы
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </fieldset>
      {w.kind !== "processing" && (
        <fieldset>
          <legend>Период этого виджета</legend>
          <SelectControl
            aria-label="Период виджета"
            value={
              w.period.mode === "rolling"
                ? String(w.period.days)
                : w.period.mode
            }
            onChange={(e) =>
              onChange({
                period:
                  e.target.value === "custom"
                    ? {
                        mode: "custom",
                        from: new Date(Date.now() - 29 * 86400000)
                          .toISOString()
                          .slice(0, 10),
                        to: new Date().toISOString().slice(0, 10),
                      }
                    : e.target.value === "all"
                      ? { mode: "all" }
                      : { mode: "rolling", days: Number(e.target.value) },
              })
            }
          >
            {!broadKinds.has(w.kind) && (
              <option value="all">За всё время</option>
            )}
            <option value="1">Последние 24 часа</option>
            <option value="7">Последние 7 дней</option>
            <option value="30">Последние 30 дней</option>
            <option value="90">Последние 90 дней</option>
            <option value="custom">Указать даты</option>
          </SelectControl>
          {w.period.mode === "custom" && (
            <>
              <label>
                С
                <input
                  type="date"
                  value={w.period.from}
                  max={w.period.to}
                  onChange={(e) => {
                    if (e.target.value && e.target.value <= (w.period.to ?? ""))
                      onChange({
                        period: { ...w.period, from: e.target.value },
                      });
                  }}
                />
              </label>
              <label>
                По
                <input
                  type="date"
                  value={w.period.to}
                  min={w.period.from}
                  onChange={(e) => {
                    if (
                      e.target.value &&
                      e.target.value >= (w.period.from ?? "")
                    )
                      onChange({ period: { ...w.period, to: e.target.value } });
                  }}
                />
              </label>
            </>
          )}
        </fieldset>
      )}
      <button
        className="ghost-button small"
        onClick={() => {
          const original = newWidget(w.kind);
          onChange({
            color: original.color,
            custom_light: undefined,
            custom_dark: undefined,
          });
        }}
      >
        Восстановить цвета
      </button>
    </div>,
    document.body,
  );
}
