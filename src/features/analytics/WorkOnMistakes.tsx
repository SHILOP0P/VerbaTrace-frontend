import { ArrowRight, CheckCircle2, ChevronDown, History, Repeat2, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AnalyticsFilters, CallProgress, CallProgressCriterion, EmployeeProgress, ProgressVerdict } from "../../types";

const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
function formatDate(value: string) {
  return dayFormat.format(new Date(value));
}

const verdictLabels: Record<ProgressVerdict, string> = {
  fixed: "Исправлено", repeated: "Повторилось", new: "Новая ошибка", holding: "Держит", first_time: "Впервые",
};

const unavailableTexts: Record<string, string> = {
  shared_call: "Совместный звонок: по общему разговору нельзя сказать, кто исправил или повторил ошибку, поэтому он не сравнивается с прошлыми.",
  internal_call: "Внутренний звонок: разговор коллег не сравнивается с рабочими звонками по критериям.",
  no_fixed_scorecard: "Звонок оценён без постоянных критериев инструкции — сравнивать с прошлыми звонками не по чему.",
};

// Opens a card of another call: the calls page reads the call and the card from
// the address.
function openCallItem(callId: string, itemId: string) {
  const query = new URLSearchParams({ call: callId, item: itemId });
  window.history.pushState({}, "", `/app/calls?${query}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * The work-on-mistakes block of a call: each scored criterion against the same
 * criterion in the employee's previous call. It stays silent when the viewer
 * may not see it or the call has not been analysed yet.
 */
export function CallWorkOnMistakes({ callId, analysisId, onOpenItem }: { callId: string; analysisId?: string; onOpenItem: (itemId: string) => void }) {
  const [progress, setProgress] = useState<CallProgress>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProgress(undefined);
    if (!analysisId) return;
    api.getCallProgress(callId).then((value) => { if (!cancelled) setProgress(value); })
      // A viewer without the right or the plan simply does not get the block.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [callId, analysisId]);

  if (!progress) return null;
  if (!progress.available) {
    const text = progress.unavailable_reason ? unavailableTexts[progress.unavailable_reason] : undefined;
    return text ? <section className="mistakes-block is-muted" aria-label="Работа над ошибками"><History size={16} /><p>{text}</p></section> : null;
  }
  const { counts } = progress;
  const compared = counts.fixed + counts.repeated + counts.new + counts.holding;
  return <section className="mistakes-block" aria-label="Работа над ошибками">
    <button className="mistakes-head" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="mistakes-title"><History size={17} />Работа над ошибками{progress.employee?.full_name ? <small>{progress.employee.full_name}</small> : null}</span>
      <span className="mistakes-counts">
        {compared === 0 ? <span>Первый звонок с этими критериями — сравнивать пока не с чем</span> : <>
          <span className="tone-good">Исправлено {counts.fixed}</span>
          <span className="tone-danger">Повторилось {counts.repeated}</span>
          <span className="tone-warning">Новых {counts.new}</span>
          <span>Держит {counts.holding}</span>
        </>}
      </span>
      <ChevronDown className="mistakes-chevron" size={16} />
    </button>
    {open && <div className="mistakes-body">
      <h4>По критериям инструкции</h4>
      <ul className="mistakes-list">{progress.criteria.map((row) => <CriterionRow key={row.criterion_key} row={row} onOpenItem={onOpenItem} />)}</ul>
      {progress.growth_areas.length > 0 && <>
        <h4>Зоны роста <em>сопоставлено автоматически, проверьте по цитатам</em></h4>
        <ul className="mistakes-list">{progress.growth_areas.map((area) => <li key={area.area_uuid} className={`mistakes-row verdict-${area.verdict}`}>
          <span className="mistakes-verdict">{area.verdict === "repeated" ? "Повторилось" : area.verdict === "improved" ? "Справился" : "Не было ситуации"}</span>
          <div className="mistakes-main"><strong>{area.title}</strong>{area.note ? <small>{area.note}</small> : null}</div>
          {area.item_ids[0] && <div className="mistakes-links"><button className="text-link" type="button" onClick={() => onOpenItem(area.item_ids[0])}>Карточка</button></div>}
        </li>)}</ul>
      </>}
    </div>}
  </section>;
}

function CriterionRow({ row, onOpenItem }: { row: CallProgressCriterion; onOpenItem: (itemId: string) => void }) {
  const Icon = row.verdict === "fixed" ? CheckCircle2 : row.verdict === "repeated" ? Repeat2 : row.verdict === "new" ? TriangleAlert : row.verdict === "first_time" ? Sparkles : ArrowRight;
  return <li className={`mistakes-row verdict-${row.verdict}`}>
    <span className="mistakes-verdict"><Icon size={14} />{verdictLabels[row.verdict]}</span>
    <div className="mistakes-main">
      <strong>{row.title || "Критерий"}</strong>
      <small>
        Сейчас {row.current.score}
        {row.previous ? ` · было ${row.previous.score} (${formatDate(row.previous.occurred_at)})` : ""}
        {row.repeat_streak > 1 ? ` · подряд: ${row.repeat_streak}` : ""}
      </small>
    </div>
    <div className="mistakes-links">
      <button className="text-link" type="button" onClick={() => onOpenItem(row.current.item_id)}>Карточка</button>
      {row.previous?.can_open && <button className="text-link" type="button" onClick={() => openCallItem(row.previous!.call_uuid, row.previous!.item_id)}>Прошлый звонок</button>}
    </div>
  </li>;
}

/** Open mistakes and those closed in the period, for the employee's profile. */
export function EmployeeWorkOnMistakes({ userId, filters, onOpenCall }: { userId: string; filters: AnalyticsFilters; onOpenCall: (callId: string) => void }) {
  const [progress, setProgress] = useState<EmployeeProgress>();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProgress(undefined); setError("");
    api.getEmployeeProgress(userId, filters).then((value) => { if (!cancelled) setProgress(value); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить"); });
    return () => { cancelled = true; };
  }, [userId, filters]);

  if (error) return null;
  return <section className="analytics-block mistakes-profile">
    <h2>Работа над ошибками</h2>
    {!progress ? <div className="analytics-skeleton is-short" /> : <div className="mistakes-profile-grid">
      <div>
        <h3>Открытые ошибки</h3>
        {progress.open.length === 0 ? <p className="analytics-muted">Нет критериев, которые проваливаются сейчас.</p> : <ul className="mistakes-list">
          {progress.open.map((row) => <li key={row.criterion_key} className="mistakes-row verdict-repeated">
            <div className="mistakes-main">
              <strong>{row.title || "Критерий"}</strong>
              <small>Последний балл {row.last_score}{row.repeat_streak > 1 ? ` · подряд: ${row.repeat_streak}` : ""} · с {formatDate(row.first_failed_at)}</small>
            </div>
            {row.last_call_uuid && <div className="mistakes-links"><button className="text-link" type="button" onClick={() => onOpenCall(row.last_call_uuid)}>Звонок</button></div>}
          </li>)}
        </ul>}
      </div>
      <div>
        <h3>Закрытые за период</h3>
        {progress.closed_in_period.length === 0 ? <p className="analytics-muted">Ошибка считается закрытой после трёх звонков подряд с баллом от 75.</p> : <ul className="mistakes-list">
          {progress.closed_in_period.map((row) => <li key={row.criterion_key} className="mistakes-row verdict-fixed">
            <span className="mistakes-verdict"><CheckCircle2 size={14} />Закрыто</span>
            <div className="mistakes-main"><strong>{row.title || "Критерий"}</strong><small>{formatDate(row.closed_at)}</small></div>
          </li>)}
        </ul>}
      </div>
    </div>}
  </section>;
}
