import type { api } from "../../api";
import type { AnalyticsCapabilities, AnalyticsCriterionRow, AnalyticsFilters, AnalyticsMatrixResponse, AnalyticsProfile, AnalyticsSpeech, AnalyticsSummary } from "../../types";
import type { OverviewWidget, WidgetKind } from "./layout";

export const analyticsWidgetKinds = new Set<WidgetKind>(["coverage", "critical_missed", "criterion", "quality_delta", "matrix", "speech"]);
export function analyticsWidgetAvailable(kind: WidgetKind, caps?: AnalyticsCapabilities) {
  if (kind === "coverage") return true;
  if (!caps) return false;
  const analytics = caps.scope === "personal" ? caps.personal_progress_enabled : caps.team_analytics_enabled || caps.role === "employee";
  return kind === "matrix" ? analytics && caps.scope === "company" && caps.team_analytics_enabled && caps.can_view_employees && !caps.own_profile_only : analytics;
}
export type AnalyticsWidgetData = {
  summary?: AnalyticsSummary;
  criterion?: AnalyticsCriterionRow;
  matrix?: AnalyticsMatrixResponse;
  profile?: AnalyticsProfile;
  error?: string;
  unavailable?: string;
  needsSource?: boolean;
};
type Client = Pick<typeof api, "getAnalyticsCriteria" | "getAnalyticsMatrix" | "getAnalyticsProfile" | "getAnalyticsSummary">;

/** Existing analytics endpoints own authorization, sample suppression and period comparisons. */
export async function loadAnalyticsWidgets(
  widgets: OverviewWidget[], filters: AnalyticsFilters, caps: AnalyticsCapabilities | undefined,
  client: Client, summary?: Promise<AnalyticsSummary>,
): Promise<Record<string, AnalyticsWidgetData>> {
  const result: Record<string, AnalyticsWidgetData> = {};
  let criteria: ReturnType<Client["getAnalyticsCriteria"]> | undefined;
  let sharedSummary = summary;
  const profiles = new Map<string, ReturnType<Client["getAnalyticsProfile"]>>();
  const matrices = new Map<string, ReturnType<Client["getAnalyticsMatrix"]>>();
  const queue = widgets.filter(w => analyticsWidgetKinds.has(w.kind));
  async function load(w: OverviewWidget): Promise<AnalyticsWidgetData> {
    if (w.kind === "coverage") return {};
    if (!analyticsWidgetAvailable(w.kind, caps)) return { unavailable: "Этот источник аналитики недоступен в выбранной области." };
    if (w.kind === "critical_missed" || w.kind === "quality_delta") {
      sharedSummary ??= client.getAnalyticsSummary(filters);
      return { summary: await sharedSummary };
    }
    if (w.kind === "criterion") {
      if (!w.criterion_key) return { needsSource: true };
      criteria ??= client.getAnalyticsCriteria(filters);
      const row = (await criteria).criteria.find(row => row.criterion_key === w.criterion_key);
      return row ? { criterion: row } : { unavailable: "За выбранный период нет оценок этого критерия или он недоступен." };
    }
    if (w.kind === "matrix") {
      if (!w.instruction_uuid) return { needsSource: true };
      if (!matrices.has(w.instruction_uuid)) matrices.set(w.instruction_uuid, client.getAnalyticsMatrix({ ...filters, instruction_uuid: w.instruction_uuid }));
      return { matrix: await matrices.get(w.instruction_uuid)! };
    }
    const employee = caps?.scope === "company" && caps.can_view_employees && !caps.own_profile_only ? w.employee_uuid ?? "me" : "me";
    // A saved foreign employee selection must never silently become the viewer's own metrics.
    if (w.employee_uuid && employee === "me") return { unavailable: "Выбранный сотрудник недоступен. Выберите свои звонки в настройках." };
    if (!profiles.has(employee)) profiles.set(employee, client.getAnalyticsProfile(employee, filters));
    return { profile: await profiles.get(employee)! };
  }
  async function worker() {
    while (queue.length) {
      const w = queue.shift()!;
      try { result[w.id] = await load(w); }
      catch (error) { result[w.id] = { error: error instanceof Error ? error.message : "Не удалось загрузить показатели" }; }
    }
  }
  await Promise.all([worker(), worker()]);
  return result;
}

export function coveragePercent(analyzed?: number, total?: number): number | null {
  return total !== undefined && total > 0 && analyzed !== undefined && analyzed >= 0 && analyzed <= total ? 100 * analyzed / total : null;
}
export function comparableDelta(summary: AnalyticsSummary) {
  return summary.delta.comparable && !summary.delta.criteria_changed && summary.sample !== "none" && summary.sample !== "low" ? summary.delta.value : null;
}
export function matrixPageSize(width: number, height: number) {
  const labels = height >= 150 && width >= 220;
  const columns = Math.max(1, Math.min(8, Math.floor((width - (labels ? 105 : 0)) / 54)));
  const chrome = height < 115 ? 64 : height < 150 ? 85 : height < 240 ? 130 : 200;
  const rows = Math.max(1, Math.min(20, Math.floor((height - chrome) / 30)));
  return { columns, rows, labels };
}
export function speechMetrics(speech: AnalyticsSpeech | null | undefined) {
  const number = (n: number, digits = 0) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
  return [
    { key: "share", title: "Доля речи", value: speech?.talk_share == null ? "—" : `${number(speech.talk_share * 100, 1)}%`, raw: speech?.talk_share == null ? null : speech.talk_share * 100 },
    { key: "pace", title: "Темп речи", value: speech?.words_per_minute == null ? "—" : `${number(speech.words_per_minute)} слов/мин`, raw: null },
    { key: "pause", title: "Пауза ответа", value: speech?.response_pause_median_ms == null ? "—" : `${number(speech.response_pause_median_ms / 1000, 1)} с`, raw: null },
    { key: "monologue", title: "Длиннейший монолог", value: speech?.longest_monologue_seconds == null ? "—" : `${number(speech.longest_monologue_seconds, 1)} с`, raw: null },
    { key: "questions", title: "Вопросы", value: speech?.questions_per_hour == null ? "—" : `${number(speech.questions_per_hour, 1)} в час`, raw: null },
  ];
}
