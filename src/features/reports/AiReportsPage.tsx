import {
  Download,
  FileBarChart2,
  FileDown,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import type {
  AnalysisResponse,
  CallResponse,
  ReportFormat,
  ReportStatus,
  ReportWithCallResponse
} from "../../types";
import { isAnalysisDone } from "../../shared/lib/analysis";
import { formatBytes, formatDate, reportFormatLabel, reportStatusLabel } from "../../shared/lib/formatters";
import { SelectControl } from "../../shared/ui/primitives";
import { CustomScrollbar } from "../../shared/ui/custom-scrollbar";
import { reportFormats } from "./ReportExportPanel";

export function AiReportsPage({
  calls,
  analyses
}: {
  calls: CallResponse[];
  analyses: Record<string, AnalysisResponse>;
}) {
  const reportsPageScrollRef = useRef<HTMLElement>(null);
  const [reports, setReports] = useState<ReportWithCallResponse[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [formatFilter, setFormatFilter] = useState<ReportFormat | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>("pdf");
  const [selectedCallId, setSelectedCallId] = useState("");
  const [callQuery, setCallQuery] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyReportId, setBusyReportId] = useState("");
  const readyAnalyses = useMemo(
    () => calls.filter((call) => isAnalysisDone(analyses[call.id])),
    [analyses, calls]
  );
  const filteredReadyAnalyses = useMemo(() => {
    const query = callQuery.trim().toLowerCase();
    if (!query) return readyAnalyses.slice(0, 6);

    return readyAnalyses
      .filter((call) => reportCallSearchText(call).includes(query))
      .slice(0, 6);
  }, [callQuery, readyAnalyses]);
  const selectedCall = readyAnalyses.find((call) => call.id === selectedCallId) ?? readyAnalyses[0];
  const processingReports = calls.filter((call) => call.status === "processing").length;
  const latestReport = reports[0];

  useEffect(() => {
    if (selectedCallId && readyAnalyses.some((call) => call.id === selectedCallId)) return;
    setSelectedCallId(readyAnalyses[0]?.id ?? "");
  }, [readyAnalyses, selectedCallId]);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoadingReports(true);
      const response = await api
        .listGlobalReports({
          format: formatFilter === "all" ? undefined : formatFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          sort: "created_at",
          order: "desc",
          limit: 50,
          offset: 0
        })
        .catch(() => null);

      if (!cancelled) {
        setReports(response?.reports ?? []);
        setLoadingReports(false);
      }
    }

    loadReports();

    return () => {
      cancelled = true;
    };
  }, [formatFilter, statusFilter]);

  async function createCallReport() {
    if (!selectedCall) {
      setActionError("Нет звонка с готовым анализом для отчета.");
      return;
    }

    setActionError("");
    try {
      await api.createGlobalReport({ scope: "call", call_uuid: selectedCall.id, format: selectedFormat });
      const response = await api.listGlobalReports({ limit: 50, sort: "created_at", order: "desc" });
      setReports(response.reports);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось создать отчет.");
    }
  }

  async function downloadReport(report: ReportWithCallResponse) {
    setActionError("");
    setBusyReportId(report.id);
    try {
      const blob = await api.downloadReport(report);
      saveBlob(blob, report.file_name || `ai-report-${report.id}.${report.format}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось скачать отчет.");
    } finally {
      setBusyReportId("");
    }
  }

  async function deleteReport(report: ReportWithCallResponse) {
    setActionError("");
    setBusyReportId(report.id);
    try {
      await api.deleteReport(report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось удалить отчет.");
    } finally {
      setBusyReportId("");
    }
  }

  return (
    <section ref={reportsPageScrollRef} className="reports-page app-page atmospheric-page custom-scroll-target">
      <div className="app-page-heading readable-heading">
        <h1>AI-отчеты</h1>
        <p>Экспорт, статусы и история отчетов по звонкам.</p>
      </div>

      <div className="reports-kpi-grid">
        <ReportMetric value={readyAnalyses.length.toString()} label="Отчетов доступно" note="по готовым анализам" />
        <ReportMetric value={processingReports.toString()} label="В очереди" note="звонки в обработке" />
        <ReportMetric
          value={loadingReports ? "..." : latestReport ? reportFormatLabel(latestReport.format) : "—"}
          label="Последний экспорт"
          note={
            loadingReports
              ? "проверяю историю"
              : latestReport
                ? `${reportStatusLabel(latestReport.status)} · ${formatDate(latestReport.created_at)}`
                : readyAnalyses.length > 0
                  ? "экспорт еще не создавался"
                  : "нет готового анализа"
          }
        />
        <ReportMetric value={reportFormats.length.toString()} label="Доступно форматов" note={reportFormats.map((item) => item.label).join(", ")} />
      </div>
      <CallReportsSection
        reports={reports}
        loadingReports={loadingReports}
        formatFilter={formatFilter}
        statusFilter={statusFilter}
        selectedFormat={selectedFormat}
        selectedCall={selectedCall}
        filteredReadyAnalyses={filteredReadyAnalyses}
        callQuery={callQuery}
        readyAnalysesCount={readyAnalyses.length}
        actionError={actionError}
        busyReportId={busyReportId}
        onFormatFilterChange={setFormatFilter}
        onStatusFilterChange={setStatusFilter}
        onSelectedFormatChange={setSelectedFormat}
        onCallQueryChange={setCallQuery}
        onSelectedCallChange={setSelectedCallId}
        onCreateCallReport={createCallReport}
        onDownloadReport={downloadReport}
        onDeleteReport={deleteReport}
      />
      <CustomScrollbar targetRef={reportsPageScrollRef} inset={15} />
    </section>
  );
}

function CallReportsSection({
  reports,
  loadingReports,
  formatFilter,
  statusFilter,
  selectedFormat,
  selectedCall,
  filteredReadyAnalyses,
  callQuery,
  readyAnalysesCount,
  actionError,
  busyReportId,
  onFormatFilterChange,
  onStatusFilterChange,
  onSelectedFormatChange,
  onCallQueryChange,
  onSelectedCallChange,
  onCreateCallReport,
  onDownloadReport,
  onDeleteReport
}: {
  reports: ReportWithCallResponse[];
  loadingReports: boolean;
  formatFilter: ReportFormat | "all";
  statusFilter: ReportStatus | "all";
  selectedFormat: ReportFormat;
  selectedCall?: CallResponse;
  filteredReadyAnalyses: CallResponse[];
  callQuery: string;
  readyAnalysesCount: number;
  actionError: string;
  busyReportId: string;
  onFormatFilterChange: (format: ReportFormat | "all") => void;
  onStatusFilterChange: (status: ReportStatus | "all") => void;
  onSelectedFormatChange: (format: ReportFormat) => void;
  onCallQueryChange: (query: string) => void;
  onSelectedCallChange: (callId: string) => void;
  onCreateCallReport: () => void;
  onDownloadReport: (report: ReportWithCallResponse) => void;
  onDeleteReport: (report: ReportWithCallResponse) => void;
}) {
  return (
    <div className="reports-grid">
      <section className="glass-panel entity-list-panel">
        <div className="panel-heading large">
          <div>
            <h2>История AI-отчетов</h2>
            <p>Здесь показаны только реально созданные экспорты.</p>
          </div>
        </div>
        <div className="calls-filter-bar report-history-filters">
          <SelectControl
            aria-label="Формат AI-отчетов"
            value={formatFilter}
            onChange={(event) => onFormatFilterChange(event.target.value as ReportFormat | "all")}
          >
            <option value="all">Все форматы</option>
            {reportFormats.map((item) => (
              <option key={item.format} value={item.format}>{item.label}</option>
            ))}
          </SelectControl>
          <SelectControl
            aria-label="Статус AI-отчетов"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as ReportStatus | "all")}
          >
            <option value="all">Все статусы</option>
            <option value="pending">В очереди</option>
            <option value="ready">Готов</option>
            <option value="failed">Ошибка</option>
          </SelectControl>
        </div>
        <div className="report-placeholder-list">
          {loadingReports ? (
            <div className="report-placeholder-row">
              <FileBarChart2 size={22} />
              <div>
                <strong>Загружаю отчеты</strong>
                <small>Запрос к /reports</small>
              </div>
            </div>
          ) : reports.length > 0 ? (
            reports.slice(0, 8).map((report) => {
              const call = report.call;

              return (
                <div className="report-placeholder-row report-history-row" key={report.id}>
                  <FileBarChart2 size={22} />
                  <div>
                    <strong>{reportFormatLabel(report.format)} · {call?.title ?? "Звонок"}</strong>
                    <small>Создан {formatDate(report.created_at)} · {reportFileLabel(report.file_name)}</small>
                  </div>
                  <span className={`status-dot ${report.status === "ready" ? "ok" : report.status === "failed" ? "bad" : "warn"}`}>
                    {reportStatusLabel(report.status)}
                  </span>
                  <div className="report-row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Скачать отчет"
                      disabled={busyReportId === report.id || report.status !== "ready"}
                      onClick={() => onDownloadReport(report)}
                    >
                      <Download size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      aria-label="Удалить отчет"
                      disabled={busyReportId === report.id}
                      onClick={() => onDeleteReport(report)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="report-placeholder-row empty">
              <FileBarChart2 size={22} />
              <div>
                <strong>Созданных AI-отчетов пока нет</strong>
                <small>
                  {readyAnalysesCount > 0
                    ? "Выберите создание отчета справа, чтобы сформировать первый экспорт."
                    : "Отчет можно создать после готового AI-анализа звонка."}
                </small>
              </div>
            </div>
          )}
        </div>
      </section>

      <form
        className="glass-panel entity-detail-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedCall) onCreateCallReport();
        }}
      >
        <FileDown size={34} />
        <h2>Новый AI-отчет</h2>
        <p>Выберите звонок с готовым AI-анализом и формат отчета.</p>
        {actionError && <div className="form-error">{actionError}</div>}
        <div className="report-call-picker">
          <label>
            Звонок для отчета
            <span className="report-call-search">
              <Search size={16} />
              <input
                value={callQuery}
                onChange={(event) => onCallQueryChange(event.target.value)}
                placeholder="Найти звонок по названию"
              />
            </span>
          </label>
          <div className="report-call-options">
            {filteredReadyAnalyses.length === 0 ? (
              <div className="report-call-option empty">Готовых анализов по поиску нет</div>
            ) : (
              filteredReadyAnalyses.map((call) => (
                <button
                  className={`report-call-option ${selectedCall?.id === call.id ? "active" : ""}`}
                  type="button"
                  key={call.id}
                  onClick={() => {
                    onSelectedCallChange(call.id);
                    onCallQueryChange(call.title);
                  }}
                >
                  <strong>{call.title}</strong>
                  <small>{formatDate(call.created_at)} · {call.original_filename}</small>
                </button>
              ))
            )}
          </div>
        </div>
        <button className="primary-button" type="submit" disabled={!selectedCall}>
          <Plus size={17} />
          Создать {reportFormatLabel(selectedFormat)}
        </button>
        <div className="report-format-actions">
          {reportFormats.map((item) => (
            <button
              className={`report-action-row ${selectedFormat === item.format ? "active" : ""}`}
              type="button"
              key={item.format}
              onClick={() => onSelectedFormatChange(item.format)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

function ReportMetric({ value, label, note }: { value: string; label: string; note: string; }) {
  return (
    <div className="report-metric glass-panel">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{note}</small>
    </div>
  );
}


function reportFileLabel(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\bdeep analysis\b/gi, "глубокий анализ")
    .replace(/\bai report\b/gi, "AI-отчет")
    .replace(/\bsummary\b/gi, "сводка")
    .trim() || "готовый экспорт";
}


function reportCallSearchText(call: CallResponse) {
  return [
    call.title,
    call.original_filename,
    call.id
  ].join(" ").toLowerCase();
}


function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
