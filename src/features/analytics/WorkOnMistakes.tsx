import { ArrowRight, CheckCircle2, ChevronDown, History, Repeat2, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AnalyticsFilters, CallProgress, CallProgressCriterion, EmployeeGrowthArea, EmployeeProgress, ProgressVerdict } from "../../types";
import { stripAnalysisRefs } from "../../shared/lib/analysis-refs";

const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
function formatDate(value: string) {
  return dayFormat.format(new Date(value));
}

const shortDayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
function formatShortDay(value: string) {
  return shortDayFormat.format(new Date(value));
}

function callsWordRu(n: number) {
  const tens = n % 100, ones = n % 10;
  if (tens >= 11 && tens <= 14) return "звонков";
  return ones === 1 ? "звонок" : ones >= 2 && ones <= 4 ? "звонка" : "звонков";
}

const verdictLabels: Record<ProgressVerdict, string> = {
  fixed: "Исправлено", repeated: "Повторилось", new: "Новая ошибка", holding: "Держит", first_time: "Впервые",
};

function times(n: number) {
  const tens = n % 100, ones = n % 10;
  // 1 раз, 2–4 раза, 5–20 раз; 11–14 are "раз" whatever the last digit.
  return (tens >= 11 && tens <= 14) || ones < 2 || ones > 4 ? `${n} раз` : `${n} раза`;
}

const growthVerdictLabels: Record<string, string> = {
  new: "Новая зона", repeated: "Повторилось", improved: "Справился", not_applicable: "Не было ситуации",
};

const unavailableTexts: Record<string, string> = {
  shared_call: "Совместный звонок: по общему разговору нельзя сказать, кто исправил или повторил ошибку, поэтому он не сравнивается с прошлыми.",
  internal_call: "Внутренний звонок: разговор коллег не сравнивается с рабочими звонками по критериям.",
};

