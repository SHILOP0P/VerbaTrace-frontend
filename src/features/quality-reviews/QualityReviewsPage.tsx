import { RowsSkeleton } from "../../shared/ui/page-loading";
import { ArrowRight, ClipboardCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { CallResponse, QualityReviewResponse } from "../../types";
import { SelectControl } from "../../shared/ui/primitives";

export function QualityReviewsPage({ onOpen }: { onOpen: (reviewId: string) => void }) {
  const [items, setItems] = useState<QualityReviewResponse[]>([]);
  const [callsById, setCallsById] = useState<Record<string, CallResponse>>({});
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [result, callsResult] = await Promise.all([
        api.listQualityReviews({ status: status || undefined, limit: 50 }),
        api.listCalls({ limit: 100, offset: 0 })
      ]);
      setItems(result.items ?? []);
      const calls = Array.isArray(callsResult) ? callsResult : callsResult.items;
      setCallsById(Object.fromEntries(calls.map((call) => [call.id, call])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить проверки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [status]);

  return <div className="quality-page">
    <header className="quality-page-header">
      <div><span className="eyebrow">Human QA</span><h1>Проверка качества</h1><p>Подтверждайте выводы ИИ, исправляйте оценки и сохраняйте обратную связь.</p></div>
      <button className="ghost-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={17} />Обновить</button>
    </header>
    <div className="quality-filters"><label><span>Показать</span><SelectControl aria-label="Статус проверки" value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="">Все проверки</option><option value="pending">Ожидают проверки</option><option value="in_review">В работе</option><option value="published">Проверка завершена</option><option value="appealed">На пересмотре</option><option value="resolved">Пересмотрено</option></SelectControl></label></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {loading ? <RowsSkeleton kind="quality" count={5} /> : items.length === 0 ? <div className="quality-empty"><ClipboardCheck size={36} /><strong>Проверок пока нет</strong><span>Откройте готовый анализ звонка и нажмите «Исправить анализ».</span></div> : <div className="quality-list">{items.map((item) => <button className="quality-list-row" type="button" key={item.review_uuid} onClick={() => onOpen(item.review_uuid)}><span className={`quality-status is-${item.status}`}>{statusLabel(item.status)}</span><span className="quality-call-title"><small>Анализ звонка</small><strong>{callsById[item.call_uuid]?.title || "Звонок без названия"}</strong></span><span><small>Последнее изменение</small><strong>{new Date(item.updated_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</strong></span><ArrowRight size={18} /></button>)}</div>}
  </div>;
}

function statusLabel(status: string) {
  return ({ unassigned: "Ожидает проверки", assigned: "Ожидает проверки", in_review: "В работе", published: "Проверка завершена", appealed: "На пересмотре", resolved: "Пересмотрено", canceled: "Отменена" } as Record<string, string>)[status] ?? "Статус уточняется";
}
