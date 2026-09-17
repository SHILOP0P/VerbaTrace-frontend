import {
  ChevronDown,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type {
  AnalysisInstruction,
  AnalysisResponse,
  AppPage,
  CallFolderResponse,
  CallResponse,
  CallStatus,
  CompanyResponse,
  DepartmentResponse,
  SessionState,
  VisibilityScope
} from "../../types";

import { analysisProgress, isAnalysisDone } from "../../shared/lib/analysis";
import { enterOverlayMode } from "../../shared/lib/page-scroll";
import { useDrawerLayout } from "../../shared/lib/drawer-layout";
import { AnalysisStructuredView } from "../../shared/ui/analysis";
import { StatusChip, StatusTimeline } from "../../shared/ui/call";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { AnalysisResultSkeleton, CallListSkeleton } from "../../shared/ui/loading";
import { availableInstructionsForCall, contextInstructionCaption, InstructionMiniList } from "../instructions/instruction-components";
import { ReportExportPanel } from "../reports/ReportExportPanel";
import { CustomScrollbar } from "../../shared/ui/custom-scrollbar";
import { MobileCallDrawerTrigger } from "../../shared/ui/mobile-call-drawer-trigger";
import { SelectControl } from "../../shared/ui/primitives";
import { folderScopeLabel, loadCallFoldersForContext } from "../calls/call-page-utils";

export function AnalysisPage({
  session,
  calls,
  selectedCall,
  selectedCallId,
  selectedCallTimeline,
  analyses,
  instructions,
  companies,
  departments,
  loading,
  loadingDetails,
  onSelectCall,
  onAnalysisReady,
  onDeleteCall,
  onCallUpdated,
  onNavigate
}: {
  session: SessionState;
  calls: CallResponse[];
  selectedCall?: CallResponse;
  selectedCallId: string;
  selectedCallTimeline?: CallStatus[];
  analyses: Record<string, AnalysisResponse>;
  instructions: AnalysisInstruction[];
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  loading: boolean;
  loadingDetails: boolean;
  onSelectCall: (callId: string) => void;
  onAnalysisReady: (callId: string, analysis: AnalysisResponse) => void;
  onDeleteCall: (callId: string) => Promise<void>;
  onCallUpdated?: (call: CallResponse) => void;
  onNavigate: (page: AppPage) => void;
}) {
  const analysisSidebarScrollRef = useRef<HTMLElement | null>(null);
  const analysisDetailScrollRef = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isDrawerLayout = useDrawerLayout();
  const [statusFilter, setStatusFilter] = useState<CallStatus | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<VisibilityScope | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [callFolders, setCallFolders] = useState<CallFolderResponse[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderCallsById, setFolderCallsById] = useState<Record<string, CallResponse[]>>({});
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const analysis = selectedCall ? analyses[selectedCall.id] : undefined;
  const resultState = analysisResultState(selectedCall, analysis);
  const availableInstructions = selectedCall
    ? availableInstructionsForCall(instructions, selectedCall)
    : [];
  const filteredCalls = calls.filter((call) => {
    const query = searchQuery.trim().toLowerCase();
    return (
      (statusFilter === "all" || call.status === statusFilter) &&
      (scopeFilter === "all" || call.visibility_scope === scopeFilter) &&
      (!query || `${call.title} ${call.original_filename}`.toLowerCase().includes(query))
    );
  });
  const filteredCallIds = new Set(filteredCalls.map((call) => call.id));

  useEffect(() => {
    setShowFullAnalysis(false);
    setDeleteConfirmOpen(false);
  }, [selectedCall?.id]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };

    const leaveOverlay = enterOverlayMode();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      leaveOverlay();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    let cancelled = false;
    setFoldersLoading(true);
    loadCallFoldersForContext(companies, departments)
      .then((folders) => {
        if (!cancelled) setCallFolders(folders);
      })
      .catch(() => {
        if (!cancelled) setCallFolders([]);
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companies, departments]);

  async function toggleAnalysisFolder(folderId: string) {
    const nextExpanded = !expandedFolderIds[folderId];
    setExpandedFolderIds((current) => ({ ...current, [folderId]: nextExpanded }));
    if (!nextExpanded || folderCallsById[folderId]) return;
    const response = await api.listCalls({ folder_uuid: folderId, limit: 100, offset: 0 }).catch(() => []);
    setFolderCallsById((current) => ({
      ...current,
      [folderId]: Array.isArray(response) ? response : response.items
    }));
  }

  async function runAnalysis() {
    if (!selectedCall) return;
    setError("");
    setBusy(true);
    try {
      const result = await api.analyzeCall(selectedCall.id);
      onAnalysisReady(selectedCall.id, result);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Не удалось запустить анализ");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedCall() {
    if (!selectedCall || deleting) return;

    setDeleteError("");
    setDeleting(true);
    try {
      await onDeleteCall(selectedCall.id);
      setDeleteConfirmOpen(false);
    } catch (deleteCallError) {
      setDeleteError(deleteCallError instanceof Error ? deleteCallError.message : "Не удалось удалить звонок");
    } finally {
      setDeleting(false);
    }
  }

  function renderAnalysisCallRow(call: CallResponse, keyPrefix = "") {
    return (
      <button
        key={`${keyPrefix}${call.id}`}
        className={`call-row ${selectedCallId === call.id ? "selected" : ""}`}
        onClick={() => {
          onSelectCall(call.id);
          setMobileSidebarOpen(false);
        }}
      >
        <span className="play-dot">
          <Sparkles size={14} />
        </span>
        <span>
          <strong>{call.title}</strong>
          <StatusChip transcriptionOnly={call.transcription_only} status={call.status} analysisStatus={analyses[call.id]?.status} />
        </span>
      </button>
    );
  }

  return (
    <section className="analysis-layout atmospheric-page">
      <aside
        id="mobile-call-drawer"
        className={`calls-sidebar analysis-sidebar-drawer mobile-call-drawer glass custom-scroll-target ${mobileSidebarOpen ? "open" : ""}`}
        ref={analysisSidebarScrollRef}
        aria-label="Список звонков для анализа"
      >
        <div className="panel-heading">
          <h2>AI-аналитика</h2>
          <div className="analysis-sidebar-actions mobile-call-drawer-heading-actions">
            <button className="primary-button small" onClick={() => onNavigate("upload")}>
              <Plus size={16} />
              Звонок
            </button>
            <button
              className="icon-button analysis-drawer-close mobile-call-drawer-close"
              type="button"
              aria-label="Закрыть список звонков"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
        </div>
        <div className="calls-filter-bar analysis-call-filters">
          <SelectControl
            aria-label="Статус звонка"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as CallStatus | "all")}
          >
            <option value="all">Все статусы</option>
            <option value="new">Новые</option>
            <option value="processing">В обработке</option>
            <option value="transcribed">Расшифрованы</option>
            <option value="analyzed">Анализ готов</option>
            <option value="failed">Ошибки</option>
          </SelectControl>
          <SelectControl
            aria-label="Область звонка"
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value as VisibilityScope | "all")}
          >
            <option value="all">Все области</option>
            <option value="personal">Личные</option>
            {companies.length > 0 && <option value="company">Компании</option>}
            {departments.length > 0 && <option value="department">Отделы</option>}
          </SelectControl>
          <input
            aria-label="Поиск звонка"
            placeholder="Поиск по названию"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <section className="call-folder-panel analysis-call-folders">
          <div className="call-folder-heading">
            <div>
              <strong>Папки</strong>
              <small>{foldersLoading ? "Загружаю..." : `${callFolders.length} доступно`}</small>
            </div>
          </div>
          <div className="call-folder-tree">
            {callFolders.map((folder) => {
              const expanded = Boolean(expandedFolderIds[folder.id]);
              const folderCalls = (folderCallsById[folder.id] ?? []).filter((call) => filteredCallIds.has(call.id));
              return (
                <div className={`call-folder-project ${expanded ? "expanded" : ""}`} key={folder.id}>
                  <button
                    className="call-folder-project-button"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => void toggleAnalysisFolder(folder.id)}
                  >
                    {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <span
                      className="folder-color-dot"
                      style={{ "--folder-color": folder.color || "#ff7a43" } as React.CSSProperties}
                    />
                    <span>
                      <strong title={folder.name}>{folder.name}</strong>
                      <small>{folderScopeLabel(folder)} · {folder.calls_count} звонков</small>
                    </span>
                  </button>
                  {expanded && (
                    <div className="call-folder-child-list">
                      {!folderCallsById[folder.id] ? (
                        <div className="call-folder-child-empty">Загружаю звонки...</div>
                      ) : folderCalls.length === 0 ? (
                        <div className="call-folder-child-empty">Нет звонков по текущим фильтрам.</div>
                      ) : (
                        folderCalls.map((call) => renderAnalysisCallRow(call, `${folder.id}-`))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <p className="muted-title">Все звонки</p>
        <div className="call-list compact-list">
          {loading ? (
            <CallListSkeleton compact count={4} />
          ) : (
            filteredCalls.map((call) => renderAnalysisCallRow(call))
          )}
        </div>
      </aside>
      <button
        className={`analysis-drawer-backdrop mobile-call-drawer-backdrop ${mobileSidebarOpen ? "open" : ""}`}
        type="button"
        aria-label="Закрыть список звонков"
        tabIndex={mobileSidebarOpen ? 0 : -1}
        onClick={() => setMobileSidebarOpen(false)}
      />
      {/* Only while the drawer is on screen: otherwise its scrollbar stayed
          drawn over the page behind it. */}
      {(!isDrawerLayout || mobileSidebarOpen) && (
        <CustomScrollbar targetRef={analysisSidebarScrollRef} className="analysis-drawer-scroll-thumb mobile-call-drawer-scroll-thumb" />
      )}
      <section className="analysis-detail glass custom-scroll-target" ref={analysisDetailScrollRef}>
        <div className="panel-heading large">
          <div>
            <h1>AI-аналитика</h1>
            <p>Качество разговоров, ключевые темы, сигналы по выбранному звонку и рекомендации AI.</p>
          </div>
          <MobileCallDrawerTrigger open={mobileSidebarOpen} onToggle={() => setMobileSidebarOpen((current) => !current)} />
          <div className="panel-actions">
            <button className="primary-button" onClick={runAnalysis} disabled={!selectedCall || busy}>
              <WandSparkles size={18} />
              {busy ? "Анализирую..." : "Запустить анализ"}
            </button>
            <button className="ghost-button danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={!selectedCall || deleting}>
              <Trash2 size={18} />
              {deleting ? "Удаляю..." : "Удалить"}
            </button>
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        {deleteError && <div className="form-error">{deleteError}</div>}
        {selectedCall && (
          <StatusTimeline transcriptionOnly={Boolean(selectedCall.transcription_only && !analysis)} current={selectedCall.status} statuses={selectedCallTimeline} analysisProgress={analysisProgress(analysis)} analysisStatus={analysis?.status} />
        )}
        {selectedCall && <ReportExportPanel call={selectedCall} analysis={analysis} />}
        <div className="analysis-content-grid">
          {!(selectedCall?.transcription_only && !analysis) && <div className="info-card report-panel analysis-result-panel">
            <div className="card-title">
              <h3>Результат</h3>
              <span className={`status-chip ${resultState.tone} ${resultState.thinking ? "thinking-status" : ""}`}>
                {resultState.label}
              </span>
            </div>
            {loadingDetails || (loading && !selectedCall) ? (
              <AnalysisResultSkeleton />
            ) : !isAnalysisDone(analysis) && !analysisProgress(analysis) ? (
              <div className="empty-state compact analysis-result-empty">
                {resultState.thinking
                  ? "Производится анализ транскрипции. Результат появится после завершения обработки."
                  : selectedCall
                    ? "Для этого звонка еще нет готового AI-анализа."
                    : "Выберите звонок, чтобы увидеть результат анализа."}
              </div>
            ) : (
              <div className="analysis-user-summary">
                <div className={`analysis-full-text expandable-content ${showFullAnalysis || !isAnalysisDone(analysis) ? "expanded" : "collapsed"}`}>
                  <AnalysisStructuredView analysis={analysis} />
                </div>
                {isAnalysisDone(analysis) && <button
                  className={`analysis-toggle-button ${showFullAnalysis ? "expanded" : ""}`}
                  type="button"
                  aria-expanded={showFullAnalysis}
                  onClick={() => setShowFullAnalysis((current) => !current)}
                >
                  <span>{showFullAnalysis ? "Свернуть анализ" : "Открыть полный анализ"}</span>
                  <span className="analysis-toggle-icon">
                    <ChevronRight size={18} />
                  </span>
                </button>}
              </div>
            )}
          </div>}
          <div className="info-card">
            <div className="card-title">
              <h3>Инструкции для этого звонка</h3>
              <span className="status-chip ok">{contextInstructionCaption(selectedCall)}</span>
            </div>
            <InstructionMiniList
              instructions={availableInstructions}
              companies={companies}
              departments={departments}
            />
          </div>
        </div>
      </section>
      <CustomScrollbar targetRef={analysisDetailScrollRef} />
      {selectedCall && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          variant="danger"
          title="Удалить звонок?"
          message={`Звонок «${selectedCall.title}» будет удален без возможности восстановления.`}
          confirmLabel="Удалить"
          busy={deleting}
          onCancel={() => {
            if (!deleting) setDeleteConfirmOpen(false);
          }}
          onConfirm={() => void deleteSelectedCall()}
        />
      )}
    </section>
  );
}

function analysisResultState(
  call: CallResponse | undefined,
  analysis: AnalysisResponse | undefined
): {
  label: string;
  tone: "ok" | "warn" | "bad";
  thinking?: boolean;
} {
  if (analysis?.status === "failed") {
    return { label: "Ошибка анализа", tone: "bad" };
  }

	const progress = analysisProgress(analysis);
	if (progress && analysis?.status !== "done") {
		const label = { inventory: "Находим вопросы", answers: `Готово ${progress.items_done} из ${progress.items_total}`, validation: "Проверяем и подводим итог", complete: "Сохраняем итог" }[progress.stage];
		return { label, tone: "warn", thinking: true };
	}

  if (call?.status === "transcribed" || analysis?.status === "pending" || analysis?.status === "processing") {
    return { label: "Производится анализ транскрипции", tone: "warn", thinking: true };
  }

  if (isAnalysisDone(analysis) || call?.status === "analyzed") {
    return { label: "Готово", tone: "ok" };
  }

  return { label: "Ожидает", tone: "warn" };
}
