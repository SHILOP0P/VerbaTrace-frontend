import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type { AnalysisInstruction, SessionState, CompanyResponse, DepartmentMemberResponse } from "../../types";
import { InstructionDraftEditor } from "./InstructionDraftEditor";
import { InstructionDocumentPanel } from "./InstructionDocumentPanel";
import { InstructionScorecardTab } from "./InstructionScorecardTab";
import { InstructionWorkspaceBody, InstructionWorkspaceHeading, type InstructionPane } from "./InstructionWorkspace";

type Props = { analysisId?: string; versionId?: string; instructionId?: string; session: SessionState; companies: CompanyResponse[]; departmentMembers: DepartmentMemberResponse[]; onBack: () => void };
export function InstructionHistoryPage({ instructionId, analysisId, versionId, onBack }: Props) {
  const [instruction, setInstruction] = useState<AnalysisInstruction>();
  const [blob, setBlob] = useState<Blob>();
  const [markdown, setMarkdown] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get("draft") === "true");
  const [pane, setPane] = useState<InstructionPane>(() => new URLSearchParams(window.location.search).get("tab") === "criteria" ? "criteria" : "document");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const focusKey = new URLSearchParams(window.location.search).get("criterion") ?? undefined;
  function setDraftMode(value: boolean) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("draft", "true"); else url.searchParams.delete("draft");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    setEditing(value);
  }
  useEffect(() => {
    let cancelled = false; setLoading(true); setError("");
    async function load() {
      let id = instructionId;
      if (!id && analysisId && versionId) id = (await api.getAppliedInstruction(analysisId, versionId)).instruction_id;
      if (!id) throw new Error("Инструкция недоступна. Использованные требования показаны в карточках анализа.");
      const [value, permission, file] = await Promise.all([
        api.getInstruction(id),
        api.getInstructionDraft(id).then(() => true).catch(cause => {
          if (cause instanceof ApiError && (cause.code === "instruction_draft_not_found" || cause.status === 404)) return true;
          if (cause instanceof ApiError && cause.status === 403) return false;
          throw cause;
        }),
        api.downloadInstruction(`/instructions/${encodeURIComponent(id)}/file`),
      ]);
      const text = value.original_filename.toLowerCase().endsWith(".md") ? await file.text() : "";
      if (!cancelled) { setInstruction(value); setBlob(file); setMarkdown(text); setCanEdit(permission); }
    }
    void load().catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Инструкция недоступна."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [instructionId, analysisId, versionId, reload]);
  if (loading) return <section className="instruction-workspace"><div className="instruction-history-loading" role="status" aria-label="Загружаем инструкцию" /></section>;
  if (!instruction || error) return <section className="instruction-workspace"><button className="ghost-button small" type="button" onClick={onBack}>К инструкциям</button><p className="field-error" role="alert">{error || "Инструкция недоступна."}</p></section>;
  if (editing && canEdit) return <InstructionDraftEditor instructionId={instruction.id} title={instruction.title} onBack={onBack} onClose={() => setDraftMode(false)} onApplied={() => { setDraftMode(false); setReload(value => value + 1); }} />;
  return <section className="instruction-workspace atmospheric-page">
    <InstructionWorkspaceHeading title={instruction.title} filename={instruction.original_filename} onBack={onBack} action={canEdit ? <button className="primary-button small" type="button" onClick={() => setDraftMode(true)}><Pencil size={15} />Открыть черновик</button> : undefined} />
    <p className="iw-introduction">Действующие критерии используются в анализах. Вес и выбор по умолчанию меняются для следующих проверок. Формулировки редактируются в черновике.</p>
    <InstructionWorkspaceBody pane={pane} onPaneChange={setPane}
      document={<InstructionDocumentPanel filename={instruction.original_filename} blob={blob} content={markdown} />}
      criteria={<InstructionScorecardTab instructionId={instruction.id} canEdit={canEdit} focusKey={focusKey} />} />
  </section>;
}
