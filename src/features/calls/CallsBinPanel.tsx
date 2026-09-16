import { ChevronDown, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import type { DeletedCallResponse } from "../../types";
import { formatDate } from "../../shared/lib/formatters";

/**
 * CallsBinPanel lists calls waiting out their 30 days in the bin. Only the
 * people who may restore them see anything here, so an empty bin stays hidden.
 */
export function CallsBinPanel({ onRestored }: { onRestored: () => void }) {
  const [items, setItems] = useState<DeletedCallResponse[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await api.listDeletedCalls({ limit: 50 });
      setItems(response.items);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function restore(item: DeletedCallResponse) {
    setBusyId(item.call.id);
    setError("");
    try {
      await api.restoreCall(item.call.id);
      await reload();
      onRestored();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Не удалось восстановить звонок");
    } finally {
      setBusyId("");
    }
  }

  if (items.length === 0) return null;

  return (
    <section className="call-folder-panel">
      <div className="call-folder-heading">
        <button
          className="call-folder-project-button"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Trash2 size={15} />
          <span>
            <strong>Корзина</strong>
            <small>{items.length} удалённых · восстановление доступно 30 дней</small>
          </span>
        </button>
      </div>
      {error && <div className="form-error compact">{error}</div>}
      {expanded && (
        <div className="call-folder-tree">
          {items.map((item) => (
            <div className="call-row call-row-deleted" key={item.call.id}>
              <span className="call-row-main">
                <strong title={item.call.title}>{item.call.title}</strong>
                <small>Удалён {formatDate(item.deleted_at)} · очистка {formatDate(item.purge_after)}</small>
              </span>
              <span className="call-row-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Восстановить звонок ${item.call.title}`}
                  disabled={busyId === item.call.id}
                  onClick={() => void restore(item)}
                >
                  <RotateCcw size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
