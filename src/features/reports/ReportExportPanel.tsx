import {
  Download,
  FileDown,
  FileText,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type {
  AnalysisResponse,
  CallResponse,
  ReportFormat,
  ReportResponse,
  TranscriptionResponse,
  TranscriptionRevisionSummary
} from "../../types";

import { SelectControl } from "../../shared/ui/primitives";
import { isAnalysisDone } from "../../shared/lib/analysis";
import { formatBytes, formatDate, reportFormatLabel, reportStatusLabel } from "../../shared/lib/formatters";

export const reportFormats: Array<{ format: ReportFormat; label: string; description: string; }> = [
  { format: "pdf", label: "PDF", description: "Для отправки или печати" },
  { format: "docx", label: "DOCX", description: "Редактируемый документ" },
  { format: "md", label: "Markdown", description: "Для заметок и копирования" },
  { format: "xlsx", label: "Excel", description: "Метаданные, анализ и транскрипция" }
];

function reportDisplayName(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  const extension = lastDot > 0 ? fileName.slice(lastDot) : "";
  const baseName = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  const withoutUuid = baseName.replace(
    /[-_][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ""
  );

  return `${withoutUuid.replace(/[-_]+/g, " ").trim() || baseName}${extension}`;
}

export function ReportExportPanel({
  call,
  analysis,
  transcription
}: {
  call: CallResponse;
  analysis?: AnalysisResponse;
  transcription?: TranscriptionResponse;
}) {
  const [content, setContent] = useState<"full" | "transcription">(() => { try { return localStorage.getItem("verbatrace-report-content") === "full" ? "full" : "transcription"; } catch { return "transcription"; } });
  const [revision, setRevision] = useState(0);
  const [revisions, setRevisions] = useState<TranscriptionRevisionSummary[]>([]);
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [busyFormat, setBusyFormat] = useState<ReportFormat | null>(null);
  const [busyReportId, setBusyReportId] = useState("");
  const [error, setError] = useState("");
  const [exportEnabled, setExportEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoadingReports(true);
      setError("");
      try {
        const response = await api.listReports(call.id);
        if (!cancelled) setReports(response.reports);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить отчеты");
        }
      } finally {
        if (!cancelled) setLoadingReports(false);
      }
    }

    loadReports();

    return () => {
      cancelled = true;
    };
  }, [call.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadExportAccess() {
      setExportEnabled(null);
      try {
        const subscription =
          call.visibility_scope === "personal"
            ? await api.getSubscription()
            : call.company_uuid
              ? await api.getCompanySubscription(call.company_uuid)
              : null;

        if (!cancelled) setExportEnabled(subscription?.plan.export_enabled ?? false);
      } catch {
        if (!cancelled) setExportEnabled(false);
      }
    }

    loadExportAccess();

    return () => {
      cancelled = true;
    };
  }, [call.company_uuid, call.id, call.visibility_scope]);

  useEffect(() => {
    let cancelled = false;
    setRevision(transcription?.revision ?? 0);
    setRevisions([]);
    setTranscriptReady(transcription?.status === "transcribed");
    Promise.all([api.getTranscription(call.id), loadAllRevisions(call.id).catch(() => null)])
      .then(([current, history]) => { if (!cancelled) { setTranscriptReady(current.status === "transcribed"); setRevision(() => { try { const saved = Number(localStorage.getItem(`verbatrace-report-revision:${call.id}`)); return history?.items.some((item) => item.revision === saved) ? saved : current.revision ?? 1; } catch { return current.revision ?? 1; } }); setRevisions(history?.items ?? []); } })
      .catch(() => { if (!cancelled) setTranscriptReady(false); });
    return () => { cancelled = true; };
  }, [call.id, call.status, transcription?.revision]);

  function chooseContent(value: "full" | "transcription") { setContent(value); try { localStorage.setItem("verbatrace-report-content", value); } catch { /* Selection still works without storage. */ } }
  function chooseRevision(value: number) { setRevision(value); try { localStorage.setItem(`verbatrace-report-revision:${call.id}`, String(value)); } catch { /* Selection still works without storage. */ } }

  async function refreshReports() {
    const response = await api.listReports(call.id);
    setReports(response.reports);
  }

  async function createReport(format: ReportFormat) {
    setError("");
    setBusyFormat(format);
    try {
      const created = await api.createReport(call.id, { format, content: selectedContent, transcription_revision: revision || undefined });
      await refreshReports();
      if (created.status === "ready") {
        await downloadReport(created);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать отчет");
		await refreshReports().catch(() => undefined);
    } finally {
      setBusyFormat(null);
    }
  }

  async function downloadReport(report: ReportResponse) {
    setError("");
    setBusyReportId(report.id);
    try {
      const blob = await api.downloadReport(report);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = report.file_name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Не удалось скачать отчет");
    } finally {
      setBusyReportId("");
    }
  }

  async function deleteReport(reportId: string) {
    setError("");
    setBusyReportId(reportId);
    try {
      await api.deleteReport(reportId);
      setReports((current) => current.filter((report) => report.id !== reportId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить отчет");
    } finally {
      setBusyReportId("");
    }
  }

  const analysisReady = isAnalysisDone(analysis);
  const selectedContent = content === "full" && analysisReady && exportEnabled ? "full" : "transcription";
  const exportBlocked = selectedContent === "full" && exportEnabled !== true;
  const ready = selectedContent === "transcription" ? transcriptReady : analysisReady;


  return (
    <section className="report-panel">
      <div className="card-title">
        <div>
          <h3>Экспорт отчета</h3>
          <p>Выберите содержимое и формат. Транскрипцию можно скачать отдельно на любом тарифе.</p>
        </div>
        <span className={`status-chip ${ready ? "ok" : "warn"}`}>
          {ready ? "Можно скачать" : "Ожидаем готовый результат"}
        </span>
      </div>
      <div className="report-export-options">
        <label><span>Содержимое</span><SelectControl aria-label="Содержимое отчёта" value={selectedContent} onChange={(event) => chooseContent(event.target.value as "full" | "transcription")} disabled={busyFormat !== null}>
          <option value="transcription">Только транскрипция</option>
          {exportEnabled && analysisReady && <option value="full">Анализ и транскрипция</option>}
        </SelectControl></label>
        {<label><span>Версия транскрипции</span><SelectControl aria-label="Версия транскрипции для отчёта" value={revision} onChange={(event) => chooseRevision(Number(event.target.value))} disabled={busyFormat !== null || !transcriptReady}>
          {revisions.length ? revisions.map((item) => <option key={item.id} value={item.revision}>Версия {item.revision}{item.is_current ? " · выбрана для звонка" : ""}</option>) : <option value={revision}>{revision ? `Версия ${revision}` : "Текущая версия"}</option>}
        </SelectControl></label>}
      </div>
      <div className="report-format-grid">
        {reportFormats.map((item) => (
          (() => {
            const existing = reports.find((report) => report.format === item.format && (report.content ?? "full") === selectedContent && report.transcription_revision === revision && (selectedContent !== "full" || report.analysis_uuid === analysis?.id) && (report.status === "ready" || report.status === "pending"));
            return (
          <button
            className="report-format-button"
            key={item.format}
            onClick={() => createReport(item.format)}
            disabled={!ready || exportBlocked || busyFormat !== null || Boolean(existing)}
          >
            <FileDown size={18} />
            <span>
              <strong>{item.label}</strong>
              <small>{busyFormat === item.format ? "Создаю отчет..." : existing ? (existing.status === "ready" ? "Уже готов — ниже" : "Уже формируется") : (item.format === "xlsx" && selectedContent === "transcription" ? "Текст и сведения о звонке" : item.description)}</small>
            </span>
          </button>
            );
          })()
        ))}
      </div>
      {exportBlocked && (
        <div className="form-error">Экспорт отчетов недоступен на текущем тарифе.</div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="report-list">
        <div className="report-list-title">
          <strong>Готовые и текущие отчеты</strong>
          {loadingReports && <span>Загружаю...</span>}
        </div>
        {!loadingReports && reports.length === 0 && (
          <div className="empty-state compact">Для этого звонка еще нет экспортированных отчетов.</div>
        )}
        {reports.map((report) => (
          <div className="report-row" key={report.id}>
            <FileText size={18} />
            <div className="report-row-content">
              <strong className="report-file-name" title={report.file_name}>{reportDisplayName(report.file_name)}</strong>
              <small className="report-meta">
                {report.content === "transcription" ? `Транскрипция · версия ${report.transcription_revision} · ` : "Анализ и транскрипция · "}{reportFormatLabel(report.format)} · {formatBytes(report.size_bytes)} · создан{" "}
                {formatDate(report.created_at)} · хранится до {formatDate(report.expires_at)}
              </small>
              {report.error_message && <small className="report-error">{report.error_message}</small>}
            </div>
            <span className={`status-chip ${report.status === "ready" ? "ok" : report.status === "failed" ? "bad" : "warn"}`}>
              {reportStatusLabel(report.status)}
            </span>
            <div className="report-actions">
              <button
                className="icon-button"
                aria-label="Скачать отчет"
                onClick={() => downloadReport(report)}
                disabled={report.status !== "ready" || busyReportId === report.id}
              >
                <Download size={17} />
              </button>
              <button
                className="icon-button danger-icon"
                aria-label="Удалить отчет"
                onClick={() => deleteReport(report.id)}
                disabled={busyReportId === report.id}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function loadAllRevisions(callId: string) {
 const items: TranscriptionRevisionSummary[] = [];
 for (let offset = 0; ; offset += 100) {
  const page = await api.listTranscriptionRevisions(callId, 100, offset);
  items.push(...page.items);
  if (items.length >= page.total || page.items.length === 0) return { items };
 }
}