// Says what would make the block appear, since both of its layers are missing.
function noScorecardText(personal: boolean) {
  return `Сравнивать с прошлыми звонками пока не по чему: у звонка нет постоянных критериев инструкции и зон роста. Критерии появятся при анализе по инструкции с оценочной картой, зоны роста — при следующем анализе, если в редакторе расшифровки отметить ${personal ? "себя спикером («Это я»)" : "сотрудника спикером"}.`;
}

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
export function CallWorkOnMistakes({ callId, analysisId, personal = false, onOpenItem }: { callId: string; analysisId?: string; personal?: boolean; onOpenItem: (itemId: string) => void }) {
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
    const text = progress.unavailable_reason === "no_fixed_scorecard" ? noScorecardText(personal) : progress.unavailable_reason ? unavailableTexts[progress.unavailable_reason] : undefined;
    return text ? <section className="mistakes-block is-muted" aria-label="Работа над ошибками"><History size={16} /><p>{text}</p></section> : null;
  }
  const { counts } = progress;
  const compared = counts.fixed + counts.repeated + counts.new + counts.holding;
  const previousDate = progress.criteria.find((row) => row.previous)?.previous?.occurred_at;
  const segments: Array<[keyof typeof counts, string, string]> = [["fixed", "Исправлено", "good"], ["repeated", "Повторилось", "bad"], ["new", "Новых", "warn"], ["holding", "Держит", "hold"]];
  return <section className={`mistakes-block${open ? " is-open" : ""}`} aria-label="Работа над ошибками">
    <button className="mistakes-head" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="mistakes-title">
        <History size={17} />
        <span>
          <strong>Работа над ошибками</strong>
          <small>{progress.employee?.full_name && !personal ? `${progress.employee.full_name} · ` : ""}{previousDate ? `по сравнению с ${personal ? "вашим прошлым звонком" : "прошлым звонком сотрудника"} · ${formatDate(previousDate)}` : "по сравнению с прошлыми звонками"}</small>
        </span>
      </span>
      <ChevronDown className="mistakes-chevron" size={16} />
    </button>
    {progress.criteria.length === 0 ? <p className="mistakes-summary-note">Зон роста: {progress.growth_areas.length}</p>
      : compared === 0 ? <p className="mistakes-summary-note">Первый звонок с этими критериями — сравнивать пока не с чем.</p>
        : <div className="mistakes-summary">
          <div className="mistakes-bar" aria-hidden="true">
            {segments.map(([key, , tone]) => counts[key] > 0 ? <i key={key} className={`is-${tone}`} style={{ flexGrow: counts[key] }} /> : null)}
          </div>
          <ul className="mistakes-legend">
            {segments.map(([key, label, tone]) => <li key={key} className={`is-${tone}`}><i />{label} <b>{counts[key]}</b></li>)}
          </ul>
        </div>}
    {open && <div className="mistakes-body">
      {progress.criteria.length > 0 && <>
        <h4>По критериям инструкции</h4>
        <ul className="mistakes-list">{progress.criteria.map((row) => <CriterionRow key={row.criterion_key} row={row} onOpenItem={onOpenItem} />)}</ul>
      </>}
      {progress.growth_areas.length > 0 && <>
        <h4>Зоны роста <em>сопоставлено автоматически, проверьте по цитатам</em></h4>
        <ul className="mistakes-list">{progress.growth_areas.map((area) => <li key={area.area_uuid} className={`mistakes-row verdict-${area.verdict}`}>
          <span className="mistakes-verdict">{growthVerdictLabels[area.verdict]}</span>
          <div className="mistakes-main"><strong>{stripAnalysisRefs(area.title)}</strong>{area.note ? <small>{stripAnalysisRefs(area.note)}</small> : null}</div>
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
      <small className="mistakes-change">
        {row.previous ? <>{row.previous.score}<ArrowRight size={12} aria-label="стало" /></> : null}
        <b className={`tone-${row.current.score >= 75 ? "good" : row.current.score >= 50 ? "warning" : "danger"}`}>{row.current.score}</b>
        {row.repeat_streak > 1 ? <span className="mistakes-streak">{row.repeat_streak}-й звонок подряд</span> : null}
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
  const [showAllOpen, setShowAllOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProgress(undefined); setError("");
    api.getEmployeeProgress(userId, filters).then((value) => { if (!cancelled) setProgress(value); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить"); });
    return () => { cancelled = true; };
  }, [userId, filters]);

  if (error) return null;
  // With nothing closed the second column would stand almost empty beside a long
  // list, so the note goes on top and the list takes the whole width.
  const single = Boolean(progress && progress.closed_in_period.length === 0);
  const openShown = progress && !showAllOpen ? progress.open.slice(0, 8) : progress?.open ?? [];
  return <section className="analytics-block mistakes-profile">
    <h2>Работа над ошибками</h2>
    {!progress ? <div className="analytics-skeleton is-short" /> : <div className={`mistakes-profile-grid${single ? " is-single" : ""}`}>
      {single && <p className="mistakes-empty"><History size={16} />Закрытых за период нет. Ошибка закрывается после трёх звонков подряд с баллом от 75.</p>}
      <div>
        <h3>Открытые ошибки <b>{progress.open.length}</b></h3>
        {progress.open.length === 0 ? <p className="mistakes-empty"><CheckCircle2 size={16} />Нет критериев, которые проваливаются сейчас.</p> : <ul className="mistakes-list">
          {openShown.map((row) => <li key={row.criterion_key} className="mistakes-row is-open-mistake">
            <span className={`mistakes-score tone-${row.last_score >= 75 ? "good" : row.last_score >= 50 ? "warning" : "danger"}`}>{row.last_score}</span>
            <div className="mistakes-main">
              <strong>{row.title || "Критерий"}</strong>
              <small>{row.repeat_streak > 1 ? `${row.repeat_streak} ${callsWordRu(row.repeat_streak)} подряд ниже 75 · ` : ""}с {formatShortDay(row.first_failed_at)}</small>
            </div>
            {row.last_call_uuid && <div className="mistakes-links"><button className="text-link" type="button" onClick={() => onOpenCall(row.last_call_uuid)}>Открыть звонок<ArrowRight size={13} /></button></div>}
          </li>)}
        </ul>}
        {progress.open.length > 8 && <button className="text-link mistakes-more" type="button" onClick={() => setShowAllOpen((value) => !value)}>{showAllOpen ? "Свернуть" : `Показать все ${progress.open.length}`}</button>}
      </div>
      {!single && <div>
        <h3>Закрытые за период <b>{progress.closed_in_period.length}</b></h3>
        <ul className="mistakes-list">
          {progress.closed_in_period.map((row) => <li key={row.criterion_key} className="mistakes-row verdict-fixed">
            <span className="mistakes-verdict"><CheckCircle2 size={14} />Закрыто</span>
            <div className="mistakes-main"><strong>{row.title || "Критерий"}</strong><small>{formatShortDay(row.closed_at)}</small></div>
          </li>)}
        </ul>
      </div>}
    </div>}
    <GrowthAreas userId={userId} filters={filters} />
  </section>;
}

const areaStatusLabels: Record<EmployeeGrowthArea["status"], string> = { open: "Открыта", resolved: "Закрыта", dismissed: "Скрыта" };

/**
 * The approximate layer: shortcomings outside the criteria that the analysis
 * matched between calls. Marked as automatic, each area opens into the calls it
 * was seen in, and it can be hidden when the model got it wrong.
 */
function GrowthAreas({ userId, filters }: { userId: string; filters: AnalyticsFilters }) {
  const [areas, setAreas] = useState<EmployeeGrowthArea[]>();
  const [hidden, setHidden] = useState<EmployeeGrowthArea[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getEmployeeGrowthAreas(userId, filters), api.getEmployeeGrowthAreas(userId, { ...filters, status: "dismissed" })])
      .then(([visible, dismissed]) => { if (!cancelled) { setAreas(visible.areas); setHidden(dismissed.areas); } })
      .catch(() => { if (!cancelled) setAreas([]); });
    return () => { cancelled = true; };
  }, [userId, filters, reload]);

  if (!areas || (areas.length === 0 && hidden.length === 0)) return null;
  return <div className="growth-areas">
    <h3>Зоны роста <em>сопоставлено автоматически, проверьте по цитатам</em></h3>
    {areas.length === 0 ? <p className="analytics-muted">Открытых и закрытых зон нет.</p>
      : <ul className="mistakes-list">{areas.map((area) => <GrowthAreaRow key={area.area_uuid} area={area} onChanged={() => setReload((value) => value + 1)} />)}</ul>}
    {hidden.length > 0 && <>
      <button className="text-link growth-hidden-toggle" type="button" onClick={() => setShowHidden((value) => !value)}>{showHidden ? "Свернуть скрытые" : `Скрытые зоны: ${hidden.length}`}</button>
      {showHidden && <ul className="mistakes-list">{hidden.map((area) => <GrowthAreaRow key={area.area_uuid} area={area} onChanged={() => setReload((value) => value + 1)} />)}</ul>}
    </>}
  </div>;
}

function GrowthAreaRow({ area, onChanged }: { area: EmployeeGrowthArea; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить"); } finally { setBusy(false); }
  };
  return <li className={`growth-area is-${area.status}`}>
    <div className="growth-area-head">
      <div className="mistakes-main">
        <strong>{stripAnalysisRefs(area.title)}{area.returned && area.status === "open" ? <em className="growth-returned">вернулась</em> : null}</strong>
        <small>{areaStatusLabels[area.status]} · встречалась {times(area.occurrences)}{area.clean_streak > 0 ? ` · справился подряд: ${area.clean_streak}` : ""}</small>
        <small>{stripAnalysisRefs(area.description)}</small>
      </div>
      <div className="mistakes-links">
        {area.observations.length > 0 && <button className="text-link" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? "Свернуть" : `Звонки: ${area.observations.length}`}</button>}
        {area.status === "dismissed"
          ? <button className="text-link" type="button" disabled={busy} onClick={() => void act(() => api.reopenGrowthArea(area.area_uuid))}>Вернуть</button>
          : <button className="text-link" type="button" onClick={() => setHiding((value) => !value)}>Скрыть</button>}
      </div>
    </div>
    {hiding && area.status !== "dismissed" && <div className="growth-hide-form">
      <label htmlFor={`growth-reason-${area.area_uuid}`}>Почему это не ошибка или модель ошиблась</label>
      <textarea id={`growth-reason-${area.area_uuid}`} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="growth-hide-actions">
        <button className="primary-button small" type="button" disabled={busy || !reason.trim()} onClick={() => void act(() => api.dismissGrowthArea(area.area_uuid, reason))}>Скрыть зону</button>
        <button className="ghost-button small" type="button" disabled={busy} onClick={() => setHiding(false)}>Отмена</button>
      </div>
    </div>}
    {error && <small className="form-error">{error}</small>}
    {open && <ul className="growth-feed">{area.observations.map((observation) => <li key={`${observation.call_uuid}-${observation.occurred_at}`}>
      <span className={`mistakes-verdict verdict-${observation.verdict}`}>{growthVerdictLabels[observation.verdict]}</span>
      <div className="mistakes-main">
        <small>{formatDate(observation.occurred_at)}{observation.call_uuid ? "" : " · звонок недоступен вам"}</small>
        {observation.note ? <span>{stripAnalysisRefs(observation.note)}</span> : null}
      </div>
      {observation.call_uuid && <button className="text-link" type="button" onClick={() => openCallItem(observation.call_uuid, observation.item_ids[0] ?? "")}>Карточка</button>}
    </li>)}</ul>}
  </li>;
}
