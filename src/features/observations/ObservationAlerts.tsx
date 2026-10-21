import { SelectControl } from "../../shared/ui/primitives";
import { Bell, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { AnalyticsFilters } from "../../types";
import type { Observation, ObservationAlertPreferences } from "./types";
import { notificationModes } from "../notifications/policy";

export function ObservationAlerts({
  item,
  scope,
  onChanged,
}: {
  item: Observation;
  scope: AnalyticsFilters;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ObservationAlertPreferences>();
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!open) return;
    let stop = false;
    api
      .getObservationNotifications(item.id, scope)
      .then((v) => {
        if (stop) return;
        setValue(v);
        setEnabled(v.threshold !== null);
        setThreshold(v.threshold === null ? "" : String(v.threshold));
      })
      .catch((e) => {
        if (!stop)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить настройки",
          );
      });
    return () => {
      stop = true;
    };
  }, [open, item.id]);
  async function save() {
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.saveObservationNotifications(item.id, scope, {
        ...value,
        threshold: enabled ? Number(threshold) : null,
        period: enabled
          ? (value.period ?? { mode: "rolling", days: 30 })
          : null,
      });
      setValue(next);
      setSaved(true);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="observation-alert-settings">
      <button
        className="ghost-button small"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={16} />
        Уведомления этого наблюдения
      </button>
      {open && (
        <div className="glass-panel observation-alert-body">
          {value ? (
            <>
              <label>
                Лично для меня
                <SelectControl
                  value={value.mode}
                  onChange={(e) => {
                    setValue({
                      ...value,
                      mode: e.target.value as typeof value.mode,
                    });
                    setSaved(false);
                  }}
                >
                  {Object.entries(notificationModes).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </SelectControl>
              </label>
              {item.quality && (
                <>
                  <label className="observation-check checkbox-row">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={!value.configure_rule}
                      onChange={(e) => {
                        setEnabled(e.target.checked);
                        setSaved(false);
                      }}
                    />
                    Сообщать, если доля звонков без проблемы ниже порога
                  </label>
                  {enabled && (
                    <>
                      <label>
                        Порог, %
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={threshold}
                          disabled={!value.configure_rule}
                          onChange={(e) => {
                            setThreshold(e.target.value);
                            setSaved(false);
                          }}
                          placeholder="Укажите порог"
                        />
                      </label>
                      <label>
                        Период показателя
                        <SelectControl
                          disabled={!value.configure_rule}
                          value={
                            value.period?.mode === "custom"
                              ? "custom"
                              : String(value.period?.days ?? 30)
                          }
                          onChange={(e) => {
                            setValue({
                              ...value,
                              period:
                                e.target.value === "custom"
                                  ? {
                                      mode: "custom",
                                      from: new Date(Date.now() - 29 * 86400000)
                                        .toISOString()
                                        .slice(0, 10),
                                      to: new Date().toISOString().slice(0, 10),
                                    }
                                  : {
                                      mode: "rolling",
                                      days: Number(e.target.value),
                                    },
                            });
                            setSaved(false);
                          }}
                        >
                          <option value="7">Последние 7 дней</option>
                          <option value="30">Последние 30 дней</option>
                          <option value="90">Последние 90 дней</option>
                          <option value="custom">Указать даты</option>
                        </SelectControl>
                      </label>
                      {value.period?.mode === "custom" && (
                        <>
                          <label>
                            С
                            <input
                              type="date"
                              disabled={!value.configure_rule}
                              value={value.period.from}
                              max={value.period.to}
                              onChange={(e) =>
                                setValue({
                                  ...value,
                                  period: {
                                    ...value.period!,
                                    from: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            По
                            <input
                              type="date"
                              disabled={!value.configure_rule}
                              value={value.period.to}
                              min={value.period.from}
                              onChange={(e) =>
                                setValue({
                                  ...value,
                                  period: {
                                    ...value.period!,
                                    to: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <p>
                Уведомления о каждом случае не создаются. Показатель считается
                только по доступным получателю проверенным применимым звонкам за
                указанный период.
              </p>
              <button
                className="ghost-button small"
                disabled={
                  busy ||
                  (enabled &&
                    (!threshold.trim() ||
                      !Number.isFinite(Number(threshold)) ||
                      Number(threshold) < 0 ||
                      Number(threshold) > 100))
                }
                onClick={() => void save()}
              >
                {saved ? (
                  <>
                    <Check size={16} />
                    Сохранено
                  </>
                ) : busy ? (
                  "Сохраняем…"
                ) : (
                  "Сохранить настройки уведомлений"
                )}
              </button>
            </>
          ) : !error ? (
            <p role="status">Загрузка настроек…</p>
          ) : null}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
