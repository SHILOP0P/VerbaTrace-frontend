import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { NotificationResponse } from "../../types";
import { notificationPresentation } from "../../shared/ui/notification-presentation";
import "./notification-policy.css";

function sameObjectOpen(n: NotificationResponse) {
  const path = window.location.pathname;
  const id = n.entity_uuid;
  const call = new URLSearchParams(window.location.search).get("call");
  if (n.type === "processing_failed" && id)
    return call === id || path.split("/").includes(id);
  if (n.type === "scorecard_failed")
    return Boolean(id && path.includes(id) && /instruction|folder/.test(path));
  return false;
}

export function NotificationToasts({
  onOpen,
}: {
  onOpen: (item: NotificationResponse) => void;
}) {
  const [items, setItems] = useState<NotificationResponse[]>([]);
  const seen = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    const receive = (e: Event) => {
      const n = (e as CustomEvent<NotificationResponse>).detail;
      if (!n?.id || seen.current.has(n.id)) return;
      seen.current.add(n.id);
      if (seen.current.size > 1000)
        seen.current.delete(seen.current.values().next().value!);
      if (
        n.mode !== "inbox_toast" ||
        n.read_at ||
        document.visibilityState !== "visible" ||
        Date.parse(n.created_at) < mountedAt.current - 3000 ||
        sameObjectOpen(n)
      )
        return;
      setItems((v) => [...v, n].slice(-3));
    };
    window.addEventListener("verbatrace:notification-received", receive);
    return () =>
      window.removeEventListener("verbatrace:notification-received", receive);
  }, []);
  return (
    <aside
      className="notification-toast-stack"
      aria-label="Новые уведомления"
      aria-live="polite"
    >
      {items.map((n) => (
        <NotificationToast
          key={n.id}
          item={n}
          onOpen={() => {
            setItems((v) => v.filter((i) => i.id !== n.id));
            onOpen(n);
          }}
          onClose={() => setItems((v) => v.filter((i) => i.id !== n.id))}
        />
      ))}
    </aside>
  );
}

function NotificationToast({
  item,
  onClose,
  onOpen,
}: {
  item: NotificationResponse;
  onClose: () => void;
  onOpen: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(6000);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = window.setTimeout(() => close.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1, remaining.current - (Date.now() - start));
    };
  }, [paused]);
  const presentation = notificationPresentation(item);
  const Icon = presentation.icon;
  return (
    <section
      className={`notification-toast tone-${presentation.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <Icon size={20} />
      <button className="notification-toast-open" onClick={onOpen}>
        <strong>{item.title}</strong>
        <span>{item.body}</span>
        {item.requires_response && <small>Требуется ваш ответ</small>}
      </button>
      <button
        className="icon-button"
        aria-label="Закрыть уведомление"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </section>
  );
}
