import { cssClass, cssStyle } from "../lib/css-styles";
import type {
  AnalysisEvidence,
  AnalysisResponse,
  MediaSeekTarget,
  TranscriptionSpeakerAssignment
} from "../../types";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CheckCircle2, ChevronDown, Info, ListChecks, Sparkles, Target } from "lucide-react";
import { transcriptionSpeakerLabel } from "../lib/formatters";
import { speakerColor } from "../lib/speaker-colors";
import { maskProfanity } from "../lib/display-text";
import { stripAnalysisRefs } from "../lib/analysis-refs";
import { pluralizeRu } from "../lib/plans";
import { ScoreGauge } from "./score-gauge";

import { analysisProgress, analysisFormatError, analysisV3Result, enumLabel, formatScore, isAnalysisDone } from "../lib/analysis";
import { TextBlockSkeleton } from "./loading";

const AnalysisSpeakerAssignmentsContext = createContext<TranscriptionSpeakerAssignment[]>([]);
const AnalysisSpeakerKeysContext = createContext<string[]>([]);

export function AnalysisPreview({
  analysis,
  expanded,
  loading,
  pendingMessage,
  onEvidenceActivate,
  speakerAssignments = [],
  speakerKeys = []
}: {
  analysis?: AnalysisResponse;
  expanded: boolean;
  loading?: boolean;
  pendingMessage?: string;
  onEvidenceActivate?: (target: MediaSeekTarget) => void;
  speakerAssignments?: TranscriptionSpeakerAssignment[];
  /** The call's speakers, so a quote's speaker has the colour the player gives them. */
  speakerKeys?: string[];
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
        <AnalysisSpeakerKeysContext.Provider value={speakerKeys}>
          <AnalysisStructuredView analysis={analysis} onEvidenceActivate={onEvidenceActivate} />
        </AnalysisSpeakerKeysContext.Provider>
      </AnalysisSpeakerAssignmentsContext.Provider>
    </div>
  );
}

