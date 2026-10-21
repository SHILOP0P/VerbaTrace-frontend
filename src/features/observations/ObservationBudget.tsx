import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Wallet, X } from "lucide-react";
import { DateTimePicker } from "../../shared/ui/DateTimePicker";
import { api } from "../../api";
import type { AnalyticsFilters } from "../../types";
export type ObservationBudget = {
  limit_credits: number | null;
  from: string;
  to: string;
  lock_version: number;
  spent_credits: number;
  reserved_credits: number;
};
export function ObservationBudgetSettings({
  scope,
}: {
  scope: AnalyticsFilters;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ObservationBudget>();
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const scopeLabel = scope.department_uuid ? "Отдел" : scope.company_uuid ? "Компания" : "Личный профиль";
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('.date-time-popover')) return;
      if (event.key === "Escape" && !busy) { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, busy]);
  useEffect(() => {
    if (!open) return;
    let stop = false;
    setValue(undefined);
    setError("");
    api
      .getObservationBudget(scope)
      .then((v) => {
        if (stop) return;
        setValue(v);
        setAmount(v.limit_credits === null ? "" : String(v.limit_credits));
        setFrom(v.from.slice(0, 10));
        setTo(new Date(Date.parse(v.to) - 1).toISOString().slice(0, 10));
      })
      .catch((e) => {
        if (!stop)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить лимит",
          );
      });
    return () => {
      stop = true;
    };
  }, [open, scope.company_uuid, scope.department_uuid]);
  async function save() {
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      setValue(
        await api.saveObservationBudget(scope, {
          ...value,
          limit_credits: amount.trim() ? Number(amount) : null,
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: end.toISOString(),
        }),
      );
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить лимит");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="observation-budget">
      <button
        className="ghost-button small"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Wallet size={16} />Расходы
      </button>
      {open && createPortal(
        <div className="confirm-dialog-layer vt-portal" onPointerDown={event => {
          if (event.target === event.currentTarget && !busy) setOpen(false);
        }}>
        <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
          className="observation-budget-dialog">
          <header>
            <div><span className="observation-budget-scope">{scopeLabel}</span><h2 id={titleId}>Расходы на наблюдения</h2></div>
            <button type="button" className="icon-button" aria-label="Закрыть расходы" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button>
          </header>
          <p className="observation-budget-description">Задайте общий лимит в кредитах на выбранный период. Оставьте поле пустым, если отдельный лимит не нужен.</p>
          {value ? (
            <>
              <label className="observation-budget-amount">
                Лимит в кредитах
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Без отдельного лимита"
                />
              </label>
              <div className="observation-budget-dates">
                <div><span>Период с</span><DateTimePicker mode="date" display="compact" ariaLabel="Начало периода расходов" dialogLabel="Выбор начала периода расходов" value={from} onChange={setFrom} /></div>
                <div><span>По</span><DateTimePicker mode="date" display="compact" ariaLabel="Конец периода расходов" dialogLabel="Выбор конца периода расходов" value={to} onChange={setTo} /></div>
              </div>
              <dl className="observation-budget-usage">
                <div><dt>Списано</dt><dd>{value.spent_credits.toLocaleString("ru-RU")} <small>кредитов</small></dd></div>
                <div><dt>В резерве</dt><dd>{value.reserved_credits.toLocaleString("ru-RU")} <small>кредитов</small></dd></div>
              </dl>
              <p className="observation-budget-description">Резерв учитывает незавершённые проверки. {scope.company_uuid
                ? "Лимиты компании и отдела действуют вместе и относятся только к наблюдениям."
                : "Лимит относится только к наблюдениям."}</p>
              <footer>
              <button className="ghost-button small" type="button" disabled={busy} onClick={() => setOpen(false)}>Отмена</button>
              <button
                className="primary-button small"
                type="button"
                disabled={
                  busy ||
                  !from ||
                  !to ||
                  from > to ||
                  (amount !== "" &&
                    (!Number.isSafeInteger(Number(amount)) ||
                      Number(amount) < 0))
                }
                onClick={() => void save()}
              >
                {busy ? "Сохраняем…" : "Сохранить лимит"}
              </button>
              </footer>
            </>
          ) : !error ? (
            <p role="status">Загрузка лимита…</p>
          ) : null}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
        </div>, document.body,
      )}
    </div>
  );
}
