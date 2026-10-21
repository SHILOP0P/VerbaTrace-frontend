import { SelectControl } from "../../shared/ui/primitives";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { ObservationEditor } from "./ObservationEditor";
import { ObservationBudgetSettings } from "./ObservationBudget";
import { ObservationsEmptyState } from "./ObservationsEmptyState";
import { ObservationAlerts } from "./ObservationAlerts";
import { useAuth } from "../auth/AuthProvider";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  LayoutGrid,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Radar,
  Settings2,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import type {
  AnalyticsCapabilities,
  AnalyticsFilters,
  CallResponse,
  DepartmentResponse,
} from "../../types";
import { useWorkspaceCompanyId } from "../../shared/lib/workspace-company";
import { MiniSparkline } from "../overview/overview-components";
import {
  PeriodSelect,
  periodRange,
  type PeriodValue,
} from "../../shared/ui/analytics-ui";
import type {
  Observation,
  ObservationCase,
  ObservationPlan,
  ObservationRuleVersion,
  ObservationReplacementSuggestion,
} from "./types";
import "./observations.css";

const statusLabels = {
  draft: "Готово к включению",
  preparing: "Подготовка правила",
  active: "Включено",
  paused: "На паузе",
  error: "Проверки остановлены",
};
const outcomes = {
  match: "Случай подтверждён",
  no_match: "Ситуация не обнаружена",
  not_applicable: "Не применимо",
  unclear: "Недостаточно данных",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Не удалось выполнить действие";
const matchRate = (item: Observation) => item.stats.checked > 0 ? `${Number((100 * item.stats.matches / item.stats.checked).toFixed(1))}%` : "—";
const observationMetrics = (item: Observation) => item.kind === "criterion" ? [
  [item.stats.average_score == null ? "—" : item.stats.average_score.toLocaleString("ru-RU", { maximumFractionDigits: 1 }), "средняя оценка из 100"],
  [item.stats.scored ?? 0, "звонков с оценкой"],
  [item.stats.matches, "зафиксировано отклонений"],
] : [[item.stats.matches, "совпадений"], [item.stats.checked, "проверено"], [matchRate(item), "доля совпадений"]];
export function ObservationsPage({
  departments,
}: {
  departments: DepartmentResponse[];
}) {
  const workspace = useWorkspaceCompanyId();
  return (
    <ObservationWorkspace
      key={workspace ?? "personal"}
      workspace={workspace ?? ""}
      departments={departments}
    />
  );
}
function ObservationWorkspace({
  workspace,
  departments,
}: {
  workspace: string;
  departments: DepartmentResponse[];
}) {
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const q = new URLSearchParams(window.location.search);
    const preset = q.get("period");
    return preset === "custom"
      ? {
          preset: "custom",
          from: q.get("from") ?? undefined,
          to: q.get("to") ?? undefined,
        }
      : preset === "7" || preset === "90"
        ? { preset }
        : { preset: "30" };
  });
  const [department, setDepartment] = useState(
    () => new URLSearchParams(window.location.search).get("department") ?? "",
  );
  const [items, setItems] = useState<Observation[]>([]);
  const [caps, setCaps] = useState<AnalyticsCapabilities>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<string | undefined>(
    () =>
      new URLSearchParams(window.location.search).get("observation") ??
      undefined,
  );
  const { session } = useAuth();
  const viewKey = `verbatrace.observations.view.${session?.user.id ?? ""}.${workspace || "personal"}`;
  const [view, setViewState] = useState<"cards" | "table">(() => {
    try {
      return window.localStorage.getItem(viewKey) === "table"
        ? "table"
        : "cards";
    } catch {
      return "cards";
    }
  });
  function setView(next: "cards" | "table") {
    setViewState(next);
    try {
      window.localStorage.setItem(viewKey, next);
    } catch {}
  }
  const [refresh, setRefresh] = useState(0);
  const scope = useMemo<AnalyticsFilters>(
    () => ({
      ...(workspace
        ? { company_uuid: workspace }
        : { scope: "personal" as const }),
      department_uuid: department || undefined,
      ...periodRange(period),
    }),
    [workspace, department, period],
  );
  useEffect(() => {
    let stop = false;
    api
      .getAnalyticsCapabilities(scope)
      .then((v) => {
        if (!stop) {
          setCaps(v);
          if (
            v.role === "department_leader" &&
            !department &&
            v.department_uuids.length > 0
          )
            setDepartment(v.department_uuids[0]);
        }
      })
      .catch((e) => {
        if (!stop) setError(message(e));
      });
    return () => {
      stop = true;
    };
  }, [workspace]);
  useEffect(() => {
    let stop = false;
    setLoading(true);
    setError("");
    api
      .getObservations(scope)
      .then((v) => {
        if (!stop) setItems(v.items);
      })
      .catch((e) => {
        if (!stop) setError(message(e));
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [scope, refresh]);
  useEffect(() => {
    if (!items.some((v) => v.status === "preparing" || v.status === "active"))
      return;
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") setRefresh((n) => n + 1);
      },
      items.some((v) => v.status === "preparing") ? 6000 : 20000,
    );
    return () => window.clearInterval(timer);
  }, [
    items.some((v) => v.status === "preparing" || v.status === "active"),
    items.some((v) => v.status === "preparing"),
  ]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const chosen = items.find((v) => v.id === selection);
  const canCreate = caps && caps.role !== "employee";
  const chart = (item: Observation) => {
    const score = item.kind === "criterion" ? item.stats.score_trend?.[0] : undefined;
    const single = item.kind === "criterion" ? item.stats.score_trend?.length === 1 : item.stats.trend.length === 1;
    const point = item.stats.trend[0];
    if (single && (score || point)) {
      const value = score ? score.score : point.checked ? 100 * point.matches / point.checked : 0;
      const date = score?.date ?? point.date;
      return <div className="observation-single-day"><strong>{value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}{score ? " из 100" : "%"}</strong><svg viewBox="0 0 100 5" preserveAspectRatio="none" role="img" aria-label={score ? "Средняя оценка за день" : "Доля совпадений за день"}><rect width="100" height="5" rx="2.5"/><rect className="is-value" width={Math.max(0, Math.min(100, value))} height="5" rx="2.5"/></svg><small>{new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", {day:"numeric", month:"long"})} · {score ? `${score.calls} звонков с оценкой` : `${point.matches} из ${point.checked} проверенных`}</small></div>;
    }
    return (
    <div className="observation-mini-chart ow-color-teal">
      {item.kind === "criterion" && item.stats.score_trend?.length ? <MiniSparkline tone="neutral" points={item.stats.score_trend.map(p => ({label: p.date, value: p.score, display: `${p.score.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из 100 · ${p.calls} звонков`}))}/> : item.stats.trend.length ? (
        <MiniSparkline
          tone="neutral"
          points={item.stats.trend.map((p) => ({
            label: p.date,
            value: p.checked ? 100 * p.matches / p.checked : 0,
            display: `${p.matches} совпадений · ${p.checked} проверено`,
          }))}
        />
      ) : (
        <span className="observation-empty-chart">
          Динамика появится после проверок
        </span>
      )}
    </div>
    );
  };
  return (
    <section className="app-page observations-page">
      <header className="observations-heading">
        {chosen ? <>
          <h1 className="observation-detail-page-title">Наблюдение</h1>
          <button className="ghost-button small" onClick={() => setSelection(undefined)}><ArrowLeft size={16}/>Все наблюдения</button>
        </> :
        <div>
          <h1>Наблюдения</h1>
          <p>
            Сохранённые ситуации и подтверждённые случаи за выбранный период.
          </p>
        </div>
        }
        <div className="observations-heading-actions">
        {canCreate && (caps?.role !== "department_leader" || department) && (
          <ObservationBudgetSettings scope={scope} />
        )}
        {canCreate && items.length > 0 && !chosen && (
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Создать наблюдение
          </button>
        )}
        </div>
      </header>
      {(loading || items.length > 0 || workspace) && (
      <div className="observations-toolbar">
        <PeriodSelect
          value={period}
          onChange={setPeriod}
          retentionDays={caps?.retention_days}
        />
        {workspace && canCreate && (
          <SelectControl
            aria-label="Отдел наблюдения"
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setSelection(undefined);
            }}
          >
            {caps?.role !== "department_leader" && (
              <option value="">Компания</option>
            )}
            {departments
              .filter(
                (d) =>
                  d.company_uuid === workspace &&
                  (!caps ||
                    caps.role !== "department_leader" ||
                    caps.department_uuids.includes(d.id)),
              )
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.name}
                </option>
              ))}
          </SelectControl>
        )}
        {items.length > 0 && !chosen && <SegmentedControl className="segmented">
          <button
            className={view === "cards" ? "active" : ""}
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            <LayoutGrid size={16} />
            Карточки
          </button>
          <button
            className={view === "table" ? "active" : ""}
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <Table2 size={16} />
            Таблица
          </button>
        </SegmentedControl>}
        <button
          className="icon-button"
          disabled={loading}
          aria-label="Обновить наблюдения"
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {loading && items.length === 0 && !error && (
        <p role="status">Загрузка наблюдений…</p>
      )}
      {!loading && !items.length && !error && (
        <ObservationsEmptyState onCreate={canCreate ? () => setCreating(true) : undefined} />
      )}
      {chosen ? (
        <>
          <ObservationDetail
            key={chosen.id}
            item={chosen}
            scope={scope}
            refresh={refresh}
            onChanged={() => setRefresh((n) => n + 1)}
            onAction={act}
            busy={busy}
          />
        </>
      ) : (
        <div className={`observation-list is-${view}`}>
          {view === "table" && items.length > 0 && (
            <div className="observation-table-head">
              <span>Наблюдение</span>
              <span>Результат</span>
              <span>Звонки</span>
              <span>Дополнительно</span>
              <span />
            </div>
          )}
          {items.map((item) => (
            <article className={`observation-card glass-panel is-${item.status}`} key={item.id}>
              <div className="observation-card-main">
                <span className={`observation-status is-${item.status}`}>
                  {item.status === "paused" ? <Pause size={13}/> : <Radar size={13}/>}
                  {statusLabels[item.status]}
                </span>
                <small>
                  {item.kind === "criterion"
                    ? "Критерий инструкции"
                    : "Описание ситуации"}
                </small>
                <button
                  className="observation-title"
                  onClick={() => setSelection(item.id)}
                >
                  {item.title}
                </button>
              </div>
              {view === "cards" && <div className="observation-card-chart"><span>{item.kind === "criterion" ? "Оценка выполнения по дням" : "Доля совпадений по дням"}</span>{chart(item)}</div>}
              {observationMetrics(item).map(([value, label]) => <div className="observation-stat" key={label}><strong>{value}</strong><small>{label}</small></div>)}
              <button
                className="ghost-button small"
                onClick={() => setSelection(item.id)}
              >
                <ArrowUpRight size={17} />
                Открыть
              </button>
            </article>
          ))}
        </div>
      )}
      {creating && (
        <ObservationEditor
          scope={scope}
          onClose={() => setCreating(false)}
          onSaved={(item) => {
            setItems((v) => [item, ...v]);
            setSelection(item.id);
            setCreating(false);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

function ObservationDetail({
  item,
  scope,
  refresh,
  onChanged,
  onAction,
  busy,
}: {
  item: Observation;
  scope: AnalyticsFilters;
  refresh: number;
  onChanged: () => void;
  onAction: (fn: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [cases, setCases] = useState<ObservationCase[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [source, setSource] = useState<string>();
  const [sourceLoading, setSourceLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [history, setHistory] = useState(false);
  const [trial, setTrial] = useState(false);
  const [calls, setCalls] = useState<CallResponse[]>([]);
  const [callIDs, setCallIDs] = useState<string[]>([]);
  const [plan, setPlan] = useState<ObservationPlan>();
  const [planning, setPlanning] = useState(false);
  const [rerun, setRerun] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ruleExpanded, setRuleExpanded] = useState(false);
  const [versions, setVersions] = useState<ObservationRuleVersion[]>([]);
  const [ruleVersion, setRuleVersion] = useState(item.rule_version);
  const [replacement, setReplacement] = useState(false);
  const [suggestion, setSuggestion] =
    useState<ObservationReplacementSuggestion | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const alive = useRef(true);
  const requestGeneration = useRef(0);
  const newCases = useRef(new Set<string>());
  const readThrough = useRef(0);
  const readPending = useRef(false);
  function keepVisitBadges(rows: ObservationCase[]) {
    return rows.map((row) => {
      if (row.is_new && !row.trial && ruleVersion === item.rule_version)
        newCases.current.add(row.id);
      return { ...row, is_new: newCases.current.has(row.id) };
    });
  }
  const chosen = cases.find((c) => c.id === selected);
  const currentID = useRef<string | undefined>(undefined);
  currentID.current = selected;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setRuleVersion(item.rule_version);
  }, [item.rule_version]);
  useEffect(() => {
    let stopped = false;
    api
      .getObservationVersions(item.id, scope)
      .then((value) => {
        if (!stopped) setVersions(value.items);
      })
      .catch((e) => {
        if (!stopped) setError(message(e));
      });
    api
      .getObservationReplacementSuggestion(item.id, scope)
      .then((value) => {
        if (!stopped) setSuggestion(value);
      })
      .catch((e) => {
        if (!stopped) setError(message(e));
      });
    return () => {
      stopped = true;
    };
  }, [item.id, item.rule_version, refresh, JSON.stringify(scope)]);
  useEffect(() => {
    requestGeneration.current++;
    setCases([]);
    setSelected(undefined);
    setHistory(false);
    setPlan(undefined);
  }, [JSON.stringify(scope), ruleVersion]);
  useEffect(() => {
    let stop = false;
    api
      .getObservationCases(item.id, scope, 0, ruleVersion)
      .then((v) => {
        if (stop) return;
        setCases(keepVisitBadges(v.items));
        setMore(v.items.length === 100);
      })
      .catch((e) => {
        if (!stop) setError(message(e));
      });
    return () => {
      stop = true;
    };
  }, [item.id, JSON.stringify(scope), refresh, ruleVersion]);
  useEffect(() => {
    if (ruleVersion !== item.rule_version || readPending.current) return;
    const latest = cases
      .filter((row) => !row.trial)
      .reduce((max, row) => Math.max(max, Date.parse(row.detected_at) || 0), 0);
    if (!latest || latest <= readThrough.current) return;
    readPending.current = true;
    api
      .markObservationRead(item.id, scope, new Date(latest).toISOString())
      .then(() => {
        readThrough.current = Math.max(readThrough.current, latest);
      })
      .catch((e) => {
        if (alive.current)
          setError(`Не удалось отметить просмотр: ${message(e)}`);
      })
      .finally(() => {
        readPending.current = false;
      });
  }, [cases, item.id, item.rule_version, ruleVersion, JSON.stringify(scope)]);
  useEffect(() => {
    setSource(undefined);
    setSourceLoading(false);
    setError("");
  }, [selected]);
  async function openSource(c: ObservationCase) {
    setSourceLoading(true);
    setError("");
    try {
      const value = await api.getTranscriptionRevision(
        c.call_uuid,
        c.source_revision,
      );
      if (alive.current && currentID.current === c.id) setSource(value.text);
    } catch (e) {
      if (alive.current && currentID.current === c.id) setError(message(e));
    } finally {
      if (alive.current && currentID.current === c.id) setSourceLoading(false);
    }
  }
  async function showHistory(isTrial: boolean, isReplacement = false) {
    requestGeneration.current++;
    setReplacement(isReplacement);
    setHistory(true);
    setTrial(isTrial);
    setPlan(undefined);
    setCallIDs([]);
    setCalls([]);
    if (isTrial) {
      try {
        const response = await api.listCalls({
          ...scope,
          scope: scope.scope,
          company_uuid: scope.company_uuid,
          folder_uuid: item.filters.folder_uuid,
          participant_user_uuid: item.filters.employee_uuid,
          limit: 100,
        });
        if (alive.current)
          setCalls(Array.isArray(response) ? response : response.items);
      } catch (e) {
        setError(message(e));
      }
    }
  }
  async function makePlan() {
    setPlanning(true);
    setError("");
    try {
      const generation = requestGeneration.current;
      const value = await api.planObservationHistory(item.id, scope, {
        trial,
        call_uuids: trial ? callIDs : [],
        rerun,
        replacement,
      });
      if (alive.current && generation === requestGeneration.current)
        setPlan(value);
    } catch (e) {
      setError(message(e));
    } finally {
      setPlanning(false);
    }
  }
  async function start() {
    if (!plan) return;
    await onAction(async () => {
      await api.confirmObservationHistory(item.id, scope, plan.id);
      setHistory(false);
      setPlan(undefined);
    });
  }
  async function loadMore() {
    if (loadingMore) return;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    try {
      const value = await api.getObservationCases(
        item.id,
        scope,
        cases.length,
        ruleVersion,
      );
      if (alive.current && generation === requestGeneration.current) {
        setCases((v) => [...v, ...keepVisitBadges(value.items)]);
        setMore(value.items.length === 100);
      }
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }
  return (
    <section className="observation-detail">
      <header className="observation-detail-head glass-panel">
        <div>
          <span className={`observation-status is-${item.status}`}>
            {item.status === "paused" ? <Pause size={13}/> : <Radar size={13}/>}
            {statusLabels[item.status]}
          </span>
          <h2>{item.title}</h2>
        </div>
        {item.can_manage && (
          <div className="observation-management">
            <button
              className="ghost-button small"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Settings2 size={15} />
              Изменить
            </button>
            {item.status !== "preparing" && (
              <button
                className="ghost-button small"
                disabled={
                  busy || (item.kind === "description" && !item.interpretation)
                }
                onClick={() =>
                  void onAction(() =>
                    api.setObservationStatus(
                      item,
                      scope,
                      item.status !== "active",
                    ),
                  )
                }
              >
                {item.status === "active" ? (
                  <Pause size={15} />
                ) : (
                  <Play size={15} />
                )}{" "}
                {item.status === "active"
                  ? "Приостановить"
                  : item.status === "draft"
                    ? "Подтвердить правило и включить"
                    : "Включить"}
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Удалить наблюдение"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Удалить наблюдение и все его результаты? Отменить это действие нельзя.",
                  )
                )
                  void onAction(() => api.deleteObservation(item, scope));
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
        <div className="observation-rule-content">
          <h3>Правило проверки</h3>
          <p id={`observation-rule-text-${item.id}`} className={!ruleExpanded && (item.interpretation || item.description || "").length > 450 ? "is-collapsed" : undefined}>{item.interpretation || item.description || "Проверка готовых оценок выбранного критерия."}</p>
          {(item.interpretation || item.description || "").length > 450 && <button className="ghost-button small observation-rule-expand" aria-expanded={ruleExpanded} aria-controls={`observation-rule-text-${item.id}`} onClick={() => setRuleExpanded(value => !value)}>{ruleExpanded ? "Свернуть правило" : "Показать правило полностью"}</button>}
        </div>
      </header>
      {item.status === "preparing" && (
        <div className="observation-preparing" role="status">
          <span className="observation-preparing-mark">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Подготавливаем правило наблюдения</strong>
            <p>
              Формулируем условия и проверяем, что именно следует искать. После
              подготовки подтвердите трактовку.
            </p>
          </div>
        </div>
      )}
      {item.error_code === "budget_reached" && (
        <p className="observation-helper">
          Проверки приостановлены из-за лимита расходов или недостаточного
          баланса. После изменения лимита включите наблюдение. Пропущенные
          звонки проверяются отдельным запуском.
        </p>
      )}
      {item.status === "error" && (
        <p className="form-error" role="alert">
          Проверки остановлены. Проверьте доступ к источнику и доступный баланс.
          Неопределённый исход платного запроса автоматически не повторяется.
        </p>
      )}
      <div className="observation-detail-stats">
        {observationMetrics(item).map(([value, label]) => <span key={label}><strong>{value}</strong>{label}</span>)}
      </div>
      {item.kind === "criterion" && <p className="observation-helper">Оценка и её динамика берутся из готового анализа выбранных звонков с учётом опубликованных исправлений. Повторный анализ не запускается. Отклонения фиксируются наблюдением после включения или отдельной проверки истории.</p>}
      {item.can_manage &&
        item.status !== "preparing" &&
        (item.kind === "criterion" || item.interpretation) && (
          <div className="observation-history-actions">
            <button
              className="ghost-button small"
              onClick={() => void showHistory(false)}
            >
              Проверить историю за выбранный период
            </button>
            <button
              className="ghost-button small"
              onClick={() => void showHistory(true)}
            >
              Пробная проверка · необязательно
            </button>
          </div>
        )}
      {suggestion && item.can_manage && (
        <div className="observation-replacement-suggestion">
          <p>
            Критерий изменён. При необходимости можно проверить по новому
            правилу доступные звонки, которые ранее оценивались по предыдущему
            критерию.
          </p>
          <button
            className="ghost-button small"
            onClick={() => void showHistory(false, true)}
          >
            Выбрать период и рассчитать расход
          </button>
        </div>
      )}
      <section className="observation-results-tools" aria-label="Настройки результатов наблюдения">
        <div className="observation-results-toolbar">
        <div className="observation-version-select">
          {versions.some(v => v.rule_version !== item.rule_version) ? <>
          <label htmlFor={`observation-rule-${item.id}`}>Результаты по правилу</label>
          <SelectControl
            id={`observation-rule-${item.id}`}
            aria-label="Версия правила наблюдения"
            aria-describedby={`observation-version-help-${item.id}`}
            value={ruleVersion}
            onChange={(e) => setRuleVersion(Number(e.target.value))}
          >
            <option value={item.rule_version}>
              Текущее правило · №{item.rule_version}
            </option>
            {versions
              .filter((v) => v.rule_version !== item.rule_version)
              .map((v) => (
                <option key={v.rule_version} value={v.rule_version}>
                  Правило №{v.rule_version} · {v.title}
                </option>
              ))}
          </SelectControl>
          </> : <span className="observation-current-rule">Текущее правило · №{item.rule_version}</span>}
        </div>
        <ObservationAlerts item={item} scope={scope} onChanged={onChanged} />
        </div>
        <p className="observation-helper" id={`observation-version-help-${item.id}`}>
          Версия правила меняется при изменении условий наблюдения. {versions.some(v => v.rule_version !== item.rule_version) ? "Выберите правило, чтобы посмотреть его сохранённые результаты." : "Предыдущих версий с сохранёнными результатами пока нет."}
        </p>
      </section>
      {ruleVersion !== item.rule_version && (
        <p className="observation-helper">
          Сохранённые результаты предыдущей версии. Счётчики выше относятся к
          текущему правилу.
        </p>
      )}
      {history && (
        <section className="observation-history glass-panel">
          <header>
            <h3>
              {trial
                ? "Пробная проверка"
                : replacement
                  ? "Проверка после замены критерия"
                  : "Проверка истории"}
            </h3>
            <button
              className="icon-button"
              aria-label="Закрыть запуск"
              onClick={() => {
                requestGeneration.current++;
                setHistory(false);
                setPlan(undefined);
              }}
            >
              <X size={17} />
            </button>
          </header>
          {trial && (
            <div className="observation-trial-calls">
              {calls.length ? (
                calls.map((c) => (
                  <label className="observation-check checkbox-row" key={c.id}>
                    <input
                      type="checkbox"
                      disabled={!callIDs.includes(c.id) && callIDs.length >= 10}
                      checked={callIDs.includes(c.id)}
                      onChange={(e) => {
                        setCallIDs((v) =>
                          e.target.checked
                            ? [...v, c.id]
                            : v.filter((id) => id !== c.id),
                        );
                        setPlan(undefined);
                      }}
                    />
                    {c.title}
                  </label>
                ))
              ) : (
                <p>Нет доступных звонков за период.</p>
              )}
            </div>
          )}
          <label className="observation-check checkbox-row">
            <input
              type="checkbox"
              checked={rerun}
              onChange={(e) => {
                setRerun(e.target.checked);
                setPlan(undefined);
              }}
            />
            Перепроверить также ранее проверенные звонки
          </label>
          {plan ? (
            <>
              <p>
                {plan.calls} звонков. Предельный расход:{" "}
                {plan.maximum_credits.toLocaleString("ru-RU")} кредитов.
                Списывается фактическая стоимость; отсутствие совпадения тоже
                может потребовать платной проверки.
              </p>
              <button
                className="primary-button small"
                disabled={busy || plan.calls === 0}
                onClick={() => void start()}
              >
                Подтвердить и запустить
              </button>
            </>
          ) : (
            <button
              className="ghost-button small"
              disabled={planning || (trial && callIDs.length === 0)}
              onClick={() => void makePlan()}
            >
              {planning ? "Считаем…" : "Посмотреть объём и стоимость"}
            </button>
          )}
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className={`observation-case-layout${chosen ? " has-proof" : ""}`}>
        <div className="observation-cases">
          {cases.length === 0 ? (
            <p className="analysis-empty">
              За выбранный период результатов пока нет. После включения
              проверяются новые готовые звонки; историю можно запустить
              отдельно.
            </p>
          ) : (
            cases.map((c) => (
              <button
                key={c.id}
                className={`observation-case glass-panel${selected === c.id ? " is-selected" : ""}`}
                onClick={() => setSelected(c.id)}
              >
                <strong>{c.call_title}</strong>
                <Radar size={18} className="observation-case-icon" aria-hidden="true"/>
                {c.is_new && ruleVersion === item.rule_version && (
                  <span className="observation-new-badge">Новый</span>
                )}
                <span>
                  {c.trial ? "Проба · " : ""}
                  {outcomes[c.outcome]}
                  {c.false_positive ? " · ложный сигнал" : ""}
                </span>
                {c.explanation && <p className="observation-case-explanation">{c.explanation}</p>}
                {c.evidence[0] && <blockquote><span className="observation-case-quote">{c.evidence[0]}</span></blockquote>}
                <small>{new Date(c.detected_at).toLocaleString("ru-RU")}</small>
              </button>
            ))
          )}
          {more && (
            <button
              className="ghost-button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Загрузка…" : "Показать ещё"}
            </button>
          )}
        </div>
        {chosen && (
          <section className="observation-proof glass-panel">
            <header>
              <h3>{outcomes[chosen.outcome]}</h3>
              <button
                className="icon-button"
                aria-label="Закрыть доказательство"
                onClick={() => setSelected(undefined)}
              >
                <X size={16} />
              </button>
            </header>
            <p>{chosen.explanation}</p>
            {(chosen.false_positive || chosen.false_positive_at) && (
              <p className="observation-helper">
                {chosen.false_positive ? "Отмечено как ложный сигнал" : "Подтверждённый случай восстановлен"}
                {chosen.false_positive_author
                  ? ` · ${chosen.false_positive_author}`
                  : ""}
                {chosen.false_positive_at
                  ? ` · ${new Date(chosen.false_positive_at).toLocaleString("ru-RU")}`
                  : ""}
                .
              </p>
            )}
            {chosen.evidence.length ? (
              chosen.evidence.map((quote, i) => (
                <blockquote key={i}>{quote}</blockquote>
              ))
            ) : (
              <p className="observation-helper">
                Для этого вывода отдельная цитата не сохранена. Отсутствие
                действия не оформляется вымышленной цитатой.
              </p>
            )}
            <small>Версия расшифровки: {chosen.source_revision}</small>
            <button
              className="ghost-button small"
              disabled={sourceLoading}
              onClick={() => void openSource(chosen)}
            >
              {sourceLoading ? "Открываем…" : "Открыть проверенную версию"}
            </button>
            {source !== undefined && (
              <pre className="observation-source">{source}</pre>
            )}
            {chosen.outcome === "match" && (
              <button
                className="ghost-button small"
                disabled={busy}
                onClick={() =>
                  void onAction(async () => {
                    await api.setObservationFeedback(
                      item.id,
                      chosen.id,
                      scope,
                      !chosen.false_positive,
                    );
                    onChanged();
                  })
                }
              >
                {chosen.false_positive ? <Check size={16} /> : <X size={16} />}{" "}
                {chosen.false_positive
                  ? "Вернуть подтверждённый случай"
                  : "Отметить ложный сигнал"}
              </button>
            )}
          </section>
        )}
      </div>
      {editing && (
        <ObservationEditor
          scope={scope}
          item={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
