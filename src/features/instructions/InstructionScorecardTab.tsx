import { AlertTriangle, ChevronDown, ClipboardCheck, Link2, ListChecks, Loader2, RefreshCw, Save, Split, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../api";
import { pluralizeRu } from "../../shared/lib/plans";
import { SelectControl } from "../../shared/ui/primitives";
import { TransientAlert } from "../../shared/ui/TransientAlert";
import type { InstructionScorecard, ScorecardCriterion, ScorecardCriterionEdit, ScorecardEditableField } from "../../types";

const pollInterval = 3000;
// Past this many enabled criteria every call gets noticeably dearer; the server
// refuses more than the limit.
const expensiveFrom = 25;
const enabledLimit = 40;

type Draft = Partial<Pick<ScorecardCriterion, "title" | "weight" | "is_critical" | "enabled">>;

const warningLabels: Record<string, string> = {
  compound: "Похоже на два требования в одном",
  not_observable: "Нельзя проверить по тексту разговора",
  vague: "Расплывчато: нет проверяемого признака",
  negative_wording: "Сформулировано через запрет",
  excerpt_unverified: "Цитата не найдена в инструкции дословно",
};

function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

// Mirrors the server: every started batch of three criteria is one assessment
// and one audit request in each analysed call.
function requestsPerCall(enabled: number) {
  return Math.ceil(enabled / 3) * 2;
}

export function InstructionScorecardTab({ instructionId, canEdit, focusKey }: { instructionId: string; canEdit: boolean; focusKey?: string }) {
  const [card, setCard] = useState<InstructionScorecard>();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expanded, setExpanded] = useState<string[]>(focusKey ? [focusKey] : []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    // Opening the tab compiles a version without criteria at once instead of
    // after the quiet period. Only an editor may start it: the compile is paid.
    const first = canEdit ? api.ensureInstructionScorecard(instructionId).catch(() => api.getInstructionScorecard(instructionId)) : api.getInstructionScorecard(instructionId);
    first.then((next) => { if (!cancelled) { setCard(next); setDrafts({}); } })
      .catch((cause) => { if (!cancelled) setError(errorText(cause, "Не удалось загрузить критерии.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [canEdit, instructionId]);

  const pending = card?.status === "queued" || card?.status === "compiling";
  useEffect(() => {
    if (!pending || !card) return;
    // A compile waiting out the quiet period after an edit is not polled every
    // few seconds for two minutes.
    const waitsFor = card.status === "queued" && card.compile_after ? new Date(card.compile_after).getTime() - Date.now() : 0;
    const timer = window.setTimeout(() => {
      api.getInstructionScorecard(instructionId).then(setCard).catch(() => undefined);
    }, Math.min(Math.max(waitsFor, pollInterval), 30000));
    return () => window.clearTimeout(timer);
  }, [card, instructionId, pending]);

  // A link from a call's requirement card opens the tab on its criterion.
  const focusReady = Boolean(focusKey && card?.criteria.some((criterion) => criterion.criterion_key === focusKey));
  useEffect(() => {
    if (focusReady && focusKey) document.getElementById(`criterion-${focusKey}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusKey, focusReady]);

  const value = <K extends keyof Draft>(criterion: ScorecardCriterion, field: K) => (drafts[criterion.criterion_key]?.[field] ?? criterion[field]) as ScorecardCriterion[K];
  const enabledCount = useMemo(() => card?.criteria.filter((criterion) => drafts[criterion.criterion_key]?.enabled ?? criterion.enabled).length ?? 0, [card, drafts]);
  const dirty = Object.keys(drafts).length > 0;
  const invalidTitle = Object.values(drafts).some((draft) => draft.title !== undefined && !draft.title.trim());

  function change<K extends keyof Draft>(criterion: ScorecardCriterion, field: K, next: ScorecardCriterion[K]) {
    setDrafts((current) => {
      const draft: Draft = { ...current[criterion.criterion_key] };
      if (next === criterion[field]) delete draft[field]; else draft[field] = next;
      const rest = { ...current };
      if (Object.keys(draft).length === 0) delete rest[criterion.criterion_key]; else rest[criterion.criterion_key] = draft;
      return rest;
    });
  }

  async function run(action: () => Promise<InstructionScorecard>, done: string, fallback: string, keepDrafts = false) {
    setBusy(true); setError(""); setNotice("");
    try { const next = await action(); setCard(next); if (!keepDrafts) setDrafts({}); if (done) setNotice(done); }
    catch (cause) {
      if (cause instanceof ApiError && cause.code === "scorecard_version_conflict") {
        setError("Карту изменили в другом окне. Показываем актуальную версию.");
        setDrafts({});
        api.getInstructionScorecard(instructionId).then(setCard).catch(() => undefined);
      } else setError(errorText(cause, fallback));
    } finally { setBusy(false); }
  }

  function save() {
    if (!card || !dirty || invalidTitle) return;
    const criteria: ScorecardCriterionEdit[] = Object.entries(drafts).map(([criterion_key, draft]) => ({ criterion_key, ...draft, ...(draft.title !== undefined ? { title: draft.title.trim() } : {}) }));
    void run(() => api.editInstructionScorecard(instructionId, { lock_version: card.lock_version, criteria }), "Редакция сохранена. Уже оценённые звонки остаются со своей редакцией.", "Не удалось сохранить редакцию.");
  }

  function toggleConfirm(next: boolean) {
    if (!card) return;
    void run(() => api.editInstructionScorecard(instructionId, { lock_version: card.lock_version, confirm_required: next }), next ? "Новые критерии будут ждать подтверждения." : "Новые критерии будут применяться сразу.", "Не удалось изменить настройку.", true);
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  if (loading) return <section className="scorecard-tab"><div className="instruction-history-loading" /></section>;
  if (!card) return <section className="scorecard-tab"><div className="scorecard-state"><AlertTriangle size={26}/><p>{error || "Критерии недоступны."}</p></div></section>;

  const confirmSwitch = canEdit ? <label className="checkbox-row scorecard-confirm-switch"><input type="checkbox" checked={card.confirm_required} disabled={busy} onChange={(event) => toggleConfirm(event.target.checked)}/><span><strong>Подтверждать критерии перед применением</strong><small>После правки инструкции новые критерии начнут действовать, когда вы нажмёте «Применить». До этого звонки оцениваются по прежним.</small></span></label> : null;

  return <section className="scorecard-tab">
    {error ? <TransientAlert message={error}/> : null}
    {notice ? <TransientAlert message={notice} tone="success"/> : null}
    {card.status === "not_compiled" ? <div className="scorecard-state"><ListChecks size={26}/><h3>Критерии ещё не готовили</h3><p>Их соберут перед первым анализом звонка по этой инструкции или когда её автор откроет эту вкладку.</p></div> : null}
    {pending ? <PendingState card={card}/> : null}
    {card.status === "failed" ? <div className="scorecard-state is-failed"><AlertTriangle size={26}/><h3>Не удалось подготовить критерии</h3><p>{card.error?.message || "Попробуйте ещё раз."} Пока критериев нет, звонки оцениваются по разово подобранным требованиям и не попадают в аналитику по критериям.</p>{canEdit ? <button className="primary-button small" type="button" disabled={busy} onClick={() => void run(() => api.recompileInstructionScorecard(instructionId), "", "Не удалось запустить подготовку критериев.")}><RefreshCw size={15}/>Повторить</button> : null}</div> : null}
    {card.status === "ready" ? <>
      {card.awaiting_confirmation ? <div className="scorecard-awaiting"><ClipboardCheck size={20}/><span><strong>Новые критерии ждут подтверждения</strong><small>Пока вы их не примените, звонки оцениваются по прежней версии инструкции и её критериям.</small></span>{canEdit ? <button className="primary-button small" type="button" disabled={busy || dirty || !card.scorecard_uuid} title={dirty ? "Сначала сохраните редакцию" : undefined} onClick={() => void run(() => api.confirmInstructionScorecard(instructionId, { scorecard_uuid: card.scorecard_uuid!, lock_version: card.lock_version }), "Критерии применены.", "Не удалось применить критерии.")}>Применить</button> : null}</div> : null}
      <div className="scorecard-summary">
        <span><strong>{card.criteria.length}</strong> {pluralizeRu(card.criteria.length, "критерий", "критерия", "критериев")} · учитывается {enabledCount}</span>
        <small>Версия {card.instruction_version} · редакция {card.revision}</small>
        <p>Эта карта добавляет к каждому звонку примерно {requestsPerCall(enabledCount)} {pluralizeRu(requestsPerCall(enabledCount), "запрос", "запроса", "запросов")} к модели. Выключенный критерий в анализ не попадает.</p>
      </div>
      {enabledCount > enabledLimit ? <p className="scorecard-warning is-blocking"><AlertTriangle size={16}/>Учитывать можно не больше {enabledLimit} критериев. Выключите лишние, чтобы сохранить.</p>
        : enabledCount >= expensiveFrom ? <p className="scorecard-warning"><AlertTriangle size={16}/>Учитывается {enabledCount} {pluralizeRu(enabledCount, "критерий", "критерия", "критериев")}: каждый звонок станет заметно дороже.</p> : null}
      <ChangesBar card={card} canEdit={canEdit} busy={busy} dirty={dirty}
        onLink={(key, canonical) => void run(() => api.linkScorecardCriterion(instructionId, key, canonical), "Критерии связаны: история продолжится под новым названием.", "Не удалось связать критерии.")}
        onSplit={(key) => void run(() => api.splitScorecardCriterion(instructionId, key), "Критерий отделён: его история начнётся заново.", "Не удалось отделить критерий.")}/>
      <ol className="scorecard-criteria">{card.criteria.map((criterion) => {
        const open = expanded.includes(criterion.criterion_key);
        const enabled = value(criterion, "enabled");
        const edited = (field: ScorecardEditableField) => criterion.edited_fields.includes(field) ? <span className="scorecard-edited-dot" title="изменено вручную" aria-label="изменено вручную"/> : null;
        return <li key={criterion.criterion_key} id={`criterion-${criterion.criterion_key}`} className={`scorecard-criterion${enabled ? "" : " is-disabled"}${criterion.criterion_key === focusKey ? " is-focused" : ""}`}>
          <span className="scorecard-criterion-number">{criterion.position}</span>
          <div className="scorecard-criterion-main">
            <div className="scorecard-criterion-title">
              {/* A textarea, so a long title wraps instead of being cut off; it
                  still takes one line of text. */}
              {canEdit ? <textarea rows={1} value={value(criterion, "title")} maxLength={200} aria-label={`Название критерия ${criterion.position}`} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => change(criterion, "title", event.target.value.replace(/\s*\n\s*/g, " "))}/> : <strong>{criterion.title}</strong>}
              {edited("title")}
            </div>
            <div className="scorecard-criterion-tags">
              {criterion.required_question ? <span>обязательный вопрос</span> : null}
              {criterion.cross_cutting ? <span>сквозной</span> : null}
              {criterion.warnings.length ? <span className="is-warning" title={criterion.warnings.map((code) => warningLabels[code] ?? code).join("; ")}><AlertTriangle size={12}/>{criterion.warnings.length === 1 ? warningLabels[criterion.warnings[0]] ?? "Проверьте формулировку" : `${criterion.warnings.length} замечания к формулировке`}</span> : null}
              <button className="scorecard-criterion-expand" type="button" aria-expanded={open} onClick={() => toggleExpanded(criterion.criterion_key)}><ChevronDown size={14}/>Формулировка</button>
            </div>
            {open ? <dl className="scorecard-criterion-details">
              <div><dt>Требование</dt><dd>{criterion.requirement}</dd></div>
              {criterion.applicability ? <div><dt>Когда применим</dt><dd>{criterion.applicability}</dd></div> : null}
              {criterion.depth ? <div><dt>Глубина</dt><dd>{criterion.depth}</dd></div> : null}
              {criterion.source_excerpt ? <div><dt>Из инструкции</dt><dd><q>{criterion.source_excerpt}</q></dd></div> : null}
              {criterion.warnings.map((code) => <div key={code} className="is-warning"><dt>Замечание</dt><dd>{warningLabels[code] ?? code}</dd></div>)}
            </dl> : null}
          </div>
          <div className="scorecard-criterion-controls">
            <div className="scorecard-weight" role="group" aria-label="Вес">
              <small>Вес{edited("weight")}</small>
              {canEdit ? <span>{[1, 2, 3].map((weight) => <button key={weight} type="button" className={value(criterion, "weight") === weight ? "active" : ""} aria-pressed={value(criterion, "weight") === weight} onClick={() => change(criterion, "weight", weight)}>{weight}</button>)}</span> : <b>{criterion.weight}</b>}
            </div>
            {canEdit ? <>
              <label className="checkbox-row"><input type="checkbox" checked={value(criterion, "is_critical")} onChange={(event) => change(criterion, "is_critical", event.target.checked)}/><span>Критичный{edited("is_critical")}</span></label>
              <label className="checkbox-row"><input type="checkbox" checked={enabled} onChange={(event) => change(criterion, "enabled", event.target.checked)}/><span>Учитывать{edited("enabled")}</span></label>
            </> : <>
              {criterion.is_critical ? <span className="scorecard-critical-badge">Критичный</span> : null}
              {!criterion.enabled ? <span className="scorecard-off-badge">Не учитывается</span> : null}
            </>}
          </div>
        </li>;
      })}</ol>
      {canEdit ? <div className="scorecard-actions">
        <small>Правка создаёт новую редакцию. Уже оценённые звонки не пересчитываются.</small>
        <button className="ghost-button small" type="button" disabled={busy || !dirty} onClick={() => setDrafts({})}><Undo2 size={15}/>Отменить</button>
        <button className="primary-button small" type="button" disabled={busy || !dirty || invalidTitle || enabledCount > enabledLimit} onClick={save}><Save size={15}/>{busy ? "Сохраняю…" : "Сохранить редакцию"}</button>
      </div> : null}
    </> : null}
    {confirmSwitch}
  </section>;
}

function PendingState({ card }: { card: InstructionScorecard }) {
  const waiting = card.status === "queued" && card.compile_after && new Date(card.compile_after).getTime() - Date.now() > pollInterval;
  const message = card.error?.code === "awaiting_credits" ? "Недостаточно кредитов. Соберём критерии, когда баланс пополнится."
    : card.error ? card.error.message
    : waiting ? "Инструкцию недавно меняли. Соберём критерии через пару минут после последней правки."
    : "Обычно это занимает до минуты. Страницу можно закрыть: критерии сохранятся.";
  return <div className="scorecard-state is-pending"><Loader2 size={26} className="scorecard-spinner"/><h3>Готовим критерии…</h3><p>{message}</p></div>;
}

function ChangesBar({ card, canEdit, busy, dirty, onLink, onSplit }: { card: InstructionScorecard; canEdit: boolean; busy: boolean; dirty: boolean; onLink: (key: string, canonical: string) => void; onSplit: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState("");
  const groups = useMemo(() => ({
    unchanged: card.criteria.filter((criterion) => criterion.change_kind === "unchanged"),
    reworded: card.criteria.filter((criterion) => criterion.change_kind === "reworded"),
    linked: card.criteria.filter((criterion) => criterion.same_as),
    added: card.criteria.filter((criterion) => criterion.change_kind === "new" && !criterion.same_as),
  }), [card.criteria]);
  const removed = card.removed_criteria;
  // A first scorecard has nothing to compare with: every criterion is new and
  // nothing was removed.
  if (!groups.unchanged.length && !groups.reworded.length && !groups.linked.length && !removed.length) return null;
  const parts = [
    groups.unchanged.length ? `${groups.unchanged.length} без изменений` : "",
    groups.reworded.length ? `${groups.reworded.length} ${pluralizeRu(groups.reworded.length, "переформулирован", "переформулированы", "переформулированы")}` : "",
    groups.linked.length ? `${groups.linked.length} ${pluralizeRu(groups.linked.length, "связан", "связаны", "связаны")} с прежним` : "",
    groups.added.length ? `${groups.added.length} ${pluralizeRu(groups.added.length, "новый", "новых", "новых")}` : "",
    removed.length ? `${removed.length} ${pluralizeRu(removed.length, "убран", "убраны", "убраны")}` : "",
  ].filter(Boolean);
  const locked = busy || dirty;
  const splitButton = (criterion: ScorecardCriterion) => canEdit ? armed === criterion.criterion_key
    ? <span className="scorecard-change-confirm"><small>История прежнего критерия на этом закончится</small><button className="ghost-button small" type="button" disabled={locked} onClick={() => { setArmed(""); onSplit(criterion.criterion_key); }}>Отделить</button><button className="ghost-button small" type="button" onClick={() => setArmed("")}>Отмена</button></span>
    : <button className="ghost-button small" type="button" disabled={locked} onClick={() => setArmed(criterion.criterion_key)}><Split size={14}/>Это другой критерий</button> : null;

  return <section className={`scorecard-changes${open ? " open" : ""}`}>
    <button className="scorecard-changes-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span><strong>Что изменилось</strong><small>{parts.join(" · ")}</small></span><ChevronDown size={17}/></button>
    {open ? <div className="scorecard-changes-body">
      {dirty && canEdit ? <p className="scorecard-changes-note">Сохраните или отмените правки ниже, чтобы исправлять сопоставление.</p> : null}
      {groups.added.length ? <div className="scorecard-change-group"><h4>Новые</h4>{groups.added.map((criterion) => <div className="scorecard-change-row" key={criterion.criterion_key}><span>{criterion.title}</span>{canEdit && removed.length ? <span className="scorecard-change-link"><SelectControl aria-label="Прежний критерий" value={links[criterion.criterion_key] ?? removed[0].criterion_key} onChange={(event) => setLinks((current) => ({ ...current, [criterion.criterion_key]: event.target.value }))}>{removed.map((item) => <option key={item.criterion_key} value={item.criterion_key}>{item.title}</option>)}</SelectControl><button className="ghost-button small" type="button" disabled={locked} onClick={() => onLink(criterion.criterion_key, links[criterion.criterion_key] ?? removed[0].criterion_key)}><Link2 size={14}/>Это тот же критерий</button></span> : null}</div>)}</div> : null}
      {groups.linked.length ? <div className="scorecard-change-group"><h4>Связаны с прежними</h4>{groups.linked.map((criterion) => <div className="scorecard-change-row" key={criterion.criterion_key}><span>{criterion.title} <small>— тот же критерий, что «{criterion.same_as?.title}»</small></span></div>)}</div> : null}
      {groups.reworded.length ? <div className="scorecard-change-group"><h4>Переформулированы</h4>{groups.reworded.map((criterion) => <div className="scorecard-change-row" key={criterion.criterion_key}><span>{criterion.title}</span>{splitButton(criterion)}</div>)}</div> : null}
      {groups.unchanged.length ? <div className="scorecard-change-group"><h4>Без изменений</h4>{groups.unchanged.map((criterion) => <div className="scorecard-change-row" key={criterion.criterion_key}><span>{criterion.title}</span>{splitButton(criterion)}</div>)}</div> : null}
      {removed.length ? <div className="scorecard-change-group"><h4>Убраны</h4>{removed.map((item) => <div className="scorecard-change-row is-removed" key={item.criterion_key}><span>{item.title}</span></div>)}<small>История этих критериев на графиках закончится. Если критерий просто переименовали, свяжите его с новым выше.</small></div> : null}
    </div> : null}
  </section>;
}
