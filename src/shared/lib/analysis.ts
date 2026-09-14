import type {
  AnalysisEvidence,
  AnalysisResponse,
  AnalysisV2CriteriaResult,
  AnalysisV2Question,
  AnalysisV2Result,
  AnalysisV3Result,
  AnalysisProgress
} from "../../types";

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

export type AnalysisQuestion = {
  question?: string;
  managerAnswer?: string;
  answerStatus?: string;
  evidenceQuotes: string[];
  evidence: AnalysisEvidence[];
};

export type AnalysisDetails = {
  summary: string;
  topics: string[];
  nextSteps: string[];
  dialogueTone: {
    overall?: string;
    manager?: string;
    client?: string;
    evidenceQuotes: string[];
    evidence: AnalysisEvidence[];
  };
  clientQuestions: AnalysisQuestion[];
  questionCoverage: {
    status?: string;
    summary?: string;
    unansweredQuestions: string[];
  };
  managerQuality: {
    strengths: string[];
    issues: string[];
    recommendations: string[];
  };
  callOutcome?: string;
  customerObjections: string[];
  risks: string[];
  confidence?: string;
};

export type AnalysisAdditionalField = {
  label: string;
  value: string | string[];
};

export const answerStatusLabels: Record<string, string> = {
  answered: "Ответ дан",
  partially_answered: "Частично отвечено",
  not_answered: "Нет ответа",
  unclear: "Неясно"
};

export const coverageStatusLabels: Record<string, string> = {
  answered: "Все вопросы закрыты",
  partially_answered: "Часть вопросов закрыта",
  not_answered: "Вопросы не закрыты",
  no_questions: "Вопросов не было",
  unclear: "Неясно"
};

export const criteriaStatusLabels: Record<string, string> = {
  met: "Выполнено",
  partially_met: "Частично",
  missed: "Пропущено",
  not_applicable: "Не применимо",
  unclear: "Неясно"
};

export const businessOutcomeLabels: Record<string, string> = {
  success: "Успех",
  follow_up_needed: "Нужен следующий контакт",
  no_decision: "Без решения",
  lost: "Потеряно",
  support_resolved: "Поддержка решена",
  not_call: "Не звонок",
  unclear: "Неясно"
};

export const lostReasonLabels: Record<string, string> = {
  price: "Цена",
  timing: "Сроки",
  no_need: "Нет потребности",
  competitor: "Конкурент",
  no_next_step: "Нет следующего шага",
  unclear_value: "Ценность не раскрыта",
  bad_fit: "Не подходит",
  not_applicable: "Не применимо",
  unclear: "Неясно"
};

export const confidenceLabels: Record<string, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая"
};

export const priorityLabels: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий"
};

export const severityLabels: Record<string, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая"
};

export const signalLevelLabels: Record<string, string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
  unclear: "Неясно"
};

export function isAnalysisDone(analysis?: AnalysisResponse) {
  return analysis?.status === "done";
}

export function analysisRecord(analysis?: AnalysisResponse) {
  const persistedResult = unwrapEmbeddedAnalysisRecord(recordFromUnknown(analysis?.result_json));
  if (persistedResult) return persistedResult;

  const malformedPersistedResult = recoverMalformedAnalysisRecord(analysis?.result_json);
  if (malformedPersistedResult) return malformedPersistedResult;

  // Older completed analyses may have their JSON in result_text after a provider
  // response was persisted before result_json. Render that payload structurally
  // instead of exposing raw JSON to the user.
  const fallback = unwrapEmbeddedAnalysisRecord(recordFromUnknown(analysis?.result_text));
  if (fallback) return fallback;

  const malformedFallback = recoverMalformedAnalysisRecord(analysis?.result_text);
  if (malformedFallback) return malformedFallback;

  return {};
}

export function analysisFormatError(analysis?: AnalysisResponse) {
  return stringValue(analysisRecord(analysis).analysis_format_error);
}

