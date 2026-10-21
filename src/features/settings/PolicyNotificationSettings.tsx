import { SelectControl } from "../../shared/ui/primitives";
import { ArrowLeft, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import {
  notificationLabels,
  notificationModes,
  type NotificationPreference,
} from "../notifications/policy";
import "../notifications/notification-policy.css";

export function PolicyNotificationSettings({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<NotificationPreference[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    api
      .getNotificationPreferences()
      .then((v) => {
        if (!cancelled) setItems(v.items);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить настройки",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function save(item: NotificationPreference, mode: string) {
    setBusy(true);
    setError("");
    try {
      const next = await api.saveNotificationPreferences([
        { type: item.type, mode },
      ]);
      setItems(next.items);
      window.dispatchEvent(new Event("verbatrace:notification-settings"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notification-settings-page app-page atmospheric-page">
      <button className="ghost-button small" onClick={onBack}>
        <ArrowLeft size={17} />К настройкам
      </button>
      <header className="privacy-settings-heading glass-panel">
        <span>
          <BellRing size={28} />
        </span>
        <div>
          <h1>Уведомления</h1>
          <p>
            Центр уведомлений — список под колокольчиком и счётчик
            непрочитанного. Дополнительное оповещение появляется в углу экрана и
            закрывается вручную или автоматически.
          </p>
        </div>
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <label className="notification-policy-search">
        Найти событие
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Например, перевод в отдел"
        />
      </label>
      {!items && !error && <p role="status">Загрузка настроек…</p>}
      <div className="notification-policy-list glass-panel">
        {items
          ?.filter((item) =>
            (notificationLabels[item.type] ?? item.type)
              .toLocaleLowerCase("ru")
              .includes(search.toLocaleLowerCase("ru")),
          )
          .map((item) => (
            <div className="notification-policy-row" key={item.type}>
              <div>
                <strong>{notificationLabels[item.type] ?? "Событие"}</strong>
                <small>
                  {item.required
                    ? "Запрос, требующий вашего ответа. Пока он актуален, его нельзя отключить."
                    : !item.available
                      ? "Новые уведомления этого типа не создаются."
                      : item.type === "processing_failed"
                        ? "Если этот звонок открыт, ошибка показывается на его странице."
                        : item.type === "scorecard_failed"
                          ? "Если редактор открыт, ошибка показывается в нём."
                          : "Личная настройка"}
                </small>
              </div>
              <SelectControl
                aria-label={notificationLabels[item.type] ?? item.type}
                value={item.mode}
                disabled={busy || item.required || !item.available}
                onChange={(e) => void save(item, e.target.value)}
              >
                {Object.entries(notificationModes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectControl>
            </div>
          ))}
      </div>
      <p className="notification-policy-note">
        Обязательные запросы остаются в списке до решения. Закрытие всплывающей
        карточки не означает ответа. Почта и Telegram здесь не подключаются.
      </p>
    </section>
  );
}
