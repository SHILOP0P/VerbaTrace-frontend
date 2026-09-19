import { ArrowLeft, Bell, BellRing, CalendarCheck, Mail, Send, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import type { NotificationSubscription } from "../../types";

const kindLabels: Record<NotificationSubscription["kind"], { title: string; text: string; icon: LucideIcon }> = {
  weekly_digest: { title: "Итоги недели", text: "В понедельник утром: звонки, средний балл, слабые критерии и работа над ошибками за прошлую неделю.", icon: CalendarCheck },
  critical_call_alert: { title: "Провальный звонок", text: "Пропущен критичный критерий или балл ниже порога компании.", icon: TrendingDown },
};

const channelLabels: Record<NotificationSubscription["channel"], string> = { in_app: "В приложении", email: "Почта", telegram: "Telegram" };
const channelIcons: Record<NotificationSubscription["channel"], LucideIcon> = { in_app: Bell, email: Mail, telegram: Send };
const channels: NotificationSubscription["channel"][] = ["in_app", "email", "telegram"];
const kinds: NotificationSubscription["kind"][] = ["weekly_digest", "critical_call_alert"];

/** Personal settings of which events come and where. Mail and Telegram are shown switched off until they are connected. */
export function NotificationSettingsPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<NotificationSubscription[]>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.getNotificationSubscriptions().then((value) => { if (!cancelled) setItems(value.items); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось загрузить настройки"); });
    return () => { cancelled = true; };
  }, []);

  const toggle = async (item: NotificationSubscription) => {
    const key = `${item.kind}/${item.channel}`;
    setBusy(key); setError("");
    try {
      const value = await api.updateNotificationSubscriptions([{ kind: item.kind, channel: item.channel, enabled: !item.enabled }]);
      setItems(value.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить");
    } finally {
      setBusy("");
    }
  };

  const cell = (kind: string, channel: string) => items?.find((item) => item.kind === kind && item.channel === channel);
  return <section className="notification-settings-page app-page atmospheric-page">
    <button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={17} />К настройкам</button>
    <header className="privacy-settings-heading glass-panel"><span><BellRing size={28} /></span><div><h1>Уведомления</h1><p>Какие события приходят и куда. Сейчас работает колокольчик в приложении; почта и Telegram появятся позже.</p></div></header>
    {error && <div className="form-error" role="alert">{error}</div>}
    {!items && !error ? <div className="analytics-skeleton is-short" /> : null}
    {items && <div className="notification-matrix glass-panel" role="table" aria-label="События и каналы">
      <div className="notification-matrix-row is-head" role="row">
        <span role="columnheader">Событие</span>
        {channels.map((channel) => {
          const ChannelIcon = channelIcons[channel];
          return <span key={channel} role="columnheader"><ChannelIcon size={15} aria-hidden="true" />{channelLabels[channel]}{channel !== "in_app" ? <em>скоро</em> : null}</span>;
        })}
      </div>
      {kinds.map((kind) => {
        const KindIcon = kindLabels[kind].icon;
        return <div className="notification-matrix-row" role="row" key={kind}>
          <span className="notification-matrix-event" role="rowheader">
            <span className="page-emblem notification-matrix-emblem" aria-hidden="true"><KindIcon /></span>
            <span><strong>{kindLabels[kind].title}</strong><small>{kindLabels[kind].text}</small></span>
          </span>
          {channels.map((channel) => {
            const item = cell(kind, channel);
            const waiting = !item?.available;
            return <label key={channel} className={`notification-matrix-cell${waiting ? " is-waiting" : ""}`} role="cell" data-channel={channelLabels[channel]}>
              <input type="checkbox" className="vt-sr-only" checked={Boolean(item?.enabled)} disabled={waiting || busy === `${kind}/${channel}`}
                aria-label={`${kindLabels[kind].title}: ${channelLabels[channel]}`} onChange={() => item && void toggle(item)} />
              <span className="notification-switch" aria-hidden="true"><i /></span>
              <span className="notification-matrix-channel">{channelLabels[channel]}{channel !== "in_app" ? " · скоро" : ""}</span>
            </label>;
          })}
        </div>;
      })}
    </div>}
  </section>;
}
