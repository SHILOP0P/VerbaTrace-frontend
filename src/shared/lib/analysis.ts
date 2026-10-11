import type { AnalysisEvidence, AnalysisResponse, AnalysisV3Result, AnalysisProgress } from "../../types";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAnalysisDone(analysis?: AnalysisResponse) { return analysis?.status === "done"; }
export function analysisRecord(analysis?: AnalysisResponse): Record<string, unknown> {
  return isPlainRecord(analysis?.result_json) ? analysis.result_json : {};
}
export function analysisFormatError(analysis?: AnalysisResponse) {
  if (!analysis || !analysis.result_json) return undefined;
  return analysisV3Result(analysis) ? undefined : "Формат анализа не поддерживается. Запустите новый анализ по действующим критериям.";
}
export function analysisScore100(analysis?: AnalysisResponse) {
  const value = analysisV3Result(analysis);
  const score = value?.overall_score ?? null;
  return { score, scale:100, label:value?.overall_score_label || "Нет активных оценок", percent:score === null ? 0 : clampPercent(score) };
}
export function analysisNextStep(analysis?: AnalysisResponse) {
  const value=analysisV3Result(analysis);
  const id=value?.priority_recommendation_ids[0];
  const next=value?.recommendations.find(item=>item.id===id) ?? value?.recommendations[0];
  return next?.action || "После анализа здесь появится рекомендуемое действие.";
}
export function evidenceList(value: unknown): AnalysisEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];
    const quote = stringValue(item.quote);
    const matchStatus = stringValue(item.match_status);
    if (!quote || !matchStatus) return [];
    const evidence: AnalysisEvidence = { quote, match_status: matchStatus };
    const start = finiteNumber(item.start_seconds);
    const end = finiteNumber(item.end_seconds);
    const wordStart = integerValue(item.word_start_index);
    const wordEnd = integerValue(item.word_end_index);
    if (start !== null) evidence.start_seconds = start;
    if (end !== null) evidence.end_seconds = end;
    if (wordStart !== null) evidence.word_start_index = wordStart;
    if (wordEnd !== null) evidence.word_end_index = wordEnd;
    const speaker = stringValue(item.speaker);
    if (speaker) evidence.speaker = speaker;
    return [evidence];
  });
}


export function analysisProgress(analysis?: AnalysisResponse): AnalysisProgress | undefined {
  if (analysis?.status === "stale") return undefined;
  const raw = analysisRecord(analysis).progress;
  if (!isPlainRecord(raw) || !["inventory", "answers", "validation", "complete"].includes(String(raw.stage))) return undefined;
  const count = (key: string) => Math.max(0, integerValue(raw[key]) ?? 0);
  return { stage: raw.stage as AnalysisProgress["stage"], windows_done: count("windows_done"), windows_total: count("windows_total"), items_done: count("items_done"), items_total: count("items_total"), questions_found: count("questions_found") };
}


