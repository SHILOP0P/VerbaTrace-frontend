import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { AdminAuditTrail, AdminAuditTrailEntry } from "../../types";
import { SelectControl } from "../../shared/ui/primitives";

const trailLabels: Record<AdminAuditTrail, string> = {
  admin_actions: "Действия администраторов",
  billing_alerts: "Алерты биллинга",
  credit_reconciliation: "Сверка кредитов",
  retention: "Очистка по срокам хранения",
  transcript_edits: "Правки транскрипта",
  comment_revisions: "Правки комментариев",
};

/**
 * AuditTrailsPanel opens the append-only records the system keeps.
 *
 * All of them were written faithfully and none could be read from the product:
 * an incident meant opening the database by hand. The panel shows them through
 * one shape — when, who, what, details — because that is all six have in common.
 */
// The details differ from trail to trail, so they are shown as they are rather
// than squeezed into a shape none of them share.
function formatDetails(details: unknown) {
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

// An alert is open until somebody closes it. The status lives in the details,
// which is the only place the trail carries anything a record-specific.
function isOpenAlert(entry: AdminAuditTrailEntry) {
  if (!entry.entry_uuid || typeof entry.details !== "object" || entry.details === null) return false;
  return (entry.details as { status?: unknown }).status !== "resolved";
}

export function AuditTrailsPanel() {
  const [trail, setTrail] = useState<AdminAuditTrail>("admin_actions");
  const [entries, setEntries] = useState<AdminAuditTrailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getAdminAuditTrail(trail, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      });
      setEntries(result.items);
      setTotal(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал");
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [from, to, trail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(entry: AdminAuditTrailEntry) {
    if (!entry.entry_uuid) return;
    if (!reason.trim()) {
      setError("Укажите причину — она попадёт в журнал действий администратора.");
      return;
    }
    setResolvingId(entry.entry_uuid);
    setError("");
    try {
      await api.resolveBillingAlert(entry.entry_uuid, reason.trim());
      setReason("");
      await load();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Не удалось закрыть алерт");
    } finally {
      setResolvingId("");
    }
  }

  return (
    <>
      <form
        className="admin-toolbar admin-audit-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <SelectControl
          aria-label="Журнал"
          value={trail}
          onChange={(event) => setTrail(event.target.value as AdminAuditTrail)}
        >
          {Object.entries(trailLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectControl>
        <label className="audit-trail-date">
          <span>С</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="audit-trail-date">
          <span>По</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="ghost-button small" type="submit">
          Показать
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Обновить"
          aria-busy={loading}
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "refresh-icon spinning" : "refresh-icon"} size={17} />
        </button>
      </form>
      <p className="admin-section-summary">Записей: {total}</p>
      {trail === "billing_alerts" && (
        <label className="audit-trail-reason">
          <span>Причина закрытия алерта</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Обязательна для аудита" />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="admin-results" aria-busy={loading}>
        {loading && entries.length === 0 ? (
          <p className="admin-empty">Загрузка журнала…</p>
        ) : entries.length === 0 ? (
          <p className="admin-empty">За выбранный период записей нет.</p>
        ) : (
          <ul className="audit-trail-list">
            {entries.map((entry, index) => (
              <li className="audit-trail-entry" key={`${entry.occurred_at}-${index}`}>
                <div className="audit-trail-entry-head">
                  <time dateTime={entry.occurred_at}>
                    {new Date(entry.occurred_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                  <strong>{entry.action}</strong>
                  {entry.actor_user_uuid && (
                    <span className="audit-trail-actor">
                      {entry.actor_username ? `@${entry.actor_username}` : "Пользователь без профиля"}
                    </span>
                  )}
                  {isOpenAlert(entry) && (
                    <button
                      className="ghost-button small audit-trail-resolve"
                      type="button"
                      disabled={resolvingId !== ""}
                      onClick={() => void resolve(entry)}
                    >
                      {resolvingId === entry.entry_uuid ? "Закрываю…" : "Закрыть алерт"}
                    </button>
                  )}
                </div>
                {entry.details !== undefined && entry.details !== null && (
                  <pre className="audit-trail-details">{formatDetails(entry.details)}</pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
