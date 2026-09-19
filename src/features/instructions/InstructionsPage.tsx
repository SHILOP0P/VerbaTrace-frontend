import {
  ArrowLeft,
  Building2,
  Download,
  FileText,
  Lightbulb,
  Plus,
  Trash2,
  Upload,
  UserRound,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type {
  AnalysisInstruction,
  CompanyResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  SessionState
} from "../../types";

import { activeDepartmentLeaderIds, isCompanyManager } from "../../shared/lib/access";
import { pluralizeRu } from "../../shared/lib/plans";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { InstructionListSkeleton } from "../../shared/ui/loading";
import { instructionContextLabel } from "./instruction-components";
import { InstructionExample, writingTips } from "./InstructionExample";

export function InstructionsPage({
  session,
  instructions,
  companies,
  departments,
  departmentMembers,
  loading,
  onBackToSettings
}: {
  session: SessionState;
  instructions: AnalysisInstruction[];
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  loading: boolean;
  onBackToSettings: () => void;
}) {
  const [localInstructions, setLocalInstructions] = useState(instructions);
  const managedCompanies = useMemo(
    () => companies.filter((company) => isCompanyManager(company, session.user.id)),
    [companies, session.user.id]
  );
  const managedCompanyIds = useMemo(
    () => new Set(managedCompanies.map((company) => company.id)),
    [managedCompanies]
  );
  const ledDepartmentIds = useMemo(
    () => activeDepartmentLeaderIds(departmentMembers, session.user.id),
    [departmentMembers, session.user.id]
  );
  const editableDepartments = useMemo(
    () =>
      departments.filter(
        (department) =>
          managedCompanyIds.has(department.company_uuid) || ledDepartmentIds.has(department.id)
      ),
    [departments, ledDepartmentIds, managedCompanyIds]
  );
  const editableDepartmentIds = useMemo(
    () => new Set(editableDepartments.map((department) => department.id)),
    [editableDepartments]
  );
  const newestFirst = (items: AnalysisInstruction[]) => [...items].sort((left, right) => {
    const dateDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
    return dateDifference || right.id.localeCompare(left.id);
  });
  const personalInstructions = newestFirst(localInstructions.filter((instruction) => instruction.scope === "personal"));
  const companyInstructions = newestFirst(localInstructions.filter(
    (instruction) =>
      instruction.scope === "company" &&
      Boolean(instruction.company_uuid && managedCompanyIds.has(instruction.company_uuid))
  ));
  const departmentInstructions = newestFirst(localInstructions.filter(
    (instruction) =>
      instruction.scope === "department" &&
      Boolean(instruction.department_uuid && editableDepartmentIds.has(instruction.department_uuid))
  ));
  const instructionSections = [
    {
      title: "Личные",
      instructions: personalInstructions
    },
    {
      title: "Компании",
      instructions: companyInstructions
    },
    {
      title: "Отделы",
      instructions: departmentInstructions
    }
  ].filter((section) => section.instructions.length > 0);
  const shownInstructions = instructionSections.flatMap((section) => section.instructions);
  const activeCount = shownInstructions.filter((instruction) => instruction.is_active).length;

  useEffect(() => {
    setLocalInstructions(instructions);
  }, [instructions]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettingsInstructions() {
      const loaded = (
        await Promise.all([
          api.listInstructions({ scope: "personal", include_inactive: true }).catch(() => []),
          ...managedCompanies.map((company) =>
            api.listInstructions({ scope: "company", company_uuid: company.id, include_inactive: true }).catch(() => [])
          ),
          ...editableDepartments.map((department) =>
            api
              .listInstructions({
                scope: "department",
                company_uuid: department.company_uuid,
                department_uuid: department.id,
                include_inactive: true
              })
              .catch(() => [])
          )
        ])
      ).flat();

      if (!cancelled) setLocalInstructions(loaded);
    }

    loadSettingsInstructions();
    return () => {
      cancelled = true;
    };
  }, [managedCompanies, editableDepartments]);

  const openNew = (query = "") => { window.history.pushState({}, "", `/app/instructions/new${query}`); window.dispatchEvent(new PopStateEvent("popstate")); };

  return (
    <section className="instructions-page app-page settings-subpage-layout">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBackToSettings}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <header className="instructions-page-head">
        <div className="app-page-heading settings-heading">
          <span className="settings-heading-icon" aria-hidden="true">
            <FileText size={22} />
          </span>
          <div>
            <h1>Инструкции</h1>
            <p>По инструкции AI оценивает звонки: каждый её пункт становится критерием.</p>
          </div>
        </div>
        <div className="instructions-page-actions">
          <button className="ghost-button" type="button" onClick={() => openNew("?mode=upload")}>
            <Upload size={17} /> Загрузить файл
          </button>
          <button className="primary-button" type="button" onClick={() => openNew()}>
            <Plus size={17} /> Новая инструкция
          </button>
        </div>
      </header>
      <div className="instructions-page-body">
        <div className="instructions-catalog">
          <header className="instructions-catalog-head">
            <h2>Ваши инструкции</h2>
            {!loading && shownInstructions.length > 0 && <span>{activeCount} {pluralizeRu(activeCount, "активна", "активны", "активны")} из {shownInstructions.length}</span>}
          </header>
          {loading ? (
            <InstructionListSkeleton count={4} />
          ) : instructionSections.length === 0 ? (
            <div className="instructions-empty">
              <span aria-hidden="true"><FileText size={22} /></span>
              <strong>Инструкций пока нет</strong>
              <p>Опишите, что проверять в разговоре, или загрузите готовый документ — критерии оценки соберутся из него.</p>
              <button className="primary-button" type="button" onClick={() => openNew()}><Plus size={17} /> Новая инструкция</button>
            </div>
          ) : (
            instructionSections.map((section) => (
              <InstructionSection
                key={section.title}
                title={section.title}
                instructions={section.instructions}
                companies={companies}
                departments={departments}
                onInstructionChanged={(updated) =>
                  setLocalInstructions((current) => current.map((item) => item.id === updated.id ? updated : item))
                }
                onInstructionDeleted={(instructionId) =>
                  setLocalInstructions((current) => current.filter((item) => item.id !== instructionId))
                }
              />
            ))
          )}
        </div>
        <aside className="instructions-help" aria-label="Как писать инструкцию">
          <div className="instructions-help-card">
            <strong><Lightbulb size={16} />Как писать, чтобы критерии получились точными</strong>
            <ul>{writingTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          </div>
          <InstructionExample showTips={false} />
        </aside>
      </div>
    </section>
  );
}

