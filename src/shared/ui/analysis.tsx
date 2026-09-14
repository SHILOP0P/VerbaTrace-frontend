import type {
  AnalysisEvidence,
  AnalysisResponse,
  MediaSeekTarget,
  TranscriptionSpeakerAssignment
} from "../../types";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, ChevronDown, CircleHelp, MessageSquareText, Quote, Sparkles, Target, TriangleAlert } from "lucide-react";
import { transcriptionSpeakerLabel } from "../lib/formatters";
import { maskProfanity } from "../lib/display-text";

import {
  analysisDetails,
  analysisProgress,
  analysisAdditionalFields,
  analysisFormatError,
  AnalysisQuestion,
  analysisScore100,
  analysisV2Result,
  analysisV3Result,
  answerStatusLabels,
  businessOutcomeLabels,
  confidenceLabels,
  coverageStatusLabels,
  criteriaStatusLabels,
  enumLabel,
  formatScore,
  isAnalysisDone,
  lostReasonLabels,
  signalLevelLabels
} from "../lib/analysis";
import { TextBlockSkeleton } from "./loading";

const AnalysisSpeakerAssignmentsContext = createContext<TranscriptionSpeakerAssignment[]>([]);

export function AnalysisPreview({
  analysis,
  expanded,
  loading,
  pendingMessage,
  onEvidenceActivate,
  speakerAssignments = []
}: {
  analysis?: AnalysisResponse;
  expanded: boolean;
  loading?: boolean;
  pendingMessage?: string;
  onEvidenceActivate?: (target: MediaSeekTarget) => void;
  speakerAssignments?: TranscriptionSpeakerAssignment[];
}) {
  if (loading) {
    return <TextBlockSkeleton rows={4} />;
  }

  if (!analysis || (!isAnalysisDone(analysis) && !analysisProgress(analysis))) {
    return <p className="muted">{pendingMessage ?? "Запустите анализ после готовой расшифровки."}</p>;
  }

  return (
    <div className={`analysis-preview analysis-full-text expandable-content ${expanded || !isAnalysisDone(analysis) ? "expanded" : "collapsed"}`}>
      <AnalysisSpeakerAssignmentsContext.Provider value={speakerAssignments}>
        <AnalysisStructuredView analysis={analysis} onEvidenceActivate={onEvidenceActivate} />
      </AnalysisSpeakerAssignmentsContext.Provider>
    </div>
  );
}

