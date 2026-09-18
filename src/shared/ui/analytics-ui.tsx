import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Minus } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import type { AnalyticsDelta, AnalyticsDistribution, AnalyticsMarker, AnalyticsSample, AnalyticsTrendPoint } from "../../types";
import { DateTimePicker } from "./DateTimePicker";

/* Shared building blocks of the analytics screens (spec, section 8). No chart
   library: the lines are plain SVG, like the rest of the application. */

export type DataColumn<T> = {
  key: string;
  label: string;
  /** Lower stays longer as the window narrows; 0 never goes. */
  priority: number;
  width?: number;
  align?: "start" | "end";
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string | null;
};

/**
 * A sortable list on div rows. Columns drop in one order as the window
 * narrows, by priority; under 760px every row becomes a card and nothing is
 * left as a clipped fragment.
 */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, pinned, initialSort, emptyText }: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Rows kept on top whatever the sort, such as the viewer's own. */
  pinned?: (row: T) => boolean;
  initialSort?: { key: string; order: "asc" | "desc" } | null;
  emptyText?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    const column = columns.find((item) => item.key === sort?.key);
    const list = [...rows];
    if (column?.sortValue) {
      const direction = sort?.order === "desc" ? -1 : 1;
      list.sort((a, b) => {
        const left = column.sortValue!(a), right = column.sortValue!(b);
        if (left === right) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return (left < right ? -1 : 1) * direction;
      });
    }
    if (pinned) list.sort((a, b) => Number(pinned(b)) - Number(pinned(a)));
    return list;
  }, [columns, pinned, rows, sort]);

  function toggle(column: DataColumn<T>) {
    if (!column.sortValue) return;
    setSort((current) => current?.key === column.key ? { key: column.key, order: current.order === "asc" ? "desc" : "asc" } : { key: column.key, order: "asc" });
  }

  const cellStyle = (column: DataColumn<T>) => column.width ? { flex: `0 0 ${column.width}px` } : undefined;
  return <div className="data-table" role="table">
    <div className="data-table-row data-table-head" role="row">
      {columns.map((column) => <div key={column.key} role="columnheader" data-priority={column.priority} className={`data-table-cell${column.align === "end" ? " is-end" : ""}${column.width ? "" : " is-grow"}`} style={cellStyle(column)}>
        {column.sortValue ? <button type="button" className="data-table-sort" onClick={() => toggle(column)} aria-sort={sort?.key === column.key ? (sort.order === "asc" ? "ascending" : "descending") : "none"}>
          {column.label}{sort?.key === column.key ? (sort.order === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : null}
        </button> : column.label}
      </div>)}
    </div>
    {sorted.length === 0 && emptyText ? <p className="data-table-empty">{emptyText}</p> : null}
    {sorted.map((row) => <div key={rowKey(row)} role="row" className={`data-table-row${onRowClick ? " is-clickable" : ""}${pinned?.(row) ? " is-pinned" : ""}`}
      tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}
      onKeyDown={onRowClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); } } : undefined}>
      {columns.map((column) => <div key={column.key} role="cell" data-priority={column.priority} data-label={column.label} className={`data-table-cell${column.align === "end" ? " is-end" : ""}${column.width ? "" : " is-grow"}`} style={cellStyle(column)}>
        {column.render(row)}
      </div>)}
    </div>)}
  </div>;
}

export type PeriodValue = { preset: "7" | "30" | "90" | "custom"; from?: string; to?: string };

/** The previous Monday-to-Sunday week, which the weekly digest links to. */
export function lastWeekPeriod(): PeriodValue {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const day = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return { preset: "custom", from: day(monday), to: day(sunday) };
}

/** The RFC 3339 window of a period in the viewer's zone, or nothing for the default. */
export function periodRange(value: PeriodValue): { from?: string; to?: string } {
  const endOfToday = new Date();
  endOfToday.setHours(24, 0, 0, 0);
  if (value.preset !== "custom") {
    const from = new Date(endOfToday);
    from.setDate(from.getDate() - Number(value.preset));
    return { from: from.toISOString(), to: endOfToday.toISOString() };
  }
  const from = value.from ? new Date(`${value.from}T00:00:00`) : undefined;
  const to = value.to ? new Date(`${value.to}T00:00:00`) : undefined;
  if (to) to.setDate(to.getDate() + 1);
  return { from: from?.toISOString(), to: to?.toISOString() };
}