export function analysisV2Result(analysis?: AnalysisResponse): AnalysisV2Result | null {
  const record = analysisRecord(analysis);
  const criteria = criteriaResultList(record.criteria_results);
  const schemaVersion = numberValue(record.schema_version);
  const scoreScale = numberValue(record.score_scale);
  const looksLikeV2 = schemaVersion === 2 || (scoreScale === 100 && criteria.length > 0);

  if (!looksLikeV2) return null;

  const dialogueTone = recordField(record, "dialogue_tone");
  const questionCoverage = recordField(record, "question_coverage");
  const managerQuality = recordField(record, "manager_quality");
  const scoreBreakdown = recordField(record, "score_breakdown");
  const pointsAwarded = numberValue(scoreBreakdown?.points_awarded) ?? 0;
  const pointsPossible = numberValue(scoreBreakdown?.points_possible) ?? 0;
  const scoreFromBreakdown = pointsPossible > 0 ? Math.round((pointsAwarded / pointsPossible) * 100) : null;
  const nextStepQuality = recordField(record, "next_step_quality");
  const businessOutcome = recordField(record, "business_outcome");
  const customerSignals = recordField(record, "customer_signals");

  return {
    schema_version: 2,
    summary: stringValue(record.summary) ?? "",
    topics: stringList(record.topics),
    dialogue_tone: {
      overall: stringValue(dialogueTone?.overall) ?? "",
      manager: stringValue(dialogueTone?.manager) ?? "",
      client: stringValue(dialogueTone?.client) ?? "",
      evidence_quotes: stringList(dialogueTone?.evidence_quotes),
      evidence: evidenceList(dialogueTone?.evidence)
    },
    client_questions: v2QuestionList(record.client_questions),
    question_coverage: {
      status: stringValue(questionCoverage?.status) ?? "",
      summary: stringValue(questionCoverage?.summary) ?? "",
      unanswered_questions: stringList(questionCoverage?.unanswered_questions)
    },
    manager_quality: {
      strengths: stringList(managerQuality?.strengths),
      issues: stringList(managerQuality?.issues),
      recommendations: stringList(managerQuality?.recommendations)
    },
    call_outcome: stringValue(record.call_outcome) ?? "",
    score: numberValue(record.score) ?? scoreFromBreakdown ?? 0,
    score_scale: scoreScale ?? 100,
    score_breakdown: {
      points_awarded: pointsAwarded,
      points_possible: pointsPossible,
      applicable_criteria_count: numberValue(scoreBreakdown?.applicable_criteria_count) ?? criteria.length,
      total_criteria_count: numberValue(scoreBreakdown?.total_criteria_count) ?? criteria.length
    },
    criteria_results: criteria,
    customer_objections: stringList(record.customer_objections),
    risks: stringList(record.risks),
    next_steps: stringList(record.next_steps),
    next_step: stringValue(record.next_step) ?? "",
    next_step_quality: {
      has_next_step: booleanValue(nextStepQuality?.has_next_step),
      specific: booleanValue(nextStepQuality?.specific),
      has_deadline: booleanValue(nextStepQuality?.has_deadline),
      has_responsible_person: booleanValue(nextStepQuality?.has_responsible_person)
    },
    business_outcome: {
      status: stringValue(businessOutcome?.status) ?? "",
      summary: stringValue(businessOutcome?.summary) ?? "",
      lost_reason: stringValue(businessOutcome?.lost_reason) ?? ""
    },
    customer_signals: {
      intent: stringValue(customerSignals?.intent) ?? "",
      urgency: stringValue(customerSignals?.urgency) ?? "",
      budget_discussed: booleanValue(customerSignals?.budget_discussed),
      decision_maker_present: booleanValue(customerSignals?.decision_maker_present)
    },
    issue_codes: stringList(record.issue_codes),
    evidence_quotes: stringList(record.evidence_quotes),
    evidence: evidenceList(record.evidence),
    confidence: stringValue(record.confidence) ?? ""
  };
}

export function analysisProgress(analysis?: AnalysisResponse): AnalysisProgress | undefined {
  const raw = analysisRecord(analysis).progress;
  if (!isPlainRecord(raw) || !["inventory", "answers", "validation", "complete"].includes(String(raw.stage))) return undefined;
  const count = (key: string) => Math.max(0, integerValue(raw[key]) ?? 0);
  return { stage: raw.stage as AnalysisProgress["stage"], windows_done: count("windows_done"), windows_total: count("windows_total"), items_done: count("items_done"), items_total: count("items_total"), questions_found: count("questions_found") };
}

export function analysisV3Result(analysis?: AnalysisResponse): AnalysisV3Result | null {
  const record = analysisRecord(analysis);
  if (numberValue(record.schema_version) !== 3 || !Array.isArray(record.items)) return null;
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
      improvement:stringValue(raw.improvement) ?? null, evidence:evidenceList(raw.evidence), instruction_sources:stringList(raw.instruction_sources)
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
    overall_score:finiteNumber(record.overall_score), overall_score_label:stringValue(record.overall_score_label) ?? "", items, recommendations, priority_recommendation_ids:stringList(record.priority_recommendation_ids)
  };
}