export function AnalysisStructuredView({ analysis, onEvidenceActivate }: { analysis?: AnalysisResponse; onEvidenceActivate?: (target: MediaSeekTarget) => void; }) {
  if (!analysis) {
    return <p className="muted">Запустите анализ после готовой расшифровки.</p>;
  }

  const result=analysisV3Result(analysis);
  if (!result) return <p className="analysis-empty" role="alert">{analysisFormatError(analysis) || "Результат анализа пока не готов."}</p>;
  return <AnalysisV3View analysis={analysis} onEvidenceActivate={onEvidenceActivate}/>;
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
  // Card and recommendation numbers the model cites become their titles.
  const refTitles = new Map<string, string>([
    ...result.items.map((item): [string, string] => [item.id, stripAnalysisRefs(item.title)]),
    ...result.recommendations.map((item): [string, string] => [item.id, stripAnalysisRefs(item.title)])
  ]);
  const displayText = (value: string) => resolveAnalysisSpeakers(stripAnalysisRefs(value, refTitles), speakerAssignments);
  const scoreTone = (score: number | null) => score === null ? "neutral" : score >= 75 ? "good" : score >= 50 ? "warning" : "danger";
  const cardStatusLabels: Record<string, string> = { met: "выполнено", mostly_met: "в основном", partially_met: "частично", minimally_met: "минимально", missed: "пропущено", not_applicable: "не применимо", unclear: "мало данных", conflict: "конфликт требований", not_assessed: "не оценено" };
  useLayoutEffect(() => {
    const filter = filterRef.current;
    if (!filter) return;
    const update = () => {
      const active = filter.querySelector<HTMLElement>("button.active");
      if (!active) return;
      cssStyle(filter).setProperty("--filter-left", `${active.offsetLeft}px`);
      cssStyle(filter).setProperty("--filter-width", `${active.offsetWidth}px`);
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
      <div className="analysis-score-summary">
        <ScoreGauge value={result.overall_score} size={150} />
        <div className="analysis-score-summary-body">
          <span className="analysis-score-summary-title">Общая оценка</span>
          {result.overall_score === null && <small className="analysis-score-summary-note">{displayText(result.overall_score_label) || "Разобрана только часть критериев — общий балл не считается."}</small>}
          <span className="analysis-score-summary-count">{scored.length} {pluralizeRu(scored.length, "оценённый пункт", "оценённых пункта", "оценённых пунктов")}</span>
          <div className="analysis-distribution" aria-label="Распределение оценок">
            {scored.length > 0 && <><i className={["good", cssClass({width:`${distribution.strong/scored.length*100}%`})].filter(Boolean).join(" ")} /><i className={["warning", cssClass({width:`${distribution.partial/scored.length*100}%`})].filter(Boolean).join(" ")} /><i className={["danger", cssClass({width:`${distribution.weak/scored.length*100}%`})].filter(Boolean).join(" ")} /></>}
          </div>
          <div className="analysis-distribution-legend"><span className="good">Сильные <b>{distribution.strong}</b></span><span className="warning">Частичные <b>{distribution.partial}</b></span><span className="danger">Слабые <b>{distribution.weak}</b></span></div>
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
    {/* priority_score ranks the advice; printed next to the call's scores it
        read as one more score, so only its level is shown. */}
    {topRecommendations.length > 0 && <AnalysisSection title="Что сделать в первую очередь"><ol className="analysis-recommendations">{topRecommendations.map((item,index)=><li className="analysis-recommendation" key={item.id}>
      <span className="analysis-recommendation-index" aria-hidden="true">{index + 1}</span>
      <div className="analysis-recommendation-body">
        <div className="analysis-recommendation-head">
          <strong>{displayText(item.title)}</strong>
          <span className={`analysis-recommendation-priority ${item.priority}`}>{recommendationPriorityLabels[item.priority] ?? "приоритет не определён"}</span>
        </div>
        <p className="analysis-recommendation-action">{displayText(item.action)}</p>
        {item.reason && <p className="analysis-recommendation-note"><span>Почему</span>{displayText(item.reason)}</p>}
        {item.expected_result && <p className="analysis-recommendation-note is-effect"><span>Что даст</span>{displayText(item.expected_result)}</p>}
      </div>
    </li>)}</ol></AnalysisSection>}
    <AnalysisSection title="Подробный разбор">
      {speakers.length > 1 && <div ref={filterRef} className="analysis-speaker-filter" role="group" aria-label="Фильтр вопросов по спикеру"><i className="analysis-filter-indicator" aria-hidden="true"/><button className={speakerFilter === "all" ? "active" : ""} onClick={()=>setSpeakerFilter("all")}>Все <b>{result.items.filter(item=>item.kind==="question").length}</b></button>{speakers.map(speaker=><button key={speaker} className={speakerFilter === speaker ? "active" : ""} onClick={()=>setSpeakerFilter(speaker)}>{transcriptionSpeakerLabel(speaker, speakerAssignments)} <b>{result.items.filter(item=>item.kind==="question" && itemSpeaker(item)===speaker).length}</b></button>)}</div>}
      <div className="analysis-v3-items">{visibleItems.map(item=><details id={`analysis-item-${item.id}`} className={`analysis-v3-item ${item.processing_status === "pending" ? "is-pending" : "is-ready"}${item.inactive?" is-inactive":""}`} key={item.id}>
        <summary>
          <ScorePips score={item.processing_status === "pending" ? null : item.score} tone={scoreTone(item.score)} />
          <span className="analysis-item-title"><strong>{displayText(item.title)}</strong><small>{item.kind === "question" && itemSpeaker(item) ? transcriptionSpeakerLabel(itemSpeaker(item), speakerAssignments) : kindLabels[item.kind]}{item.fulfilled_earlier ? " · Ответ прозвучал ранее" : ""}</small></span>
          {item.is_critical ? <span className="analysis-critical-badge">Критичный</span> : <span aria-hidden="true" />}
          <span className={`analysis-item-score ${item.processing_status === "pending" ? "neutral" : scoreTone(item.score)}`}>
            {item.processing_status === "pending"
              ? <small>ожидает</small>
              : <><strong>{item.score === null ? "—" : formatScore(item.score)}</strong><small>{cardStatusLabels[item.status] ?? statusLabels[item.status] ?? "не оценено"}</small></>}
          </span>
          <ChevronDown className="analysis-item-chevron" size={18}/>
        </summary>
        {/* What was said and what it lacked on the left, the proof on the
            right; only the ready-made wording keeps a panel of its own. */}
        <div className="analysis-v3-item-body criterion-detail">
          <div className="criterion-detail-main">
            {item.processing_status !== "pending" && item.kind === "question" && <p className="criterion-detail-coverage">
              {[item.asked === true ? "Вопрос задан явно" : item.asked === false ? "Отдельного вопроса не было" : "Задавался ли вопрос, не ясно", item.information_status ? `ответ ${informationLabels[item.information_status] ?? "не определён"}` : "", item.fulfilled_earlier ? "информация прозвучала раньше и засчитана" : ""].filter(Boolean).join(" · ")}
            </p>}
            {item.kind === "question" && (item.question_parts?.length ?? 0) > 1 && <CriterionSection label="Части вопроса"><CriterionList items={item.question_parts!.map(displayText)} /></CriterionSection>}
            {item.inactive&&<p className="criterion-inactive-label">Критерий больше не используется и не влияет на итог</p>}{item.requirement&&<CriterionSection label="Использованное требование"><p>{item.requirement}</p></CriterionSection>}{item.answer_summary && <CriterionSection label={item.kind === "question" ? "Что ответили" : "Что произошло"}><p>{displayText(item.answer_summary)}</p></CriterionSection>}
            {item.explanation && <CriterionSection label="Разбор"><p>{displayText(item.explanation)}</p></CriterionSection>}
            {item.human_quote && <CriterionSection label="Цитата проверяющего"><blockquote>{item.human_quote}</blockquote></CriterionSection>}
            {item.strengths.length > 0 && <CriterionSection label="Что получилось"><CriterionList items={item.strengths.map(displayText)} tone="good" /></CriterionSection>}
            {item.gaps.length > 0 && <CriterionSection label="Чего не хватило"><CriterionList tone={scoreTone(item.score)} items={item.gaps.map((gap) => displayText(gap.text))} notes={item.gaps.map((gap) => gap.explanation ? displayText(gap.explanation) : "")} /></CriterionSection>}
            {/* The model sometimes writes the kind's code instead of the text;
                cleaned of it, nothing is left to show. */}
            {item.improvement_kind !== "not_needed" && displayText(item.improvement ?? "Недостаточно фактов для готового варианта ответа.") && <div className="criterion-detail-improvement"><span>{improvementLabels[item.improvement_kind]}</span><p>{displayText(item.improvement ?? "Недостаточно фактов для готового варианта ответа.")}</p></div>}
          </div>
          <div className="criterion-detail-side">
            <span className="criterion-detail-label">{item.evidence.length > 1 ? "Цитаты" : "Цитата"}</span>
            {item.evidence.length > 0
              ? <div className="criterion-detail-quotes"><EvidenceItems evidence={item.evidence} onActivate={onEvidenceActivate} /></div>
              : <p className="criterion-detail-empty">{item.processing_status === "pending" ? "Появится после разбора." : "В разговоре этого не прозвучало."}</p>}
            {item.criterion_key && item.instruction_sources[0]
              ? <button className="criterion-detail-basis" type="button" onClick={() => openInstructionCriterion(item.instruction_sources[0], item.criterion_key!)}><ListChecks size={15} aria-hidden="true" />Критерий в инструкции</button>
              : item.instruction_sources.length > 0 && <p className="criterion-detail-basis">Основание: {instructionNames(item).map((name) => `«${name}»`).join(", ")}</p>}
          </div>
        </div>
      </details>)}</div>{visibleItems.length === 0 && <p className="analysis-empty">У выбранного спикера вопросы не найдены.</p>}
    </AnalysisSection>
  </div>;
}

function CriterionSection({ label, children }: { label: string; children: React.ReactNode }) {
  return <section className="criterion-detail-section"><span className="criterion-detail-label">{label}</span>{children}</section>;
}

// A dot in the tone of the verdict marks each line; a note, when there is
// one, explains the line under it.
function CriterionList({ items, notes = [], tone = "neutral" }: { items: string[]; notes?: string[]; tone?: string }) {
  return <ul className={`criterion-detail-list ${tone}`}>
    {items.map((text, index) => <li key={`${text}-${index}`}><span>{text}</span>{notes[index] && <small>{notes[index]}</small>}</li>)}
  </ul>;
}

// The five-step scale 0/25/50/75/100 as four divisions: the status reads at a
// glance and the title, not a badge, stays the loudest thing in the row.
function ScorePips({ score, tone }: { score: number | null; tone: string }) {
  const filled = score === null ? 0 : Math.round(Math.max(0, Math.min(100, score)) / 25);
  return <span className={`analysis-score-pips ${tone}`} aria-hidden="true">
    {[0, 1, 2, 3].map((index) => <i key={index} className={index < filled ? "is-filled" : undefined} />)}
  </span>;
}

// A card names its instruction by title. Analyses saved before titles were
// stored have identifiers only, and an identifier is never shown.
function instructionNames(item: { instruction_sources: string[]; instruction_titles: string[] }) {
  return item.instruction_sources.map((_, index) => item.instruction_titles[index] || "Инструкция звонка");
}

function openInstructionCriterion(instructionId: string, criterionKey: string) {
  const query = new URLSearchParams({ tab: "criteria", criterion: criterionKey });
  window.history.pushState({}, "", `/app/instructions/${encodeURIComponent(instructionId)}?${query}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
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

function EvidenceItems({ evidence, onActivate }: { evidence: AnalysisEvidence[]; onActivate?: (target: MediaSeekTarget) => void; }) {
  const speakerAssignments = useContext(AnalysisSpeakerAssignmentsContext);
  const speakerKeys = useContext(AnalysisSpeakerKeysContext);
  const items = compactEvidenceItems(evidence);
  return <>{items.map((item, index) => {
    const matched = item.match_status === "matched" && typeof item.start_seconds === "number";
    const time = matched ? formatEvidenceTime(item.start_seconds!) : "";
    const speaker = item.speaker ? transcriptionSpeakerLabel(item.speaker, speakerAssignments) : "";
    const speakerStyle = item.speaker && speakerKeys.length > 0 ? { "--speaker-color": speakerColor(item.speaker, speakerKeys) } as CSSProperties : undefined;
    const speakerTag = speaker ? <small className={[`evidence-speaker${speakerStyle ? " has-color" : ""}`, cssClass(speakerStyle)].filter(Boolean).join(" ")} >{speaker}</small> : null;
    if (!matched) return <blockquote key={`${item.quote}-${index}`}>{speakerTag}<span>{maskProfanity(item.quote)}</span><small> · Точное место не определено</small></blockquote>;
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
        <span>{speakerTag}{maskProfanity(item.quote)}</span><time>{time}</time>
      </button>
    );
  })}</>;
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

// The same "Спикер A" the transcript and the player show for an unnamed voice.
function fallbackSpeakerName(key: string) {
  const normalized = key.trim();
  if (/^[A-Z]$/i.test(normalized)) return `Спикер ${normalized.toUpperCase()}`;
  return "Участник разговора";
}

const recommendationPriorityLabels: Record<string, string> = {
  high: "высокий приоритет",
  medium: "средний приоритет",
  low: "низкий приоритет"
};

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
