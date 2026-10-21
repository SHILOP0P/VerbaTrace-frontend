import { Star } from "lucide-react";
import { useId } from "react";
import { HoverHint } from "../../shared/ui/hover-hint";
import type { AnalyticsOverviewResponse, AnalyticsSummary } from "../../types";
import { cssClass } from "../../shared/lib/css-styles";
import { formatScore } from "../../shared/lib/analysis";
import { formatDuration } from "../../shared/lib/formatters";
import { pluralizeRu } from "../../shared/lib/plans";
import { DeltaBadge } from "../../shared/ui/analytics-ui";
import { ScoreGauge } from "../../shared/ui/score-gauge";
import {
  sparklineCoordinates,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
} from "./sparkline-geometry";

export function MetricCard({
  icon,
  title,
  value,
  tone = "neutral",
  points,
  note,
  live = false,
  loading = false,
  series,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  tone?: "neutral" | "success" | "warning";
  points?: ChartPoint[];
  note?: string;
  /** Something is running right now: a quiet amber pulse next to the number. */
  live?: boolean;
  loading?: boolean;
  /** The metric's own colour, shared by its icon and its line. */
  series?: "blue" | "violet" | "green" | "teal";
}) {
  const hasChart = Boolean(points && points.length > 0);
  const seriesClass = series ? ` kpi-series-${series}` : "";

  if (loading) {
    return (
      <article
        className={`dashboard-kpi-card glass-panel ${tone}${seriesClass}`}
        aria-busy="true"
      >
        <div className="kpi-head">
          <span>{title}</span>
          <span className="metric-icon">{icon}</span>
        </div>
        <span className="skeleton-line overview-kpi-value-skeleton" />
        <span className="skeleton-line overview-kpi-chart-skeleton" />
      </article>
    );
  }

  return (
    <article
      className={`dashboard-kpi-card glass-panel ${tone}${seriesClass}${hasChart ? "" : " is-plain"}`}
    >
      <div className="kpi-head">
        <span>{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong className="kpi-value">
        {value}
        {live && <i className="kpi-live" aria-hidden="true" />}
      </strong>
      {note && <span className="kpi-note">{note}</span>}
      {hasChart && <MiniSparkline points={points!} tone={tone} />}
    </article>
  );
}

// The average over everything visible, with the change over the analytics
// period next to it. The period is named, because the two numbers cover
// different spans and must not read as one.
export function ScoreKpiCard({
  score,
  summary,
  loading,
  fluidGauge = false,
}: {
  score: number | null;
  summary: AnalyticsSummary | null;
  loading: boolean;
  fluidGauge?: boolean;
}) {
  const periodDays = summary
    ? Math.max(
        1,
        Math.round(
          (Date.parse(summary.period.to) - Date.parse(summary.period.from)) /
            86_400_000,
        ),
      )
    : null;
  return (
    <article
      className="dashboard-kpi-card glass-panel is-score"
      aria-busy={loading || undefined}
    >
      <div className="kpi-head">
        <span>Средняя оценка</span>
        <span className="metric-icon">
          <Star size={18} />
        </span>
      </div>
      <div className="kpi-score-body">
        <ScoreGauge
          value={loading ? null : score}
          size={112}
          loading={loading}
          fluid={fluidGauge}
        />
        {!loading && (
          <div className="kpi-score-side">
            {score === null ? (
              <span className="kpi-note">
                Оценок пока нет: общий балл появится после первого анализа.
              </span>
            ) : summary && periodDays ? (
              summary.avg_score !== null &&
              summary.sample !== "none" &&
              summary.sample !== "low" ? (
                <>
                  <span className="kpi-note">
                    за {periodDays}{" "}
                    {pluralizeRu(periodDays, "день", "дня", "дней")}
                  </span>
                  <span className="kpi-score-period">
                    <b>{formatScore(summary.avg_score)}</b>
                    <DeltaBadge delta={summary.delta} />
                  </span>
                  <span className="kpi-note">
                    к прошлым {periodDays}{" "}
                    {pluralizeRu(periodDays, "дню", "дням", "дням")}
                  </span>
                </>
              ) : (
                <span className="kpi-note">
                  Сравнение с прошлым периодом появится от 5 оценённых звонков
                  за {periodDays}{" "}
                  {pluralizeRu(periodDays, "день", "дня", "дней")}.
                </span>
              )
            ) : (
              <span className="kpi-note">по всем оценённым звонкам</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

type ChartPoint = {
  label: string;
  value: number;
  display: string;
  detail?: string;
};

export function MiniSparkline({
  points,
  tone,
}: {
  points: ChartPoint[];
  tone: "neutral" | "accent" | "success" | "warning";
}) {
  // useId returns characters a url(#…) reference does not accept everywhere.
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const prepared =
    points.length > 0
      ? points
      : [{ label: "Нет данных", value: 0, display: "0" }];
  const animationKey = prepared
    .map((point) => `${point.label}:${point.value}:${point.display}`)
    .join("|");
  const coordinates = sparklineCoordinates(prepared);
  const path = smoothPath(coordinates);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const area =
    coordinates.length > 1
      ? `${path} L ${last.x} ${SPARKLINE_HEIGHT} L ${first.x} ${SPARKLINE_HEIGHT} Z`
      : "";

  return (
    <div
      className={`mini-chart ${tone}${coordinates.length === 1 ? " is-single-point" : ""}`}
    >
      <svg
        key={animationKey}
        className="mini-sparkline"
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="График значения"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="mini-sparkline-stop-top" />
            <stop offset="1" className="mini-sparkline-stop-bottom" />
          </linearGradient>
        </defs>
        {/* Inline, because the older stylesheet sets fill: none on every path. */}
        {area && (
          <path
            className={[
              "mini-sparkline-area",
              cssClass({ fill: `url(#${gradientId})` }),
            ]
              .filter(Boolean)
              .join(" ")}
            d={area}
          />
        )}
        <path
          className="mini-sparkline-line"
          d={path}
          vectorEffect="non-scaling-stroke"
        />
        {coordinates.map((point, index) => (
          <circle
            cx={point.x}
            cy={point.y}
            r="7"
            key={`${point.label}-${index}`}
          />
        ))}
      </svg>
      {coordinates.map((point, index) => (
        <HoverHint
          label={point.display}
          detail={point.detail ?? point.label}
          ariaLabel={`${point.label}: ${point.display}`}
          placement="above"
          className={[
            `chart-hit ${index === coordinates.length - 1 ? "is-last" : ""}`,
            cssClass({
              left: `${point.left}%`,
              top: `${point.top}%`,
            } as React.CSSProperties),
          ]
            .filter(Boolean)
            .join(" ")}
          key={`${point.label}-${index}-hit`}
        />
      ))}
    </div>
  );
}

export function buildOverviewChartSeries(
  overview: AnalyticsOverviewResponse | null,
) {
  const charts = overview?.charts;
  return {
    totalCalls: countChartPoints(charts?.calls_by_day, "загрузок"),
    analyzedCalls: analyzedChartPoints(charts?.analyzed_by_day),
    duration: durationChartPoints(charts?.duration_by_day),
    quality: qualityChartPoints(charts?.score_by_day),
  };
}

export function overviewScore(overview: AnalyticsOverviewResponse | null) {
  if (!overview) {
    return { score: null, scale: 100 };
  }

  if (
    typeof overview.average_score === "number" &&
    Number.isFinite(overview.average_score)
  ) {
    return {
      score: overview.average_score,
      scale:
        typeof overview.score_scale === "number" && overview.score_scale > 0
          ? overview.score_scale
          : 100,
    };
  }

  if (
    typeof overview.average_quality_score === "number" &&
    Number.isFinite(overview.average_quality_score)
  ) {
    return {
      score: overview.average_quality_score * 20,
      scale: 100,
    };
  }

  return { score: null, scale: 100 };
}

function chartDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function countChartPoints(
  points: Array<{ date: string; count: number }> | undefined,
  unit: string,
): ChartPoint[] {
  return (points ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.count,
    display: `${point.count} ${unit}`,
  }));
}

function analyzedChartPoints(
  points: Array<{ date: string; count: number }> | undefined,
): ChartPoint[] {
  return (points ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.count,
    display: `${point.count} ${pluralizeCalls(point.count)}`,
    detail: `${chartDateLabel(point.date)} · получили анализ`,
  }));
}

function pluralizeCalls(count: number) {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return "звонков";
  if (last === 1) return "звонок";
  if (last >= 2 && last <= 4) return "звонка";
  return "звонков";
}

function durationChartPoints(
  points: Array<{ date: string; average_duration_seconds: number }> | undefined,
): ChartPoint[] {
  return (points ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.average_duration_seconds,
    display: formatDuration(Math.round(point.average_duration_seconds)),
  }));
}

function qualityChartPoints(
  scorePoints: Array<{ date: string; average_score: number }> | undefined,
): ChartPoint[] {
  return (scorePoints ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.average_score,
    display: `${formatScore(point.average_score)} / 100`,
  }));
}

function smoothPath(points: Array<ChartPoint & { x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}
