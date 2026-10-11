import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Check, FlaskConical, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { api } from "../../api";
import type { CallResponse, DraftCheckEstimate, InstructionDraft, ScorecardCriterion } from "../../types";
import { AnalysisStructuredView } from "../../shared/ui/analysis";
import { analysisV3Result } from "../../shared/lib/analysis";
import { pluralizeRu } from "../../shared/lib/plans";
import { cssClass } from "../../shared/lib/css-styles";
import { InstructionCheckCallPicker } from "./InstructionCheckCallPicker";
import { InstructionCriterionCards, instructionCriterionSummary } from "./InstructionCriterionCards";
import { InstructionDocumentPanel } from "./InstructionDocumentPanel";
import { InstructionPanel, InstructionWorkspaceBody, InstructionWorkspaceHeading, type InstructionPane } from "./InstructionWorkspace";
import "./instruction-draft.css";

const message = (error: unknown) => error instanceof Error ? error.message : "Не удалось выполнить действие.";

export function InstructionDraftEditor({ instructionId, title, onApplied, onClose, onBack }: { instructionId: string; title: string; onApplied: () => void; onClose: () => void; onBack: () => void }) {
  const [draft, setDraft] = useState<InstructionDraft>();
  const [content, setContent] = useState("");
  const [criteria, setCriteria] = useState<ScorecardCriterion[]>([]);
  const [blob, setBlob] = useState<Blob>();
  const [call, setCall] = useState<CallResponse>();
  const [selected, setSelected] = useState<string[]>([]);
  const [estimate, setEstimate] = useState<{ value: DraftCheckEstimate; key: string }>();
  const [estimating, setEstimating] = useState(false);
  const [costError, setCostError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pane, setPane] = useState<InstructionPane>("document");
  const dirty = !!draft && (draft.content !== content || JSON.stringify(draft.criteria) !== JSON.stringify(criteria));
  const compiling = draft?.status === "queued" || draft?.status === "compiling";
  const checking = draft?.check?.status === "queued" || draft?.check?.status === "running";
  const invalid = criteria.some(item => !item.title.trim() || !item.requirement.trim());
  const selectedKeys = selected.join(",");
  const estimateKey = `${draft?.lock_version}:${call?.id}:${selectedKeys}`;
  function accept(value: InstructionDraft) {
    setDraft(value); setContent(value.content); setCriteria(value.criteria); setEstimate(undefined); setAcknowledged(false);
    setSelected(current => current.filter(key => value.criteria.some(item => item.criterion_key === key)));
  }
  useEffect(() => {
    let cancelled = false;
    api.getInstructionDraft(instructionId, true).then(value => {
      if (cancelled) return; accept(value);
      setSelected(value.criteria.filter(item => item.enabled).slice(0, 40).map(item => item.criterion_key));
      if (value.check) void api.getCall(value.check.call_uuid).then(source => { if (!cancelled) setCall(source); }).catch(() => undefined);
    }).catch(cause => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [instructionId]);
  useEffect(() => {
    if (!draft || draft.original_filename.toLowerCase().endsWith(".md")) return;
    let cancelled = false;
    api.getInstructionDraftFile(instructionId).then(value => { if (!cancelled) setBlob(value); }).catch(cause => { if (!cancelled) setError(message(cause)); });
    return () => { cancelled = true; };
  }, [instructionId, draft?.original_filename, draft?.content, draft?.lock_version]);
  useEffect(() => {
    if (!compiling && !checking) return;
    let cancelled = false;
    const timer = window.setTimeout(() => { api.getInstructionDraft(instructionId).then(value => { if (!cancelled) { if (compiling) accept(value); else setDraft(value); } }).catch(cause => { if (!cancelled) setError(message(cause)); }); }, 2000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [instructionId, draft, compiling, checking]);
  useEffect(() => {
    setEstimate(undefined); setCostError("");
    if (!draft || !call || !selected.length || dirty || compiling || checking || busy || invalid || draft.status !== "ready") { setEstimating(false); return; }
    let cancelled = false; setEstimating(true);
    const timer = window.setTimeout(() => { api.estimateDraftCheck(instructionId, draft.lock_version, call.id, selectedKeys.split(",")).then(value => { if (!cancelled) setEstimate({ value, key: estimateKey }); }).catch(cause => { if (!cancelled) setCostError(message(cause)); }).finally(() => { if (!cancelled) setEstimating(false); }); }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [instructionId, draft?.lock_version, draft?.status, call?.id, selectedKeys, dirty, compiling, checking, busy, invalid, estimateKey]);
  useEffect(() => { const timer = window.setTimeout(() => { void api.touchInstructionDraft(instructionId).catch(() => undefined); }, 1000); return () => window.clearTimeout(timer); }, [instructionId, content, criteria, call?.id, selectedKeys]);
  useEffect(() => { const touch = () => { void api.touchInstructionDraft(instructionId).catch(() => undefined); }; window.addEventListener("focus", touch); return () => window.removeEventListener("focus", touch); }, [instructionId]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); } }
  async function save(): Promise<InstructionDraft> {
    if (!draft) throw new Error("Черновик ещё не загружен.");
    let current = draft;
    if (draft.content !== content) current = await api.saveInstructionDraft(instructionId, current.lock_version, content);
    if (JSON.stringify(draft.criteria) !== JSON.stringify(criteria)) current = await api.saveDraftCriteria(instructionId, current.lock_version, criteria);
    accept(current); return current;
  }
  function leave(action: () => void) { if (dirty) void run(async () => { await save(); action(); }); else action(); }
  function change(key: string, patch: Partial<ScorecardCriterion>) { setCriteria(current => current.map(item => item.criterion_key === key ? { ...item, ...patch } : item)); setAcknowledged(false); }
  function add() { setCriteria(current => [...current, { criterion_key: crypto.randomUUID(), position: current.length + 1, title: "", requirement: "", source_excerpt: "", applicability: "", depth: "", required_question: false, cross_cutting: false, weight: 1, is_critical: false, enabled: true, edited_fields: [], change_kind: "new", warnings: [], same_as: null }]); setAcknowledged(false); }
  function choose(key: string) { setSelected(current => current.includes(key) ? current.filter(value => value !== key) : current.length < 40 ? [...current, key] : current); }
  const result = useMemo(() => draft?.check?.result ? { id: draft.draft_uuid, call_uuid: draft.check.call_uuid, status: "done" as const, provider: "instruction_check", result_json: draft.check.result, created_at: draft.last_used_at, updated_at: draft.last_used_at } : undefined, [draft]);
  const parsed = analysisV3Result(result);
  if (!draft) return <section className="instruction-workspace">{error ? <p className="field-error" role="alert">{error}</p> : <p role="status">Загружаем черновик…</p>}</section>;
  const cost = estimate?.key === estimateKey ? estimate.value : undefined;
  const locked = busy || compiling;
  const check = <>
    <InstructionPanel kind="check" title="Проверка на звонке" subtitle="Проверьте формулировки на готовой расшифровке перед применением" action={<span className="iw-badge">Только отладка</span>}>
      <div className="iw-check-content"><div className="iw-check-setup"><InstructionCheckCallPicker selected={call} onChange={setCall} disabled={busy || checking} />
        <div><div className="iw-target-heading"><strong>Критерии для проверки</strong><button type="button" disabled={locked || checking || !criteria.length || criteria.length > 40} onClick={() => setSelected(criteria.map(item => item.criterion_key))}>Использовать все критерии для проверки</button></div>
          {criteria.length > 40 && <p className="iw-notice">Для одной проверки выберите не больше 40 критериев.</p>}
          <div className="iw-check-targets">{criteria.map(item => <label className="checkbox-row" key={item.criterion_key}><input type="checkbox" checked={selected.includes(item.criterion_key)} disabled={locked || checking || (!selected.includes(item.criterion_key) && selected.length >= 40)} onChange={() => choose(item.criterion_key)} />{item.title || "Новый критерий"}</label>)}</div>
          <p className="iw-target-count">Выбрано {selected.length} из {criteria.length} · максимум 40</p>
        </div></div>
        <div className="iw-check-footer"><div className="iw-cost" aria-live="polite">{dirty ? <><span>Сохраните правки перед проверкой.</span><button className="ghost-button small" type="button" disabled={locked || invalid} onClick={() => void run(async () => { await save(); })}><Save size={14} />Сохранить правки</button></> : checking ? "Проверка выполняется…" : costError ? <span className="field-error">{costError}</span> : estimating ? "Рассчитываем стоимость…" : cost ? <>Предварительно: <strong>{cost.estimated_credits.toLocaleString("ru-RU")} кредитов</strong><small>Фактический расход зависит от ответа модели.</small></> : <><span>{!call ? "Выберите звонок" : !selected.length ? "Выберите критерии" : "Подготовьте критерии"} для расчёта стоимости.</span><small>Стоимость обновляется автоматически.</small></>}</div>
          <button className="primary-button small" type="button" disabled={busy || checking || compiling || dirty || !call || !cost} onClick={() => void run(async () => { if (!call || !cost) return; await api.startDraftCheck(instructionId, draft.lock_version, call.id, selected, cost.input_hash, crypto.randomUUID()); setDraft(await api.getInstructionDraft(instructionId)); })}><FlaskConical size={16} />{checking ? "Проверяем…" : "Проверить"}</button>
        </div>{draft.check?.error && <p className="field-error" role="alert">{draft.check.error}</p>}
      </div>
    </InstructionPanel>
    <InstructionPanel kind="result" title="Результат проверки" subtitle="Оценки и цитаты для выбранного звонка" action={<span className="iw-badge">{checking ? "Проверяем…" : parsed ? "Готово" : "Нет результата"}</span>}>
      <div className="iw-result-content">{parsed ? <><p className="iw-result-count">{parsed.items.length} {pluralizeRu(parsed.items.length, "критерий", "критерия", "критериев")}</p>{draft.check?.outdated_transcription && <p className="iw-notice">Результат получен по прежней расшифровке.</p>}{dirty && <p className="iw-notice">Результат относится к сохранённому черновику. Несохранённые правки в него не входят.</p>}<AnalysisStructuredView analysis={result} onEvidenceActivate={target => { const query = new URLSearchParams({ call: draft.check!.call_uuid, evidence_time: String(target.startSeconds) }); if (target.endSeconds !== undefined) query.set("evidence_end_time", String(target.endSeconds)); window.history.pushState({}, "", `/app/calls?${query}`); window.dispatchEvent(new PopStateEvent("popstate")); }} /><p className="iw-result-retention">Хранится до {new Date(draft.check!.expires_at).toLocaleString("ru-RU")}; использование черновика продлевает срок.</p></> : <div className="iw-result-empty"><FlaskConical size={26} /><p>{checking ? "Анализируем выбранные критерии…" : "Здесь появится разбор после проверки."}<small>Результат хранится временно и удаляется при применении.</small></p></div>}</div>
    </InstructionPanel>
  </>;
  return <section className="instruction-workspace atmospheric-page">
    <InstructionWorkspaceHeading title={title} filename={draft.original_filename} draft onBack={() => leave(onBack)} backDisabled={busy || (dirty && invalid)} action={<button className="ghost-button small" type="button" disabled={busy || (dirty && invalid)} onClick={() => leave(onClose)}>{dirty ? "Сохранить и закрыть" : "Посмотреть действующую"}</button>} />
    <p className="iw-introduction">Правки сохраняются в черновике. Новые правила начнут действовать после нажатия «Применить».</p>
    {error && <p className="field-error" role="alert">{error}</p>}{notice && <p className="iw-notice" role="status">{notice}</p>}
    <InstructionWorkspaceBody pane={pane} onPaneChange={setPane}
      document={<InstructionDocumentPanel filename={draft.original_filename} blob={blob} content={content} editable disabled={locked} saving={busy} dirty={dirty} onChange={value => { setContent(value); setAcknowledged(false); }} onSave={() => void run(async () => { if (invalid) throw new Error("Заполните название и требование каждого критерия."); await save(); setNotice("Правки сохранены в черновике."); })} onUpload={async file => { setBusy(true); setError(""); try { if (invalid) throw new Error("Заполните или уберите незавершённые критерии перед заменой файла."); const current = dirty ? await save() : draft; const updated = await api.saveInstructionDraftFile(instructionId, current.lock_version, file); setBlob(file); accept(updated); } catch (cause) { setError(message(cause)); throw cause; } finally { setBusy(false); } }} />}
      criteria={<InstructionPanel kind="criteria" title="Критерии оценки" subtitle={instructionCriterionSummary(criteria)} action={<button className="primary-button small" type="button" disabled={locked || !content.trim() || invalid} onClick={() => void run(async () => { const current = dirty ? await save() : draft; accept(await api.compileInstructionDraft(instructionId, current.lock_version)); })}><RefreshCw size={15} />{compiling ? "Готовим…" : "Подготовить"}</button>}>
        <div className="iw-criteria-content">{draft.error && <p className="field-error" role="alert">{draft.error}</p>}{compiling ? <PreparingCriteria /> : <>{!criteria.length && <div className="iw-empty"><p>Подготовьте критерии из инструкции или добавьте их вручную.</p></div>}<InstructionCriterionCards criteria={criteria} canEdit canEditText disabled={busy} onChange={change} onRemove={key => { setCriteria(current => current.filter(item => item.criterion_key !== key).map((item, index) => ({ ...item, position: index + 1 }))); setSelected(current => current.filter(item => item !== key)); setAcknowledged(false); }} /><button className="ghost-button small iw-add-criterion" type="button" disabled={locked} onClick={add}><Plus size={16} />Добавить критерий вручную</button>
          {draft.inactive_criteria.some(item => !criteria.some(current => current.criterion_key === item.criterion_key)) && <details className="iw-inactive-criteria"><summary>Неактивные прежние критерии · {draft.inactive_criteria.filter(item => !criteria.some(current => current.criterion_key === item.criterion_key)).length}</summary>{draft.inactive_criteria.filter(item => !criteria.some(current => current.criterion_key === item.criterion_key)).map(item => <div key={item.criterion_key}><span>{item.title}</span><button className="ghost-button small" type="button" disabled={locked} onClick={() => { setCriteria(current => [...current, { ...item, enabled: true, position: current.length + 1 }]); setAcknowledged(false); }}>Вернуть в черновик</button></div>)}</details>}</>}
        </div></InstructionPanel>} check={check} />
    <footer className="iw-apply"><label className="checkbox-row"><input type="checkbox" checked={acknowledged} disabled={busy || dirty || compiling} onChange={event => setAcknowledged(event.target.checked)} />Всё готово к применению</label><div><button className="ghost-button small iw-delete-draft" type="button" disabled={busy} onClick={() => void run(async () => { await api.deleteInstructionDraft(instructionId); onClose(); })}><Trash2 size={15} />Удалить черновик</button><button className="primary-button small" type="button" disabled={busy || dirty || compiling || invalid || !acknowledged || draft.status !== "ready" || !criteria.length} onClick={() => void run(async () => { await api.applyInstructionDraft(instructionId, draft.lock_version); onApplied(); })}><Check size={15} />Применить</button></div></footer>
  </section>;
}

function PreparingCriteria() {
  return <div className="iw-preparing" role="status"><div className="scorecard-assembling" aria-hidden="true">{[0, 1, 2, 3].map(row => <span key={row} className={cssClass({ "--row": row } as CSSProperties)}><svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="4" /><path d="m4.5 8.4 2.3 2.3 4.7-5" /></svg><i /></span>)}</div><h3>Готовим критерии…</h3><p>Читаем инструкцию и формулируем требования к разговору. Можно закрыть страницу — черновик сохранится.</p></div>;
}
