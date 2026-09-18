import { AlertTriangle, ArrowLeft, BarChart3, FileText, Headphones, ListChecks, Lock, RefreshCw, Settings2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../api";
import { useWorkspaceCompanyId } from "../../shared/lib/workspace-company";
import { DataTable, DeltaBadge, DistributionBar, EmptyState, MiniTrend, PeriodSelect, ScoreValue, TrendChart, formatBucket, lastWeekPeriod, periodRange, scoreTone, type DataColumn, type PeriodValue } from "../../shared/ui/analytics-ui";
import { SelectControl } from "../../shared/ui/primitives";
import { EmployeeWorkOnMistakes } from "./WorkOnMistakes";
import { SpeechComparison, formatSeconds as formatSpeechSeconds, formatShare, speechHints } from "../../shared/ui/speech";
import { AnalyticsSettingsCard } from "./AnalyticsSettings";
import type {
  AnalyticsCapabilities, AnalyticsCriteriaResponse, AnalyticsCriterionCallsResponse, AnalyticsCriterionRow, AnalyticsDepartmentRow,
  AnalyticsDepartmentsResponse, AnalyticsEmployeeRow, AnalyticsEmployeesResponse, AnalyticsFilters, AnalyticsMatrixResponse,
  AnalyticsProfile, AnalyticsSummary, AnalyticsTeamRow, AnalyticsWorthListening, AppPage, DepartmentResponse,
} from "../../types";

type Tab = "criteria" | "employees" | "departments" | "matrix";

export type OpenCallAt = (callId: string, itemId?: string, seconds?: number | null) => void;

type Props = {
  departments: DepartmentResponse[];
  /** The employee whose profile the URL points at; "me" for one's own. */
  profileUserId?: string;
  onNavigate: (page: AppPage) => void;
  onOpenCall: OpenCallAt;
};

function openProfile(userId: string) {
  window.history.pushState({}, "", `/app/analytics/employees/${encodeURIComponent(userId)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function backToTeam() {
  window.history.pushState({}, "", "/app/analytics");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const STATUS_LABELS: Record<string, string> = {
  met: "Выполнено", mostly_met: "Почти", partially_met: "Частично", minimally_met: "Минимально", missed: "Не выполнено",
  not_applicable: "Не применимо", unclear: "Нет данных", conflict: "Конфликт", not_assessed: "Не оценено",
};

function accessError(cause: unknown): "team" | "personal" | null {
  if (cause instanceof ApiError && cause.status === 403) {
    if (cause.code === "team_analytics_access_denied") return "team";
    if (cause.code === "personal_progress_access_denied") return "personal";
  }
  return null;
}

export function AnalyticsPage({ departments, profileUserId, onNavigate, onOpenCall }: Props) {
  const workspace = useWorkspaceCompanyId();
  const base = useMemo<AnalyticsFilters>(() => workspace ? { company_uuid: workspace } : { scope: "personal" }, [workspace]);
  const [capabilities, setCapabilities] = useState<AnalyticsCapabilities>();
  const [capabilitiesError, setCapabilitiesError] = useState("");
  // The weekly digest opens the page on the week it summed up.
  const [period, setPeriod] = useState<PeriodValue>(() => new URLSearchParams(window.location.search).get("period") === "last_week" ? lastWeekPeriod() : { preset: "30" });
  const [department, setDepartment] = useState("");
  const [instruction, setInstruction] = useState("");
  const [includeInternal, setIncludeInternal] = useState(false);
  const [excludeShared, setExcludeShared] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCapabilities(undefined); setCapabilitiesError(""); setDepartment(""); setInstruction("");
    api.getAnalyticsCapabilities(base).then((value) => { if (!cancelled) setCapabilities(value); })
      .catch((cause) => { if (!cancelled) setCapabilitiesError(cause instanceof Error ? cause.message : "Не удалось открыть аналитику"); });
    return () => { cancelled = true; };
  }, [base]);

  const filters = useMemo<AnalyticsFilters>(() => ({
    ...base, ...periodRange(period), department_uuid: department || undefined, instruction_uuid: instruction || undefined,
    include_internal: includeInternal || undefined, exclude_shared: excludeShared || undefined,
  }), [base, period, department, instruction, includeInternal, excludeShared]);
  const profileFilters = useMemo<AnalyticsFilters>(() => ({ ...filters, department_uuid: undefined }), [filters]);

  const ownOnly = capabilities?.own_profile_only;
  const companyDepartments = useMemo(() => departments.filter((item) => item.company_uuid === workspace && (!capabilities?.department_uuids.length || capabilities.department_uuids.includes(item.id))), [capabilities, departments, workspace]);

  if (capabilitiesError) return <section className="app-page analytics-page"><EmptyState icon={<AlertTriangle size={28} />} title="Аналитика недоступна" text={capabilitiesError} /></section>;
  if (!capabilities) return <section className="app-page analytics-page"><div className="analytics-skeleton" /></section>;

  // The company's settings are the owner's and the deputy's; a personal account
  // sets up its own.
  const canSetUp = capabilities.scope === "personal" || capabilities.role === "company_manager" || capabilities.role === "company_deputy";
  // A profile belongs to one person, so the department filter only matters on the team view.
  const header = <div className="analytics-toolbar">
    <PeriodSelect value={period} onChange={setPeriod} retentionDays={capabilities.retention_days} />
    {!ownOnly && !profileUserId && companyDepartments.length > 1 ? <SelectControl aria-label="Отдел" value={department} onChange={(event) => setDepartment(event.target.value)}>
      <option value="">Все отделы</option>{companyDepartments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </SelectControl> : null}
    <label className="checkbox-row analytics-toggle"><input type="checkbox" checked={excludeShared} onChange={(event) => setExcludeShared(event.target.checked)} /><span>Без совместных</span></label>
    <label className="checkbox-row analytics-toggle"><input type="checkbox" checked={includeInternal} onChange={(event) => setIncludeInternal(event.target.checked)} /><span>Включая внутренние</span></label>
    {canSetUp && <button className="ghost-button small analytics-settings-button" type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)}><Settings2 size={16} />Настройки</button>}
  </div>;
  const settingsCard = settingsOpen && canSetUp ? <AnalyticsSettingsCard companyId={workspace || undefined} onClose={() => setSettingsOpen(false)} /> : null;

  if (ownOnly || profileUserId) {
    return <section className="app-page analytics-page">
      {!ownOnly ? <button className="ghost-button small analytics-back" type="button" onClick={backToTeam}><ArrowLeft size={16} />К команде</button> : null}
      {header}
      {settingsCard}
      <ProfileView userId={ownOnly ? "me" : profileUserId!} filters={profileFilters} onOpenCall={onOpenCall} onNavigate={onNavigate} />
    </section>;
  }
  return <section className="app-page analytics-page">
    <div className="app-page-heading"><div><h1>Аналитика</h1><p>Средние баллы по критериям, сотрудникам и отделам — из проверенных звонков.</p></div></div>
    {header}
    {settingsCard}
    <TeamView capabilities={capabilities} filters={filters} instruction={instruction} onInstruction={setInstruction} onNavigate={onNavigate} onOpenCall={onOpenCall} />
  </section>;
}

function TeamView({ capabilities, filters, instruction, onInstruction, onNavigate, onOpenCall }: {
  capabilities: AnalyticsCapabilities; filters: AnalyticsFilters; instruction: string; onInstruction: (value: string) => void;
  onNavigate: (page: AppPage) => void; onOpenCall: OpenCallAt;
}) {
  const [tab, setTab] = useState<Tab>("criteria");
  const [summary, setSummary] = useState<AnalyticsSummary>();
  const [error, setError] = useState<{ kind: "team" | "personal" | "other"; message: string }>();
  const [reload, setReload] = useState(0);
  const [openCriterion, setOpenCriterion] = useState<{ key: string; employee?: string }>();

  useEffect(() => {
    let cancelled = false;
    setSummary(undefined); setError(undefined);
    api.getAnalyticsSummary(filters).then((value) => { if (!cancelled) setSummary(value); }).catch((cause) => {
      if (cancelled) return;
      const denied = accessError(cause);
      setError({ kind: denied ?? "other", message: cause instanceof Error ? cause.message : "Не удалось загрузить аналитику" });
    });
    return () => { cancelled = true; };
  }, [filters, reload]);

  if (error?.kind === "team" || error?.kind === "personal") return <EmptyState icon={<Lock size={28} />}
    title={error.kind === "team" ? "Командная аналитика не входит в тариф" : "Личный прогресс доступен на тарифах Plus и Pro"}
    text="Общий балл и счётчики остаются на «Обзоре»."
    action={<button className="primary-button" type="button" onClick={() => onNavigate("settingsTariffs")}>Перейти к тарифам</button>} />;
  if (error) return <EmptyState icon={<AlertTriangle size={28} />} title="Не удалось загрузить аналитику" text={error.message}
    action={<button className="ghost-button" type="button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />Повторить</button>} />;
  if (!summary) return <div className="analytics-skeleton" />;
  if (summary.calls_analyzed === 0) return <><SummaryStrip summary={summary} role={capabilities.role} /><EmptyState icon={<BarChart3 size={28} />} title="Нет проанализированных звонков за период" text="Выберите период подлиннее или загрузите звонки." /></>;

  const tabs: Array<[Tab, string]> = [["criteria", "Критерии"], ["employees", "Сотрудники"]];
  // A leader compares their departments with the company row.
  if (capabilities.can_view_departments) tabs.push(["departments", "Отделы"]);
  tabs.push(["matrix", "Матрица"]);
  return <>
    <SummaryStrip summary={summary} role={capabilities.role} />
    <div className="analytics-trend-card"><TrendChart points={summary.trend} markers={summary.markers} label="Средний балл" /></div>
    <div className="segmented analytics-tabs" role="tablist">
      {tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`${tab === value ? "active" : ""}${value === "matrix" ? " analytics-tab-matrix" : ""}`} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    {tab === "criteria" ? <CriteriaTab filters={filters} onOpen={(key) => setOpenCriterion({ key })} onNavigate={onNavigate} /> : null}
    {tab === "employees" ? <EmployeesTab filters={filters} /> : null}
    {tab === "departments" ? <DepartmentsTab filters={filters} /> : null}
    {tab === "matrix" ? <MatrixTab filters={filters} instruction={instruction} onInstruction={onInstruction} onOpen={(key, employee) => setOpenCriterion({ key, employee })} /> : null}
    {openCriterion ? <CriterionPanel criterionKey={openCriterion.key} employee={openCriterion.employee} filters={filters} onClose={() => setOpenCriterion(undefined)} onOpenCall={onOpenCall} /> : null}
  </>;
}

function SummaryStrip({ summary, role }: { summary: AnalyticsSummary; role: AnalyticsCapabilities["role"] }) {
  return <div className="analytics-summary">
    <div><small>Звонков с анализом</small><strong>{summary.calls_analyzed}</strong><span>из {summary.calls_total}{summary.calls_internal_excluded ? ` · внутренних скрыто: ${summary.calls_internal_excluded}` : ""}</span></div>
    <div><small>Средний балл</small><strong><ScoreValue value={summary.avg_score} sample={summary.sample} /></strong><span><DeltaBadge delta={summary.delta} /> к прошлому периоду</span></div>
    {role === "department_leader" ? <div><small>Мой отдел / компания</small><strong>{summary.avg_score ?? "—"} / {summary.company_avg_score ?? "—"}</strong><span>средний балл</span></div> : null}
    <div><small>Критичных пропусков</small><strong className={summary.critical_missed ? "tone-danger" : ""}>{summary.critical_missed}</strong><span>критерии с отметкой «Критичный»</span></div>
    <div title="Их требования подобраны разово, поэтому их нет в разрезе по критериям"><small>Без постоянных критериев</small><strong>{summary.calls_without_fixed_scorecard}</strong><span>не входят в разрез по критериям</span></div>
  </div>;
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setValue(undefined); setError("");
    load().then((result) => { if (!cancelled) setValue(result); }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  return { value, error, retry: () => setAttempt((current) => current + 1) };
}

function LoadState({ error, retry }: { error: string; retry: () => void }) {
  if (error) return <EmptyState icon={<AlertTriangle size={26} />} title="Не удалось загрузить" text={error} action={<button className="ghost-button" type="button" onClick={retry}><RefreshCw size={16} />Повторить</button>} />;
  return <div className="analytics-skeleton" />;
}

function CriteriaTab({ filters, onOpen, onNavigate }: { filters: AnalyticsFilters; onOpen: (key: string) => void; onNavigate: (page: AppPage) => void }) {
  const { value, error, retry } = useLoad<AnalyticsCriteriaResponse>(() => api.getAnalyticsCriteria(filters), [filters]);
  if (!value) return <LoadState error={error} retry={retry} />;
  if (value.criteria.length === 0) return <EmptyState icon={<ListChecks size={28} />} title="Нет инструкций с критериями"
    text="Критерии появляются, когда звонки оцениваются по инструкции с готовой оценочной картой."
    action={<button className="primary-button" type="button" onClick={() => onNavigate("instructionCreate")}>Создать инструкцию</button>} />;
  const columns: DataColumn<AnalyticsCriterionRow>[] = [
    { key: "title", label: "Критерий", priority: 0, render: (row) => <span className="analytics-name"><strong>{row.title}{row.is_critical ? <em className="analytics-critical">Критичный</em> : null}</strong><small>{row.instruction.title}{row.instruction.deleted ? " · инструкция удалена" : ""}</small></span>, sortValue: (row) => row.title },
    { key: "avg", label: "Средний", priority: 1, width: 150, render: (row) => <span className="analytics-score-cell"><ScoreValue value={row.avg_score} sample={row.sample} /><DistributionBar distribution={row.distribution} /></span>, sortValue: (row) => row.avg_score },
    { key: "delta", label: "Дельта", priority: 2, width: 76, align: "end", render: (row) => <DeltaBadge delta={row.delta} />, sortValue: (row) => row.delta.value },
    { key: "pass", label: "Выполнено", priority: 3, width: 96, align: "end", render: (row) => row.pass_rate === null ? "—" : `${Math.round(row.pass_rate * 100)}%`, sortValue: (row) => row.pass_rate },
    { key: "n", label: "Оценок", priority: 4, width: 110, align: "end", render: (row) => <span title={`Не применимо: ${row.n_not_applicable}, не удалось оценить: ${row.n_unassessed}`}>{row.n_scored}{row.n_not_applicable || row.n_unassessed ? <small className="analytics-muted"> +{row.n_not_applicable + row.n_unassessed}</small> : null}</span>, sortValue: (row) => row.n_scored },
    { key: "trend", label: "Тренд", priority: 5, width: 96, render: (row) => <MiniTrend points={row.trend} /> },
  ];
  return <DataTable columns={columns} rows={value.criteria} rowKey={(row) => row.criterion_key} onRowClick={(row) => onOpen(row.criterion_key)} />;
}

function teamColumns<T extends AnalyticsEmployeeRow | AnalyticsDepartmentRow>(name: (row: T) => React.ReactNode, sortName: (row: T) => string): DataColumn<T>[] {
  return [
    { key: "name", label: "Имя", priority: 0, render: name, sortValue: sortName },
    { key: "avg", label: "Средний", priority: 1, width: 120, render: (row) => <ScoreValue value={row.avg_score} sample={row.sample} />, sortValue: (row) => row.avg_score },
    { key: "delta", label: "Дельта", priority: 2, width: 76, align: "end", render: (row) => <DeltaBadge delta={row.delta} />, sortValue: (row) => row.delta.value },
    { key: "calls", label: "Звонков", priority: 3, width: 84, align: "end", render: (row) => row.calls, sortValue: (row) => row.calls },
    { key: "critical", label: "Критичные", priority: 4, width: 96, align: "end", render: (row) => row.critical_missed || "—", sortValue: (row) => row.critical_missed },
    { key: "weakest", label: "Слабый критерий", priority: 5, width: 200, render: (row) => row.weakest_criterion ? <span className="analytics-weakest">{row.weakest_criterion.title} <small>{row.weakest_criterion.avg_score}</small></span> : "—" },
    { key: "trend", label: "Тренд", priority: 6, width: 96, render: (row) => <MiniTrend points={row.trend} /> },
  ];
}

function TeamLine({ label, team }: { label: string; team: AnalyticsTeamRow | null }) {
  if (!team) return null;
  return <div className="analytics-team-line"><strong>{label}</strong><span>звонков: {team.calls}</span><ScoreValue value={team.avg_score} sample={team.sample} /><DeltaBadge delta={team.delta} /><MiniTrend points={team.trend} /></div>;
}

function EmployeesTab({ filters }: { filters: AnalyticsFilters }) {
  const { value, error, retry } = useLoad<AnalyticsEmployeesResponse>(() => api.getAnalyticsEmployees(filters), [filters]);
  if (!value) return <LoadState error={error} retry={retry} />;
  // Speech columns come last: they are the first to go on a narrow screen.
  const columns: DataColumn<AnalyticsEmployeeRow>[] = [
    ...teamColumns<AnalyticsEmployeeRow>((row) => <span className="analytics-name"><strong>{row.full_name || "Без имени"}{row.is_me ? <em>вы</em> : null}{row.is_former_member ? <em className="is-muted">бывший сотрудник</em> : null}</strong><small>{row.department?.name ?? "Без отдела"}{row.calls_shared ? ` · совместных: ${row.calls_shared}` : ""}</small></span>, (row) => row.full_name),
    { key: "talk", label: "Доля речи", priority: 7, width: 96, align: "end", render: (row) => <span title={speechHints.talk_share}>{formatShare(row.speech?.talk_share)}</span>, sortValue: (row) => row.speech?.talk_share ?? null },
    { key: "monologue", label: "Монолог", priority: 8, width: 90, align: "end", render: (row) => <span title={speechHints.longest_monologue}>{formatSpeechSeconds(row.speech?.longest_monologue_seconds)}</span>, sortValue: (row) => row.speech?.longest_monologue_seconds ?? null },
  ];
  return <>
    <TeamLine label="Команда" team={value.team} />
    <DataTable columns={columns} rows={value.employees} rowKey={(row) => row.user_uuid} pinned={(row) => row.is_me} onRowClick={(row) => openProfile(row.user_uuid)} emptyText="Сотрудников с оценёнными звонками нет." />
  </>;
}

function DepartmentsTab({ filters }: { filters: AnalyticsFilters }) {
  const { value, error, retry } = useLoad<AnalyticsDepartmentsResponse>(() => api.getAnalyticsDepartments(filters), [filters]);
  if (!value) return <LoadState error={error} retry={retry} />;
  const columns = teamColumns<AnalyticsDepartmentRow>((row) => <span className="analytics-name"><strong>{row.name}</strong><small>сотрудников: {row.employees}</small></span>, (row) => row.name);
  return <>
    <TeamLine label="Компания" team={value.company} />
    <DataTable columns={columns} rows={value.departments} rowKey={(row) => row.department_uuid} emptyText="Звонков с отделом за период нет." />
  </>;
}

function MatrixTab({ filters, instruction, onInstruction, onOpen }: { filters: AnalyticsFilters; instruction: string; onInstruction: (value: string) => void; onOpen: (key: string, employee: string) => void }) {
  const criteria = useLoad<AnalyticsCriteriaResponse>(() => api.getAnalyticsCriteria({ ...filters, instruction_uuid: undefined }), [filters]);
  const instructions = useMemo(() => {
    const seen = new Map<string, string>();
    criteria.value?.criteria.forEach((row) => seen.set(row.instruction.uuid, row.instruction.title));
    return Array.from(seen, ([uuid, title]) => ({ uuid, title }));
  }, [criteria.value]);
  const selected = instruction || instructions[0]?.uuid || "";
  const matrix = useLoad<AnalyticsMatrixResponse | undefined>(() => selected ? api.getAnalyticsMatrix({ ...filters, instruction_uuid: selected }) : Promise.resolve(undefined), [filters, selected]);
  if (!criteria.value) return <LoadState error={criteria.error} retry={criteria.retry} />;
  if (instructions.length === 0) return <EmptyState icon={<ListChecks size={28} />} title="Нет инструкций с критериями" />;
  return <div className="analytics-matrix">
    <SelectControl aria-label="Инструкция" value={selected} onChange={(event) => onInstruction(event.target.value)}>{instructions.map((item) => <option key={item.uuid} value={item.uuid}>{item.title}</option>)}</SelectControl>
    {!matrix.value ? <LoadState error={matrix.error} retry={matrix.retry} /> : <div className="analytics-matrix-scroll">
      <table>
        <thead><tr><th>Сотрудник</th>{matrix.value.criteria.map((criterion) => <th key={criterion.criterion_key} title={criterion.title}><span>{criterion.title}</span></th>)}</tr></thead>
        <tbody>{matrix.value.rows.map((row) => <tr key={row.user_uuid}><th>{row.full_name}</th>{row.cells.map((cell) => <td key={cell.criterion_key}>
          <button type="button" className={`analytics-matrix-cell ${cell.avg_score === null ? "is-empty" : `band-${band(cell.avg_score)}`}`} title={`Оценок: ${cell.n}`} onClick={() => onOpen(cell.criterion_key, row.user_uuid)}>{cell.avg_score ?? "—"}</button>
        </td>)}</tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

function band(score: number) {
  return score >= 88 ? 5 : score >= 63 ? 4 : score >= 38 ? 3 : score >= 13 ? 2 : 1;
}

function CriterionPanel({ criterionKey, employee, filters, onClose, onOpenCall }: { criterionKey: string; employee?: string; filters: AnalyticsFilters; onClose: () => void; onOpenCall: OpenCallAt }) {
  const [sort, setSort] = useState<"occurred_at" | "score">("score");
  const [offset, setOffset] = useState(0);
  const { value, error, retry } = useLoad<AnalyticsCriterionCallsResponse>(() => api.getAnalyticsCriterionCalls(criterionKey, { ...filters, employee_uuid: employee, sort, limit: 20, offset }), [criterionKey, employee, filters, sort, offset]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <aside className="analytics-panel" role="dialog" aria-label="Звонки критерия">
    <header><div><small>{value?.criterion.instruction.title}</small><h2>{value?.criterion.title ?? "Критерий"}</h2></div><button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button></header>
    <div className="segmented compact"><button type="button" className={sort === "score" ? "active" : ""} onClick={() => setSort("score")}>Сначала слабые</button><button type="button" className={sort === "occurred_at" ? "active" : ""} onClick={() => setSort("occurred_at")}>Сначала новые</button></div>
    {!value ? <LoadState error={error} retry={retry} /> : <>
      <ul className="analytics-panel-calls">{value.calls.map((call) => <li key={call.call_uuid}>
        <button type="button" disabled={!call.can_open} onClick={() => onOpenCall(call.call_uuid, call.item_id, call.evidence_start_seconds)}>
          <span className={`analytics-status tone-${call.score === null ? "neutral" : scoreTone(call.score)}`}>{STATUS_LABELS[call.status] ?? call.status}{call.score !== null ? ` · ${call.score}` : ""}{call.score_source === "human" ? " · проверено человеком" : ""}</span>
          <strong>{call.can_open ? call.title || "Звонок" : "Звонок недоступен вам"}</strong>
          <small>{new Date(call.occurred_at).toLocaleDateString("ru-RU")} · {call.employees.map((person) => person.full_name).join(", ") || "—"}{call.is_shared ? " · совместный" : ""}{call.subjects_changed_manually ? " · состав менялся вручную" : ""}</small>
          {call.can_open && call.evidence_start_seconds !== null ? <em><Headphones size={13} />к моменту {formatSeconds(call.evidence_start_seconds)}</em> : null}
        </button>
      </li>)}</ul>
      {value.total > value.limit ? <div className="analytics-panel-pages">
        <button className="ghost-button small" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - value.limit))}>Назад</button>
        <span>{offset + 1}–{Math.min(offset + value.limit, value.total)} из {value.total}</span>
        <button className="ghost-button small" type="button" disabled={offset + value.limit >= value.total} onClick={() => setOffset(offset + value.limit)}>Дальше</button>
      </div> : null}
    </>}
  </aside>;
}

function formatSeconds(seconds: number) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ProfileView({ userId, filters, onOpenCall, onNavigate }: { userId: string; filters: AnalyticsFilters; onOpenCall: OpenCallAt; onNavigate: (page: AppPage) => void }) {
  const [profile, setProfile] = useState<AnalyticsProfile>();
  const [error, setError] = useState<{ kind: "team" | "personal" | "other"; message: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setProfile(undefined); setError(undefined);
    api.getAnalyticsProfile(userId, filters).then((value) => { if (!cancelled) setProfile(value); }).catch((cause) => {
      if (!cancelled) setError({ kind: accessError(cause) ?? "other", message: cause instanceof Error ? cause.message : "Не удалось загрузить профиль" });
    });
    return () => { cancelled = true; };
  }, [userId, filters, attempt]);
  if (error?.kind === "personal") return <EmptyState icon={<Lock size={28} />} title="Личный прогресс доступен на тарифах Plus и Pro" text="Общий балл остаётся на «Обзоре»."
    action={<button className="primary-button" type="button" onClick={() => onNavigate("settingsTariffs")}>Перейти к тарифам</button>} />;
  if (error) return <EmptyState icon={<AlertTriangle size={28} />} title="Профиль недоступен" text={error.message} action={<button className="ghost-button" type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} />Повторить</button>} />;
  if (!profile) return <div className="analytics-skeleton" />;
  return <div className="analytics-profile">
    <header className="analytics-profile-head">
      <span className="analytics-profile-avatar" aria-hidden="true"><Users size={22} /></span>
      <div><h1>{profile.employee.full_name || "Сотрудник"}</h1><p>{profile.employee.department?.name ?? "Без отдела"}{profile.employee.is_former_member ? " · бывший сотрудник" : ""} · {formatBucket(profile.period.from.slice(0, 10))} — {formatBucket(profile.period.to.slice(0, 10))}</p></div>
    </header>
    <div className="analytics-summary">
      <div><small>Звонков</small><strong>{profile.totals.calls}</strong></div>
      <div><small>Средний балл</small><strong><ScoreValue value={profile.totals.avg_score} sample={profile.totals.sample} /></strong><span><DeltaBadge delta={profile.totals.delta} /> к прошлому периоду</span></div>
      <div><small>По критериям</small><strong>{profile.totals.avg_criteria_score ?? "—"}</strong><span>только критерии инструкций</span></div>
      <div><small>{profile.reference.label || "Сравнение"}</small><strong>{profile.reference.hidden ? "—" : profile.reference.avg_score ?? "—"}</strong><span>{profile.reference.hidden ? "в отделе меньше трёх человек со звонками" : "средний балл"}</span></div>
    </div>
    <div className="analytics-trend-card"><TrendChart points={profile.trend} reference={profile.reference.hidden ? undefined : profile.reference.trend} label="Свой балл" referenceLabel={profile.reference.label} /></div>
    <section className="analytics-block">
      <h2>Критерии: свой балл и {profile.reference.hidden ? "команда" : profile.reference.label.charAt(0).toLowerCase() + profile.reference.label.slice(1)}</h2>
      <DataTable
        columns={[
          { key: "title", label: "Критерий", priority: 0, render: (row) => <span className="analytics-name"><strong>{row.title}</strong><small>{row.instruction.title}</small></span>, sortValue: (row) => row.title },
          { key: "own", label: "Свой", priority: 1, width: 110, render: (row) => <ScoreValue value={row.own_avg} sample={row.sample} />, sortValue: (row) => row.own_avg },
          { key: "ref", label: "Команда", priority: 2, width: 90, align: "end", render: (row) => row.reference_avg ?? "—", sortValue: (row) => row.reference_avg },
          { key: "delta", label: "Дельта", priority: 3, width: 76, align: "end", render: (row) => <DeltaBadge delta={row.delta} />, sortValue: (row) => row.delta.value },
          { key: "n", label: "Оценок", priority: 4, width: 80, align: "end", render: (row) => row.own_n, sortValue: (row) => row.own_n },
        ]}
        rows={profile.criteria} rowKey={(row) => row.criterion_key} emptyText="Оценённых критериев за период нет." />
    </section>
    <EmployeeWorkOnMistakes userId={userId} filters={filters} onOpenCall={(callId) => onOpenCall(callId)} />
    {profile.speech !== undefined && <section className="analytics-block">
      <h2>Речь</h2>
      <SpeechComparison own={profile.speech?.own ?? null} median={profile.speech?.team_median ?? null} />
    </section>}
    <section className="analytics-block">
      <h2>Стоит послушать</h2>
      <WorthListening items={profile.worth_listening} onOpenCall={onOpenCall} />
    </section>
  </div>;
}

export function WorthListening({ items, onOpenCall }: { items: AnalyticsWorthListening[]; onOpenCall: OpenCallAt }) {
  if (items.length === 0) return <p className="analytics-muted">Слабых звонков и критичных пропусков за период нет.</p>;
  return <ul className="analytics-worth">{items.map((item) => <li key={item.call_uuid}>
    <button type="button" disabled={!item.can_open} onClick={() => onOpenCall(item.call_uuid)}>
      <FileText size={16} />
      <span><strong>{item.can_open ? item.title || "Звонок" : "Звонок недоступен вам"}</strong><small>{new Date(item.occurred_at).toLocaleDateString("ru-RU")}{item.critical_missed ? ` · критичных пропусков: ${item.critical_missed}` : ""}</small></span>
      <b className={item.overall_score === null ? "" : `tone-${scoreTone(item.overall_score)}`}>{item.overall_score ?? "—"}</b>
    </button>
  </li>)}</ul>;
}
