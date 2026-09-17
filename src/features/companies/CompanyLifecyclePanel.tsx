import { PauseCircle, PlayCircle, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type { CompanyLifecycle } from "../../types";
import { formatDate } from "../../shared/lib/formatters";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";

/**
 * CompanyLifecyclePanel shows whether a company works and lets the owner choose
 * which ones keep working when the plan covers fewer than they own. A frozen
 * company stays readable; only what changes data or spends credits stops.
 */
export function CompanyLifecyclePanel({
  companyId,
  isOwner,
}: {
  companyId: string;
  isOwner: boolean;
}) {
  const [lifecycle, setLifecycle] = useState<CompanyLifecycle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [freezeOpen, setFreezeOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLifecycle(await api.getCompanyLifecycle(companyId));
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404)) {
        setLifecycle(null);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить состояние компании");
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!lifecycle) return null;
  // An active company needs no explanation; only the owner may park one.
  if (lifecycle.state === "active" && !isOwner) return null;

  // A company frozen by a downgrade is switched back on. One that is being
  // deleted is not: calling off the deletion is a separate, deliberate step, and
  // only then does the ordinary activation apply.
  const beingDeleted = lifecycle.state === "frozen" && lifecycle.freeze_reason === "deletion";

  async function change(action: "freeze" | "activate" | "cancel-deletion") {
    setBusy(true);
    setError("");
    try {
      if (action === "freeze") {
        await api.freezeCompany(companyId);
      } else if (action === "cancel-deletion") {
        await api.cancelCompanyDeletion(companyId);
      } else {
        await api.activateCompany(companyId);
      }
      setFreezeOpen(false);
      await reload();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "Не удалось изменить состояние компании");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="company-card glass">
      <div className="panel-heading">
        <div>
          <h2>Состояние компании</h2>
          <p>{stateDescription(lifecycle)}</p>
        </div>
        <span className={`status-chip ${lifecycle.state === "active" ? "ok" : "warn"}`}>{stateLabel(lifecycle)}</span>
      </div>
      {error && <div className="form-error">{error}</div>}
      {isOwner && (
        <div className="panel-actions">
          {lifecycle.state === "active" && (
            <button className="ghost-button small" type="button" disabled={busy} onClick={() => setFreezeOpen(true)}>
              <PauseCircle size={16} />
              Заморозить
            </button>
          )}
          {beingDeleted && (
            <button className="primary-button small" type="button" disabled={busy} onClick={() => void change("cancel-deletion")}>
              <Undo2 size={16} />
              {busy ? "Отменяю…" : "Отменить удаление"}
            </button>
          )}
          {lifecycle.state === "frozen" && !beingDeleted && (
            <button className="primary-button small" type="button" disabled={busy} onClick={() => void change("activate")}>
              <PlayCircle size={16} />
              Включить компанию
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={freezeOpen}
        title="Заморозить компанию?"
        message="Данные останутся доступны для чтения, но загрузка звонков, анализ и другие операции с кредитами остановятся. Через 30 дней компания уйдёт в мягкое удаление."
        confirmLabel="Заморозить"
        busy={busy}
        onCancel={() => setFreezeOpen(false)}
        onConfirm={() => void change("freeze")}
      />
    </section>
  );
}

function stateLabel(lifecycle: CompanyLifecycle) {
  if (lifecycle.state === "active") return "Активна";
  if (lifecycle.state === "frozen") {
    return lifecycle.freeze_reason === "deletion" ? "Удаляется" : "Заморожена";
  }
  return "Мягко удалена";
}

function stateDescription(lifecycle: CompanyLifecycle) {
  if (lifecycle.state === "active") {
    return "Компания работает: звонки загружаются, анализ выполняется.";
  }
  if (lifecycle.state === "frozen") {
    // A downgrade and a deletion look the same from the outside, so the text has
    // to say which one this is and what undoes it.
    if (lifecycle.freeze_reason === "deletion") {
      return lifecycle.purge_after
        ? `Компания удаляется. Чтение и выгрузка отчётов доступны, изменения остановлены. Мягкое удаление ${formatDate(lifecycle.purge_after)}, до него удаление можно отменить.`
        : "Компания удаляется. Чтение доступно, изменения остановлены. Удаление ещё можно отменить.";
    }
    return lifecycle.purge_after
      ? `Тариф не покрывает компанию. Чтение и выгрузка отчётов доступны, изменения остановлены. Мягкое удаление ${formatDate(lifecycle.purge_after)}.`
      : "Тариф не покрывает компанию. Чтение доступно, изменения остановлены.";
  }
  return lifecycle.purge_after
    ? `Компания удалена. Полная очистка ${formatDate(lifecycle.purge_after)}, после неё сотрудники открепляются.`
    : "Компания удалена и ждёт полной очистки.";
}
