import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCheck, ChevronLeft, ChevronRight, CircleCheck, Grid2X2, Mic, SlidersHorizontal } from "lucide-react";
import type { AnalyticsMatrixResponse, AnalyticsOverviewResponse, AnalyticsTrendPoint } from "../../types";
import { cssClass } from "../../shared/lib/css-styles";
import { HoverHint } from "../../shared/ui/hover-hint";
import { MiniSparkline, MetricCard } from "./overview-components";
import { WidgetRows } from "./WidgetRows";
import { comparableDelta, coveragePercent, matrixPageSize, speechMetrics, type AnalyticsWidgetData } from "./analytics-widget-data";
import { widgetInfo, widgetMaxHeight, type OverviewWidget, type WidgetKind } from "./layout";
import "./analytics-widgets.css";

const icons = { coverage: CircleCheck, critical_missed: AlertTriangle, criterion: CheckCheck, quality_delta: ArrowUpRight, matrix: Grid2X2, speech: Mic };
const num = (n: number, digits = 1) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const trendPoints = (points: AnalyticsTrendPoint[]) => points.flatMap(p => p.avg == null ? [] : [{
  label: new Date(p.bucket).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), value: p.avg, display: `${num(p.avg)} из 100`, detail: `${p.n} оценок`,
}]);
function Heading({ kind, title }: { kind: WidgetKind; title?: string }) {
  const Icon = icons[kind as keyof typeof icons];
  return <div className="kpi-head"><span>{title ?? widgetInfo[kind].title}</span><span className="metric-icon"><Icon size={18} /></span></div>;
}
function Shell({ widget: w, title, children }: { widget: OverviewWidget; title?: string; children: ReactNode }) {
  return <section data-tight={w.kind === "matrix" && widgetMaxHeight(w) < 240 ? true : undefined} className={`overview-widget-body ow-analytic ow-analytic-${w.kind}`}><Heading kind={w.kind} title={title} />{children}</section>;
}
function Message({ widget, message, onConfigure, error = false }: { widget: OverviewWidget; message: string; onConfigure?: () => void; error?: boolean }) {
  return <Shell widget={widget}><div className="ow-analytic-message" role={error ? "alert" : "status"}>
    <p>{message}</p>{onConfigure && <button type="button" className="ghost-button small" onClick={onConfigure}><SlidersHorizontal size={15} />Настроить виджет</button>}
  </div></Shell>;
}
function Ring({ value }: { value: number | null }) {
  return <svg className="ow-progress-ring" viewBox="0 0 120 120" role="img" aria-label={value === null ? "Нет звонков за период" : `Проанализировано ${num(value)}% звонков`}>
    <circle className="ow-ring-track" cx="60" cy="60" r="49" />
    {value !== null && value > 0 && <circle className="ow-ring-value" cx="60" cy="60" r="49" pathLength="100" strokeDasharray={`${value} 100`} />}
    <text x="60" y="65" textAnchor="middle">{value === null ? "—" : `${num(value)}%`}</text>
  </svg>;
}
export function AdvancedWidget({ widget: w, overview, data, error, loading, onConfigure }: {
  widget: OverviewWidget; overview: AnalyticsOverviewResponse | null; data?: AnalyticsWidgetData; error?: string; loading: boolean; onConfigure?: () => void;
}) {
  if (loading || !data && !error) return <Message widget={w} message="Загрузка показателей…" />;
  if (error || data?.error) return <Message widget={w} message={error ?? data!.error!} error />;
  if (data?.needsSource) return <Message widget={w} message={`Выберите ${w.kind === "matrix" ? "инструкцию" : "критерий"} в настройках виджета.`} onConfigure={onConfigure} />;
  if (data?.unavailable) return <Message widget={w} message={data.unavailable} onConfigure={["criterion", "matrix", "speech"].includes(w.kind) ? onConfigure : undefined} />;
  if (w.kind === "coverage") {
    const total = overview?.calls_total, analyzed = overview?.calls_analyzed;
    const ratio = coveragePercent(analyzed, total);
    return <Shell widget={w}><div className="ow-analytic-core"><div className="ow-analytic-plot"><Ring value={ratio} /></div>
      <div className="ow-analytic-secondary"><strong>{analyzed == null ? "—" : num(analyzed, 0)} <small>из {total == null ? "—" : num(total, 0)}</small></strong><p className="kpi-note">{total === 0 ? "За выбранный период звонков нет" : "звонков с готовым анализом"}</p></div>
    </div></Shell>;
  }
  if (w.kind === "critical_missed") return <MetricCard title={widgetInfo[w.kind].title} icon={<AlertTriangle size={18} />} value={data?.summary ? num(data.summary.critical_missed, 0) : "—"}
    note={data?.summary ? `Пропущенные критичные критерии · ${num(data.summary.calls_analyzed, 0)} звонков с анализом` : "Нет данных"} />;
  if (w.kind === "quality_delta") {
    const summary = data?.summary;
    const delta = summary ? comparableDelta(summary) : null;
    const note = summary?.delta.criteria_changed ? "Критерии изменились: периоды несопоставимы" : delta === null ? "Недостаточно данных для сравнения периодов" : "изменение в баллах к предыдущему периоду той же длины";
    return <MetricCard title={widgetInfo[w.kind].title} icon={delta !== null && delta < 0 ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
      value={<HoverHint label={delta === null ? note : `Изменение оценки: ${delta > 0 ? "+" : ""}${num(delta)}`} detail={note}>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${num(delta)}`}<small className="ow-delta-unit">{delta === null ? "" : "бал."}</small></HoverHint>}
      points={w.chart && summary ? trendPoints(summary.trend) : undefined} note={note} />;
  }
  if (w.kind === "criterion" && data?.criterion) {
    const row = data.criterion;
    const rate = row.pass_rate === null ? null : row.pass_rate * 100;
    const distribution = [
      ["Выполнено", row.distribution.met], ["В основном", row.distribution.mostly_met], ["Частично", row.distribution.partially_met], ["Минимально", row.distribution.minimally_met], ["Пропущено", row.distribution.missed],
    ] as const;
    const count = distribution.reduce((sum, [, n]) => sum + n, 0);
    const points = trendPoints(row.trend);
    return <Shell widget={w} title={row.title}>
      <p className="kpi-note ow-source-caption">{row.instruction.title}</p>
      <div className="ow-criterion-primary"><strong>{rate === null ? "—" : `${num(rate)}%`}</strong><span className="ow-analytic-detail">{rate === null ? "Недостаточно оценок" : "оценок от 75 баллов"}</span></div>
      <div className="ow-analytic-core">
        <div className="ow-criterion-distribution" role="img" aria-label={distribution.map(([label,n]) => `${label}: ${n}`).join("; ")}>
          {distribution.map(([label, n], i) => n > 0 && <HoverHint key={label} label={`${label}: ${n}`} focusable={false} className={cssClass({flexGrow:n})}>
            <span className={`ow-criterion-band ${cssClass({ "--ow-band-weight": `${100 - i * 17}%` })}`} />
          </HoverHint>)}
          {count === 0 && <span className="ow-analytic-empty">Нет оценок</span>}
        </div>
        {w.chart && points.length > 0 && <MiniSparkline tone="neutral" points={points} />}
      </div>
      <p className="kpi-note">Оценено: {row.n_scored} · неприменимо: {row.n_not_applicable} · без оценки: {row.n_unassessed}</p>
    </Shell>;
  }
  if (w.kind === "matrix" && data?.matrix) return <MatrixWidget key={`${w.instruction_uuid}:${JSON.stringify(w.period)}`} widget={w} matrix={data.matrix} />;
  if (w.kind === "speech" && data?.profile) {
    const profile = data.profile, speech = profile.speech?.own;
    if (!speech || speech.n === 0) return <Message widget={w} message="Нет речевых метрик за период. Сотрудник должен быть привязан к участнику разговора." onConfigure={onConfigure} />;
    return <Shell widget={w}><p className="kpi-note ow-source-caption">{profile.employee.full_name} · {speech.n} звонков с речевыми метриками</p>
      <WidgetRows widget={w} className="ow-speech-list">{speechMetrics(speech).map(metric => <div className="ow-speech-row" key={metric.key} aria-label={`${metric.title}: ${metric.value}`}>
        <span>{metric.title}</span><strong>{metric.value}</strong>
        {metric.raw !== null && <i className="ow-speech-share" aria-hidden="true"><b className={cssClass({width:`${Math.max(0,Math.min(100,metric.raw))}%`})}/></i>}
      </div>)}</WidgetRows>
    </Shell>;
  }
  return <Message widget={w} message="Нет данных за выбранный период." />;
}

function MatrixWidget({ widget: w, matrix }: { widget: OverviewWidget; matrix: AnalyticsMatrixResponse }) {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [requestedPage, setPage] = useState(0);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node); setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  const { columns, rows, labels } = matrixPageSize(width, widgetMaxHeight(w));
  const columnPages = Math.max(1, Math.ceil(matrix.criteria.length / columns));
  const rowPages = Math.max(1, Math.ceil(matrix.rows.length / rows));
  const pages = columnPages * rowPages, page = Math.min(requestedPage, pages - 1);
  const columnStart = page % columnPages * columns, rowStart = Math.floor(page / columnPages) * rows;
  const shownCriteria = matrix.criteria.slice(columnStart, columnStart + columns);
  return <Shell widget={w}><p className="kpi-note ow-source-caption">{matrix.instruction.title}</p>
    <div ref={element} className={`ow-matrix${labels ? " has-labels" : ""}`}>
      {matrix.rows.length === 0 || matrix.criteria.length === 0 ? <p className="ow-analytic-empty">За период нет оценок для матрицы.</p> : <>
        <div className={`ow-matrix-grid ${cssClass({ "--ow-matrix-columns": shownCriteria.length })}`} role="table" aria-label="Оценки сотрудников по критериям">
          {labels && <div className="ow-matrix-row ow-matrix-head" role="row"><span role="columnheader">Сотрудник</span>{shownCriteria.map(c => <HoverHint key={c.criterion_key} label={c.title}><span role="columnheader">{c.title}</span></HoverHint>)}</div>}
          {matrix.rows.slice(rowStart, rowStart + rows).map(row => <div className="ow-matrix-row" role="row" key={row.user_uuid}>
            {labels && <HoverHint label={row.full_name}><span role="rowheader">{row.full_name}</span></HoverHint>}
            {shownCriteria.map(criterion => {
              const cell = row.cells.find(c => c.criterion_key === criterion.criterion_key);
              const score = cell?.sample === "low" || cell?.sample === "none" ? null : cell?.avg_score ?? null;
              const description = score === null ? `Недостаточно оценок · ${cell?.n ?? 0} оценок` : `${score} из 100 · ${cell?.n} оценок`;
              return <HoverHint key={criterion.criterion_key} label={`${row.full_name} · ${criterion.title}`} detail={description}>
                <span role="cell" aria-label={description} className={`ow-matrix-cell${score === null ? " is-unknown" : ""} ${cssClass({"--ow-cell-strength":`${score === null ? 0 : 10 + score * .25}%`})}`}><span className="ow-matrix-value">{score ?? "—"}</span></span>
              </HoverHint>;
            })}
          </div>)}
        </div>
        <div className="ow-matrix-legend ow-analytic-detail"><i aria-hidden="true"/>0 → 100 баллов · «—» — недостаточно оценок</div>
        {pages > 1 && <nav className="ow-row-pages" aria-label="Страницы матрицы">
          <button className="icon-button" type="button" aria-label="Предыдущая часть матрицы" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14}/></button>
          <span>{page + 1}/{pages}<span className="ow-matrix-page-detail"> · строки {rowStart + 1}–{Math.min(rowStart + rows,matrix.rows.length)} · критерии {columnStart + 1}–{Math.min(columnStart + columns,matrix.criteria.length)}</span></span>
          <button className="icon-button" type="button" aria-label="Следующая часть матрицы" disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14}/></button>
        </nav>}
      </>}
    </div>
  </Shell>;
}

export function AdvancedWidgetPreview({ kind }: { kind: WidgetKind }) {
  const Icon = icons[kind as keyof typeof icons];
  return <span className={`overview-catalog-preview ow-advanced-preview preview-${kind}`} aria-hidden="true">
    <Icon size={24}/>
    {kind === "coverage" ? <svg viewBox="0 0 120 70"><circle cx="60" cy="35" r="26" fill="none" stroke="currentColor" strokeWidth="7" opacity=".2"/><circle cx="60" cy="35" r="26" fill="none" stroke="currentColor" strokeWidth="7" pathLength="100" strokeDasharray="70 100" transform="rotate(-90 60 35)"/></svg>
      : kind === "matrix" ? <span className="ow-preview-matrix">{Array.from({length:15},(_,i)=><i key={i} className={cssClass({opacity: .15+(i%5)*.18})}/>)}</span>
      : kind === "speech" ? <span className="ow-preview-speech">{[70,45,85,30].map((n,i)=><i key={i} className={cssClass({width:`${n}%`})}/>)}</span>
      : kind === "critical_missed" ? <span className="ow-preview-counter">!</span>
      : kind === "criterion" ? <span className="ow-preview-distribution">{[4,3,2,1,1].map((n,i)=><i key={i} className={cssClass({flexGrow:n,opacity:1-i*.17})}/>)}</span>
      : <svg viewBox="0 0 200 60"><path d="M8 50 Q35 55 58 33 T105 29 T150 16 T192 9" fill="none" stroke="currentColor" strokeWidth="3"/></svg>}
  </span>;
}