export function analysisScore100(analysis?: AnalysisResponse): {
  score: number | null;
  scale: number;
  label: string;
  percent: number;
} {
  const v2 = analysisV2Result(analysis);
  const v2Score = v2 ? finiteNumber(v2.score) : null;
  const v2Scale = v2 ? finiteNumber(v2.score_scale) ?? 100 : 100;

  if (v2 && v2Score !== null) {
    const scale = v2Scale > 0 ? v2Scale : 100;
    return {
      score: v2Score,
      scale,
      label: `${formatScore(v2Score)} / ${scale}`,
      percent: clampPercent((v2Score / scale) * 100)
    };
  }

  const record = analysisRecord(analysis);
  const rawScore = firstNumber(record, ["quality_score", "score", "overall_score", "manager_score"]);

  if (rawScore === null) {
    return {
      score: null,
      scale: 100,
      label: "Нет данных",
      percent: 0
    };
  }

  const normalized = rawScore <= 5 ? rawScore * 20 : rawScore;
  return {
    score: normalized,
    scale: 100,
    label: `${formatScore(normalized)} / 100`,
    percent: clampPercent(normalized)
  };
}

export function analysisSummary(analysis?: AnalysisResponse) {
  const record = analysisRecord(analysis);
  const summary = stringValue(record.summary);
  if (summary) return summary;
  return analysis?.result_text ?? "Анализ появится здесь после обработки звонка.";
}

export function analysisTopics(analysis?: AnalysisResponse) {
  return stringList(analysisRecord(analysis).topics);
}

export function analysisNextStep(analysis?: AnalysisResponse) {
  const record = analysisRecord(analysis);
  const nextStep = stringValue(record.next_step);
  if (nextStep) return nextStep;

  const nextSteps = stringList(record.next_steps);
  if (nextSteps.length > 0) return nextSteps[0];

  return "После анализа здесь появится рекомендуемое действие.";
}

export function analysisDetails(analysis?: AnalysisResponse): AnalysisDetails {
  const record = analysisRecord(analysis);
  const dialogueTone = recordField(record, "dialogue_tone");
  const questionCoverage = recordField(record, "question_coverage");
  const managerQuality = recordField(record, "manager_quality");
  const nextSteps = stringList(record.next_steps);
  const legacyNextStep = stringValue(record.next_step);

  return {
    summary: analysisSummary(analysis),
    topics: analysisTopics(analysis),
    nextSteps: nextSteps.length > 0 ? nextSteps : legacyNextStep ? [legacyNextStep] : [],
    dialogueTone: {
      overall: stringValue(dialogueTone?.overall),
      manager: stringValue(dialogueTone?.manager),
      client: stringValue(dialogueTone?.client),
      evidenceQuotes: stringList(dialogueTone?.evidence_quotes),
      evidence: evidenceList(dialogueTone?.evidence)
    },
    clientQuestions: questionList(record.client_questions),
    questionCoverage: {
      status: stringValue(questionCoverage?.status),
      summary: stringValue(questionCoverage?.summary),
      unansweredQuestions: stringList(questionCoverage?.unanswered_questions)
    },
    managerQuality: {
      strengths: stringList(managerQuality?.strengths),
      issues: stringList(managerQuality?.issues),
      recommendations: stringList(managerQuality?.recommendations)
    },
    callOutcome: stringValue(record.call_outcome),
    customerObjections: stringList(record.customer_objections),
    risks: stringList(record.risks),
    confidence: stringValue(record.confidence)
  };
}

// Composed prompt profiles may add their own fields without changing the core
// analysis contract. Preserve those values for the renderer instead of silently
// dropping them when a new profile is introduced.
export function analysisAdditionalFields(analysis?: AnalysisResponse): AnalysisAdditionalField[] {
  const record = analysisRecord(analysis);
  const knownKeys = new Set([
    "schema_version", "summary", "topics", "dialogue_tone", "client_questions",
    "question_coverage", "manager_quality", "call_outcome", "score", "score_scale",
    "score_breakdown", "criteria_results", "customer_objections", "risks", "next_steps",
    "next_step", "next_step_quality", "business_outcome", "customer_signals", "issue_codes",
    "evidence_quotes", "confidence", "raw_response"
  ]);

  return Object.entries(record).flatMap<AnalysisAdditionalField>(([key, value]) => {
    if (knownKeys.has(key)) return [];
    const text = stringValue(value);
    if (text) return [{ label: humanizeAnalysisKey(key), value: text }];
    const items = stringList(value);
    if (items.length > 0) return [{ label: humanizeAnalysisKey(key), value: items }];
    if (isPlainRecord(value)) {
      const nested = Object.entries(value).flatMap(([nestedKey, nestedValue]) => {
        const nestedText = stringValue(nestedValue);
        const nestedItems = stringList(nestedValue);
        if (nestedText) return [`${humanizeAnalysisKey(nestedKey)}: ${nestedText}`];
        if (nestedItems.length > 0) return [`${humanizeAnalysisKey(nestedKey)}: ${nestedItems.join("; ")}`];
        return [];
      });
      return nested.length > 0 ? [{ label: humanizeAnalysisKey(key), value: nested }] : [];
    }
    return [];
  });
}

