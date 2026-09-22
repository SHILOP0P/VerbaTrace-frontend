import { PauseCircle, PlayCircle, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type { CompanyLifecycle } from "../../types";
import { formatDate } from "../../shared/lib/formatters";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { HoverHint } from "../../shared/ui/hover-hint";

/**
 * CompanyLifecyclePanel shows whether a company works and lets the owner choose
 * which ones keep working when the plan covers fewer than they own. A frozen
 * company stays readable; only what changes data or spends credits stops.
 *
 * It is a row inside the company card, not a card of its own: the state of the
 * company belongs with its name, not in a panel further down the page.
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
    <div className="company-state-row">
      <p className="company-state-text">
        <span className={`status-chip ${stateTone(lifecycle)}`}>{stateLabel(lifecycle)}</span>
        {stateDescription(lifecycle)}
      </p>
      {error && <div className="form-error">{error}</div>}
      {isOwner && (
        /* Every action the state knows about stays on screen and the ones that
           do not apply are pale and inert, with a hint that says why. Hiding
           them left the card looking different on every visit and gave no hint
           that the company could be switched on again at all. Only the action
           that applies right now is the bright one. */
        <div className="company-state-actions">
          <StateAction
            icon={<PauseCircle size={16} />}
            label="Заморозить"
            enabled={!busy && lifecycle.state === "active"}
            hint="Заморозить можно только работающую компанию"
            onClick={() => setFreezeOpen(true)}
          />
          <StateAction
            icon={<Undo2 size={16} />}
            label={busy && beingDeleted ? "Отменяю…" : "Отменить удаление"}
            enabled={!busy && beingDeleted}
            primary
            hint="Отменять нечего: удаление не начато"
            onClick={() => void change("cancel-deletion")}
          />
          <StateAction
            icon={<PlayCircle size={16} />}
            label="Включить компанию"
            enabled={!busy && lifecycle.state === "frozen" && !beingDeleted}
            primary
            hint={
              lifecycle.state === "active"
                ? "Компания и так работает"
                : beingDeleted
                  ? "Сначала отмените удаление"
                  : "Компания удалена: вернуть её может только суперадмин"
            }
            onClick={() => void change("activate")}
          />
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
    </div>
  );
}

// Green while the company works, amber while it is parked and can come back,
// red once it is on its way out.
function stateTone(lifecycle: CompanyLifecycle) {
  if (lifecycle.state === "active") return "ok";
  return lifecycle.state === "frozen" && lifecycle.freeze_reason !== "deletion" ? "warn" : "bad";
}

// A disabled button cannot carry its own hover hint, so the inert ones are
// wrapped: the explanation still appears, in the app's own tooltip.
function StateAction({ icon, label, enabled, hint, primary = false, onClick }: {
  icon: ReactNode;
  label: string;
  enabled: boolean;
  hint: string;
  primary?: boolean;
  onClick: () => void;
}) {
  if (!enabled) {
    return (
      <HoverHint label={hint} focusable={false}>
        <button className="ghost-button small" type="button" disabled>{icon}{label}</button>
      </HoverHint>
    );
  }
  return (
    <button className={primary ? "primary-button small" : "ghost-button small"} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
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
