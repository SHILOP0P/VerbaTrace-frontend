import { ShieldQuestion } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type { SupportAccessJournalEntry } from "../../types";
import { formatDate } from "../../shared/lib/formatters";

/**
 * SupportJournalPanel answers a question the customer is entitled to ask: who
 * from support opened our data, when and why. Support access is temporary and
 * approved by the company, and this is the record of it.
 */
export function SupportJournalPanel({ companyId }: { companyId: string }) {
  const [entries, setEntries] = useState<SupportAccessJournalEntry[]>([]);
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await api.listCompanySupportJournal(companyId);
      setEntries(response.items);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404)) {
        setVisible(false);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал поддержки");
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!visible) return null;

  return (
    <section className="company-card glass">
      <div className="panel-heading">
        <div>
          <h2>Журнал действий поддержки</h2>
          <p>Доступ поддержки к данным компании временный и выдаётся по вашему решению.</p>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {entries.length === 0 ? (
        <div className="instruction-empty standalone">
          <ShieldQuestion size={18} />
          Поддержка не запрашивала доступ к данным компании.
        </div>
      ) : (
        <div className="company-mini-list">
          {entries.map((entry) => (
            <article className="company-mini-card support-journal-entry" key={entry.id}>
              <div>
                <strong>{eventLabel(entry.event_type)}</strong>
                <small>
                  {entry.actor_username ? `${entry.actor_username} · ` : ""}
                  {formatDate(entry.created_at)}
                  {entry.resource ? ` · ${entry.resource}` : ""}
                  {entry.access_expires_at ? ` · доступ до ${formatDate(entry.access_expires_at)}` : ""}
                </small>
                {entry.reason && <small>{entry.reason}</small>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function eventLabel(eventType: string) {
  if (eventType === "requested") return "Запрошен доступ";
  if (eventType === "approved") return "Доступ выдан";
  if (eventType === "denied") return "Доступ отклонён";
  if (eventType === "revoked") return "Доступ отозван";
  if (eventType === "expired") return "Доступ истёк";
  if (eventType === "used") return "Открыты данные";
  return eventType;
}