export function AnalysisStructuredView({ analysis, onEvidenceActivate }: { analysis?: AnalysisResponse; onEvidenceActivate?: (target: MediaSeekTarget) => void; }) {
  if (!analysis) {
    return <p className="muted">Запустите анализ после готовой расшифровки.</p>;
  }

  const details = analysisDetails(analysis);
  const formatError = analysisFormatError(analysis);
  if (formatError) {
    return (
      <div className="analysis-structured">
        <AnalysisSection title="Резюме">
          <p>{details.summary}</p>
        </AnalysisSection>
        <AnalysisSection title="Анализ не завершён">
          <p className="analysis-empty">{formatError}</p>
        </AnalysisSection>
      </div>
    );
  }

  const v2 = analysisV2Result(analysis);
  const v3 = analysisV3Result(analysis);
  if (v3) {
    return <AnalysisV3View analysis={analysis} onEvidenceActivate={onEvidenceActivate} />;
  }
  if (v2) {
    return <AnalysisV2View analysis={analysis} onEvidenceActivate={onEvidenceActivate} />;
  }

  const additionalFields = analysisAdditionalFields(analysis);

  return (
    <div className="analysis-structured">
      <AnalysisSection title="Резюме">
        <p>{details.summary}</p>
      </AnalysisSection>

      <AnalysisSection title="Ключевые темы">
        <div className="topic-list">
          {details.topics.length > 0 ? (
            details.topics.map((topic) => <span key={topic}>{topic}</span>)
          ) : (
            <span>Темы не указаны</span>
          )}
        </div>
      </AnalysisSection>

      <AnalysisSection title="Тон диалога">
        <div className="analysis-kv-grid">
          <AnalysisKeyValue label="Общий тон" value={details.dialogueTone.overall} />
          <AnalysisKeyValue label="Менеджер" value={details.dialogueTone.manager} />
          <AnalysisKeyValue label="Клиент" value={details.dialogueTone.client} />
        </div>
        <EvidenceQuotes quotes={details.dialogueTone.evidenceQuotes} evidence={details.dialogueTone.evidence} onActivate={onEvidenceActivate} />
      </AnalysisSection>

      <AnalysisSection title="Вопросы клиента и ответы менеджера">
        <AnalysisQuestionList questions={details.clientQuestions} onEvidenceActivate={onEvidenceActivate} />
      </AnalysisSection>

      <AnalysisSection title="Полнота ответов менеджера">
        <div className="analysis-kv-grid">
          <AnalysisKeyValue
            label="Статус"
            value={enumLabel(details.questionCoverage.status, coverageStatusLabels)}
          />
          <AnalysisKeyValue label="Итог" value={details.questionCoverage.summary} />
        </div>
        <AnalysisStringList
          items={details.questionCoverage.unansweredQuestions}
          emptyLabel="Незакрытые вопросы не указаны"
        />
      </AnalysisSection>

      <AnalysisSection title="Качество менеджера">
        <div className="analysis-columns">
          <div>
            <strong>Сильные стороны</strong>
            <AnalysisStringList items={details.managerQuality.strengths} emptyLabel="Не указаны" />
          </div>
          <div>
            <strong>Проблемы</strong>
            <AnalysisStringList items={details.managerQuality.issues} emptyLabel="Не указаны" />
          </div>
          <div>
            <strong>Рекомендации</strong>
            <AnalysisStringList items={details.managerQuality.recommendations} emptyLabel="Не указаны" />
          </div>
        </div>
      </AnalysisSection>

      {additionalFields.length > 0 && (
        <AnalysisSection title="Дополнительные результаты анализа">
          <div className="analysis-columns">
            {additionalFields.map((field) => (
              <div key={field.label}>
                <strong>{field.label}</strong>
                {Array.isArray(field.value) ? <AnalysisStringList items={field.value} emptyLabel="" /> : <p>{field.value}</p>}
              </div>
            ))}
          </div>
        </AnalysisSection>
      )}

      <AnalysisSection title="Итог, риски и следующие шаги">
        <div className="analysis-kv-grid">
          <AnalysisKeyValue label="Итог звонка" value={details.callOutcome} />
          <AnalysisKeyValue label="Уверенность" value={enumLabel(details.confidence, confidenceLabels)} />
        </div>
        <div className="analysis-columns">
          <div>
            <strong>Возражения клиента</strong>
            <AnalysisStringList items={details.customerObjections} emptyLabel="Не указаны" />
          </div>
          <div>
            <strong>Риски</strong>
            <AnalysisStringList items={details.risks} emptyLabel="Не указаны" />
          </div>
          <div>
            <strong>Следующие шаги</strong>
            <AnalysisStringList items={details.nextSteps} emptyLabel="Не указаны" />
          </div>
        </div>
      </AnalysisSection>
    </div>
  );
}