export function PeriodSelect({ value, onChange, retentionDays }: { value: PeriodValue; onChange: (value: PeriodValue) => void; retentionDays?: number }) {
  return <div className="period-select">
    <div className="segmented compact period-select-presets" role="group" aria-label="Период">
      {(["7", "30", "90"] as const).map((preset) => <button key={preset} type="button" className={value.preset === preset ? "active" : ""} onClick={() => onChange({ preset })}>{preset} дней</button>)}
      <button type="button" className={value.preset === "custom" ? "active" : ""} onClick={() => onChange({ preset: "custom", from: value.from, to: value.to })}>Свой</button>
    </div>
    {value.preset === "custom" ? <div className="period-select-range">
      <DateTimePicker mode="date" display="compact" ariaLabel="С" value={value.from ?? ""} onChange={(from) => onChange({ ...value, from })} />
      <span>—</span>
      <DateTimePicker mode="date" display="compact" ariaLabel="По" value={value.to ?? ""} onChange={(to) => onChange({ ...value, to })} />
    </div> : null}
    {retentionDays ? <small className="period-select-hint" title="История оценок удаляется вместе со звонком">История хранится {retentionDays} дн. по тарифу</small> : null}
  </div>;
}

const CHART_WIDTH = 600, CHART_HEIGHT = 160, PAD = 12;

/**
 * A line of mean scores by bucket, with an optional second series (the team or
 * the department) and vertical marks where the yardstick moved.
 */
export function TrendChart({ points, reference, markers = [], label, referenceLabel }: {
  points: AnalyticsTrendPoint[]; reference?: AnalyticsTrendPoint[]; markers?: AnalyticsMarker[]; label: string; referenceLabel?: string;
}) {
  const buckets = useMemo(() => Array.from(new Set([...points, ...(reference ?? [])].map((point) => point.bucket))).sort(), [points, reference]);
  if (buckets.length === 0) return <p className="trend-chart-empty">За период нет оценённых звонков.</p>;
  const x = (bucket: string) => buckets.length === 1 ? CHART_WIDTH / 2 : PAD + buckets.indexOf(bucket) * (CHART_WIDTH - 2 * PAD) / (buckets.length - 1);
  const y = (value: number) => CHART_HEIGHT - PAD - value / 100 * (CHART_HEIGHT - 2 * PAD);
  const path = (series: AnalyticsTrendPoint[]) => series.filter((point) => point.avg !== null).map((point, index) => `${index === 0 ? "M" : "L"}${x(point.bucket).toFixed(1)},${y(point.avg!).toFixed(1)}`).join(" ");
  const markerX = (date: string) => {
    const index = buckets.findIndex((bucket) => bucket >= date);
    return index < 0 ? null : x(buckets[index]);
  };
  return <figure className="trend-chart" aria-label={label}>
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img">
      {[25, 50, 75].map((line) => <line key={line} className="trend-chart-grid" x1={0} x2={CHART_WIDTH} y1={y(line)} y2={y(line)} />)}
      {markers.map((marker) => { const mx = markerX(marker.date); return mx === null ? null : <line key={`${marker.kind}-${marker.date}-${marker.label}`} className={`trend-chart-marker is-${marker.kind}`} x1={mx} x2={mx} y1={0} y2={CHART_HEIGHT}><title>{marker.label}</title></line>; })}
      {reference?.length ? <path className="trend-chart-line is-reference" d={path(reference)} /> : null}
      <path className="trend-chart-line" d={path(points)} />
      {points.filter((point) => point.avg !== null).map((point) => <circle key={point.bucket} className="trend-chart-dot" cx={x(point.bucket)} cy={y(point.avg!)} r={3}><title>{`${formatBucket(point.bucket)}: ${point.avg} (звонков: ${point.n})`}</title></circle>)}
    </svg>
    <figcaption>
      <span className="trend-chart-legend"><i />{label}</span>
      {reference?.length && referenceLabel ? <span className="trend-chart-legend is-reference"><i />{referenceLabel}</span> : null}
      {markers.length ? <span className="trend-chart-legend is-marker"><i />менялись инструкция или модель</span> : null}
    </figcaption>
  </figure>;
}

