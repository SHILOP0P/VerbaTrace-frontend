import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  ChevronRight,
  CloudUpload,
  FolderMinus,
  FolderPlus,
  FileText,
  Headphones,
  MessageSquareWarning,
  PhoneCall,
  RotateCcw,
  Trash2,
  WandSparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import type {
  AnalysisResponse,
  AppliedInstruction,
  AnalysisReviewContext,
  AppPage,
  CallFolderResponse,
  CallResponse,
  CallAction,
  CallStatus,
  CompanyResponse,
  DepartmentResponse,
  EffectiveAnalysis,
  MediaSeekTarget,
  TranscriptionResponse,
  TranscriptionSpeakerAssignment
  , TranscriptionRevisionSummary
} from "../../types";
import { ApiError, api } from "../../api";

import { analysisProgress, analysisNextStep, analysisScore100, formatScore, isAnalysisDone } from "../../shared/lib/analysis";
import { contextLabel, formatDate, formatDuration } from "../../shared/lib/formatters";
import { AnalysisPreview } from "../../shared/ui/analysis";
import { CallMediaPlayer } from "../../shared/ui/audio";
import { isCallBeingProcessed } from "../../shared/lib/call-status";
import { InfoCard, StatusChip, StatusTimeline, TranscriptPreview } from "../../shared/ui/call";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { CallDetailSkeleton } from "../../shared/ui/loading";
import { ReportExportPanel } from "../reports/ReportExportPanel";
import { AnalysisComments } from "./AnalysisComments";
import { CreateActionDialog } from "../actions/ActionsPage";
import { TranscriptCollapseIsland } from "./TranscriptCollapseIsland";

type CardProcessState = {
  label: string;
  tone: "ok" | "warn" | "bad";
  thinking?: boolean;
};

