import { ArrowLeft, Eye, FileCheck2, FileText, GitCompareArrows, History, ListChecks, Pencil, Save, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { activeDepartmentLeaderIds, isCompanyManager } from "../../shared/lib/access";
import type { AnalysisInstruction, AnalysisInstructionVersion, AppliedInstruction, CompanyResponse, DepartmentMemberResponse, SessionState } from "../../types";
import { InstructionDocumentViewer } from "./InstructionDocumentViewerV2";
import { InstructionScorecardTab } from "./InstructionScorecardTab";
import { LiveMarkdownEditor } from "./LiveMarkdownEditor";
import { TransientAlert } from "../../shared/ui/TransientAlert";

type InstructionTab = "document" | "criteria";

function tabFromUrl(): InstructionTab {
  return new URLSearchParams(window.location.search).get("tab") === "criteria" ? "criteria" : "document";
}

type Props = { analysisId?: string; versionId?: string; instructionId?: string; session: SessionState; companies: CompanyResponse[]; departmentMembers: DepartmentMemberResponse[]; onBack: () => void; onCompare: (instructionId: string, versionIds: string[]) => void; };

export function InstructionHistoryPage({ analysisId, versionId, instructionId, session, companies, departmentMembers, onBack, onCompare }: Props) {
  const [applied, setApplied] = useState<AppliedInstruction>();
  const [instruction, setInstruction] = useState<AnalysisInstruction>();
  const [versions, setVersions] = useState<AnalysisInstructionVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState(versionId ?? "");
  const [blob, setBlob] = useState<Blob>();
  const [markdown, setMarkdown] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File>();
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  // The criteria tab belongs to the instruction itself, not to the version a
  // call was analysed with.
  const tabbed = Boolean(instructionId && !analysisId);
  const [tab, setTab] = useState<InstructionTab>(() => tabbed ? tabFromUrl() : "document");
  const focusCriterion = useMemo(() => new URLSearchParams(window.location.search).get("criterion") ?? undefined, []);
  useEffect(() => {
    if (!tabbed) return;
    // A notification can open this same page on the other tab.
    const sync = () => setTab(tabFromUrl());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [tabbed]);
  const resolvedInstructionId = instructionId ?? applied?.instruction_id ?? "";
  const selectedVersion = versions.find((item) => item.id === selectedVersionId);
  const filename = selectedVersion?.original_filename ?? applied?.original_filename ?? instruction?.original_filename ?? "instruction.md";
  const isMarkdown = filename.toLowerCase().endsWith(".md");
  const canEdit = useMemo(() => {
    if (!instruction || !instruction.is_active) return false;
    if (instruction.scope === "personal") return instruction.user_uuid === session.user.id;
    const managed = companies.some((company) => company.id === instruction.company_uuid && isCompanyManager(company, session.user.id));
    if (instruction.scope === "company") return managed;
    return managed || Boolean(instruction.department_uuid && activeDepartmentLeaderIds(departmentMembers, session.user.id).has(instruction.department_uuid));
  }, [companies, departmentMembers, instruction, session.user.id]);

  useEffect(() => {
    let cancelled = false; setLoading(true); setError("");
    const request = analysisId && versionId ? api.getAppliedInstruction(analysisId, versionId) : Promise.resolve(undefined);
    request.then((item) => { if (!cancelled && item) { setApplied(item); setMarkdown(item.content ?? ""); setDraft(item.content ?? ""); } }).catch(() => { if (!cancelled) setError("Инструкция недоступна или у вас нет доступа."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [analysisId, versionId]);

  useEffect(() => {
    if (!resolvedInstructionId) return;
    let cancelled = false;
    setMissing(false);
    Promise.all([api.getInstruction(resolvedInstructionId), api.listInstructionVersions(resolvedInstructionId)]).then(([current, history]) => {
      if (cancelled) return; setInstruction(current); setVersions(history.items); setSelectedVersionId((value) => value || history.items[0]?.id || "");
    }).catch(() => { if (!applied && !cancelled) { setMissing(true); setError("Инструкция уже удалена или недоступна."); } });
    return () => { cancelled = true; };
  }, [applied, resolvedInstructionId]);

  useEffect(() => {
    if (!resolvedInstructionId || !selectedVersionId) return;
    let cancelled = false;
    api.getInstructionVersionFile(resolvedInstructionId, selectedVersionId).then(async (file) => {
      if (cancelled) return; setBlob(file);
      if ((selectedVersion?.original_filename ?? "").toLowerCase().endsWith(".md")) { const text = await file.text(); if (!cancelled) { setMarkdown(text); setDraft(text); } }
    }).catch(() => { if (!applied && !cancelled) setError("Файл версии недоступен."); });
    return () => { cancelled = true; };
  }, [applied, resolvedInstructionId, selectedVersion?.original_filename, selectedVersionId]);

  async function saveMarkdown() {
    if (!instruction || !draft.trim()) return; setBusy(true); setError("");
    try { const file = new File([draft], instruction.original_filename.toLowerCase().endsWith(".md") ? instruction.original_filename : `${instruction.title}.md`, { type: "text/markdown;charset=utf-8" }); const updated = await api.replaceInstructionFile(instruction.id, file); const history = await api.listInstructionVersions(instruction.id); setInstruction(updated); setVersions(history.items); setSelectedVersionId(history.items[0]?.id ?? ""); setMarkdown(draft); setEditing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить инструкцию."); } finally { setBusy(false); }
  }

  async function saveReplacement() {
    if (!instruction || !replacementFile) return;
    const expectedExtension = filename.split(".").pop()?.toLowerCase();
    const replacementExtension = replacementFile.name.split(".").pop()?.toLowerCase();
    if (!expectedExtension || expectedExtension !== replacementExtension) { setError(`Выберите файл формата ${expectedExtension?.toUpperCase()}.`); return; }
    setBusy(true); setError("");
    try {
      const updated = await api.replaceInstructionFile(instruction.id, replacementFile);
      const history = await api.listInstructionVersions(instruction.id);
      setInstruction(updated); setVersions(history.items); setSelectedVersionId(history.items[0]?.id ?? ""); setEditing(false); setReplacementFile(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить новую версию."); }
    finally { setBusy(false); }
  }

  function openTab(next: InstructionTab) {
    setTab(next);
    if (next === "criteria") setEditing(false);
    const query = new URLSearchParams(window.location.search);
    query.delete("criterion");
    if (next === "criteria") query.set("tab", "criteria"); else query.delete("tab");
    const search = query.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 5 ? [...current, id] : current);
  }

  function openComparison() {
    if (compareIds.length < 2 || !resolvedInstructionId) return;
    const versionInstructionId = versions.find((item) => compareIds.includes(item.id))?.instruction_id;
    onCompare(versionInstructionId || resolvedInstructionId, compareIds);
  }

  if (loading) return <section className="instruction-history-page atmospheric-page"><div className="instruction-history-shell glass"><div className="instruction-history-loading" /></div></section>;
  if (missing) return <section className="instruction-history-page atmospheric-page"><button className="ghost-button instruction-history-back" type="button" onClick={onBack}><ArrowLeft size={18}/>К инструкциям</button><article className="instruction-history-shell glass instruction-history-missing"><FileText size={34}/><h1>Инструкция удалена</h1><p>Она больше не отображается в списке и недоступна для просмотра.</p><button className="primary-button" type="button" onClick={onBack}>Вернуться к инструкциям</button><TransientAlert message={error}/></article></section>;
  return <section className="instruction-history-page atmospheric-page"><button className="ghost-button instruction-history-back" type="button" onClick={onBack}><ArrowLeft size={18} />Назад</button><article className="instruction-history-shell glass">
    <header className="instruction-history-header"><div className="instruction-history-icon"><FileText size={24} /></div><div><span className="eyebrow">ИНСТРУКЦИЯ</span><h1>{filename}</h1><p>{applied ? "Версия, которая фактически применялась при анализе звонка." : "Просмотр, редактирование и история документа."}</p></div>{canEdit ? <button className="ghost-button small" type="button" onClick={() => { openTab("document"); setEditing(true); }}><Pencil size={16}/>Редактировать</button> : <span className="instruction-history-state">Только чтение</span>}</header>
    {error ? <TransientAlert message={error} /> : null}
    <dl className="instruction-history-meta"><div><dt><History size={16}/>Версия</dt><dd>{selectedVersion ? `Версия ${selectedVersion.version}` : applied ? `Версия ${applied.version}` : "Текущая"}</dd></div><div><dt><FileText size={16}/>Формат</dt><dd>{filename.split(".").pop()?.toUpperCase() ?? "MD"}</dd></div></dl>
    {tabbed ? <div className="segmented instruction-tabs" role="tablist" aria-label="Разделы инструкции"><button type="button" role="tab" aria-selected={tab === "document"} className={tab === "document" ? "active" : ""} onClick={() => openTab("document")}><FileText size={15}/>Документ</button><button type="button" role="tab" aria-selected={tab === "criteria"} className={tab === "criteria" ? "active" : ""} onClick={() => openTab("criteria")}><ListChecks size={15}/>Критерии оценки</button></div> : null}
    {tab === "criteria" ? instruction ? <InstructionScorecardTab instructionId={instruction.id} canEdit={canEdit} focusKey={focusCriterion}/> : <div className="instruction-history-loading"/> : <>
    {editing && isMarkdown
      ? <section className="instruction-editor"><header><div><h2>Редактирование Markdown</h2><small>Выберите строку, чтобы увидеть и изменить её Markdown-разметку.</small></div><div><button className="ghost-button small" type="button" onClick={() => { setEditing(false); setDraft(markdown); }}><X size={15}/>Отмена</button><button className="primary-button small" type="button" disabled={busy || !draft.trim()} onClick={() => void saveMarkdown()}><Save size={15}/>{busy ? "Сохраняю…" : "Сохранить версию"}</button></div></header><LiveMarkdownEditor value={draft} onChange={setDraft}/></section>
      : editing
      ? <section className="instruction-editor instruction-file-editor"><header><div><span><h2>Новая версия {filename.split(".").pop()?.toUpperCase()}</h2><small>Выберите обновлённый файл. Текущая версия останется в истории и будет доступна для сравнения.</small></span></div><div><button className="ghost-button small" type="button" onClick={() => { setEditing(false); setReplacementFile(undefined); }}><X size={15}/>Отмена</button><button className="primary-button small" type="button" disabled={busy || !replacementFile} onClick={() => void saveReplacement()}><Save size={15}/>{busy ? "Сохраняю…" : "Сохранить версию"}</button></div></header><label className="instruction-file-editor-drop"><input type="file" hidden accept={`.${filename.split(".").pop()?.toLowerCase()}`} onChange={(event) => setReplacementFile(event.target.files?.[0])}/>{replacementFile ? <><FileCheck2 size={28}/><span><strong>{replacementFile.name}</strong><small>{(replacementFile.size / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} КБ · готов к сохранению</small></span><em>Выбрать другой</em></> : <><Upload size={28}/><span><strong>Выберите обновлённый {filename.split(".").pop()?.toUpperCase()}-файл</strong><small>Он будет сохранён как новая версия без удаления предыдущей</small></span><em>Выбрать файл</em></>}</label>{replacementFile ? <div className="instruction-file-editor-preview"><InstructionDocumentViewer filename={replacementFile.name} blob={replacementFile}/></div> : null}</section>
      : <InstructionDocumentViewer filename={filename} blob={blob} markdown={markdown}/>}
    {versions.length > 0 ? <section className="instruction-versions"><header><div><History size={19}/><span><h2>История версий</h2><small>Нажмите на карточку, чтобы отметить версию для сравнения</small></span></div><div className="instruction-version-actions"><span><GitCompareArrows size={16}/>Выбрано: {compareIds.length}</span><button className="primary-button small" type="button" disabled={compareIds.length < 2} onClick={openComparison}><GitCompareArrows size={16}/>Сравнить версии</button></div></header><div className="instruction-version-list">{versions.map((item)=>{const checked=compareIds.includes(item.id),disabled=!checked&&compareIds.length>=5;return <div className={`${item.id===selectedVersionId?"active ":""}${checked?"checked":""}`} role="checkbox" aria-checked={checked} aria-disabled={disabled} tabIndex={disabled?-1:0} onClick={()=>{if(!disabled)toggleCompare(item.id)}} onKeyDown={(event)=>{if(!disabled&&(event.key===" "||event.key==="Enter")){event.preventDefault();toggleCompare(item.id)}}} key={item.id}><div className="instruction-version-summary"><strong>Версия {item.version}</strong><small>{new Date(item.created_at).toLocaleString("ru-RU")} · {item.original_filename}</small></div><button className="instruction-version-open" type="button" onClick={(event)=>{event.stopPropagation();setSelectedVersionId(item.id);setEditing(false)}}><Eye size={15}/>Открыть</button><span className={`instruction-version-check${checked?" is-checked":""}`} aria-hidden="true"><span/></span></div>})}</div></section> : null}
    </>}
  </article></section>;
}