export function analysisV3Result(analysis?: AnalysisResponse): AnalysisV3Result | null {
  const record = analysisRecord(analysis);
  if (record.schema_version !== 3 || record.prompt_version !== "universal-v3.2" || !Array.isArray(record.items)) return null;
  if (record.scorecard_mode !== "fixed" && record.scorecard_mode !== "none") return null;
  const seen = new Set<string>();
  for (const raw of record.items) {
    if (!isPlainRecord(raw) || !stringValue(raw.id) || !stringValue(raw.title) || seen.has(String(raw.id)) || !["question","episode","requirement"].includes(String(raw.kind))) return null;
    seen.add(String(raw.id));
    if (raw.kind === "requirement" && (!uuidPattern.test(String(raw.criterion_key)) || !uuidPattern.test(String(raw.scorecard_uuid)))) return null;
  }
  const items = record.items.flatMap((raw): AnalysisV3Result["items"] => {
    if (!isPlainRecord(raw)) return [];
    const id = stringValue(raw.id), title = stringValue(raw.title), kind = stringValue(raw.kind);
    if (!id || !title || !["question", "episode", "requirement"].includes(kind ?? "")) return [];
    const gaps = Array.isArray(raw.gaps) ? raw.gaps.flatMap((gap) => {
      if (!isPlainRecord(gap)) return [];
      const text = stringValue(gap.text), basis = stringValue(gap.basis);
      return text && (basis === "instruction" || basis === "explicit_question") ? [{text, basis: basis as "instruction" | "explicit_question", explanation:stringValue(gap.explanation) ?? "", affects_score:Boolean(gap.affects_score)}] : [];
    }) : [];
    return [{
      processing_status: raw.processing_status === "pending" ? "pending" : "ready", question_parts: stringList(raw.question_parts),
      id, kind: kind as AnalysisV3Result["items"][number]["kind"], title, topic:stringValue(raw.topic) ?? "", order:integerValue(raw.order) ?? 0, question_speaker:stringValue(raw.question_speaker),
      asked:typeof raw.asked === "boolean" ? raw.asked : null,
      information_status:(stringValue(raw.information_status) as AnalysisV3Result["items"][number]["information_status"]) ?? null,
      fulfilled_earlier:Boolean(raw.fulfilled_earlier), answer_summary:stringValue(raw.answer_summary) ?? null,
      status:(stringValue(raw.status) as AnalysisV3Result["items"][number]["status"]) ?? "not_assessed",
      weight:finiteNumber(raw.weight) ?? 1, score:finiteNumber(raw.score), explanation:stringValue(raw.explanation) ?? "", strengths:stringList(raw.strengths), gaps,
      improvement_kind:(stringValue(raw.improvement_kind) as AnalysisV3Result["items"][number]["improvement_kind"]) ?? "not_needed",
      improvement:stringValue(raw.improvement) ?? null, evidence:evidenceList(raw.evidence), instruction_sources:stringList(raw.instruction_sources), instruction_titles:stringList(raw.instruction_titles),
      inactive:raw.inactive===true,requirement:stringValue(raw.requirement),applicability:stringValue(raw.applicability),depth:stringValue(raw.depth),criterion_key:stringValue(raw.criterion_key), scorecard_uuid:stringValue(raw.scorecard_uuid), is_critical:raw.is_critical === true,human_quote:stringValue(raw.human_quote)
    }];
  }).sort((a,b)=>a.order-b.order);
  const coverage = recordField(record,"coverage");
  const recommendations = Array.isArray(record.recommendations) ? record.recommendations.flatMap((raw): AnalysisV3Result["recommendations"] => {
    if (!isPlainRecord(raw) || !stringValue(raw.id) || !stringValue(raw.title)) return [];
    return [{id:stringValue(raw.id)!, title:stringValue(raw.title)!, action:stringValue(raw.action) ?? "", reason:stringValue(raw.reason) ?? "", expected_result:stringValue(raw.expected_result) ?? "", item_ids:stringList(raw.item_ids), affects_score:Boolean(raw.affects_score), importance:finiteNumber(raw.importance) ?? 1, impact:finiteNumber(raw.impact), repetition:finiteNumber(raw.repetition) ?? 1, priority_score:finiteNumber(raw.priority_score), priority:(stringValue(raw.priority) as AnalysisV3Result["recommendations"][number]["priority"]) ?? "unresolved"}];
  }) : [];
  return {
    progress: analysisProgress(analysis),
    schema_version:3, prompt_version:stringValue(record.prompt_version) ?? "", conversation_types:stringList(record.conversation_types), purpose:stringValue(record.purpose) ?? null,
    summary:stringValue(record.summary) ?? "", outcome:stringValue(record.outcome) ?? null, strengths:stringList(record.strengths), work_on:stringList(record.work_on),
    coverage:{status:coverage?.status === "complete" ? "complete" : "partial", actual_question_count:integerValue(coverage?.actual_question_count) ?? 0, analyzed_actual_question_count:integerValue(coverage?.analyzed_actual_question_count) ?? 0, required_question_count:integerValue(coverage?.required_question_count) ?? 0, complete_without_separate_question:integerValue(coverage?.complete_without_separate_question) ?? 0, limitations:stringList(coverage?.limitations)},
    overall_score:finiteNumber(record.overall_score), overall_score_label:stringValue(record.overall_score_label) ?? "", items, recommendations, priority_recommendation_ids:stringList(record.priority_recommendation_ids),
    scorecard_mode:(["fixed","none"].includes(stringValue(record.scorecard_mode) ?? "") ? stringValue(record.scorecard_mode) as AnalysisV3Result["scorecard_mode"] : undefined)
  };
}


export function recordField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isPlainRecord(value) ? value : undefined;
}


export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


export function stringValue(value: unknown) {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}


export function stringList(value: unknown) {
  if (typeof value === "string") {
    const item = stringValue(value);
    return item ? [item] : [];
  }

  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const text = stringValue(item);
    return text ? [text] : [];
  });
}


export function enumLabel(value: string | undefined, labels: Record<string, string>) {
  if (!value) return undefined;
  // An unknown machine code (snake_case) is a key, not a word for a reader;
  // the caller's fallback text reads better than "partially_answered".
  return labels[value] ?? (/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(value) ? undefined : value);
}

/** Readable names of the legacy issue codes; codes without one are not shown. */


export function formatScore(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(".", ",");
}


function numberValue(value: unknown) {
  return finiteNumber(value);
}


function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}


function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}


function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
