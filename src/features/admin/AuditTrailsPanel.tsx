import { Building2, CircleAlert, CreditCard, FileText, Gauge, RefreshCw, ScrollText, Trash2, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { AdminAuditTrail, AdminAuditTrailEntry } from "../../types";
import { SelectControl } from "../../shared/ui/primitives";
import { formatUsername } from "../calls/call-page-utils";

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
// What the keys in the details actually mean. The trails come from six unrelated
// tables, so the list is a union of their columns; anything not named here is
// shown under its own key rather than hidden.
const detailLabels: Record<string, string> = {
  reason: "Причина",
  actor_role: "Роль",
  ip_address: "IP-адрес",
  target_type: "Объект",
  severity: "Важность",
  status: "Статус",
  provider: "Провайдер",
  period_start: "Период с",
  period_end: "Период по",
  checked: "Проверено операций",
  mismatched: "Расхождений",
  completed_at: "Завершено",
  resolved_at: "Закрыто",
  entity_type: "Тип сущности",
  item_count: "Записей",
  byte_count: "Байт",
  revision: "Ревизия",
  transcription_uuid: "Транскрипт",
  comment_uuid: "Комментарий",
  revision_uuid: "Ревизия",
  details: "Подробности",
  metadata: "Метаданные",
};

const targetTypeLabels: Record<string, string> = {
  user: "пользователь",
  company: "компания",
  call: "звонок",
  department: "отдел",
  subscription: "подписка",
};

// Values that are only an identifier say nothing to a reader and are never put
// on screen: the row already names what was acted on through `target_type`.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDetailValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (uuidPattern.test(value)) return null;
    if (key === "target_type") return targetTypeLabels[value] ?? value;
    if (key === "actor_role") return roleLabels[value] ?? value;
    const parsed = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
    }
    return value;
  }
  // A nested object or list is the exception the flat shape cannot carry, so it
  // keeps its compact JSON rather than being dropped.
  try {
    const encoded = JSON.stringify(value);
    return encoded === "{}" || encoded === "[]" ? null : encoded;
  } catch {
    return null;
  }
}

/**
 * The details used to be printed as a raw JSON blob, which read as debug output
 * and put raw uuids on screen. They become plain labelled rows: the keys the
 * trails use are named, identifiers are left out, and timestamps are formatted.
 */
function detailRows(details: unknown): Array<{ key: string; label: string; value: string }> {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>)
    .map(([key, value]) => {
      const formatted = formatDetailValue(key, value);
      return formatted === null ? null : { key, label: detailLabels[key] ?? key, value: formatted };
    })
    .filter((row): row is { key: string; label: string; value: string } => row !== null);
}

// What the records are called in the interface. The action is a key in the
// database; a reader should not have to translate `subscription.granted`.
const actionLabels: Record<string, string> = {
  "subscription.granted": "Подписка выдана",
  "subscription.extended": "Подписка продлена",
  "subscription.canceled": "Подписка отменена",
  "company.frozen": "Компания заморожена",
  "company.unfrozen": "Компания разморожена",
  "company.restored": "Компания восстановлена",
  "company.tag_changed": "Тег компании изменён",
  "usage.reset": "Счётчики сброшены",
  "user.profile_updated": "Профиль изменён",
  "user.role_changed": "Роль изменена",
  "session.revoked": "Сессия закрыта",
  "sessions.revoked": "Все сессии закрыты",
  "billing_alert.resolved": "Алерт закрыт",
  provider_outcome_unknown: "Ответ провайдера неизвестен",
  comment_revised: "Комментарий отредактирован",
};

const roleLabels: Record<string, string> = {
  user: "Пользователь",
  helper: "Помощник",
  admin: "Администратор",
  superadmin: "Супер-администратор",
};

// The emblem families. Each one borrows an existing tint from the integration
// emblems rather than introducing a colour of its own.
function entryEmblem(action: string) {
  const family = action.split(/[._]/)[0];
  switch (family) {
    case "subscription":
      return { Icon: CreditCard, tone: "is-key" };
    case "company":
      return { Icon: Building2, tone: "is-connection" };
    case "usage":
    case "allowance":
      return { Icon: Gauge, tone: "is-management" };
    case "user":
    case "sessions":
    case "session":
      return { Icon: UserCog, tone: "is-account" };
    case "provider":
    case "billing":
      return { Icon: CircleAlert, tone: "is-management" };
    case "retention":
    case "purge":
      return { Icon: Trash2, tone: "is-audit" };
    case "comment":
    case "transcript":
    case "transcription":
      return { Icon: FileText, tone: "is-import" };
    default:
      return { Icon: ScrollText, tone: "is-audit" };
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
            {entries.map((entry, index) => {
              const { Icon, tone } = entryEmblem(entry.action);
              return <li className="audit-trail-entry" key={`${entry.occurred_at}-${index}`}>
                <div className="audit-trail-entry-head">
                  {/* The same emblem the integration journal uses, so a record is
                      recognisable by its kind before the text is read. */}
                  <span className={`integration-icon is-audit-event ${tone}`} aria-hidden="true"><Icon size={17} /></span>
                  <div className="audit-trail-entry-title">
                    <strong>{actionLabels[entry.action] ?? entry.action}</strong>
                    <small>
                      <time dateTime={entry.occurred_at}>
                        {new Date(entry.occurred_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                      {entry.actor_user_uuid && (
                        <>
                          {" · "}
                          <span className="audit-trail-actor">
                            {entry.actor_username ? formatUsername(entry.actor_username) : "Пользователь без профиля"}
                          </span>
                        </>
                      )}
                    </small>
                  </div>
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
                {detailRows(entry.details).length > 0 && (
                  <dl className="audit-trail-details">
                    {detailRows(entry.details).map((row) => (
                      <div key={row.key}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>;
            })}
          </ul>
        )}
      </div>
    </>
  );
}