export function CallDetailPanel({
  call,
  currentUserId,
  companies,
  departments,
  transcription,
  analysis,
  timelineStatuses,
  loading,
  loadingDetails,
  onNavigate,
  onAnalysisReady,
  onDeleteCall,
  onCallUpdated,
  onOpenTranscriptionEditor,
  onOpenRevisionComparison,
  folders = [],
  activeFolder,
  folderActionBusy = false,
  onAssignToFolder,
  onRemoveFromFolder,
  drawerTrigger,
  showReports = false
}: {
  call?: CallResponse;
  currentUserId: string;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  transcription?: TranscriptionResponse;
  analysis?: AnalysisResponse;
  timelineStatuses?: CallStatus[];
  loading?: boolean;
  loadingDetails?: boolean;
  onNavigate: (page: AppPage) => void;
  onAnalysisReady?: (callId: string, analysis: AnalysisResponse) => void;
  onDeleteCall?: (callId: string) => Promise<void>;
  // Cancelling processing changes the call in place rather than removing it, so
  // the list has to hear about the new status.
  onCallUpdated?: (call: CallResponse) => void;
  onOpenTranscriptionEditor?: (callId: string) => void;
  onOpenRevisionComparison?: (callId: string, revision?: number) => void;
  folders?: CallFolderResponse[];
  activeFolder?: CallFolderResponse;
  folderActionBusy?: boolean;
  onAssignToFolder?: (folderId: string, callId: string) => Promise<void>;
  onRemoveFromFolder?: (folderId: string, callId: string) => Promise<void>;
  drawerTrigger?: ReactNode;
  showReports?: boolean;
}) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [transcriptExpandable, setTranscriptExpandable] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [restarting, setRestarting] = useState<"analyze" | "transcribe" | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisRunError, setAnalysisRunError] = useState("");
  const [rerunRequestOpen, setRerunRequestOpen] = useState(false);
  const [rerunReason, setRerunReason] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [seekTarget, setSeekTarget] = useState<MediaSeekTarget | null>(null);
  const [localTranscription, setLocalTranscription] = useState(transcription);
  const [revisions, setRevisions] = useState<TranscriptionRevisionSummary[]>([]);
  const [speakerAssignments, setSpeakerAssignments] = useState<TranscriptionSpeakerAssignment[]>([]);
  const [showRevisionHistory, setShowRevisionHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectingRevision, setSelectingRevision] = useState<number | null>(null);
  const [qualityReviewBusy, setQualityReviewBusy] = useState(false);
  const [qualityReviewError, setQualityReviewError] = useState("");
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeReason, setChallengeReason] = useState("");
  const [challengeSent, setChallengeSent] = useState(false);
  const [reviewContext, setReviewContext] = useState<AnalysisReviewContext>();
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionDecisionBusy, setActionDecisionBusy] = useState(false);
  const [actionDecisionMessage, setActionDecisionMessage] = useState("");
  const [noActionRequired, setNoActionRequired] = useState(false);
  const [noActionConfirmOpen, setNoActionConfirmOpen] = useState(false);
  const [linkedAction, setLinkedAction] = useState<CallAction>();
  const [appliedInstructions, setAppliedInstructions] = useState<AppliedInstruction[]>([]);
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [instructionsError, setInstructionsError] = useState("");
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const transcriptCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(()=>{if(!call?.id)return;const query=new URLSearchParams(window.location.search);if(query.get("call")!==call.id)return;const wordStart=optionalNonNegativeNumber(query.get("evidence_start"));const wordEnd=optionalNonNegativeNumber(query.get("evidence_end"));const startSeconds=optionalNonNegativeNumber(query.get("evidence_time"));const endSeconds=optionalNonNegativeNumber(query.get("evidence_end_time"));if(wordStart===undefined&&startSeconds===undefined)return;setShowFullTranscript(true);setSeekTarget({startSeconds:startSeconds??localTranscription?.words?.[wordStart??-1]?.start_seconds??0,endSeconds:endSeconds,wordStartIndex:wordStart,wordEndIndex:wordEnd??wordStart});requestAnimationFrame(()=>transcriptCardRef.current?.scrollIntoView({block:"start",behavior:"smooth"}))},[call?.id,localTranscription?.words]);
  const analysisCardRef = useRef<HTMLDivElement | null>(null);
  const displayedAnalysis = applyEffectiveAnalysis(analysis, reviewContext?.effective_analysis);
  const score = analysisScore100(displayedAnalysis);
  const canEditAnalysis = !call?.is_test && reviewContext?.capabilities.can_edit_analysis === true;
  const canDisputeAnalysis = !call?.is_test && reviewContext?.capabilities.can_dispute_analysis === true;

  useEffect(() => {
    let cancelled = false;
    if (!analysis?.id || !isAnalysisDone(analysis)) {
      setAppliedInstructions([]);
      setInstructionsError("");
      setInstructionsLoading(false);
      return;
    }
    setAppliedInstructions([]);
    setInstructionsLoading(true);
    setInstructionsError("");
    api.listAppliedInstructions(analysis.id)
      .then((result) => { if (!cancelled) setAppliedInstructions(result.items); })
      .catch(() => { if (!cancelled) { setAppliedInstructions([]); setInstructionsError("Не удалось загрузить применённые инструкции."); } })
      .finally(() => { if (!cancelled) setInstructionsLoading(false); });
    return () => { cancelled = true; };
  }, [analysis?.id, analysis?.status]);

  useEffect(() => {
    let cancelled = false;
    if (!call?.id) {
      setLinkedAction(undefined);
      return;
    }
    api.listActions({ call_uuid: call.id, limit: 1, offset: 0 })
      .then((result) => {
        if (!cancelled) setLinkedAction(result.items[0]);
      })
      .catch(() => {
        if (!cancelled) setLinkedAction(undefined);
      });
    return () => { cancelled = true; };
  }, [call?.id]);

  async function createQualityReview() {
    if (!call || !analysis || qualityReviewBusy) return;
    setQualityReviewBusy(true); setQualityReviewError("");
    try {
      const reviewId = reviewContext?.review_uuid ?? (await api.createQualityReview(call.id, { analysis_uuid: analysis.id })).review_uuid;
      window.history.pushState({}, "", `/app/quality-reviews/${encodeURIComponent(reviewId)}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (cause) {
      setQualityReviewError(cause instanceof Error ? cause.message : "Не удалось создать проверку");
    } finally { setQualityReviewBusy(false); }
  }

  async function challengeAnalysis() {
    if (!call || !analysis || qualityReviewBusy || challengeReason.trim().length < 10) return;
    setQualityReviewBusy(true); setQualityReviewError("");
    try {
      await api.challengeCallAnalysis(call.id, analysis.id, challengeReason.trim());
      setChallengeOpen(false); setChallengeReason(""); setChallengeSent(true);
      setReviewContext(await api.getAnalysisReviewContext(call.id, analysis.id));
    } catch (cause) {
      setQualityReviewError(cause instanceof Error ? cause.message : "Не удалось отправить анализ на пересмотр");
    } finally { setQualityReviewBusy(false); }
  }

  async function runAnalysis() {
    if (!call || analysisBusy) return;
    setAnalysisBusy(true);
    setAnalysisRunError("");
    setChallengeOpen(false);
    setChallengeReason("");
    setChallengeSent(false);
    try {
      const result = await api.analyzeCall(call.id);
      onAnalysisReady?.(call.id, result);
    } catch (cause) {
      // Re-running the analysis of a company call belongs to the leader, the
      // deputy and the owner. An employee sends them a request instead.
      if (cause instanceof ApiError && cause.code === "analysis_rerun_forbidden") {
        setRerunRequestOpen(true);
        setAnalysisRunError("");
        return;
      }
      setAnalysisRunError(cause instanceof Error ? cause.message : "Не удалось запустить анализ");
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function requestAnalysisRerun() {
    if (!call || analysisBusy) return;
    setAnalysisBusy(true);
    try {
      await api.requestAnalysisRerun(call.id, rerunReason.trim());
      setRerunRequestOpen(false);
      setRerunReason("");
      setAnalysisRunError("Запрос на повторный анализ отправлен руководителю.");
    } catch (cause) {
      setAnalysisRunError(cause instanceof Error ? cause.message : "Не удалось отправить запрос");
    } finally {
      setAnalysisBusy(false);
    }
  }

  useEffect(() => {
    setShowFullTranscript(false);
    setShowFullAnalysis(false);
    setDeleteError("");
    setAnalysisRunError("");
    setDeleteConfirmOpen(false);
    setFolderMenuOpen(false);
    setActiveWordIndex(-1);
    setSeekTarget(null);
  }, [call?.id]);

  useEffect(() => {
    let cancelled = false;
    setReviewContext(undefined);
    setChallengeSent(false);
    if (!call || !analysis || !isAnalysisDone(analysis)) return;
    void api.getAnalysisReviewContext(call.id, analysis.id)
      .then((value) => {
        if (!cancelled) {
          setReviewContext(value);
          setChallengeSent(Boolean(value.challenge) || value.status === "appealed");
        }
      })
      .catch(() => { if (!cancelled) setReviewContext(undefined); });
    return () => { cancelled = true; };
  }, [call?.id, analysis?.id, analysis?.status]);

  useEffect(() => {
    if (!qualityReviewError) return;
    const timer = window.setTimeout(() => setQualityReviewError(""), 5200);
    return () => window.clearTimeout(timer);
  }, [qualityReviewError]);

  useEffect(() => {
    if (!analysisRunError) return;
    const timer = window.setTimeout(() => setAnalysisRunError(""), 5200);
    return () => window.clearTimeout(timer);
  }, [analysisRunError]);

  useEffect(() => { setLocalTranscription(transcription); }, [transcription]);
  useEffect(() => { setRevisions([]); setShowRevisionHistory(false); }, [call?.id]);
  useEffect(() => {
    if (!call) { setSpeakerAssignments([]); return; }
    let cancelled = false;
    void api.listTranscriptionSpeakerAssignments(call.id)
      .then((items) => { if (!cancelled) setSpeakerAssignments(items); })
      .catch(() => { if (!cancelled) setSpeakerAssignments([]); });
    return () => { cancelled = true; };
  }, [call?.id, transcription?.updated_at]);

  useEffect(() => {
    if (!folderMenuOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!folderMenuRef.current?.contains(event.target)) {
        setFolderMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFolderMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [folderMenuOpen]);

  if (loading && !call) {
    return (
      <>
        {drawerTrigger}
        <CallDetailSkeleton />
      </>
    );
  }

  if (!call) {
    return (
      <>
        {drawerTrigger}
        <div className="empty-panel">
          <Headphones size={34} />
          <h2>Звонков пока нет</h2>
          <p>Загрузите первый аудиофайл и выберите, кому он принадлежит.</p>
          <button className="primary-button" onClick={() => onNavigate("upload")}>
            <CloudUpload size={18} />
            Загрузить звонок
          </button>
        </div>
      </>
    );
  }

  const transcriptionState = transcriptionCardState(call, transcription);
  const analysisState = analysisCardState(call, analysis);
  const transcriptionOnly = Boolean(call.transcription_only && !analysis && call.status !== "analyzed");

  function openEvidence(target: MediaSeekTarget) {
    const words = localTranscription?.words ?? [];
    let wordStartIndex = target.wordStartIndex;
    if (wordStartIndex === undefined && words.length > 0) {
      let nearestDistance = Number.POSITIVE_INFINITY;
      words.forEach((word, index) => {
        if (typeof word.start_seconds !== "number") return;
        const distance = Math.abs(word.start_seconds - target.startSeconds);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          wordStartIndex = index;
        }
      });
    }
    setShowFullTranscript(true);
    setSeekTarget({ ...target, wordStartIndex, wordEndIndex: target.wordEndIndex ?? wordStartIndex });
  }

  function toggleExpandedCard(
    expanded: boolean,
    setExpanded: React.Dispatch<React.SetStateAction<boolean>>,
    cardRef: React.RefObject<HTMLDivElement | null>
  ) {
    setExpanded((current) => !current);
    if (expanded) {
      requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: "nearest" }));
    }
  }

  // A call the queue is still working on cannot be thrown away: the provider has
  // it and its credits are reserved. Stopping it is a decision of its own, and
  // the recording survives it.
  const processingInFlight = call ? isCallBeingProcessed(call.status) : false;

  async function cancelProcessing() {
    if (!call || cancelling) return;

    setCancelError("");
    setCancelling(true);
    try {
      const updated = await api.cancelCallProcessing(call.id);
      onCallUpdated?.(updated);
    } catch (cancelProcessingError) {
      setCancelError(
        cancelProcessingError instanceof Error ? cancelProcessingError.message : "Не удалось отменить обработку"
      );
    } finally {
      setCancelling(false);
    }
  }

  // A cancelled call keeps its recording, so starting it again is an ordinary
  // choice between the two modes — not a new upload.
  async function restartProcessing(mode: "analyze" | "transcribe") {
    if (!call || restarting) return;

    setCancelError("");
    setRestarting(mode);
    try {
      const updated = await api.restartCallProcessing(call.id, mode);
      onCallUpdated?.(updated);
    } catch (restartError) {
      setCancelError(restartError instanceof Error ? restartError.message : "Не удалось запустить обработку заново");
    } finally {
      setRestarting(null);
    }
  }

  async function deleteSelectedCall() {
    if (!call || !onDeleteCall || deleting) return;

    setDeleteError("");
    setDeleting(true);
    try {
      await onDeleteCall(call.id);
      setDeleteConfirmOpen(false);
    } catch (deleteCallError) {
      setDeleteError(deleteCallError instanceof Error ? deleteCallError.message : "Не удалось удалить звонок");
    } finally {
      setDeleting(false);
    }
  }

  async function loadRevisionHistory() {
    if (!call) return;
    setHistoryLoading(true); setHistoryError("");
    try { const result = await api.listTranscriptionRevisions(call.id); setRevisions(result.items); setShowRevisionHistory(true); }
    catch (error) { setHistoryError(error instanceof Error ? error.message : "Не удалось загрузить историю"); }
    finally { setHistoryLoading(false); }
  }

  async function toggleRevisionHistory() {
    if (showRevisionHistory) {
      setShowRevisionHistory(false);
      setHistoryError("");
      return;
    }
    await loadRevisionHistory();
  }

  async function restoreRevision(revision: TranscriptionRevisionSummary) {
    if (!call) return;
    setSelectingRevision(revision.revision); setHistoryError("");
    try {
      const result = await api.restoreTranscriptionRevision(call.id, revision.revision, localTranscription?.revision ?? 1);
      setLocalTranscription(result.transcription);
      const history = await api.listTranscriptionRevisions(call.id);
      setRevisions(history.items);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось выбрать версию транскрипции");
    } finally { setSelectingRevision(null); }
  }

  return (
    <>
      <div className="panel-heading large">
        <h2>Обзор звонка</h2>
        {drawerTrigger}
        <div className="panel-actions">
          <button className="primary-button small" onClick={() => onNavigate("upload")}>
            <CloudUpload size={16} />
            Загрузить звонок
          </button>
          {!call.is_test && (onAssignToFolder || (activeFolder && onRemoveFromFolder)) && (
            <div className="call-folder-action-menu" ref={folderMenuRef}>
              {activeFolder && onRemoveFromFolder ? (
                <button
                  className="ghost-button small"
                  type="button"
                  disabled={folderActionBusy}
                  title={activeFolder.name}
                  onClick={async () => {
                    setFolderMenuOpen(false);
                    await onRemoveFromFolder(activeFolder.id, call.id);
                  }}
                >
                  <FolderMinus size={16} />
                  Убрать из папки
                </button>
              ) : (
                <button
                  className="ghost-button small"
                  type="button"
                  disabled={folderActionBusy || folders.length === 0}
                  aria-expanded={folderMenuOpen}
                  onClick={() => setFolderMenuOpen((current) => !current)}
                >
                  <FolderPlus size={16} />
                  Добавить в папку
                </button>
              )}
              {folderMenuOpen && onAssignToFolder && !activeFolder && (
                <div className="call-folder-dropdown">
                  {folders.length === 0 ? (
                    <div className="empty-state compact">Сначала создайте папку.</div>
                  ) : (
                    folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        disabled={folderActionBusy}
                        onClick={async () => {
                          setFolderMenuOpen(false);
                          await onAssignToFolder(folder.id, call.id);
                        }}
                      >
                        <span
                          className="folder-color-dot"
                          style={{ "--folder-color": folder.color || "#ff7a43" } as CSSProperties}
                        />
                        <span>
                          <strong>{folder.name}</strong>
                          <small>{folder.calls_count} звонков</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {onDeleteCall && !call.is_test && !transcriptionOnly && (
            <button className="ghost-button small call-analysis-button" type="button" onClick={() => void runAnalysis()} disabled={analysisBusy}>
              <WandSparkles size={16} />
              {analysisBusy ? "Анализирую…" : "Сделать анализ"}
            </button>
          )}
          {/* While the queue still owns the call, stopping it is the way out;
              deleting is refused until then and would only produce an error. */}
          {onDeleteCall && processingInFlight && (
            <button className="ghost-button small danger-button" type="button" onClick={() => void cancelProcessing()} disabled={cancelling}>
              <Ban size={16} />
              {cancelling ? "Отменяю…" : "Отменить обработку"}
            </button>
          )}
          {onDeleteCall && !processingInFlight && (
            <button className="ghost-button small danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={deleting}>
              <Trash2 size={16} />
              {deleting ? "Удаляю..." : "Удалить"}
            </button>
          )}
        </div>
      </div>
      {call.status === "awaiting_credits" && (
        <div className="call-waiting-notice" role="note">
          <strong>Звонок ждёт кредитов</strong>
          <span>Лимит исчерпан. Обработка начнётся сама, как только лимит обновится или кошелёк пополнят. Можно отменить обработку и вернуться к звонку позже.</span>
        </div>
      )}
      {call.status === "cancelled" && (
        <div className="call-waiting-notice" role="note">
          <strong>Обработка отменена</strong>
          <span>Запись на месте: её можно прослушать и скачать в плеере ниже, обработать заново или удалить в корзину.</span>
          {onDeleteCall && !call.is_test && (
            <div className="call-waiting-actions">
              <button className="primary-button small" type="button" disabled={restarting !== null} onClick={() => void restartProcessing("analyze")}>
                <RotateCcw size={16} />
                {restarting === "analyze" ? "Запускаю…" : "Обработать заново"}
              </button>
              <button className="ghost-button small" type="button" disabled={restarting !== null} onClick={() => void restartProcessing("transcribe")}>
                <FileText size={16} />
                {restarting === "transcribe" ? "Переключаю…" : "Только транскрибация"}
              </button>
            </div>
          )}
        </div>
      )}
      {cancelError && <div className="form-error">{cancelError}</div>}
      {analysisRunError && <div className="form-error is-dismissible" role="alert">{analysisRunError}</div>}
      {deleteError && <div className="form-error">{deleteError}</div>}
      {call.is_test && <div className="call-test-notice" role="note"><strong>Тестовый звонок</strong><span>Он хранится отдельно и доступен только для проверки загрузки и удаления. Анализ, редактирование и перенос в другие папки отключены.</span></div>}
      <div className="selected-call-card">
        <div className="play-large">
          <PhoneCall size={22} />
        </div>
        <div className="selected-call-main">
          <StatusChip transcriptionOnly={call.transcription_only} status={call.status} analysisStatus={call.is_test ? undefined : analysis?.status} label={call.is_test ? "Тестовый" : undefined} />
          <strong>{call.title}</strong>
          <small>
            {formatDate(call.created_at)} · {formatDuration(call.duration_seconds)} ·{" "}
            {contextLabel(call, companies, departments)}
          </small>
          {!call.is_test && score.score !== null && (
            <span className="call-score-chip">Оценка {formatScore(score.percent)} / 100</span>
          )}
        </div>
      </div>
      <CallMediaPlayer
        call={call}
        words={localTranscription?.words}
        seekTarget={seekTarget}
        onActiveWordChange={setActiveWordIndex}
      />
      {!call.is_test && <StatusTimeline transcriptionOnly={transcriptionOnly} current={call.status} statuses={timelineStatuses} analysisProgress={analysisProgress(analysis)} analysisStatus={analysis?.status} />}
      {(showReports || transcriptionOnly) && !call.is_test && <ReportExportPanel call={call} analysis={analysis} transcription={localTranscription} />}
      {transcriptionOnly && <div className="transcription-analysis-entry"><div><strong>Нужен анализ разговора?</strong><p>Запустите его по готовой транскрипции, когда понадобится.</p></div><button className="primary-button" disabled={analysisBusy || localTranscription?.status !== "transcribed"} onClick={() => void runAnalysis()}><WandSparkles size={18} />{analysisBusy ? "Запускаю…" : "Анализировать"}</button>{analysisRunError && <div className="form-error">{analysisRunError}</div>}</div>}
      <div className={`detail-grid${call.is_test || transcriptionOnly ? " is-test-call" : ""}`}>
        <InfoCard
          title="Расшифровка"
          className="transcript-card"
          cardRef={transcriptCardRef}
          status={transcriptionState.label}
          statusTone={transcriptionState.tone}
          statusThinking={transcriptionState.thinking}
          action={transcriptExpandable ? (showFullTranscript ? "Свернуть расшифровку" : "Открыть полную расшифровку") : undefined}
          onAction={() => toggleExpandedCard(showFullTranscript, setShowFullTranscript, transcriptCardRef)}
          actionVariant="analysis"
          expanded={showFullTranscript}
        >
          {localTranscription?.editable && !call.is_test && (
            <div className="transcript-history-actions">
              <div className="transcript-history-toolbar">
                {onOpenTranscriptionEditor && !call.is_test && <button type="button" className="primary-button small" onClick={() => onOpenTranscriptionEditor(call.id)}>Исправить транскрипцию</button>}
                <button type="button" className="ghost-button small" disabled={historyLoading} aria-expanded={showRevisionHistory} onClick={() => void toggleRevisionHistory()}>
                  {historyLoading ? "Загружаю историю…" : showRevisionHistory ? "Свернуть историю" : "История исправлений"}
                </button>
                {(localTranscription.revision ?? 1) > 1 && onOpenRevisionComparison && <button type="button" className="ghost-button small" onClick={() => onOpenRevisionComparison(call.id)}>Сравнить версии</button>}
              </div>
              {historyError && <div className="form-error">{historyError}</div>}
              {showRevisionHistory && <div className="transcript-history-list">
                {revisions.length === 0 ? <small>Версий пока нет.</small> : revisions.map((revision) => <div className={`transcript-history-row${revision.is_current ? " is-current" : ""}`} key={revision.id}>
                  <button type="button" className="transcript-history-preview-button" onClick={() => onOpenRevisionComparison?.(call.id, revision.revision)} aria-label={`Сравнить версию ${revision.revision}`}>
                    <span><strong>Версия {revision.revision}</strong><small>{revision.is_current ? "Используется сейчас" : "Нажмите для сравнения"}</small></span>
                  </button>
                  {revision.is_current
                    ? <span className="transcript-current-revision"><CheckCircle2 size={18} /> Выбрана</span>
                    : <button type="button" className="ghost-button small" disabled={selectingRevision !== null} onClick={() => void restoreRevision(revision)}>{selectingRevision === revision.revision ? "Выбираю…" : "Выбрать"}</button>}
                </div>)}
              </div>}
            </div>
          )}
          {showFullTranscript && transcriptExpandable && !loadingDetails && <TranscriptCollapseIsland
            key={call.id}
            cardRef={transcriptCardRef}
            onCollapse={() => toggleExpandedCard(true, setShowFullTranscript, transcriptCardRef)}
          />}
          <TranscriptPreview
            transcription={localTranscription}
            expanded={showFullTranscript}
            loading={loadingDetails}
            activeWordIndex={activeWordIndex}
            selectedEvidence={seekTarget}
            speakerAssignments={speakerAssignments}
            onOverflowChange={setTranscriptExpandable}
          />
        </InfoCard>
        {!call.is_test && !transcriptionOnly && <div className="analysis-card-stack">
          {isAnalysisDone(analysis) && reviewContext && (canEditAnalysis || canDisputeAnalysis || reviewContext.human_review_count > 0) && <div className="quality-review-entry"><div><ClipboardCheck size={20} /><span><strong>{reviewContext.human_review_count > 0 ? `Действует человеческая оценка ${reviewContext.human_review_count}` : "Проверка человеком"}</strong><small>{reviewContext.source_outdated ? "Эта проверка относится к устаревшей версии анализа и доступна только для просмотра." : canEditAnalysis ? `Опубликовано ${reviewContext.human_review_count} из ${reviewContext.human_review_limit} допустимых переоценок.${reviewContext.next_review_requires_different_author ? " Следующую должен выполнить другой проверяющий." : ""}` : canDisputeAnalysis ? "Если выводы или оценки неверны, отправьте анализ своего звонка на независимый пересмотр." : "Доступны просмотр и история оценок."}</small></span></div><div className="quality-review-entry-actions">{canEditAnalysis && <button className="primary-button" type="button" disabled={qualityReviewBusy} onClick={() => void createQualityReview()}>{qualityReviewBusy ? "Открываю…" : "Исправить анализ"}</button>}{reviewContext.review_uuid && !canEditAnalysis && reviewContext.human_review_count > 0 && <button className="ghost-button" type="button" onClick={() => { window.history.pushState({}, "", `/app/quality-reviews/${encodeURIComponent(reviewContext.review_uuid!)}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>История оценок</button>}{canDisputeAnalysis && <button className="ghost-button" type="button" disabled={qualityReviewBusy || challengeSent} onClick={() => setChallengeOpen(true)}><MessageSquareWarning size={17} />{challengeSent ? "Отправлено на пересмотр" : "Оспорить анализ"}</button>}</div></div>}
          {qualityReviewError && <div className="form-error is-dismissible" role="alert">{qualityReviewError}</div>}
          <InfoCard
            title="AI-анализ"
            cardRef={analysisCardRef}
            status={analysisState.label}
            statusTone={analysisState.tone}
            statusThinking={analysisState.thinking}
            action={showFullAnalysis ? "Свернуть анализ" : "Открыть полный анализ"}
            onAction={() => toggleExpandedCard(showFullAnalysis, setShowFullAnalysis, analysisCardRef)}
            actionVariant="analysis"
            expanded={showFullAnalysis}
          >
            {showFullAnalysis && isAnalysisDone(analysis) && <TranscriptCollapseIsland
              cardRef={analysisCardRef}
              kind="analysis"
              label="Свернуть анализ"
              blockedByVisibleSelector='.transcript-collapse-island[data-collapse-kind="transcript"]'
              onCollapse={() => toggleExpandedCard(true, setShowFullAnalysis, analysisCardRef)}
            />}
            <AnalysisPreview
              analysis={displayedAnalysis}
              expanded={showFullAnalysis}
              loading={loadingDetails}
              pendingMessage={analysisState.thinking ? "Производится анализ транскрипции. Результат появится после завершения обработки." : undefined}
              onEvidenceActivate={openEvidence}
              speakerAssignments={speakerAssignments}
            />
          </InfoCard>
          {analysis && isAnalysisDone(analysis) && (
            <section className="applied-instructions-card" aria-labelledby="applied-instructions-title">
              <div className="applied-instructions-heading">
                <FileText size={20} aria-hidden="true" />
                <span><strong id="applied-instructions-title">Применённые инструкции</strong><small>Правила, по которым был сформирован этот анализ</small></span>
                <b>{instructionsLoading ? "…" : appliedInstructions.length}</b>
              </div>
              {instructionsError ? <p className="applied-instructions-error" role="alert">{instructionsError}</p> : instructionsLoading ? <div className="applied-instructions-skeleton" aria-label="Загрузка инструкций" /> : appliedInstructions.length === 0 ? <p className="applied-instructions-empty">Для этого анализа инструкции не применялись.</p> : <div className="applied-instructions-list">{appliedInstructions.map((instruction) => <button type="button" key={instruction.version_id} onClick={() => { window.history.pushState({}, "", `/app/calls/${encodeURIComponent(call.id)}/analyses/${encodeURIComponent(analysis.id)}/instructions/${encodeURIComponent(instruction.version_id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }}><span><strong>{instruction.title}</strong><small>Версия {instruction.version} · {instructionScopeLabel(instruction.scope)}{instruction.instruction_deleted ? " · удалена из настроек" : ""}</small></span><ChevronRight size={17} aria-hidden="true" /></button>)}</div>}
            </section>
          )}
          {analysis && isAnalysisDone(analysis) && reviewContext && <AnalysisComments callId={call.id} analysisId={analysis.id} comments={reviewContext.comments ?? []} canComment={reviewContext.capabilities.can_comment_analysis} onChange={(comments)=>setReviewContext((current)=>current?{...current,comments}:current)} />}
        </div>}
      </div>
      {analysis && isAnalysisDone(analysis) && <div className="next-step">
        <span className={`step-icon${linkedAction?.status === "completed" || noActionRequired ? " is-complete" : ""}`}>
          {linkedAction?.status === "completed" || noActionRequired ? <CheckCircle2 size={19} /> : <WandSparkles size={19} />}
        </span>
        <div>
          <h3>{linkedAction ? linkedActionHeading(linkedAction.status) : noActionRequired ? "Действия не требуются" : "Следующий шаг"}</h3>
          <p>{linkedAction ? linkedAction.title : noActionRequired ? "Решение сохранено. Новое действие для этого анализа создать нельзя." : analysisNextStep(displayedAnalysis)}</p>
        </div>
        <div className="next-step-actions">
          {linkedAction ? <>
            <button className="ghost-button" type="button" onClick={() => { window.history.pushState({}, "", `/app/actions/${encodeURIComponent(linkedAction.id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>Открыть действие<ChevronRight size={16} /></button>
            {linkedAction.status === "cancelled" && <button className="text-button" type="button" disabled={!analysis || !isAnalysisDone(analysis)} onClick={() => setActionDialogOpen(true)}>Создать новое</button>}
          </> : noActionRequired ? null : <>
            <button className="ghost-button" type="button" onClick={() => setActionDialogOpen(true)}>Создать действие<ChevronRight size={16} /></button>
            <button className="text-button no-action-button" type="button" disabled={actionDecisionBusy} onClick={() => setNoActionConfirmOpen(true)}>Действий не требуется</button>
          </>}
        </div>
      </div>}
      {actionDecisionMessage && <div className="action-decision-message" role="status">{actionDecisionMessage}</div>}
      {actionDialogOpen && analysis && createPortal(
        <CreateActionDialog call={call} analysis={analysis} transcription={localTranscription} speakerAssignments={speakerAssignments} companies={companies} departments={departments} currentUserId={currentUserId} onClose={() => setActionDialogOpen(false)} onCreated={(created) => { setLinkedAction(created); setActionDialogOpen(false); window.history.pushState({}, "", `/app/actions/${encodeURIComponent(created.id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }} />,
        document.querySelector<HTMLElement>(".app-shell") ?? document.body
      )}
      <ConfirmDialog
        open={noActionConfirmOpen}
        title="Подтвердить отсутствие действий?"
        message="После подтверждения новое действие для текущего анализа звонка создать будет нельзя."
        confirmLabel="Подтвердить"
        busy={actionDecisionBusy}
        onCancel={() => { if (!actionDecisionBusy) setNoActionConfirmOpen(false); }}
        onConfirm={async () => { if (!analysis) return; setActionDecisionBusy(true); setActionDecisionMessage(""); try { await api.setNoActionRequired(call.id, analysis.id); setNoActionRequired(true); setNoActionConfirmOpen(false); setActionDecisionMessage("Отмечено: дальнейших действий не требуется."); } catch (cause) { setActionDecisionMessage(cause instanceof Error ? cause.message : "Не удалось сохранить решение"); } finally { setActionDecisionBusy(false); } }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        variant="danger"
        title="Удалить звонок?"
        message={`Звонок «${call.title}» попадёт в корзину на 30 дней. После этого запись и файлы удаляются безвозвратно.`}
        confirmLabel="Удалить"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void deleteSelectedCall()}
      />
      {rerunRequestOpen && createPortal(<div className="quality-challenge-backdrop" role="presentation" onMouseDown={() => !analysisBusy && setRerunRequestOpen(false)}><section className="quality-challenge-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-rerun-title" onMouseDown={(event) => event.stopPropagation()}><span className="eyebrow">Повторный анализ</span><h2 id="analysis-rerun-title">Нужен запрос руководителю</h2><p>Перезапустить анализ звонка компании может лидер отдела, заместитель или владелец. Опишите, почему анализ стоит сделать заново — запрос увидят они.</p><label><span>Причина</span><textarea autoFocus maxLength={2000} value={rerunReason} placeholder="Например: транскрипция была исправлена, выводы устарели" onChange={(event) => setRerunReason(event.target.value)} /></label><div className="quality-challenge-dialog-actions"><button className="ghost-button" type="button" disabled={analysisBusy} onClick={() => setRerunRequestOpen(false)}>Отмена</button><button className="primary-button" type="button" disabled={analysisBusy} onClick={() => void requestAnalysisRerun()}>{analysisBusy ? "Отправляю…" : "Отправить запрос"}</button></div></section></div>, document.body)}      {challengeOpen && createPortal(<div className="quality-challenge-backdrop" role="presentation" onMouseDown={() => !qualityReviewBusy && setChallengeOpen(false)}><section className="quality-challenge-dialog" role="dialog" aria-modal="true" aria-labelledby="quality-challenge-title" onMouseDown={(event) => event.stopPropagation()}><span className="eyebrow">Пересмотр анализа</span><h2 id="quality-challenge-title">Что вас не устроило?</h2><p>Опишите, с какими выводами, оценками или формулировками ИИ вы не согласны. Сообщение увидит специалист по проверке качества.</p><label><span>Сопроводительное сообщение</span><textarea autoFocus maxLength={5000} value={challengeReason} placeholder="Например: в анализе неверно указано, что я не уточнил следующий шаг…" onChange={(event) => setChallengeReason(event.target.value)} /><small>{challengeReason.trim().length}/5000 · минимум 10 символов</small></label><div className="quality-challenge-dialog-actions"><button className="ghost-button" type="button" disabled={qualityReviewBusy} onClick={() => setChallengeOpen(false)}>Отмена</button><button className="primary-button" type="button" disabled={qualityReviewBusy || challengeReason.trim().length < 10} onClick={() => void challengeAnalysis()}>{qualityReviewBusy ? "Отправляю…" : "Отправить на пересмотр"}</button></div></section></div>, document.body)}
    </>
  );
}

function instructionScopeLabel(scope: AppliedInstruction["scope"]) {
  if (scope === "company") return "Компания";
  if (scope === "department") return "Отдел";
  return "Личная";
}

function linkedActionHeading(status: CallAction["status"]) {
  if (status === "completed") return "Действие выполнено";
  if (status === "cancelled") return "Действие отменено";
  if (status === "overdue") return "Действие просрочено";
  if (status === "in_progress") return "Действие выполняется";
  return "Действие отправлено";
}

function optionalNonNegativeNumber(value:string|null){if(value===null||value.trim()==="")return undefined;const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?parsed:undefined}

function transcriptionCardState(
  call: CallResponse,
  transcription?: TranscriptionResponse
): CardProcessState {
  if (transcription?.status === "failed") {
    return { label: "Ошибка", tone: "bad" };
  }

  if (transcription?.status === "transcribed" || call.status === "transcribed" || call.status === "analyzed") {
    return { label: "Готово", tone: "ok" };
  }

  if (call.status === "processing" || transcription?.status === "processing") {
    return { label: "Транскрибируется", tone: "warn", thinking: true };
  }

  return { label: "Ожидает", tone: "warn" };
}

function applyEffectiveAnalysis(analysis: AnalysisResponse | undefined, effective: EffectiveAnalysis | undefined): AnalysisResponse | undefined {
  if (!analysis || !effective || !analysis.result_json || typeof analysis.result_json !== "object" || Array.isArray(analysis.result_json)) return analysis;
  const source = analysis.result_json as Record<string, unknown>;
  const criteriaByKey = new Map(effective.criteria.map((item) => [item.criterion_key, item]));
  if (source.schema_version === 3 && Array.isArray(source.items)) {
    const items = source.items.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const item = value as Record<string, unknown>;
      const key = typeof item.id === "string" ? item.id : "";
      const replacement = criteriaByKey.get(key);
      if (!replacement) return value;
      const max = replacement.score_max && replacement.score_max > 0 ? replacement.score_max : 100;
      return {...item,status:replacement.not_applicable?"not_applicable":item.status,score:replacement.effective_score===undefined?null:replacement.effective_score/max*100,effective_source:replacement.effective_source};
    });
    return {...analysis,result_json:{...source,overall_score:effective.total_score,score:effective.total_score,score_scale:100,effective_source:effective.source,items}};
  }
  const criteria = Array.isArray(source.criteria_results)
    ? source.criteria_results.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const item = value as Record<string, unknown>;
      const key = typeof item.code === "string" ? item.code : "";
      const replacement = criteriaByKey.get(key);
      if (!replacement) return value;
      const max = replacement.score_max && replacement.score_max > 0 ? replacement.score_max : 100;
      const normalized = replacement.effective_score === undefined ? undefined : replacement.effective_score / max * 100;
      return {
        ...item,
        status: replacement.not_applicable ? "not_applicable" : item.status,
        points_awarded: replacement.effective_score,
        points_max: replacement.score_max,
        score: normalized,
        effective_source: replacement.effective_source
      };
    })
    : source.criteria_results;
  return {
    ...analysis,
    result_json: {
      ...source,
      score: effective.total_score,
      score_scale: 100,
      effective_source: effective.source,
      criteria_results: criteria
    }
  };
}

function analysisCardState(
  call: CallResponse,
  analysis?: AnalysisResponse
): CardProcessState {
  if (analysis?.status === "failed") {
    return { label: "Ошибка анализа", tone: "bad" };
  }

  const progress = analysisProgress(analysis);
  if (progress && analysis?.status !== "done") {
    const label = { inventory: "Находим вопросы", answers: `Готово ${progress.items_done} из ${progress.items_total}`, validation: "Проверяем и подводим итог", complete: "Сохраняем итог" }[progress.stage];
    return { label, tone: "warn", thinking: true };
  }
  if (call.status === "transcribed" || analysis?.status === "pending" || analysis?.status === "processing") {
    return { label: "Производится анализ транскрипции", tone: "warn", thinking: true };
  }

  if (isAnalysisDone(analysis) || call.status === "analyzed") {
    return { label: "Анализ готов", tone: "ok" };
  }

  if (call.status === "processing") {
    return { label: "Ожидает расшифровку", tone: "warn" };
  }

  return { label: "Ожидает", tone: "warn" };
}
