import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  PanelLeftClose,
  Plus,
  Trash2,
  Upload
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
import { InstructionListSkeleton } from "../../shared/ui/loading";
import { instructionContextLabel } from "./instruction-components";
import { InstructionExample } from "./InstructionExample";

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
  const [instructionPanelCollapsed, setInstructionPanelCollapsed] = useState(
    () => window.localStorage.getItem("verbatrace:instructions-panel-collapsed") === "1"
  );
  const [compactInstructionLayout, setCompactInstructionLayout] = useState(
    () => window.matchMedia("(max-width: 760px)").matches
  );
  const instructionPanelEffectivelyCollapsed = instructionPanelCollapsed && !compactInstructionLayout;
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
      title: "Личная инструкция",
      instructions: personalInstructions
    },
    {
      title: "Инструкция компании",
      instructions: companyInstructions
    },
    {
      title: "Инструкция Отдела",
      instructions: departmentInstructions
    }
  ].filter((section) => section.instructions.length > 0);

  useEffect(() => {
    setLocalInstructions(instructions);
  }, [instructions]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const syncLayout = () => setCompactInstructionLayout(media.matches);
    syncLayout();
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  function toggleInstructionPanel() {
    setInstructionPanelCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("verbatrace:instructions-panel-collapsed", next ? "1" : "0");
      return next;
    });
  }

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

  return (
    <section className={`instructions-layout collapsible-instructions-layout app-page settings-subpage-layout ${instructionPanelEffectivelyCollapsed ? "call-list-collapsed" : ""}`}>
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBackToSettings}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <button
        className="icon-button calls-list-collapse instructions-panel-toggle"
        type="button"
        aria-label={instructionPanelEffectivelyCollapsed ? "Открыть панель инструкций" : "Свернуть панель инструкций"}
        aria-controls="instructions-actions-panel"
        aria-expanded={!instructionPanelEffectivelyCollapsed}
        title={instructionPanelEffectivelyCollapsed ? "Открыть панель инструкций" : "Свернуть панель инструкций"}
        onClick={toggleInstructionPanel}
      >
        <span className="instructions-panel-toggle-expanded" aria-hidden="true"><PanelLeftClose size={19} /></span>
        <span className="instructions-panel-toggle-collapsed" aria-hidden="true"><ChevronRight size={21} /></span>
      </button>
      <aside
        id="instructions-actions-panel"
        className="instructions-form glass instructions-list-header calls-sidebar"
        aria-label="Создание инструкций"
        aria-hidden={instructionPanelEffectivelyCollapsed ? true : undefined}
        inert={instructionPanelEffectivelyCollapsed}
      >
        <div className="app-page-heading settings-heading compact-heading">
          <span className="settings-heading-icon" aria-hidden="true">
            <FileText size={26} />
          </span>
          <div>
            <h1>Инструкции</h1>
            <p>Инструкция определяет, как AI будет оценивать звонок в выбранном контексте.</p>
          </div>
        </div>
        <div className="instructions-list-header-actions">
          <button className="ghost-button" type="button" onClick={() => { window.history.pushState({}, "", "/app/instructions/new?mode=upload"); window.dispatchEvent(new PopStateEvent("popstate")); }}>
            <Upload size={17} /> Загрузить файл
          </button>
          <button className="primary-button" type="button" onClick={() => { window.history.pushState({}, "", "/app/instructions/new"); window.dispatchEvent(new PopStateEvent("popstate")); }}>
            <Plus size={17} /> Новая инструкция
          </button>
        </div>
        <InstructionExample />
      </aside>
      <div className="instructions-list glass">
        <h2>Активные инструкции</h2>
        {loading ? (
          <InstructionListSkeleton count={4} />
        ) : instructionSections.length === 0 ? (
          <div className="instruction-empty standalone">Инструкций пока нет.</div>
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
    <section className="instruction-section">
      <div className="instruction-section-title">
        <span />
        <strong>{title}</strong>
        <span />
      </div>
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
  async function download() {
    const blob = await api.downloadInstruction(instruction.download_url || instruction.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = instruction.original_filename || `${instruction.title}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="instruction-row">
      <button className="instruction-row-link" type="button" onClick={() => { window.history.pushState({}, "", `/app/instructions/${encodeURIComponent(instruction.id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>
        <FileText size={20} />
        {/* The name the owner gave comes first; the file it came from is a detail. */}
        <span className="instruction-row-name">
          <strong>{instruction.title || instruction.original_filename}</strong>
          {instruction.original_filename && ![instruction.title, `${instruction.title}.md`].includes(instruction.original_filename) ? <small>{instruction.original_filename}</small> : null}
        </span>
      </button>
      <div className="instruction-row-footer">
        <small>
          {instructionContextLabel(instruction, companies, departments)}
        </small>
        <span className={`status-chip ${instruction.is_active ? "ok" : "warn"}`}>
          {instruction.is_active ? "Активна" : "Отключена"}
        </span>
        <div className="panel-actions">
        <button
          className="text-button"
          type="button"
          onClick={async () => {
            const updated = await api.updateInstruction(instruction.id, { is_active: !instruction.is_active });
            onInstructionChanged(updated);
          }}
        >
          {instruction.is_active ? "Отключить" : "Включить"}
        </button>
        <button className="icon-button" type="button" aria-label="Скачать инструкцию" onClick={download}>
          <Download size={16} />
        </button>
        <label className="icon-button" aria-label="Заменить файл">
          <Upload size={16} />
          <input
            type="file"
            accept=".md,.pdf,.docx,.xlsx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const updated = await api.replaceInstructionFile(instruction.id, file);
              onInstructionChanged(updated);
            }}
          />
        </label>
        <button
          className="icon-button"
          type="button"
          aria-label="Удалить инструкцию"
          onClick={async () => {
            await api.deleteInstruction(instruction.id);
            onInstructionDeleted(instruction.id);
          }}
        >
          <Trash2 size={16} />
        </button>
        </div>
      </div>
    </div>
  );
}