/** A small trend for a table row. */
export function MiniTrend({ points }: { points: AnalyticsTrendPoint[] }) {
  const values = points.filter((point) => point.avg !== null);
  if (values.length < 2) return <span className="mini-trend is-empty" aria-hidden="true">—</span>;
  const width = 80, height = 24;
  const d = values.map((point, index) => `${index === 0 ? "M" : "L"}${(2 + index * (width - 4) / (values.length - 1)).toFixed(1)},${(height - 2 - point.avg! / 100 * (height - 4)).toFixed(1)}`).join(" ");
  return <svg className="mini-trend" viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><path d={d} /></svg>;
}

const DISTRIBUTION_ORDER: Array<[keyof AnalyticsDistribution, string]> = [["met", "Выполнено"], ["mostly_met", "Почти"], ["partially_met", "Частично"], ["minimally_met", "Минимально"], ["missed", "Не выполнено"]];

export function DistributionBar({ distribution }: { distribution: AnalyticsDistribution }) {
  const total = DISTRIBUTION_ORDER.reduce((sum, [key]) => sum + distribution[key], 0);
  if (total === 0) return <span className="distribution-bar is-empty" aria-label="Нет оценок" />;
  return <span className="distribution-bar" role="img" aria-label={DISTRIBUTION_ORDER.map(([key, label]) => `${label}: ${distribution[key]}`).join(", ")}>
    {DISTRIBUTION_ORDER.map(([key, label]) => distribution[key] > 0 ? <i key={key} className={`is-${key}`} style={{ flexGrow: distribution[key] }} title={`${label}: ${distribution[key]}`} /> : null)}
  </span>;
}

/** The change against the previous period, grey when it is within the noise. */
export function DeltaBadge({ delta }: { delta: AnalyticsDelta }) {
  if (delta.value === null) return <span className="delta-badge is-none" title={delta.comparable ? "Мало данных для сравнения" : "Сравнивать не с чем"}>—</span>;
  const tone = !delta.significant || delta.value === 0 ? "is-neutral" : delta.value > 0 ? "is-up" : "is-down";
  const Icon = delta.value > 0 ? ArrowUpRight : delta.value < 0 ? ArrowDownRight : Minus;
  const title = [!delta.significant ? "В пределах обычного разброса" : "", delta.criteria_changed ? "Критерии менялись между периодами" : ""].filter(Boolean).join(". ");
  return <span className={`delta-badge ${tone}`} title={title || undefined}><Icon size={13} />{delta.value > 0 ? "+" : ""}{delta.value}{delta.criteria_changed ? "*" : ""}</span>;
}

/** A score with the sample note: nothing under five, "мало данных" under twenty. */
export function ScoreValue({ value, sample }: { value: number | null; sample: AnalyticsSample }) {
  if (value === null || sample === "none" || sample === "low") return <span className="score-value is-empty" title="Меньше пяти оценок">—</span>;
  return <span className={`score-value tone-${scoreTone(value)}`}>{value}{sample === "thin" ? <small title="Меньше 20 оценок"> мало данных</small> : null}</span>;
}

export function scoreTone(value: number) {
  return value >= 75 ? "good" : value >= 50 ? "warning" : "danger";
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="analytics-empty-state">
    <span className="analytics-empty-icon" aria-hidden="true">{icon}</span>
    <h3>{title}</h3>
    {text ? <p>{text}</p> : null}
    {action}
  </div>;
}

export function formatBucket(bucket: string) {
  const [year, month, day] = bucket.split("-");
  return `${day}.${month}.${year}`;
}
