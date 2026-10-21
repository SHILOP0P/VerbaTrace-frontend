import { cssClass } from "../../shared/lib/css-styles";
import { SkeletonLine } from "../../shared/ui/loading";
import { TableSkeleton } from "../../shared/ui/page-loading";
import {
  Activity,
  ArrowLeft,
  Clock3,
  RotateCcw,
  Workflow
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../../api";
import type { CallResponse } from "../../types";

export function MonitoringPage({ calls, onBack }: { calls: CallResponse[]; onBack: () => void; }) {
  const [monitoring, setMonitoring] = useState<Awaited<ReturnType<typeof api.getProcessingMonitoring>> | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const denied = useRef(false);
  const callsQueueKey = calls.map((call) => `${call.id}:${call.status}`).join("|");

  useEffect(() => {
    let cancelled = false;
    let loadingRequest = false;

    async function loadMonitoring(showLoading: boolean) {
      if (denied.current || loadingRequest) return;
      loadingRequest = true;
      if (showLoading) setLoading(true);
      try {
        const response = await api.getProcessingMonitoring();
        if (cancelled) return;
        setMonitoring(response);
        setRestricted(false);
      } catch (error) {
        if (!cancelled && error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          denied.current = true;
          setRestricted(true);
        }
      } finally {
        loadingRequest = false;
        if (!cancelled) setLoading(false);
      }
    }

    loadMonitoring(true);
    const refreshTimer = window.setInterval(() => loadMonitoring(false), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [callsQueueKey]);

  const queue = monitoring?.queue;
  return (
    <section className="monitoring-page app-page atmospheric-page">
      <div className="settings-back-row"><button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={16} />Назад в админ-панель</button></div>
      <div className="app-page-heading readable-heading">
        <h1>Мониторинг</h1>
        <p>Состояние обработки звонков: очередь, ошибки, повторы и среднее время.</p>
      </div>

      <div className="monitoring-kpi-grid">
        <MetricCard loading={loading && !monitoring} icon={<Workflow size={20} />} label="В очереди" value={loading ? "..." : (queue?.pending ?? 0).toString()} note={`${queue?.running ?? 0} выполняется`} />
        <MetricCard loading={loading && !monitoring} icon={<Activity size={20} />} label="Ошибки" value={loading ? "..." : (queue?.failed ?? 0).toString()} note={`${queue?.retry ?? 0} на повторе`} />
        <MetricCard loading={loading && !monitoring} icon={<Clock3 size={20} />} label="Среднее время" value={formatDuration(monitoring?.average_processing_seconds)} note="на одну завершённую обработку" />
        <MetricCard loading={loading && !monitoring} icon={<RotateCcw size={20} />} label="Повторы" value={loading ? "..." : (queue?.retry ?? 0).toString()} note="ожидают повторной обработки" />
      </div>

      <div className="monitoring-grid single">
        <section className="glass-panel entity-list-panel">
          <div className="panel-heading large">
            <div>
              <h2>Пайплайн обработки</h2>
              <p>Показывает только состояние задач, полезное пользователю.</p>
            </div>
            {restricted && <span className="status-chip warn">Ограничено</span>}
          </div>
          {restricted ? (
            <div className="instruction-empty standalone">Мониторинг доступен администраторам и менеджерам компании.</div>
          ) : loading && !monitoring ? <TableSkeleton /> : (
            <div className="pipeline-list">
              <PipelineStep title="Ожидают" status={`${queue?.pending ?? 0} задач`} tone="warn" progress={queueProgress(queue?.pending, queue)} />
              <PipelineStep title="Выполняются" status={`${queue?.running ?? 0} задач`} tone="warn" progress={queueProgress(queue?.running, queue)} />
              <PipelineStep title="Завершены" status={`${queue?.done ?? 0} задач`} tone="ok" progress={queueProgress(queue?.done, queue)} />
              <PipelineStep title="Ошибки / повтор" status={`${queue?.failed ?? 0} ошибок, ${queue?.retry ?? 0} повторов`} tone="warn" progress={queueProgress((queue?.failed ?? 0) + (queue?.retry ?? 0), queue)} />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function formatDuration(value?: number | null) {
  if (value === undefined) return "Нет данных";
  if (value === null) return "Нет данных";
  if (!Number.isFinite(value) || value < 0) return "Нет данных";
  if (value < 10) return `${value.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`;
  const seconds = Math.round(value);
  if (seconds < 60) return `${seconds} с`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return remainder > 0 ? `${minutes} мин ${remainder} с` : `${minutes} мин`;
}

function queueProgress(value = 0, queue?: { pending: number; running: number; done: number; failed: number; retry: number }) {
  if (!queue) return 0;
  const total = queue.pending + queue.running + queue.done + queue.failed + queue.retry;
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function MetricCard({
  icon,
  label,
  value,
  loading = false,
  note
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
  note: string;
}) {
  return (
    <div className="monitoring-metric glass-panel">
      <span>{icon}</span>
      <div>
        <strong>{loading ? <span role="status" aria-label="Загрузка показателя"><SkeletonLine className="skeleton-metric-value" /></span> : value}</strong>
        <small>{label}</small>
      </div>
      <em>{note}</em>
    </div>
  );
}

function PipelineStep({
  title,
  status,
  tone,
  progress
}: {
  title: string;
  status: string;
  tone: "ok" | "warn";
  progress: number;
}) {
  return (
    <div className={`pipeline-step ${tone}`}>
      <span className="pipeline-dot" />
      <div>
        <strong>{title}</strong>
        <small>{status}</small>
      </div>
      <div className="pipeline-track" aria-hidden="true">
        <span className={cssClass({ width: `${Math.min(100, Math.max(0, progress))}%` })} />
      </div>
    </div>
  );
}
