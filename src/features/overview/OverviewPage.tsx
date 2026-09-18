import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Phone,
  RefreshCw,
  Star
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type {
  AnalyticsOverviewResponse,
  AppPage,
  CallResponse,
  ProcessingMonitoringResponse
} from "../../types";

import {
  businessOutcomeLabels,
  enumLabel,
  formatScore
} from "../../shared/lib/analysis";
import { formatDuration } from "../../shared/lib/formatters";
import { useWorkspaceCompanyId } from "../../shared/lib/workspace-company";
import { sparklineCoordinates, SPARKLINE_HEIGHT, SPARKLINE_WIDTH } from "./sparkline-geometry";

/**
 * The overview follows the company chosen in the header, like the calls list:
 * a company shows that company, the personal workspace shows only personal
 * calls, and a device where nothing was chosen yet sees everything it can reach.
 */
function overviewFilters(workspaceCompanyId: string | null): Parameters<typeof api.getAnalyticsOverview>[0] {
  if (workspaceCompanyId === null) return {};
  return workspaceCompanyId ? { company_uuid: workspaceCompanyId } : { scope: "personal" };
}

export function OverviewPage({
  calls,
  callsVersion,
  onNavigate
}: {
  calls: CallResponse[];
  callsVersion: string;
  onNavigate?: (page: AppPage) => void;
}) {
  const workspaceCompanyId = useWorkspaceCompanyId();
  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [processingMonitoring, setProcessingMonitoring] = useState<ProcessingMonitoringResponse | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const avgDuration = analyticsOverview?.average_duration_seconds === null || analyticsOverview === null
    ? "Нет данных"
    : formatDuration(Math.round(analyticsOverview.average_duration_seconds));
  const analyticsScore = overviewScore(analyticsOverview);
  const chartSeries = buildOverviewChartSeries(analyticsOverview);
  const recentUploads = useMemo(() => buildRecentUploadChart(calls), [calls]);
  const qualityDonutPercent = analyticsScore.score === null ? 0 : (analyticsScore.score / analyticsScore.scale) * 100;
  const qualityDonutLabel = analyticsScore.score === null
    ? "нет данных"
    : `${formatScore(analyticsScore.score)} / ${analyticsScore.scale}`;

  // The aggregates read every visible analysis, so they are fetched when the
  // calls change, when the tab comes back and on request — never on a timer.
  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      setRefreshing(true);
      const overview = await api.getAnalyticsOverview(overviewFilters(workspaceCompanyId)).catch(() => null);
      if (!cancelled) {
        setAnalyticsOverview(overview);
        setRefreshing(false);
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void loadOverview();
    }

    void loadOverview();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [callsVersion, workspaceCompanyId, refreshToken]);

  // The queue counters are cheap and move by the second, so they keep polling.
  useEffect(() => {
    let cancelled = false;

    async function loadMonitoring() {
      const monitoring = await api
        .getProcessingMonitoring(workspaceCompanyId ? { company_uuid: workspaceCompanyId } : undefined)
        .catch(() => null);
      if (!cancelled) setProcessingMonitoring(monitoring);
    }

    void loadMonitoring();
    const intervalId = window.setInterval(loadMonitoring, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [workspaceCompanyId]);

  return (
    <section className="dashboard-page app-page">
      <div className="dashboard-kpi-grid">
        <MetricCard icon={<BarChart3 size={20} />} title="Всего звонков" value={metricCount(analyticsOverview?.calls_total)} points={chartSeries.totalCalls} note="в выбранной области" />
        <MetricCard
          icon={<Phone size={20} />}
          title="Новые сегодня"
          value={metricCount(analyticsOverview?.calls_created_today)}
          points={recentUploads}
          note="за последние 24 часа"
        />
        <MetricCard icon={<Activity size={20} />} title="Звонки в обработке" value={metricCount(analyticsOverview?.calls_processing)} note={`${processingMonitoring?.queue.running ?? 0} задач выполняется`} />
        <MetricCard icon={<CheckCircle2 size={20} />} title="С анализом" value={metricCount(analyticsOverview?.calls_analyzed)} tone="success" points={chartSeries.analyzedCalls} note="готовый результат анализа" />
        <MetricCard icon={<Clock3 size={20} />} title="Средняя длительность" value={avgDuration} points={chartSeries.duration} />
        <MetricCard
          icon={<Star size={20} />}
          title="Средняя оценка"
          value={analyticsScore.score === null ? "Нет данных" : `${formatScore(analyticsScore.score)} / ${analyticsScore.scale}`}
          tone="success"
          points={chartSeries.quality}
          donutPercent={qualityDonutPercent}
          donutLabel={qualityDonutLabel}
        />
      </div>

      <div className="overview-insights-head">
        <h2>Качество разговоров</h2>
        <button
          className="icon-button"
          type="button"
          onClick={() => setRefreshToken((token) => token + 1)}
          disabled={refreshing}
          title="Обновить"
          aria-label="Обновить аналитику"
        >
          <RefreshCw size={18} className={refreshing ? "is-spinning" : undefined} />
        </button>
      </div>

      <AnalyticsOverviewInsights overview={analyticsOverview} onNavigate={onNavigate} />
    </section>
  );
}

function AnalyticsOverviewInsights({
  overview,
  onNavigate
}: {
  overview: AnalyticsOverviewResponse | null;
  onNavigate?: (page: AppPage) => void;
}) {
  const distribution = overview?.score_distribution;
  const distributionRows = distribution
    ? [
      ["critical", "Критично", distribution.critical],
      ["weak", "Слабо", distribution.weak],
      ["normal", "Норма", distribution.normal],
      ["good", "Хорошо", distribution.good],
      ["excellent", "Отлично", distribution.excellent]
    ] as Array<[string, string, number]>
    : [];
  const weakCriteria = overview?.top_weak_criteria ?? [];
  const criteriaSummary = overview?.criteria_summary ?? [];
  const issueCodes = overview?.top_issue_codes ?? [];
  const outcomes = overview?.business_outcomes ?? [];
  const nextSteps = overview?.next_step_summary;
  const topics = overview?.top_topics ?? [];
  // Older servers do not send the flag; they had no plan check at all.
  const teamAnalytics = overview?.team_analytics_enabled !== false;

  const distributionCard = (
    <InsightCard title="Распределение оценок" note="шкала 0-100">
      {distributionRows.length === 0 ? (
        <p className="analysis-empty">Нет данных по распределению.</p>
      ) : (
        <div className="score-distribution-list">
          {distributionRows.map(([key, label, count]) => (
            <div className="score-distribution-row" key={key}>
              <span>{label}</span>
              <strong>{count}</strong>
              <i style={{ "--bar": overview?.calls_analyzed ? `${Math.min(100, (count / overview.calls_analyzed) * 100)}%` : "0%" } as React.CSSProperties} />
            </div>
          ))}
        </div>
      )}
    </InsightCard>
  );

  if (!teamAnalytics) {
    return (
      <div className="analytics-insight-grid">
        {distributionCard}
        <InsightCard title="Командная аналитика" note="не входит в тариф компании">
          <p className="analysis-empty">
            Разбор по критериям, темам и итогам звонков доступен на старших бизнес-тарифах.
            Общий балл и распределение оценок остаются на любом тарифе.
          </p>
          {onNavigate ? (
            <button className="ghost-button small" type="button" onClick={() => onNavigate("settingsTariffs")}>
              Посмотреть тарифы
            </button>
          ) : null}
        </InsightCard>
      </div>
    );
  }

  return (
    <div className="analytics-insight-grid">
      {distributionCard}

      <InsightCard title="Слабые критерии" note="по пропущенным и частичным критериям">
        {weakCriteria.length === 0 ? (
          <p className="analysis-empty">Слабые критерии не найдены.</p>
        ) : (
          <div className="analytics-list">
            {weakCriteria.slice(0, 5).map((item, index) => (
              <div className="analytics-list-row" key={item.code}>
                <div>
                  <strong>{item.title || `Критерий ${index + 1}`}</strong>
                  <small>
                    {item.missed_count} пропущено · {item.partially_met_count} частично
                  </small>
                </div>
                <span>{formatNullableScore(item.average_score)}</span>
              </div>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard title="Критерии" note="«Не применимо» считается отдельно">
        {criteriaSummary.length === 0 ? (
          <p className="analysis-empty">Сводка критериев пока пустая.</p>
        ) : (
          <div className="analytics-list">
            {criteriaSummary.slice(0, 6).map((item, index) => (
              <div className="analytics-list-row criteria" key={item.code}>
                <div>
                  <strong>{item.title || `Критерий ${index + 1}`}</strong>
                  <small>
                    {item.met} выполнено · {item.partially_met} частично · {item.missed} пропущено ·{" "}
                    {item.not_applicable} не применимо
                  </small>
                </div>
                <span>{formatNullableScore(item.average_score)}</span>
              </div>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard title="Коды проблем" note="частые коды проблем">
        {issueCodes.length === 0 ? (
          <p className="analysis-empty">Коды проблем не указаны.</p>
        ) : (
          <div className="topic-list analytics-topic-list">
            {issueCodes.slice(0, 10).map((item, index) => (
              <span key={item.code}>{issueCodeLabel(item.code, index)} · {item.count}</span>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard title="Темы" note="самые частые темы">
        {topics.length === 0 ? (
          <p className="analysis-empty">Темы пока не найдены.</p>
        ) : (
          <div className="topic-list analytics-topic-list">
            {topics.slice(0, 10).map((item) => (
              <span key={item.title}>{item.title} · {item.count}</span>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard title="Итоги звонков" note="бизнес-результат разговора">
        {outcomes.length === 0 ? (
          <p className="analysis-empty">Итоги звонков не указаны.</p>
        ) : (
          <div className="analytics-list compact">
            {outcomes.slice(0, 6).map((item) => (
              <div className="analytics-list-row" key={item.status}>
                <strong>{enumLabel(item.status, businessOutcomeLabels) ?? "Неясный итог"}</strong>
                <span>{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard title="Следующий шаг" note="качество договоренности">
        {!nextSteps ? (
          <p className="analysis-empty">Сводка следующих шагов пустая.</p>
        ) : (
          <div className="analytics-list compact">
            <MetricLine label="Есть шаг" value={nextSteps.with_next_step} />
            <MetricLine label="Конкретный" value={nextSteps.specific} />
            <MetricLine label="Со сроком" value={nextSteps.with_deadline} />
            <MetricLine label="С ответственным" value={nextSteps.with_responsible_person} />
            <MetricLine label="Отсутствует" value={nextSteps.missing} />
          </div>
        )}
      </InsightCard>
    </div>
  );
}

function InsightCard({
  title,
  note,
  children
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="analytics-insight-card glass-panel">
      <div>
        <h3>{title}</h3>
        <small>{note}</small>
      </div>
      {children}
    </section>
  );
}

function MetricLine({ label, value }: { label: string; value: number; }) {
  return (
    <div className="analytics-list-row">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  tone = "accent",
  points,
  note,
  donutPercent,
  donutLabel
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  tone?: "accent" | "success" | "warning";
  points?: ChartPoint[];
  note?: string;
  donutPercent?: number;
  donutLabel?: string;
}) {
  const hasDonut = typeof donutPercent === "number";

  return (
    <article className={`dashboard-kpi-card glass-panel ${tone} ${hasDonut ? "with-donut" : ""}`}>
      <div>
        <span className="metric-icon">{icon}</span>
        <span>{title}</span>
      </div>
      {hasDonut ? (
        <QualityDonut percent={donutPercent} label={donutLabel ?? value} />
      ) : (
        <>
          <strong>{value}</strong>
          {points && points.length > 0 ? (
            <MiniSparkline points={points} tone={tone} />
          ) : (
            <span className="dashboard-kpi-note">{note ?? "нет динамики"}</span>
          )}
        </>
      )}
    </article>
  );
}

type ChartPoint = {
  label: string;
  value: number;
  display: string;
  detail?: string;
};

export function MiniSparkline({ points, tone }: { points: ChartPoint[]; tone: "accent" | "success" | "warning"; }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const prepared = points.length > 0 ? points : [{ label: "Нет данных", value: 0, display: "0" }];
  const animationKey = prepared.map((point) => `${point.label}:${point.value}:${point.display}`).join("|");
  const coordinates = sparklineCoordinates(prepared);
  const path = smoothPath(coordinates);

  return (
    <div className={`mini-chart ${tone}${coordinates.length === 1 ? " is-single-point" : ""}`}>
      <svg key={animationKey} className="mini-sparkline" viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="График значения">
        <path
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
        <span
          className={`chart-hit ${activeIndex === index ? "active" : ""} ${index <= 1 ? "edge-start" : ""} ${index >= coordinates.length - 2 ? "edge-end" : ""}`}
          style={{
            left: `${point.left}%`,
            top: `${point.top}%`
          } as React.CSSProperties}
          tabIndex={0}
          aria-label={`${point.label}: ${point.display}`}
          onBlur={() => setActiveIndex(null)}
          onFocus={() => setActiveIndex(index)}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseLeave={() => setActiveIndex(null)}
          key={`${point.label}-${index}-hit`}
        >
          <span className="chart-tooltip">
            <strong>{point.display}</strong>
            <span>{point.detail ?? point.label}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function QualityDonut({ percent, label }: { percent: number; label: string; }) {
  const [active, setActive] = useState(false);
  const clamped = Math.max(0, Math.min(100, percent));
  const drawProgress = useDrawProgress(`${clamped}:${label}`, 1600);
  const drawnPercent = clamped * drawProgress;
  const percentLabel = `${Math.round(clamped)}%`;
  return (
    <span
      className={`quality-donut-wrap ${active ? "active" : ""}`}
      style={{ "--quality-donut-percent": `${drawnPercent}%` } as React.CSSProperties}
      tabIndex={0}
      aria-label={`Заполнение диаграммы: ${percentLabel}`}
      onBlur={() => setActive(false)}
      onFocus={() => setActive(true)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      <span className="quality-donut" role="img" aria-label="Круговая диаграмма оценки качества">
        <span className="quality-donut-core">
          <span>{label}</span>
        </span>
      </span>
      <span className="chart-tooltip donut-tooltip">
        <strong>{percentLabel}</strong>
        <span>заполнение диаграммы</span>
      </span>
    </span>
  );
}

const issueCodeLabels: Record<string, string> = {
  weak_next_step: "Слабый следующий шаг",
  no_needs_discovery: "Потребность не выявлена",
  low_confidence: "Низкая уверенность",
  not_a_call: "Не звонок",
  unclear_pricing: "Неясная цена",
  price_risk: "Риск по цене",
  "price-risk": "Риск по цене",
  late_followup: "Поздний следующий контакт"
};

function issueCodeLabel(code: string, index: number) {
  return issueCodeLabels[code] ?? `Код проблемы ${index + 1}`;
}

function useDrawProgress(key: string, durationMs: number) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let startedAt = 0;

    setProgress(0);

    const tick = (time: number) => {
      if (!startedAt) startedAt = time;
      const rawProgress = Math.min(1, (time - startedAt) / durationMs);
      const easedProgress = 1 - Math.pow(1 - rawProgress, 3);
      setProgress(easedProgress);

      if (rawProgress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [durationMs, key]);

  return progress;
}

function buildOverviewChartSeries(overview: AnalyticsOverviewResponse | null) {
  const charts = overview?.charts;
  return {
    totalCalls: countChartPoints(charts?.calls_by_day, "загрузок"),
    analyzedCalls: analyzedChartPoints(charts?.analyzed_by_day),
    duration: durationChartPoints(charts?.duration_by_day),
    quality: qualityChartPoints(charts?.score_by_day, charts?.quality_by_day)
  };
}

function buildRecentUploadChart(calls: CallResponse[]): ChartPoint[] {
  const bucketHours = 3;
  const bucketMs = bucketHours * 60 * 60 * 1000;
  const bucketCount = 8;
  const rangeEnd = new Date();

  rangeEnd.setMinutes(0, 0, 0);
  rangeEnd.setHours(rangeEnd.getHours() + 1);

  const rangeEndMs = rangeEnd.getTime();
  const rangeStartMs = rangeEndMs - bucketMs * bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = rangeStartMs + index * bucketMs;
    return { start, end: start + bucketMs, count: 0 };
  });

  calls.forEach((call) => {
    const uploadedAt = new Date(call.created_at).getTime();
    if (!Number.isFinite(uploadedAt) || uploadedAt < rangeStartMs || uploadedAt > rangeEndMs) return;

    const bucketIndex = Math.min(bucketCount - 1, Math.floor((uploadedAt - rangeStartMs) / bucketMs));
    buckets[bucketIndex].count += 1;
  });

  return buckets.map((bucket) => {
    const startLabel = chartTimeLabel(bucket.start);
    const endLabel = chartTimeLabel(bucket.end);
    return {
      label: startLabel,
      value: bucket.count,
      display: `${bucket.count} ${pluralizeCalls(bucket.count)}`,
      detail: `${startLabel}–${endLabel} · загрузки`
    };
  });
}

function chartTimeLabel(value: number) {
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function overviewScore(overview: AnalyticsOverviewResponse | null) {
  if (!overview) {
    return { score: null, scale: 100 };
  }

  if (typeof overview.average_score === "number" && Number.isFinite(overview.average_score)) {
    return {
      score: overview.average_score,
      scale: typeof overview.score_scale === "number" && overview.score_scale > 0 ? overview.score_scale : 100
    };
  }

  if (
    typeof overview.average_quality_score === "number" &&
    Number.isFinite(overview.average_quality_score)
  ) {
    return {
      score: overview.average_quality_score * 20,
      scale: 100
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

function countChartPoints(points: Array<{ date: string; count: number }> | undefined, unit: string): ChartPoint[] {
  return (points ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.count,
    display: `${point.count} ${unit}`
  }));
}

function analyzedChartPoints(points: Array<{ date: string; count: number }> | undefined): ChartPoint[] {
  return (points ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.count,
    display: `${point.count} ${pluralizeCalls(point.count)}`,
    detail: `${chartDateLabel(point.date)} · получили анализ`
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

function durationChartPoints(points: Array<{ date: string; average_duration_seconds: number }> | undefined): ChartPoint[] {
  return (points ?? []).map((point) => ({
    label: chartDateLabel(point.date),
    value: point.average_duration_seconds,
    display: formatDuration(Math.round(point.average_duration_seconds))
  }));
}

function qualityChartPoints(
  scorePoints: Array<{ date: string; average_score: number }> | undefined,
  legacyPoints: Array<{ date: string; average_quality_score: number }> | undefined
): ChartPoint[] {
  if (scorePoints && scorePoints.length > 0) {
    return scorePoints.map((point) => ({
      label: chartDateLabel(point.date),
      value: point.average_score,
      display: `${formatScore(point.average_score)} / 100`
    }));
  }

  return (legacyPoints ?? []).map((point) => {
    const normalized = point.average_quality_score * 20;
    return {
      label: chartDateLabel(point.date),
      value: normalized,
      display: `${formatScore(normalized)} / 100`
    };
  });
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

function formatNullableScore(value: number | null) {
  return value === null ? "Нет данных" : `${formatScore(value)} / 100`;
}

function metricCount(value: number | null | undefined) {
  return typeof value === "number" ? value.toString() : "Нет данных";
}
