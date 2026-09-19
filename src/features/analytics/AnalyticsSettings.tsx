import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AnalyticsSettings } from "../../types";

/**
 * Analytics settings of a company (owner and deputy) or of a personal account:
 * whether growth areas are kept and where a call counts as failed.
 */
export function AnalyticsSettingsCard({ companyId, onClose }: { companyId?: string; onClose: () => void }) {
  const [settings, setSettings] = useState<AnalyticsSettings>();
  const [growth, setGrowth] = useState(true);
  const [threshold, setThreshold] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (companyId ? api.getCompanyAnalyticsSettings(companyId) : api.getPersonalAnalyticsSettings())
      .then((value) => { if (!cancelled) { setSettings(value); setGrowth(value.growth_areas_enabled); setThreshold(String(value.critical_alert_threshold)); } })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки"); });
    return () => { cancelled = true; };
  }, [companyId]);

  const value = Number(threshold);
  const valid = threshold.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 100;
  const save = async () => {
    if (!settings || !valid) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const input = { growth_areas_enabled: growth, critical_alert_threshold: value };
      const next = companyId ? await api.updateCompanyAnalyticsSettings(companyId, { ...input, lock_version: settings.lock_version }) : await api.updatePersonalAnalyticsSettings(input);
      setSettings(next); setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return <section className="analytics-block analytics-settings" aria-label="Настройки аналитики">
    <header>
      <h2>Настройки аналитики{companyId ? " компании" : ""}</h2>
      <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}><X size={18} /></button>
    </header>
    {!settings && !error ? <div className="analytics-skeleton is-short" /> : null}
    {settings && <>
      <label className="checkbox-row"><input type="checkbox" checked={growth} onChange={(event) => { setGrowth(event.target.checked); setSaved(false); }} /><span>Вести зоны роста</span></label>
      <small>Анализ замечает повторяющиеся недочёты вне критериев инструкции и сверяет их между звонками сотрудника. К одному запросу анализа добавляется немного текста; выключение возвращает анализ к прежнему виду.</small>
      <label className="analytics-settings-field">
        <span>Порог провального звонка</span>
        <input type="number" min={0} max={100} step={1} inputMode="numeric" value={threshold} onChange={(event) => { setThreshold(event.target.value); setSaved(false); }} />
      </label>
      <small>Звонок с баллом ниже порога или с пропущенным критичным критерием попадёт в оповещения.</small>
      <div className="analytics-settings-actions">
        <button className="primary-button small" type="button" disabled={busy || !valid} onClick={() => void save()}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        {saved && <span className="analytics-muted">Сохранено</span>}
      </div>
    </>}
    {error && <small className="form-error">{error}</small>}
  </section>;
}
