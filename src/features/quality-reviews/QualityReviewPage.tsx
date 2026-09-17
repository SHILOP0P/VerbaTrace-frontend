import { ArrowLeft, CheckCircle2, ChevronUp, Pencil, Plus, RotateCcw, Save, Send, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../api";
import type { AnalysisComment, QualityReviewCriterion, QualityReviewResponse } from "../../types";
import { FrozenRegion } from "../../shared/ui/frozen-region";
import { AnalysisComments } from "../calls/AnalysisComments";

type CriterionDraft = { key: string; title: string; custom: boolean; persistedEdited: boolean; aiScore?: number; scoreMin: number; scoreMax: number; storageMax: number; humanScore?: number; notApplicable: boolean; comment: string };

export function QualityReviewPage({ reviewId, onBack }: { reviewId: string; onBack: () => void }) {
  const [review, setReview] = useState<QualityReviewResponse>();
  const [comments, setComments] = useState<AnalysisComment[]>([]);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([]);
  const [overall, setOverall] = useState("");
  const [resolutionComment, setResolutionComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editedKeys, setEditedKeys] = useState<Set<string>>(() => new Set());
  const [selectedVersion, setSelectedVersion] = useState("active");
  const initialized = useRef("");

  async function load() {
    setLoading(true); setError("");
    try {
      const value = await api.getQualityReview(reviewId);
      setReview(value);
      const context = await api.getAnalysisReviewContext(value.call_uuid, value.analysis_uuid);
      setComments(context.comments ?? []);
    } catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [reviewId]);
  useEffect(() => {
    const source = review?.draft ?? (review?.capabilities.can_edit && (review?.revisions?.length ?? 0) === 1 ? undefined : review?.published_revision);
    const marker = review ? `${review.review_uuid}:${source?.revision_uuid ?? "source"}` : "";
    if (!review || initialized.current === marker) return;
    const nextCriteria = source?.criteria?.length ? fromStored(source.criteria, review.analysis) : fromAnalysis(review.analysis);
    setCriteria(nextCriteria);
    setEditedKeys(new Set(nextCriteria.filter(isMeaningfullyEdited).map((criterion) => criterion.key)));
    setOverall(source?.overall_comment ?? ""); setSelectedVersion("active"); setDirty(false); initialized.current = marker;
  }, [review]);
  useEffect(() => {
    if (!dirty || !review?.capabilities.can_edit) return;
    const timer = window.setTimeout(() => { void saveDraft(true); }, 1500);
    return () => window.clearTimeout(timer);
  }, [dirty, overall, criteria, review?.lock_version]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const blockers = useMemo(() => {
    const result: string[] = [];
    if (overall.trim().length > 0 && overall.trim().length < 3) result.push("Допишите итоговый комментарий");
    criteria.filter((criterion) => editedKeys.has(criterion.key)).forEach((criterion) => {
      if (criterion.custom && criterion.title.trim().length < 3) result.push("Назовите добавленный критерий");
      if (!criterion.notApplicable && criterion.humanScore === undefined) result.push(`Выставьте оценку: ${criterion.title}`);
    });
    if (overall.trim() === "" && editedKeys.size === 0) result.push("Измените хотя бы один раздел или добавьте критерий");
    return result;
  }, [criteria, editedKeys, overall]);

  async function claim() { if (!review) return; await action(async () => setReview(await api.claimQualityReview(review.review_uuid, review.lock_version))); }
  async function saveDraft(silent = false) {
    if (!review || saving || !review.capabilities.can_edit) return;
    setSaving(true); if (!silent) setError("");
    try {
      const updated = await api.saveQualityReviewDraft(review.review_uuid, review.lock_version, { overall_comment: overall, payload: {}, criteria: criteria.filter((item) => editedKeys.has(item.key)).map((item) => ({ criterion_key: item.key, title: item.custom ? item.title.trim() : undefined, custom: item.custom || undefined, human_score: item.notApplicable ? undefined : fromTenPointScale(item.humanScore, item.storageMax), not_applicable: item.notApplicable, comment: item.comment })) });
      initialized.current = `${updated.review_uuid}:${updated.draft?.revision_uuid ?? "source"}`; setReview(updated); setDirty(false);
    } catch (cause) { setError(message(cause)); if (cause instanceof ApiError && cause.status === 409) void load(); }
    finally { setSaving(false); }
  }
  async function publish() {
    if (!review || blockers.length || saving) return;
    if (dirty || !review.draft) await saveDraft();
    const current = await api.getQualityReview(review.review_uuid);
    if (!current.draft) return;
    await action(async () => { setReview(await api.publishQualityReview(current.review_uuid, current.lock_version, current.draft!.revision_uuid)); setDirty(false); });
  }
  async function discardChanges() {
    if (!review || saving) return;
    setSaving(true); setError("");
    try {
      const updated = review.draft
        ? await api.discardQualityReviewDraft(review.review_uuid, review.lock_version)
        : review;
      const source = updated.published_revision;
      const nextCriteria = source?.criteria?.length ? fromStored(source.criteria, updated.analysis) : fromAnalysis(updated.analysis);
      setReview(updated);
      setCriteria(nextCriteria);
      setEditedKeys(new Set(nextCriteria.filter(isMeaningfullyEdited).map((criterion) => criterion.key)));
      setOverall(source?.overall_comment ?? "");
      setExpandedSection(null);
      setDirty(false);
      initialized.current = `${updated.review_uuid}:${source?.revision_uuid ?? "source"}`;
    } catch (cause) {
      setError(message(cause));
      if (cause instanceof ApiError && cause.status === 409) void load();
    } finally { setSaving(false); }
  }
  async function resolveAppeal(appealId: string, status: "accepted" | "partially_accepted" | "rejected") {
    if (!review || resolutionComment.trim().length < 3) return;
    await action(async () => { await api.resolveQualityReviewAppeal(appealId, { status, comment: resolutionComment, replacement_revision_uuid: status === "rejected" ? undefined : review.active_revision_uuid }); setResolutionComment(""); await load(); });
  }
  async function action(operation: () => Promise<void>) { setSaving(true); setError(""); try { await operation(); } catch (cause) { setError(message(cause)); } finally { setSaving(false); } }
  function updateCriterion(index: number, patch: Partial<CriterionDraft>) { const key = criteria[index]?.key; setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); if (key) setEditedKeys((current) => new Set(current).add(key)); setDirty(true); }
  function addCriterion() { const key = `custom_${crypto.randomUUID()}`; setCriteria((current) => [...current, { key, title: "", custom: true, persistedEdited: true, scoreMin: 0, scoreMax: 10, storageMax: 10, humanScore: undefined, notApplicable: false, comment: "" }]); setEditedKeys((current) => new Set(current).add(key)); setExpandedSection(key); setDirty(true); }
  function removeCriterion(key: string) { setCriteria((current) => current.filter((item) => item.key !== key)); setEditedKeys((current) => { const next = new Set(current); next.delete(key); return next; }); setExpandedSection((current) => current === key ? null : current); setDirty(true); }
  function selectVersion(version: string) {
    if (!review || dirty) return;
    setSelectedVersion(version);
    setExpandedSection(null);
    if (version === "ai") {
      setCriteria(fromAnalysis(review.analysis));
      setEditedKeys(new Set());
      setOverall("");
      return;
    }
    const revision = version === "active" ? review.published_revision : (review.revisions ?? []).find((item) => item.revision_uuid === version);
    const next = revision?.criteria?.length ? fromStored(revision.criteria, review.analysis) : fromAnalysis(review.analysis);
    setCriteria(next);
    setEditedKeys(new Set(next.filter(isMeaningfullyEdited).map((item) => item.key)));
    setOverall(revision?.overall_comment ?? "");
  }

  if (loading) return <div className="quality-empty">Загружаю проверку…</div>;
  if (!review) return <div className="quality-page"><button className="ghost-button" onClick={onBack}><ArrowLeft size={17} />К очереди</button><div className="form-error">{error || "Проверка не найдена"}</div></div>;
  const revisions = review.revisions ?? [];
  const readOnly = selectedVersion !== "active" || !review.capabilities.can_edit || review.status === "resolved";
  const openAppeal = review.appeals.find((item) => item.status === "open" || item.status === "in_review");
  const sourceSummary = analysisSummary(review.analysis);

  return <FrozenRegion
    frozen={review.call_in_bin}
    message="Звонок помещён в корзину. Проверка доступна для чтения, изменения вернутся вместе со звонком."
  >
  <div className="quality-page quality-editor">
    <header className="quality-page-header quality-editor-header">
      <button className="ghost-button quality-back-button" type="button" onClick={onBack} data-frozen-allow><ArrowLeft size={17} />К очереди</button>
      <div className="quality-editor-heading"><span className="eyebrow">Проверка человеком</span><h1>Проверка анализа</h1><p>Читайте исходный анализ и раскрывайте только те разделы, которые хотите изменить.</p></div>
      <span className={`quality-status is-${review.status}`}>{reviewStatusLabel(review.status)}</span>
    </header>
    {review.source_outdated && <div className="quality-warning"><ShieldAlert size={20} /><div><strong>Источник изменился</strong><span>Публикация старого черновика заблокирована.</span></div></div>}
    {review.challenge && <section className="quality-challenge-letter"><span className="eyebrow">Запрос сотрудника</span><h2>Почему анализ оспорен</h2><p>{review.challenge.reason}</p><small>Отправлено {new Date(review.challenge.created_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</small></section>}
    {error && <div className="form-error" role="alert">{error}</div>}
    {review.capabilities.can_claim && <button className="primary-button" type="button" disabled={saving} onClick={() => void claim()}>Взять на проверку</button>}
    <nav className="quality-version-switcher" aria-label="Версии оценки">
      <button className={selectedVersion === "ai" ? "active" : ""} type="button" disabled={dirty} onClick={() => selectVersion("ai")}>ИИ</button>
      {revisions.map((revision, index) => <button className={selectedVersion === revision.revision_uuid ? "active" : ""} type="button" key={revision.revision_uuid} disabled={dirty} onClick={() => selectVersion(revision.revision_uuid)}>Переоценка {index + 1}</button>)}
      <button className={selectedVersion === "active" ? "active" : ""} type="button" disabled={dirty} onClick={() => selectVersion("active")}>Действующая оценка</button>
    </nav>
    <main className="quality-criteria quality-single-analysis">
      <section className={`quality-summary quality-review-section${expandedSection === "overall" ? " is-expanded" : ""}`}>
        <header className="quality-review-section-header"><div><span className="eyebrow">Резюме анализа</span><h2>Общий вывод</h2></div>{!readOnly && <button className="ghost-button small quality-edit-button" type="button" aria-expanded={expandedSection === "overall"} onClick={() => setExpandedSection((current) => current === "overall" ? null : "overall")}>{expandedSection === "overall" ? <ChevronUp size={16} /> : <Pencil size={16} />}{expandedSection === "overall" ? "Свернуть" : "Редактировать"}</button>}</header>
        <p className="quality-source-summary">{sourceSummary}</p>
        {overall && <div className="quality-human-preview"><strong>Комментарий проверяющего</strong><p>{overall}</p></div>}
        <div className="quality-section-body"><div className="quality-section-body-inner"><label><span>Итоговый комментарий <b>*</b></span><textarea value={overall} readOnly={readOnly} maxLength={5000} placeholder="Опишите сильные стороны, ошибки и необходимые изменения" onChange={(event) => { setOverall(event.target.value); setDirty(true); }} /><small>{overall.trim().length}/5000</small></label></div></div>
      </section>
      {criteria.map((criterion, index) => {
        const source = criterionSource(review.analysis, criterion.key);
        const expanded = expandedSection === criterion.key;
        return <article className={`quality-criterion quality-review-section${expanded ? " is-expanded" : ""}`} key={criterion.key}>
          <header className="quality-review-section-header"><div><span className="eyebrow">{criterion.custom ? "Добавленный критерий" : "Критерий качества"}</span><h2>{criterion.title || "Новый критерий"}</h2></div><div className="quality-section-actions"><div className="quality-scores">{!criterion.custom && <span>Оценка ИИ <strong>{formatTenPoint(criterion.aiScore)}</strong></span>}{editedKeys.has(criterion.key) && criterion.humanScore !== undefined && <span>Ваша оценка <strong>{criterion.notApplicable ? "Н/П" : formatTenPoint(criterion.humanScore)}</strong></span>}</div>{!readOnly && <><button className="ghost-button small quality-edit-button" type="button" aria-expanded={expanded} onClick={() => setExpandedSection((current) => current === criterion.key ? null : criterion.key)}>{expanded ? <ChevronUp size={16} /> : <Pencil size={16} />}{expanded ? "Свернуть" : "Редактировать"}</button>{criterion.custom && <button className="ghost-button small danger-button quality-remove-criterion" type="button" aria-label={`Удалить критерий ${criterion.title || "без названия"}`} onClick={() => removeCriterion(criterion.key)}><Trash2 size={16} /></button>}</>}</div></header>
          <div className="quality-ai-details">{source.topic && <p><strong>Что проверялось:</strong> {source.topic}</p>}{source.explanation && <p><strong>Вывод ИИ:</strong> {source.explanation}</p>}{source.recommendation && <p><strong>Рекомендация:</strong> {source.recommendation}</p>}{source.quote && <blockquote>{source.quote}</blockquote>}</div>
          {criterion.comment && <div className="quality-human-preview"><strong>Комментарий проверяющего</strong><p>{criterion.comment}</p></div>}
          <div className="quality-section-body"><div className="quality-section-body-inner">{criterion.custom && <label className="quality-custom-title"><span>Название критерия <b>*</b></span><input maxLength={200} value={criterion.title} placeholder="Например: Точность технических формулировок" onChange={(event) => updateCriterion(index, { title: event.target.value })} /></label>}<div className="quality-score-input"><label><span>Оценка по шкале от 0 до 10</span><input type="number" min="0" max="10" step="0.1" disabled={criterion.notApplicable} value={criterion.humanScore ?? ""} onChange={(event) => updateCriterion(index, { humanScore: event.target.value === "" ? undefined : Math.min(10, Math.max(0, Number(event.target.value))) })} /></label><label className="quality-check"><input type="checkbox" checked={criterion.notApplicable} onChange={(event) => updateCriterion(index, { notApplicable: event.target.checked, humanScore: event.target.checked ? undefined : criterion.humanScore })} />Не применимо</label></div><label><span>Комментарий <b>*</b></span><textarea maxLength={2000} value={criterion.comment} placeholder={criterion.humanScore === 10 ? "Что именно выполнено хорошо?" : "Объясните оценку и предложите улучшение"} onChange={(event) => updateCriterion(index, { comment: event.target.value })} /><small>{criterion.comment.trim().length}/2000</small></label></div></div>
        </article>;
      })}
      {!readOnly && <button className="quality-add-criterion" type="button" onClick={addCriterion}><Plus size={19} /><span><strong>Добавить свой критерий</strong><small>Создайте дополнительный пункт и оцените его по шкале от 0 до 10</small></span></button>}
    </main>
    <AnalysisComments callId={review.call_uuid} analysisId={review.analysis_uuid} comments={comments} canComment onChange={setComments} criteria={criteria.map((criterion) => ({ key: criterion.key, title: criterion.title }))} title="Комментарии к критериям" subtitle="Комментарии не меняют официальную оценку." placeholder="Оставьте комментарий к выбранному критерию…" />
      {!readOnly && <footer className="quality-actions"><div>{saving ? "Сохраняю…" : dirty ? "Есть несохранённые изменения" : review.draft ? "Черновик сохранён — работу можно продолжить позже" : "Изменений пока нет"}{blockers.length > 0 && <span>{blockers[0]}</span>}</div><button className="ghost-button" type="button" disabled={saving || (!dirty && !review.draft)} onClick={() => void discardChanges()}><RotateCcw size={17} />Отменить изменения</button><button className="ghost-button" type="button" disabled={saving || !dirty} onClick={() => void saveDraft()}><Save size={17} />Сохранить</button><button className="primary-button" type="button" disabled={saving || blockers.length > 0 || review.source_outdated} title={blockers[0]} onClick={() => void publish()}><Send size={17} />Опубликовать</button></footer>}
    {review.published_revision && <div className="quality-published"><CheckCircle2 size={20} />Опубликована человеческая версия №{review.published_revision.revision_number}</div>}
    {openAppeal && <section className="quality-workflow"><h2>Апелляция</h2><p>{openAppeal.reason}</p>{review.capabilities.can_resolve_appeal && <><p>{review.capabilities.can_edit ? "Чтобы принять замечания, опубликуйте независимую переоценку выше. Она станет действующей и автоматически завершит пересмотр." : "Вы можете отклонить обращение, оставив действующую оценку без изменений."}</p><textarea value={resolutionComment} maxLength={5000} placeholder="Комментарий к решению" onChange={(event) => setResolutionComment(event.target.value)} /><div><button className="ghost-button" disabled={saving || resolutionComment.trim().length < 3} onClick={() => void resolveAppeal(openAppeal.appeal_uuid, "rejected")}>Отклонить обращение</button></div></>}</section>}
  </div>
  </FrozenRegion>;
}

function fromStored(criteria: QualityReviewCriterion[], analysis: Record<string, unknown>): CriterionDraft[] { const sourceKeys = new Set(sourceCriteria(analysis).map(sourceCriterionKey)); return criteria.map((item) => { const custom = !sourceKeys.has(item.criterion_key); const storageMax = item.score_max && item.score_max > 0 ? item.score_max : custom ? 10 : 100; return { key: item.criterion_key, title: custom ? item.title : criterionTitle(item.criterion_key, item.title), custom, persistedEdited: custom || item.decision === "overridden" || item.decision === "not_applicable" || Boolean(item.comment?.trim()), aiScore: toTenPointScale(item.ai_score, storageMax), scoreMin: 0, scoreMax: 10, storageMax, humanScore: toTenPointScale(item.human_score, storageMax), notApplicable: item.decision === "not_applicable", comment: item.comment ?? "" }; }); }
function fromAnalysis(analysis: Record<string, unknown>): CriterionDraft[] { return sourceCriteria(analysis).flatMap((item, index) => { const key = sourceCriterionKey(item) || `criterion_${index + 1}`; const title = typeof item.title === "string" ? item.title : typeof item.topic === "string" ? item.topic : key; const storageMax = typeof item.points_max === "number" && item.points_max > 0 ? item.points_max : 100; const score = typeof item.points_awarded === "number" ? item.points_awarded : typeof item.score === "number" ? item.score : undefined; return [{ key, title: criterionTitle(key, title), custom: false, persistedEdited: false, aiScore: toTenPointScale(score, storageMax), scoreMin: 0, scoreMax: 10, storageMax, humanScore: toTenPointScale(score, storageMax), notApplicable: false, comment: "" }]; }); }
function sourceCriteria(analysis: Record<string, unknown>) { const raw = Array.isArray(analysis.items) ? analysis.items : Array.isArray(analysis.criteria_results) ? analysis.criteria_results : []; return raw.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)); }
function sourceCriterionKey(item: Record<string, unknown>) { return stringField(item.id) || stringField(item.code); }
function isMeaningfullyEdited(criterion: CriterionDraft) { return criterion.persistedEdited || criterion.custom || criterion.notApplicable || criterion.comment.trim() !== "" || (criterion.humanScore !== undefined && criterion.aiScore !== undefined && Math.abs(criterion.humanScore - criterion.aiScore) > .0001); }
function toTenPointScale(value: number | undefined, max: number) { return value === undefined ? undefined : Math.round((value / Math.max(max, 1)) * 100) / 10; }
function fromTenPointScale(value: number | undefined, max: number) { return value === undefined ? undefined : Math.round((value / 10) * max * 10) / 10; }
function formatTenPoint(value: number | undefined) { return value === undefined ? "— / 10" : `${Number.isInteger(value) ? value : value.toFixed(1)} / 10`; }
function criterionTitle(key: string, fallback: string) { return ({ greeting: "Приветствие и начало разговора", needs_discovery: "Выявление потребностей", question_quality: "Качество вопросов", answer_quality: "Качество ответов", solution_relevance: "Соответствие решения задаче", objection_handling: "Работа с возражениями", pricing_clarity: "Понятность условий и стоимости", tone_professionalism: "Профессиональный тон общения", next_step_quality: "Качество следующих шагов", outcome_clarity: "Ясность результата разговора", custom_instruction_match: "Соблюдение дополнительных инструкций" } as Record<string, string>)[key] ?? fallback.replaceAll("_", " "); }
function analysisSummary(analysis: Record<string, unknown>) { return stringField(analysis.summary) || stringField(analysis.call_summary) || stringField(analysis.result_text) || "ИИ не сформировал отдельное резюме для этого анализа."; }
function criterionSource(analysis: Record<string, unknown>, key: string) { const item = sourceCriteria(analysis).find(value => sourceCriterionKey(value) === key); const evidence = item && Array.isArray(item.evidence_quotes) ? item.evidence_quotes : item && Array.isArray(item.evidence) ? item.evidence : []; const quoteValue = evidence[0]; const quote = typeof quoteValue === "string" ? quoteValue : quoteValue && typeof quoteValue === "object" && !Array.isArray(quoteValue) ? stringField((quoteValue as Record<string, unknown>).quote) || stringField((quoteValue as Record<string, unknown>).text) : ""; return { topic: stringField(item?.topic), explanation: stringField(item?.explanation) || stringField(item?.reason), recommendation: stringField(item?.improvement) || stringField(item?.recommendation), quote }; }
function stringField(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function reviewStatusLabel(status: string) { return ({ unassigned: "Ожидает проверки", assigned: "Ожидает проверки", in_review: "В работе", published: "Проверка завершена", appealed: "На пересмотре", resolved: "Пересмотрено", canceled: "Отменена" } as Record<string, string>)[status] ?? "Статус уточняется"; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "Не удалось выполнить действие"; }