export function InstructionSection({
  title,
  instructions,
  companies,
  departments,
  onInstructionChanged,
  onInstructionDeleted
}: {
  title: string;
  instructions: AnalysisInstruction[];
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  onInstructionChanged: (instruction: AnalysisInstruction) => void;
  onInstructionDeleted: (instructionId: string) => void;
}) {
  return (
    <section className="instructions-group">
      <h3>{title === "Личные" ? <UserRound size={14} aria-hidden="true" /> : title === "Отделы" ? <Users size={14} aria-hidden="true" /> : <Building2 size={14} aria-hidden="true" />}{title}<b>{instructions.length}</b></h3>
      {instructions.map((instruction) => (
        <InstructionRow
          key={instruction.id}
          instruction={instruction}
          companies={companies}
          departments={departments}
          onInstructionChanged={onInstructionChanged}
          onInstructionDeleted={onInstructionDeleted}
        />
      ))}
    </section>
  );
}

export function InstructionRow({
  instruction,
  companies,
  departments,
  onInstructionChanged,
  onInstructionDeleted
}: {
  instruction: AnalysisInstruction;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  onInstructionChanged: (instruction: AnalysisInstruction) => void;
  onInstructionDeleted: (instructionId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const name = instruction.title || instruction.original_filename || "Инструкция";
  // The file name is a detail worth showing only when a person chose it; a
  // name built from an identifier tells the reader nothing.
  const machineName = /[0-9a-f]{8}[-_][0-9a-f]{4}[-_][0-9a-f]{4}/i.test(instruction.original_filename ?? "");
  const fileName = instruction.original_filename && !machineName && ![instruction.title, `${instruction.title}.md`].includes(instruction.original_filename) ? instruction.original_filename : "";
  const format = instructionFormat(instruction);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : failure); } finally { setBusy(false); }
  }

  async function download() {
    await run(async () => {
      const blob = await api.downloadInstruction(instruction.download_url || instruction.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = instruction.original_filename || `${instruction.title}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, "Не удалось скачать инструкцию");
  }

  return (
    <div className={`instruction-item${instruction.is_active ? "" : " is-off"}`}>
      <button className="instruction-item-link" type="button" onClick={() => { window.history.pushState({}, "", `/app/instructions/${encodeURIComponent(instruction.id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>
        <span className={`instruction-item-format is-${format.key}`} aria-hidden="true">{format.label}</span>
        {/* The name the owner gave comes first; the file it came from is a detail. */}
        <span className="instruction-item-name">
          <strong>{name}</strong>
          <small>
            {instructionContextLabel(instruction, companies, departments)}
            {fileName ? ` · ${fileName}` : ""}
            {` · обновлена ${formatUpdated(instruction.updated_at || instruction.created_at)}`}
          </small>
        </span>
      </button>
      <div className="instruction-item-actions">
        <button
          className={`instruction-switch${instruction.is_active ? " is-on" : ""}`}
          type="button"
          role="switch"
          aria-checked={instruction.is_active}
          disabled={busy}
          onClick={() => void run(async () => {
            const updated = await api.updateInstruction(instruction.id, { is_active: !instruction.is_active });
            onInstructionChanged(updated);
          }, "Не удалось изменить инструкцию")}
        >
          <span className="instruction-switch-track" aria-hidden="true"><i /></span>
          {instruction.is_active ? "Активна" : "Отключена"}
        </button>
        <button className="icon-button" type="button" aria-label="Скачать инструкцию" disabled={busy} onClick={() => void download()}>
          <Download size={16} />
        </button>
        <label className="icon-button" aria-label="Заменить файл">
          <Upload size={16} />
          <input
            type="file"
            accept=".md,.pdf,.docx,.xlsx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void run(async () => onInstructionChanged(await api.replaceInstructionFile(instruction.id, file)), "Не удалось заменить файл");
            }}
          />
        </label>
        <button className="icon-button instruction-delete" type="button" aria-label="Удалить инструкцию" disabled={busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} />
        </button>
      </div>
      {error && <p className="form-error instruction-item-error" role="alert">{error}</p>}
      <ConfirmDialog
        open={confirmDelete}
        title="Удалить инструкцию?"
        message={`«${name}» перестанет применяться к новым звонкам.`}
        confirmLabel="Удалить"
        variant="danger"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void run(async () => {
          await api.deleteInstruction(instruction.id);
          setConfirmDelete(false);
          onInstructionDeleted(instruction.id);
        }, "Не удалось удалить инструкцию")}
      />
    </div>
  );
}

// The document's format tells the owner which file this is before its name
// does, so each format keeps one colour across the list.
function instructionFormat(instruction: AnalysisInstruction): { key: string; label: string } {
  const extension = instruction.original_filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = instruction.mime_type.toLowerCase();
  if (extension === "docx" || mime.includes("wordprocessingml")) return { key: "docx", label: "DOCX" };
  if (extension === "pdf" || mime === "application/pdf") return { key: "pdf", label: "PDF" };
  if (extension === "xlsx" || mime.includes("spreadsheetml")) return { key: "xlsx", label: "XLSX" };
  return { key: "md", label: "MD" };
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "недавно";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("ru-RU", sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}
