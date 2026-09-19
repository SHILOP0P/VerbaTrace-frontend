import { ArrowLeft, FileText, PenLine, Upload } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { activeDepartmentLeaderIds, isCompanyManager } from "../../shared/lib/access";
import { instructionScopeLabel } from "../../shared/lib/formatters";
import { FileDropZone, SelectControl } from "../../shared/ui/primitives";
import type { AnalysisInstruction, CompanyResponse, DepartmentMemberResponse, DepartmentResponse, InstructionScope, SessionState } from "../../types";
import { InstructionExample } from "./InstructionExample";
import { LiveMarkdownEditor } from "./LiveMarkdownEditor";
import { TransientAlert } from "../../shared/ui/TransientAlert";

const initialMarkdown = "# Новая инструкция\n\n## Цель\n\nОпишите правила анализа звонка.\n";

export function NewInstructionPage({ session, companies, departments, departmentMembers, onCancel, onCreated }: {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  onCancel: () => void;
  onCreated: (instruction: AnalysisInstruction) => void;
}) {
  const managedCompanies = useMemo(() => companies.filter((company) => isCompanyManager(company, session.user.id)), [companies, session.user.id]);
  const managedCompanyIds = useMemo(() => new Set(managedCompanies.map((company) => company.id)), [managedCompanies]);
  const ledDepartmentIds = useMemo(() => activeDepartmentLeaderIds(departmentMembers, session.user.id), [departmentMembers, session.user.id]);
  const editableDepartments = useMemo(() => departments.filter((department) => managedCompanyIds.has(department.company_uuid) || ledDepartmentIds.has(department.id)), [departments, ledDepartmentIds, managedCompanyIds]);
  const companiesWithDepartments = useMemo(() => companies.filter((company) => editableDepartments.some((department) => department.company_uuid === company.id)), [companies, editableDepartments]);
  const scopes = useMemo<InstructionScope[]>(() => ["personal", ...(managedCompanies.length ? ["company" as const] : []), ...(editableDepartments.length ? ["department" as const] : [])], [editableDepartments.length, managedCompanies.length]);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"editor" | "upload">(() => new URLSearchParams(window.location.search).get("mode") === "upload" ? "upload" : "editor");
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [scope, setScope] = useState<InstructionScope>("personal");
  const selectableCompanies = scope === "department" ? companiesWithDepartments : managedCompanies;
  const [companyId, setCompanyId] = useState("");
  const availableDepartments = editableDepartments.filter((department) => department.company_uuid === companyId);
  const [departmentId, setDepartmentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (scope !== "personal" && !selectableCompanies.some((company) => company.id === companyId)) setCompanyId(selectableCompanies[0]?.id ?? "");
  }, [companyId, scope, selectableCompanies]);
  useEffect(() => {
    if (scope === "department" && !availableDepartments.some((department) => department.id === departmentId)) setDepartmentId(availableDepartments[0]?.id ?? "");
  }, [availableDepartments, departmentId, scope]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!title.trim()) return setError("Введите название инструкции.");
    if (mode === "editor" && !markdown.trim()) return setError("Напишите содержимое инструкции.");
    if (mode === "upload" && !file) return setError("Выберите файл инструкции.");
    if (scope !== "personal" && !companyId) return setError("Выберите компанию.");
    if (scope === "department" && !departmentId) return setError("Выберите отдел.");
    setBusy(true);
    try {
      const safeName = title.trim().replace(/[<>:"/\\|?*]+/g, "-");
      const instructionFile = mode === "editor" ? new File([markdown], `${safeName}.md`, { type: "text/markdown;charset=utf-8" }) : file!;
      const created = await api.createInstruction({ title: title.trim(), file: instructionFile, scope, companyUuid: scope !== "personal" ? companyId : undefined, departmentUuid: scope === "department" ? departmentId : undefined });
      onCreated(created);
      // The criteria tab starts compiling the new instruction at once.
      window.history.pushState({}, "", `/app/instructions/${encodeURIComponent(created.id)}?tab=criteria`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать инструкцию.");
    } finally { setBusy(false); }
  }

  return <section className="app-page instruction-create-page">
    <div className="settings-back-row"><button className="ghost-button small" type="button" onClick={onCancel}><ArrowLeft size={16}/>К инструкциям</button></div>
    <form className="instructions-form glass" onSubmit={submit}>
      <div className="app-page-heading settings-heading compact-heading"><span className="settings-heading-icon" aria-hidden="true"><FileText size={26}/></span><div><h1>Новая инструкция</h1><p>Создайте Markdown на сайте или загрузите готовый документ.</p></div></div>
      <label>Название инструкции<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, Контроль следующего шага"/></label>
      {/* Without a company or a department to lead, an instruction can only be
          personal, so there is nothing to choose. */}
      <div className="instruction-create-options">
        {scopes.length > 1 ? <div className="segmented scope" role="group" aria-label="Где действует инструкция">{scopes.map((item) => <button type="button" key={item} className={scope === item ? "active" : ""} onClick={() => setScope(item)}>{instructionScopeLabel(item)}</button>)}</div> : null}
        <div className="segmented scope instruction-create-mode" role="group" aria-label="Как создать инструкцию"><button type="button" className={mode === "editor" ? "active" : ""} onClick={() => setMode("editor")}><PenLine size={15}/>Markdown</button><button type="button" className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}><Upload size={15}/>Загрузить файл</button></div>
      </div>
      {scope !== "personal" && <div className="form-grid two"><label>Компания<SelectControl value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{selectableCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectControl></label>{scope === "department" && <label>Отдел<SelectControl value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>{availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectControl></label>}</div>}
      {mode === "editor" ? <div className="instruction-live-editor-field"><div className="instruction-live-editor-label"><strong>Текст инструкции</strong><small>Кликните по строке, чтобы изменить Markdown-разметку</small></div><LiveMarkdownEditor value={markdown} onChange={setMarkdown}/></div> : <div><span className="field-title">Файл инструкции</span><FileDropZone file={file} icon={<FileText size={22}/>} accept=".md,.pdf,.docx,.xlsx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" buttonLabel="Выбрать файл" emptyLabel="Перетащите MD, PDF, DOCX или XLSX сюда" onFile={setFile}/></div>}
      <InstructionExample />
      {error && <TransientAlert message={error} />}
      <div className="instruction-create-actions"><button className="ghost-button" type="button" disabled={busy} onClick={onCancel}>Отмена</button><button className="primary-button" disabled={busy}>{busy ? "Сохраняю…" : "Создать инструкцию"}</button></div>
    </form>
  </section>;
}
