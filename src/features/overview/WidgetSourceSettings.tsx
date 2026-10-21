import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AnalyticsCapabilities } from "../../types";
import { SelectControl } from "../../shared/ui/primitives";
import { analyticsWidgetAvailable } from "./analytics-widget-data";
import { periodFilters, type OverviewWidget } from "./layout";

export function WidgetSourceSettings({ widget: w, workspace, capabilities: caps, onChange }: {
  widget: OverviewWidget; workspace: string; capabilities?: AnalyticsCapabilities;
  onChange: (patch: Partial<OverviewWidget>) => void;
}) {
  const [options, setOptions] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const periodKey = JSON.stringify(w.period);
  const available = analyticsWidgetAvailable(w.kind, caps);
  const others = caps?.scope === "company" && caps.can_view_employees && !caps.own_profile_only;
  useEffect(() => {
    if (!available || !["criterion", "matrix", "speech"].includes(w.kind)) return;
    let cancelled = false;
    setOptions([]); setError("");
    if (w.kind === "speech" && !others) { setLoading(false); return; }
    setLoading(true);
    const filters = { ...(workspace === "personal" ? { scope: "personal" as const } : { company_uuid: workspace }), ...periodFilters(JSON.parse(periodKey)) };
    const request = w.kind === "speech"
      ? api.getAnalyticsEmployees(filters).then(value => value.employees.filter(row => !row.is_me).map(row => ({ id: row.user_uuid, title: row.full_name || "Без имени" })))
      : api.getAnalyticsCriteria(filters).then(value => w.kind === "criterion"
        ? value.criteria.map(row => ({ id: row.criterion_key, title: `${row.title} · ${row.instruction.title}` }))
        : [...new Map(value.criteria.map(row => [row.instruction.uuid, { id: row.instruction.uuid, title: row.instruction.title }])).values()]);
    request.then(value => { if (!cancelled) setOptions(value); })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Не удалось загрузить источники"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [available, others, w.kind, workspace, periodKey, retry]);
  if (!["criterion", "matrix", "speech"].includes(w.kind)) return null;
  const value = w.kind === "criterion" ? w.criterion_key : w.kind === "matrix" ? w.instruction_uuid : w.employee_uuid;
  const label = w.kind === "criterion" ? "Критерий" : w.kind === "matrix" ? "Инструкция" : "Сотрудник";
  const change = (id: string) => onChange(w.kind === "criterion" ? { criterion_key: id || undefined } : w.kind === "matrix" ? { instruction_uuid: id || undefined } : { employee_uuid: id || undefined });
  return <fieldset className="ow-source-settings">
    <legend>Источник данных</legend>
    {!available ? <p>Источник недоступен в выбранной области или на текущем тарифе.</p>
      : w.kind === "speech" && !others ? <><p>Мои звонки — речь сотрудника, привязанного к участнику разговора.</p>
        {value && <button type="button" className="ghost-button small" onClick={() => change("")}>Использовать мои звонки</button>}</>
      : <>
        <SelectControl aria-label={`Источник виджета: ${label}`} value={value ?? ""} disabled={loading} onChange={e => change(e.target.value)}>
          <option value="">{w.kind === "speech" ? "Мои звонки" : `Выберите ${w.kind === "criterion" ? "критерий" : "инструкцию"}`}</option>
          {value && !options.some(option => option.id === value) && <option value={value}>Выбранный источник · нет данных за период</option>}
          {options.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
        </SelectControl>
        {loading ? <p role="status">Загрузка источников…</p> : <p>{options.length ? "Доступные источники с данными за период этого виджета." : "За этот период нет доступных источников с оценками. Выберите другой период."}</p>}
        {error && <><p className="form-error" role="alert">{error}</p><button type="button" className="ghost-button small" onClick={() => setRetry(n => n + 1)}>Повторить загрузку</button></>}
      </>}
  </fieldset>;
}