function AnalysisV3View({ analysis, onEvidenceActivate }: { analysis: AnalysisResponse; onEvidenceActivate?: (target: MediaSeekTarget) => void; }) {
  const speakerAssignments = useContext(AnalysisSpeakerAssignmentsContext);
  const [speakerFilter, setSpeakerFilter] = useState("all");
  const filterRef = useRef<HTMLDivElement>(null);
  const result = analysisV3Result(analysis)!;
  const inProgress = !isAnalysisDone(analysis);
  const priority = new Map(result.recommendations.map(item => [item.id, item]));
  const topRecommendations = result.priority_recommendation_ids.flatMap(id => priority.get(id) ?? []);
  const statusLabels: Record<string,string> = {met:"Выполнено",mostly_met:"Почти выполнено",partially_met:"Частично",minimally_met:"Минимально",missed:"Не выполнено",not_applicable:"Не применимо",unclear:"Недостаточно данных",conflict:"Конфликт требований",not_assessed:"Не оценено"};
  const kindLabels: Record<string,string> = {question:"Вопрос",episode:"Эпизод",requirement:"Требование"};
  const improvementLabels: Record<string,string> = {grounded_answer:"Вариант на основе инструкции",advice:"Совет по ответу",clarification_needed:"Нужно уточнить",not_needed:"Улучшение не требуется"};
  const informationLabels: Record<string,string> = {complete:"получен полностью",partial:"получен частично",absent:"не получен",declined:"участник отказался отвечать",conflicting:"ответы противоречат друг другу",unclear:"недостаточно данных"};
  const itemSpeaker = (item: typeof result.items[number]) => item.question_speaker || item.evidence[0]?.speaker || "";
  const speakers = Array.from(new Set(result.items.filter(item => item.kind === "question").map(itemSpeaker).filter(Boolean)));
  const visibleItems = result.items.filter(item => speakerFilter === "all" || (item.kind === "question" && itemSpeaker(item) === speakerFilter));
  const scored = result.items.filter(item => item.processing_status !== "pending" && item.score !== null);
  const distribution = {
    strong: scored.filter(item => item.score! >= 75).length,
    partial: scored.filter(item => item.score! >= 50 && item.score! < 75).length,
    weak: scored.filter(item => item.score! < 50).length
  };
  const displayText = (value: string) => resolveAnalysisSpeakers(cleanAnalysisText(value), speakerAssignments);
  const scoreTone = (score: number | null) => score === null ? "neutral" : score >= 75 ? "good" : score >= 50 ? "warning" : "danger";
  useLayoutEffect(() => {
    const filter = filterRef.current;
    if (!filter) return;
    const update = () => {
      const active = filter.querySelector<HTMLElement>("button.active");
      if (!active) return;
      filter.style.setProperty("--filter-left", `${active.offsetLeft}px`);
      filter.style.setProperty("--filter-width", `${active.offsetWidth}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(filter);
    return () => observer.disconnect();
  }, [speakerFilter, speakers.join("|")]);
  return <div className="analysis-structured analysis-v3">
    {inProgress && result.progress && <AnalysisProgressView progress={result.progress} failed={analysis.status === "failed" || analysis.status === "stale"} />}
    {!inProgress && <AnalysisSection title="Итог разговора">
      <div className="analysis-outcome-card"><Sparkles size={20}/><div><p>{displayText(result.summary) || "Итог не указан."}</p>{result.outcome && <p><b>Результат:</b> {displayText(result.outcome)}</p>}</div></div>
      <div className="analysis-metrics-grid">
        <div className="analysis-metric-card">
          <div className="analysis-metric-heading"><span>Общая оценка</span><strong>{result.overall_score === null ? "—" : formatScore(result.overall_score)}<small>/100</small></strong></div>
          <div className={`analysis-linear-score ${scoreTone(result.overall_score)}`}><i style={{width:`${Math.max(0, Math.min(100, result.overall_score ?? 0))}%`}} /></div>
          <small>{result.overall_score_label}</small>
        </div>
        <div className="analysis-metric-card">
          <div className="analysis-metric-heading"><span>Распределение ответов</span><strong>{scored.length}</strong></div>
          <div className="analysis-distribution" aria-label="Распределение оценок">
            {scored.length > 0 && <><i className="good" style={{width:`${distribution.strong/scored.length*100}%`}}/><i className="warning" style={{width:`${distribution.partial/scored.length*100}%`}}/><i className="danger" style={{width:`${distribution.weak/scored.length*100}%`}}/></>}
          </div>
          <div className="analysis-distribution-legend"><span className="good">Сильные {distribution.strong}</span><span className="warning">Частичные {distribution.partial}</span><span className="danger">Слабые {distribution.weak}</span></div>
        </div>
      </div>
      {(result.strengths.length > 0 || result.work_on.length > 0) && <div className="analysis-insight-grid">
        {result.strengths.length > 0 && <div className="analysis-insight good"><CheckCircle2/><div><strong>Сильные стороны</strong><AnalysisStringList items={result.strengths.map(displayText)} emptyLabel=""/></div></div>}
        {result.work_on.length > 0 && <div className="analysis-insight warning"><Target/><div><strong>Над чем поработать</strong><AnalysisStringList items={result.work_on.map(displayText)} emptyLabel="" /></div></div>}
      </div>}
      <small className="analysis-coverage">Проверено вопросов: {result.coverage.analyzed_actual_question_count} из {result.coverage.actual_question_count}{result.coverage.required_question_count > 0 ? ` · требований-вопросов: ${result.coverage.required_question_count}` : ""}{result.coverage.complete_without_separate_question > 0 ? ` · раскрыто заранее: ${result.coverage.complete_without_separate_question}` : ""}</small>
      {result.coverage.status !== "complete" && <p className="analysis-empty">Разбор неполный. Итоговая оценка не должна считаться окончательной.</p>}
      {result.coverage.limitations.length > 0 && <><strong>Ограничения анализа</strong><AnalysisStringList items={result.coverage.limitations} emptyLabel="" /></>}
    </AnalysisSection>}
    {topRecommendations.length > 0 && <AnalysisSection title="Приоритетные рекомендации"><div className="analysis-recommendations">{topRecommendations.map((item,index)=><article className={`priority-${item.priority}`} key={item.id}><div className="analysis-recommendation-rank"><span>{String(index+1).padStart(2,"0")}</span><small>приоритет</small></div><div><div className="analysis-question-heading"><strong>{displayText(item.title)}</strong><span className={`analysis-status ${item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}`}>{item.priority_score === null ? "Нужно уточнить" : `${formatScore(item.priority_score)} балла`}</span></div><p className="analysis-recommendation-action">{displayText(item.action)}</p>{item.reason && <small>{displayText(item.reason)}</small>}{item.expected_result && <div className="analysis-expected-result"><CheckCircle2 size={15}/><span>{displayText(item.expected_result)}</span></div>}</div></article>)}</div></AnalysisSection>}
    <AnalysisSection title="Подробный разбор">
      {speakers.length > 1 && <div ref={filterRef} className="analysis-speaker-filter" role="group" aria-label="Фильтр вопросов по спикеру"><i className="analysis-filter-indicator" aria-hidden="true"/><button className={speakerFilter === "all" ? "active" : ""} onClick={()=>setSpeakerFilter("all")}>Все <b>{result.items.filter(item=>item.kind==="question").length}</b></button>{speakers.map(speaker=><button key={speaker} className={speakerFilter === speaker ? "active" : ""} onClick={()=>setSpeakerFilter(speaker)}>{transcriptionSpeakerLabel(speaker, speakerAssignments)} <b>{result.items.filter(item=>item.kind==="question" && itemSpeaker(item)===speaker).length}</b></button>)}</div>}
      <div className="analysis-v3-items">{visibleItems.map(item=><details className={`analysis-v3-item ${item.processing_status === "pending" ? "is-pending" : "is-ready"}`} key={item.id}>
        <summary><span className="analysis-item-icon"><CircleHelp size={19}/></span><span className="analysis-item-title"><strong>{displayText(item.title)}</strong><small>{item.kind === "question" && itemSpeaker(item) ? transcriptionSpeakerLabel(itemSpeaker(item), speakerAssignments) : kindLabels[item.kind]}{item.fulfilled_earlier ? " · Ответ прозвучал ранее" : ""}</small></span><span className={`analysis-score-badge ${scoreTone(item.score)}`}>{item.processing_status === "pending" ? "Ожидает" : item.score === null ? statusLabels[item.status] ?? item.status : <><strong>{formatScore(item.score)}</strong><small>баллов</small></>}</span><ChevronDown className="analysis-item-chevron" size={18}/></summary>
        <div className="analysis-v3-item-body">
          {(item.question_parts?.length ?? 0) > 1 && <div className="analysis-detail-box neutral"><b>Части вопроса</b><AnalysisStringList items={item.question_parts!.map(displayText)} emptyLabel="" /></div>}
          {item.processing_status !== "pending" && item.kind === "question" && <div className="analysis-detail-box neutral"><b>Покрытие вопроса</b><p>{item.asked === true ? "Вопрос задан явно" : item.asked === false ? "Отдельный вопрос не задавался" : "Нельзя однозначно определить, задавался ли вопрос"}{item.information_status ? ` · Ответ ${informationLabels[item.information_status] ?? item.information_status}` : ""}{item.fulfilled_earlier ? " · Нужная информация прозвучала раньше и засчитана без штрафа" : ""}.</p></div>}
          {item.answer_summary && <div className="analysis-detail-box answer"><MessageSquareText/><div><b>{item.kind === "question" ? "Ответ" : "Что произошло"}</b><p>{displayText(item.answer_summary)}</p></div></div>}
          <div className="analysis-detail-box feedback"><Sparkles/><div><b>Разбор ответа</b><p>{displayText(item.explanation)}</p></div></div>
          {item.strengths.length > 0 && <div className="analysis-detail-box good"><CheckCircle2/><div><b>Что сделано хорошо</b><AnalysisStringList items={item.strengths.map(displayText)} emptyLabel="" /></div></div>}
          {item.gaps.length > 0 && <div className="analysis-detail-box warning"><TriangleAlert/><div><b>Что не раскрыто</b><ul className="analysis-list">{item.gaps.map((gap,index)=><li key={`${item.id}-gap-${index}`}><span>{displayText(gap.text)}</span>{gap.explanation && <small>{displayText(gap.explanation)}</small>}</li>)}</ul></div></div>}
          {item.improvement_kind !== "not_needed" && <div className="analysis-detail-box reference"><BookOpen/><div><b>{improvementLabels[item.improvement_kind]}</b><p>{displayText(item.improvement ?? "Недостаточно фактов для готового варианта ответа.")}</p></div></div>}
          {item.instruction_sources.length > 0 && <div className="analysis-detail-box neutral"><b>Основание в инструкции</b><AnalysisStringList items={item.instruction_sources} emptyLabel="" /></div>}
          {item.evidence.length > 0 && <div className="analysis-detail-box evidence"><Quote/><div><CriterionEvidence evidence={item.evidence} quote="" onActivate={onEvidenceActivate} /></div></div>}
        </div>
      </details>)}</div>{visibleItems.length === 0 && <p className="analysis-empty">У выбранного спикера вопросы не найдены.</p>}
    </AnalysisSection>
  </div>;
}

function AnalysisProgressView({ progress, failed }: { progress: NonNullable<ReturnType<typeof analysisProgress>>; failed: boolean }) {
  const labels = { inventory: "Находим вопросы и темы разговора", answers: "Разбираем ответы", validation: "Проверяем полноту и формируем итог", complete: "Завершаем сохранение" };
  const total = progress.stage === "inventory" ? progress.windows_total : progress.items_total;
  const done = progress.stage === "inventory" ? progress.windows_done : progress.items_done;
  return <section className="analysis-progress-panel" aria-label="Ход анализа">
    <div role="status" aria-live="polite"><strong>{failed ? "Разбор не завершён" : labels[progress.stage]}</strong>
      <p>{progress.stage === "inventory" ? `Просмотрено участков: ${done} из ${total}. Найдено вопросов: ${progress.questions_found}.` : `Готово разборов: ${done} из ${total}.`}</p>
    </div>
    {!failed && <progress max={Math.max(1, total)} value={done} aria-label="Прогресс текущего этапа" />}
    <small>{failed ? "Готовые карточки сохранены. Можно повторить анализ; общий итог пока недоступен." : "Можно раскрывать вопросы и читать готовые ответы. Итоговая оценка появится после проверки всего разговора."}</small>
  </section>;
}

function AnalysisV2View({ analysis, onEvidenceActivate }: { analysis: AnalysisResponse; onEvidenceActivate?: (target: MediaSeekTarget) => void; }) {
  const result = analysisV2Result(analysis);
  const score = analysisScore100(analysis);
  const additionalFields = analysisAdditionalFields(analysis);

  if (!result) return null;

  const outcomeItems = [
    { label: "Вердикт", value: outcomeVerdict(result.business_outcome.status, result.call_outcome) },
    { label: "Ключевой вывод", value: result.business_outcome.summary || result.call_outcome },
    {
      label: "Причина",
      value: result.business_outcome.lost_reason && result.business_outcome.lost_reason !== "not_applicable"
        ? enumLabel(result.business_outcome.lost_reason, lostReasonLabels)
        : undefined
    },
    { label: "Уверенность вывода", value: enumLabel(result.confidence, confidenceLabels) }
  ].filter((item) => hasText(item.value));
  const signalItems = [
    { label: "Интерес", value: meaningfulSignal(result.customer_signals.intent) },
    { label: "Срочность", value: meaningfulSignal(result.customer_signals.urgency) },
    { label: "Бюджет обсуждался", value: result.customer_signals.budget_discussed ? "Да" : undefined },
    { label: "ЛПР присутствовал", value: result.customer_signals.decision_maker_present ? "Да" : undefined }
  ].filter((item) => hasText(item.value));
  const nextStepItems = [
    { label: "Следующий шаг", value: result.next_step || result.next_steps[0] },
    { label: "Есть шаг", value: booleanLabel(result.next_step_quality.has_next_step) },
    { label: "Конкретный", value: booleanLabel(result.next_step_quality.specific) },
    { label: "Есть срок", value: booleanLabel(result.next_step_quality.has_deadline) },
    { label: "Есть ответственный", value: booleanLabel(result.next_step_quality.has_responsible_person) }
  ].filter((item) => hasText(item.value));
  const topicGroups = [
    { title: "Темы", items: result.topics },
    { title: "Риски", items: result.risks },
    { title: "Возражения", items: result.customer_objections }
  ].filter((group) => group.items.length > 0);

  return (
    <div className="analysis-structured analysis-v2">
      <AnalysisSection title="Резюме">
        <div className="analysis-score-summary">
          <div className="analysis-score-meter" style={{ "--analysis-score": score.percent } as React.CSSProperties}>
            <strong>{score.score === null ? "—" : formatScore(score.percent)}</strong>
            <span>/ 100</span>
          </div>
          <div>
            <p>{result.summary || "Резюме не указано."}</p>
          </div>
        </div>
      </AnalysisSection>

      {result.criteria_results.length > 0 && (
        <AnalysisSection title="Критерии качества">
          <div className="analysis-criteria-list">
            {result.criteria_results.map((criterion, index) => (
              <div className="analysis-criterion" key={`${criterion.code}-${index}`}>
                <div className="analysis-question-heading">
                  <strong>{criterion.title || criterion.code || "Критерий"}</strong>
                  <span className={`analysis-status ${criterionStatusTone(criterion.status)}`}>
                    {enumLabel(criterion.status, criteriaStatusLabels)}
                  </span>
                </div>
                <small>
                  Оценка: {formatTenPointScore(criterion.score)} / 10{criterion.effective_source && criterion.effective_source !== "ai" ? ` · ${criterion.effective_source === "human_review_2" ? "переоценка 2" : "переоценка 1"}` : ""}
                </small>
                <p><b>Тема:</b> {criterion.topic}</p>
                <CriterionEvidence evidence={criterion.evidence} quote={criterion.quote} onActivate={onEvidenceActivate} />
                {criterion.explanation && <p><b>Объяснение:</b> {criterion.explanation}</p>}
                {!criterion.explanation && criterion.issue && <p><b>Объяснение:</b> {criterion.issue}</p>}
                {criterion.recommendation && <p><b>Рекомендация:</b> {criterion.recommendation}</p>}
              </div>
            ))}
          </div>
        </AnalysisSection>
      )}

      {outcomeItems.length > 0 && (
        <AnalysisSection title="Итоговый вердикт">
          <div className="analysis-kv-grid">
            {outcomeItems.map((item) => (
              <AnalysisKeyValue key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </AnalysisSection>
      )}

      {signalItems.length > 0 && (
        <AnalysisSection title="Сигналы в разговоре">
          <div className="analysis-kv-grid">
            {signalItems.map((item) => (
              <AnalysisKeyValue key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </AnalysisSection>
      )}

      {(nextStepItems.length > 0 || result.next_steps.length > 0) && (
        <AnalysisSection title="Следующий шаг">
          {nextStepItems.length > 0 && (
            <div className="analysis-kv-grid">
              {nextStepItems.map((item) => (
                <AnalysisKeyValue key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          )}
          {result.next_steps.length > 0 && <AnalysisStringList items={result.next_steps} emptyLabel="" />}
        </AnalysisSection>
      )}

      {topicGroups.length > 0 && (
        <AnalysisSection title="Темы, риски и возражения">
          <div className="analysis-columns">
            {topicGroups.map((group) => (
              <div key={group.title}>
                <strong>{group.title}</strong>
                <AnalysisStringList items={group.items} emptyLabel="" />
              </div>
            ))}
          </div>
        </AnalysisSection>
      )}

      {result.issue_codes.length > 0 && (
        <AnalysisSection title="Проблемные коды">
          <div className="topic-list">
            {result.issue_codes.map((code) => <span key={code}>{code}</span>)}
          </div>
        </AnalysisSection>
      )}

      {additionalFields.length > 0 && (
        <AnalysisSection title="Дополнительные результаты анализа">
          <div className="analysis-columns">
            {additionalFields.map((field) => (
              <div key={field.label}>
                <strong>{field.label}</strong>
                {Array.isArray(field.value) ? <AnalysisStringList items={field.value} emptyLabel="" /> : <p>{field.value}</p>}
              </div>
            ))}
          </div>
        </AnalysisSection>
      )}
    </div>
  );
}

export function AnalysisSection({ title, children }: { title: string; children: React.ReactNode; }) {
  return (
    <section className="analysis-section">
      <strong>{title}</strong>
      {children}
    </section>
  );
}

export function AnalysisKeyValue({ label, value }: { label: string; value?: string; }) {
  return (
    <div className="analysis-kv">
      <span>{label}</span>
      <p>{value && value.trim() ? value : "Не указано"}</p>
    </div>
  );
}

export function AnalysisStringList({ items, emptyLabel }: { items: string[]; emptyLabel: string; }) {
  if (items.length === 0) {
    return <p className="analysis-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="analysis-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

export function EvidenceQuotes({ quotes, evidence = [], onActivate }: { quotes: string[]; evidence?: AnalysisEvidence[]; onActivate?: (target: MediaSeekTarget) => void; }) {
  if (quotes.length === 0 && evidence.length === 0) return null;

  return (
    <div className="evidence-quotes">
      <span>Цитаты</span>
      <EvidenceItems evidence={evidence} fallbackQuotes={quotes} onActivate={onActivate} />
    </div>
  );
}

export function AnalysisQuestionList({ questions, onEvidenceActivate }: { questions: AnalysisQuestion[]; onEvidenceActivate?: (target: MediaSeekTarget) => void; }) {
  if (questions.length === 0) {
    return <p className="analysis-empty">Вопросы клиента не указаны.</p>;
  }

  return (
    <div className="analysis-question-list">
      {questions.map((question, index) => (
        <div className="analysis-question" key={`${question.question ?? "question"}-${index}`}>
          <div className="analysis-question-heading">
            <strong>{question.question || "Вопрос не указан"}</strong>
            <span>{enumLabel(question.answerStatus, answerStatusLabels) || "Статус не указан"}</span>
          </div>
          <p>
            <b>Ответ менеджера:</b> {question.managerAnswer || "Не указан"}
          </p>
          <EvidenceQuotes quotes={question.evidenceQuotes} evidence={question.evidence} onActivate={onEvidenceActivate} />
        </div>
      ))}
    </div>
  );
}

function EvidenceItems({ evidence, fallbackQuotes, onActivate }: { evidence: AnalysisEvidence[]; fallbackQuotes: string[]; onActivate?: (target: MediaSeekTarget) => void; }) {
  const speakerAssignments = useContext(AnalysisSpeakerAssignmentsContext);
  const rawItems: AnalysisEvidence[] = evidence.length > 0
    ? evidence
    : fallbackQuotes.filter(Boolean).map((quote) => ({ quote, match_status: "legacy" } satisfies AnalysisEvidence));
  const items = compactEvidenceItems(rawItems);
  return <>{items.map((item, index) => {
    const matched = item.match_status === "matched" && typeof item.start_seconds === "number";
    const time = matched ? formatEvidenceTime(item.start_seconds!) : "";
    const speaker = item.speaker ? transcriptionSpeakerLabel(item.speaker, speakerAssignments) : "";
    if (!matched) return <blockquote key={`${item.quote}-${index}`}>{speaker && <small className="evidence-speaker">{speaker}</small>}<span>{maskProfanity(item.quote)}</span><small>Точное место не определено</small></blockquote>;
    return (
      <button
        className="evidence-link"
        type="button"
        aria-label={`Перейти к цитате на ${time}`}
        key={`${item.quote}-${index}`}
        onClick={() => onActivate?.({
          startSeconds: item.start_seconds!,
          endSeconds: item.end_seconds,
          wordStartIndex: item.word_start_index,
          wordEndIndex: item.word_end_index
        })}
      >
        <span>{speaker && <small className="evidence-speaker">{speaker}</small>}{maskProfanity(item.quote)}</span><time>{time}</time>
      </button>
    );
  })}</>;
}

function CriterionEvidence({ evidence, quote, onActivate }: { evidence: AnalysisEvidence[]; quote: string; onActivate?: (target: MediaSeekTarget) => void; }) {
  const count = compactEvidenceItems(evidence.length > 0 ? evidence : [{ quote, match_status: "legacy" }]).length;
  if (count === 0) return null;
  return (
    <div className="criterion-evidence">
      <b>{count > 1 ? "Цитаты:" : "Цитата:"}</b>
      <EvidenceItems evidence={evidence} fallbackQuotes={[quote]} onActivate={onActivate} />
    </div>
  );
}

function compactEvidenceItems(items: AnalysisEvidence[]) {
  const unique = items.filter((item, index) => {
    const key = evidenceKey(item);
    return items.findIndex((candidate) => evidenceKey(candidate) === key) === index;
  });

  return unique.filter((item, index) => {
    const normalized = normalizeEvidenceQuote(item.quote);
    if (!normalized) return false;
    return !unique.some((candidate, candidateIndex) => {
      if (candidateIndex === index || candidate.match_status !== "matched") return false;
      const nested = normalizeEvidenceQuote(candidate.quote);
      return nested.length >= 12 && normalized.length > nested.length * 1.35 && normalized.includes(nested);
    });
  });
}

function cleanAnalysisText(value: string) {
  return value
    .replace(/\s*\([sS]\d+(?:\.\d+)?\)/g, "")
    .replace(/\b[sS]\d+(?:\.\d+)?\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function resolveAnalysisSpeakers(value: string, assignments: TranscriptionSpeakerAssignment[]) {
  const resolved = assignments.reduce((text, assignment) => {
    const key = assignment.speaker_key.trim();
    const name = assignment.display_name.trim();
    if (!key || !name) return text;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const legacyName = `«${name}»`;
    const withMarker = text
      .replace(new RegExp(`\\{\\{speaker:${escaped}\\}\\}`, "gi"), name)
      .replace(new RegExp(`\\bСпикер\\s+${escaped}\\b`, "gi"), name)
    if (key === name) return withMarker;
    return withMarker
      .replace(key.length <= 3 ? new RegExp(`(^|[\\s(])Попросить\\s+${escaped}\\s+`, "g") : /$^/, `$1Запрос для участника ${legacyName}: `)
      .replace(key.length <= 3 ? new RegExp(`(опыт|достижения|ответ|ответы|оценка|позиция|слова|реплика|действия|знания)\\s+${escaped}\\b`, "gi") : /$^/, `$1 участника ${legacyName}`)
      .replace(key.length <= 3 ? new RegExp(`(у|для|от|без)\\s+${escaped}\\b`, "gi") : /$^/, `$1 участника ${legacyName}`)
      .replace(key.length <= 3 ? new RegExp(`(с)\\s+${escaped}\\b`, "gi") : /$^/, `$1 участником ${legacyName}`)
      .replace(key.length <= 3 ? new RegExp(`\\b${escaped}\\b`, "g") : /$^/, name);
  }, value);
  return resolved.replace(/\{\{speaker:([^}]+)\}\}/gi, (_, key: string) => fallbackSpeakerName(key));
}

function fallbackSpeakerName(key: string) {
  const normalized = key.trim();
  if (/^[A-Z]$/i.test(normalized)) return `Участник ${normalized.toUpperCase().charCodeAt(0) - 64}`;
  return "Участник разговора";
}

function evidenceKey(item: AnalysisEvidence) {
  return [
    normalizeEvidenceQuote(item.quote),
    item.match_status,
    item.start_seconds ?? "",
    item.end_seconds ?? "",
    item.word_start_index ?? "",
    item.word_end_index ?? ""
  ].join("|");
}

function normalizeEvidenceQuote(quote: string) {
  return quote.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function formatEvidenceTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

function hasText(value?: string) {
  return Boolean(value?.trim());
}

function booleanLabel(value?: boolean | null) {
  if (typeof value !== "boolean") return undefined;
  return value ? "Да" : "Нет";
}

function meaningfulSignal(value?: string) {
  if (!value || value === "unclear") return undefined;
  return enumLabel(value, signalLevelLabels);
}

function outcomeVerdict(status: string, fallback: string) {
  if (status && status !== "unclear") return enumLabel(status, businessOutcomeLabels);
  return fallback || undefined;
}

function formatTenPointScore(score: number, scale = 100) {
  if (!Number.isFinite(score) || !Number.isFinite(scale) || scale <= 0) return "—";
  const normalized = Math.max(0, Math.min(10, (score / scale) * 10));
  return formatScore(Math.round(normalized * 10) / 10);
}

function criterionStatusTone(status: string) {
  if (status === "met") return "ok";
  if (status === "missed") return "bad";
  if (status === "partially_met" || status === "unclear") return "warn";
  return "neutral";
}