export function questionList(value: unknown): AnalysisQuestion[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];

    const question: AnalysisQuestion = {
      question: stringValue(item.question),
      managerAnswer: stringValue(item.manager_answer),
      answerStatus: stringValue(item.answer_status),
      evidenceQuotes: stringList(item.evidence_quotes),
      evidence: evidenceList(item.evidence)
    };

    if (
      !question.question &&
      !question.managerAnswer &&
      !question.answerStatus &&
      question.evidenceQuotes.length === 0 &&
      question.evidence.length === 0
    ) {
      return [];
    }

    return [question];
  });
}

export function recordField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isPlainRecord(value) ? value : undefined;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordFromUnknown(value: unknown): Record<string, unknown> | undefined {
  let candidate = value;
  // Some providers serialize their structured result twice. Decode a bounded
  // number of times so both an object and a JSON string use the structured view.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (isPlainRecord(candidate)) return candidate;
    if (typeof candidate !== "string") return undefined;
    try {
      candidate = JSON.parse(candidate.trim());
    } catch {
      return undefined;
    }
  }
  return isPlainRecord(candidate) ? candidate : undefined;
}

function unwrapEmbeddedAnalysisRecord(record?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!record) return undefined;

  // A provider can return the complete structured document as `summary` of an
  // outer response. Check it before accepting the outer schema marker: some
  // saved responses have `schema_version: 2` both outside and inside the
  // serialized summary, and returning early would expose the JSON verbatim.
  const embedded = recordFromUnknown(record.summary);
  if (embedded && hasStructuredAnalysisFields(embedded)) return embedded;

  const recovered = recoverMalformedAnalysisRecord(record.summary);
  if (recovered) return recovered;

  return record;
}

function recoverMalformedAnalysisRecord(value: unknown): Record<string, unknown> | undefined {
  const content = typeof value === "string"
    ? value.trim()
    : isPlainRecord(value) ? stringValue(value.summary) : undefined;

  if (!content || !looksLikeIncompleteStructuredAnalysis(content)) return undefined;

  return {
    summary: extractJSONStringField(content, "summary") ?? "Провайдер не завершил структурированный анализ.",
    analysis_format_error: "Провайдер вернул оборванный структурированный ответ. Запустите анализ повторно."
  };
}

function looksLikeIncompleteStructuredAnalysis(content: string) {
  const trimmed = content.trim();
  return trimmed.startsWith("{") &&
    (trimmed.includes('"schema_version"') || trimmed.includes('"criteria_results"'));
}

function extractJSONStringField(content: string, key: string) {
  const match = content.match(new RegExp(`"${key}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`));
  if (!match) return undefined;

  try {
    return stringValue(JSON.parse(match[1]));
  } catch {
    return undefined;
  }
}

function hasStructuredAnalysisFields(record: Record<string, unknown>) {
  return (
    numberValue(record.schema_version) === 2 ||
    numberValue(record.score_scale) === 100 ||
    Array.isArray(record.criteria_results) ||
    Array.isArray(record.topics)
  );
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
  return labels[value] ?? value;
}

export function formatScore(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(".", ",");
}

function v2QuestionList(value: unknown): AnalysisV2Question[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];

    const question = {
      question: stringValue(item.question) ?? "",
      manager_answer: stringValue(item.manager_answer) ?? "",
      answer_status: stringValue(item.answer_status) ?? "",
      evidence_quotes: stringList(item.evidence_quotes),
      evidence: evidenceList(item.evidence)
    };

    if (
      !question.question &&
      !question.manager_answer &&
      !question.answer_status &&
      question.evidence_quotes.length === 0
    ) {
      return [];
    }

    return [question];
  });
}

function criteriaResultList(value: unknown): AnalysisV2CriteriaResult[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isPlainRecord(item)) return [];

    const status = stringValue(item.status) ?? "unclear";
    if (status === "not_applicable") return [];

    const result = {
      code: stringValue(item.code) ?? "",
      title: stringValue(item.title) ?? stringValue(item.code) ?? "Критерий",
      topic: stringValue(item.topic) ?? stringValue(item.title) ?? "Не указано",
      status,
      points_awarded: numberValue(item.points_awarded) ?? 0,
      points_max: numberValue(item.points_max) ?? 0,
      score: numberValue(item.score) ?? 0,
      quote: stringValue(item.quote) ?? stringList(item.evidence_quotes)[0] ?? "Не указано",
      evidence_quotes: stringList(item.evidence_quotes),
      evidence: evidenceList(item.evidence),
      issue: stringValue(item.issue) ?? "",
      explanation: stringValue(item.explanation) ?? stringValue(item.issue) ?? "",
      recommendation: stringValue(item.recommendation) ?? "",
      effective_source: stringValue(item.effective_source) ?? undefined
    };

    if (!result.code && !result.title && !result.status) return [];
    return [result];
  });
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = finiteNumber(record[key]);
    if (value !== null) return value;
  }

  return null;
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

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function humanizeAnalysisKey(key: string) {
  return key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}
