import { RowsSkeleton } from "../../shared/ui/page-loading";
import { Bell, Check, CheckCheck, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type { NotificationResponse } from "../../types";
import { notificationPresentation } from "../../shared/ui/notification-presentation";

const pageSize = 50;

export function NotificationsPage({ onOpen }: { onOpen: (notification: NotificationResponse) => void }) {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listNotifications({ limit: pageSize, offset: 0 })
      .then((response) => {
        if (cancelled) return;
        setNotifications(response.notifications);
        setHasMore(response.notifications.length === pageSize);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof ApiError ? requestError.message : "Не удалось загрузить уведомления");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleReadState(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; readAt?: string | null }>).detail;
      if (!detail?.id) return;
      setNotifications((current) => current.map((item) => item.id === detail.id ? { ...item, read_at: detail.readAt ?? null } : item));
    }
    function handleReadAll(event: Event) {
      const readAt = (event as CustomEvent<{ readAt?: string }>).detail?.readAt ?? new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
    }
    window.addEventListener("verbatrace:notification-read-state", handleReadState);
    window.addEventListener("verbatrace:notifications-read-all", handleReadAll);
    return () => { window.removeEventListener("verbatrace:notification-read-state", handleReadState); window.removeEventListener("verbatrace:notifications-read-all", handleReadAll); };
  }, []);

  useEffect(() => {
    function handleNotification(event: Event) {
      const notification = (event as CustomEvent<NotificationResponse>).detail;
      if (!notification?.id) return;
      setNotifications((current) => current.some((item) => item.id === notification.id) ? current : [notification, ...current]);
    }
    window.addEventListener("verbatrace:notification-received", handleNotification);
    return () => window.removeEventListener("verbatrace:notification-received", handleNotification);
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    setError("");
    try {
      const response = await api.listNotifications({ limit: pageSize, offset: notifications.length });
      setNotifications((current) => [...current, ...response.notifications]);
      setHasMore(response.notifications.length === pageSize);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не удалось загрузить уведомления");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openNotification(notification: NotificationResponse) {
    if (!notification.read_at) {
      try {
        await api.markNotificationRead(notification.id);
        const readAt = new Date().toISOString();
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
        window.dispatchEvent(new CustomEvent("verbatrace:notification-read", { detail: { id: notification.id, readAt } }));
      } catch {
        // Navigation remains available if marking as read temporarily fails.
      }
    }
    onOpen(notification);
  }

  async function toggleRead(notification: NotificationResponse) {
    setError("");
    const readAt = notification.read_at ? null : new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
    window.dispatchEvent(new CustomEvent("verbatrace:notification-read-state", { detail: { id: notification.id, readAt } }));
    try {
      if (readAt) await api.markNotificationRead(notification.id); else await api.markNotificationUnread(notification.id);
    } catch (requestError) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: notification.read_at } : item));
      window.dispatchEvent(new CustomEvent("verbatrace:notification-read-state", { detail: { id: notification.id, readAt: notification.read_at } }));
      setError(requestError instanceof ApiError ? requestError.message : "Не удалось изменить состояние уведомления");
    }
  }

  return (
    <section className="notifications-page">
      <header className="notifications-page-head">
        <span className="notifications-page-icon"><Bell size={22} /></span>
        <div>
          <h1>Все уведомления</h1>
          <p>Полная история событий и напоминаний.</p>
        </div>
      </header>

      {error && <div className="notifications-page-error" role="alert">{error}</div>}
      {loading ? (
        <RowsSkeleton kind="notifications" count={6} />
      ) : notifications.length === 0 ? (
        <div className="notifications-page-state">Уведомлений пока нет.</div>
      ) : (
        <div className="notifications-history">
          {notifications.map((notification) => {
            const presentation = notificationPresentation(notification);
            const TypeIcon = presentation.icon;
            return (
            <article
              className={`notification-history-row notification-tone-${presentation.tone} ${notification.read_at ? "" : "unread"}`}
              key={notification.id}
            >
              <span className="notification-history-type" title={presentation.label} aria-label={presentation.label}><TypeIcon size={18}/></span>
              <button className="notification-history-open" type="button" onClick={() => openNotification(notification)}><span className="notification-history-content">
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
              </span></button>
              <span className="notification-history-side">
                <button className={`notification-history-read-state${notification.read_at ? " is-read" : ""}`} type="button" title={notification.read_at ? "Пометить непрочитанным" : "Пометить прочитанным"} aria-label={notification.read_at ? "Пометить непрочитанным" : "Пометить прочитанным"} onClick={() => void toggleRead(notification)}>{notification.read_at ? <CheckCheck size={15}/> : <Check size={15}/>}</button>
                <time>{formatHistoryTime(notification.created_at)}</time>
                <button className="notification-history-chevron" type="button" aria-label="Открыть уведомление" onClick={() => openNotification(notification)}><ChevronRight size={17} /></button>
              </span>
            </article>
            );
          })}
        </div>
      )}

      {hasMore && !loading && (
        <button className="notifications-load-more" type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Загружаем…" : "Показать более ранние"}
        </button>
      )}
    </section>
  );
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
