import { Gauge } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type { CompanyCreditForecast, CreditSpending } from "../../types";

/**
 * CreditLimitsPanel is where the shared pot is divided: the owner caps each
 * company, the deputy splits that cap between departments, and everybody
 * responsible sees where the current period is heading.
 */
export function CreditLimitsPanel({
  companyId,
  isOwner,
}: {
  companyId: string;
  isOwner: boolean;
}) {
  const [forecast, setForecast] = useState<CompanyCreditForecast | null>(null);
  const [visible, setVisible] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    try {
      const response = await api.getCompanyCreditForecast(companyId);
      setForecast(response);
      setDrafts(() => {
        const next: Record<string, string> = {};
        if (response.company) next[response.company.id] = limitDraft(response.company);
        response.departments.forEach((department) => {
          next[department.id] = limitDraft(department);
        });
        return next;
      });
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404)) {
        setVisible(false);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить лимиты");
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!visible || !forecast) return null;

  async function saveLimit(subjectId: string, isCompany: boolean) {
    const raw = (drafts[subjectId] ?? "").trim();
    const limit = raw === "" ? null : Number(raw);
    if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
      setError("Лимит — целое число кредитов или пусто для безлимита");
      return;
    }

    setBusyId(subjectId);
    setError("");
    try {
      if (isCompany) {
        await api.setCompanyCreditLimit(companyId, limit);
      } else {
        await api.setDepartmentCreditLimit(companyId, subjectId, limit);
      }
      await reload();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить лимит");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="company-card glass">
      <div className="panel-heading">
        <div>
          <h2>Кредиты и лимиты</h2>
          <p>Кредиты общие на все компании владельца, лимит удерживает расход в рамках.</p>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}

      {forecast.company && (
        <article className="company-mini-card">
          <div>
            <strong>{forecast.company.name || "Компания"}</strong>
            <small>{spendingSummary(forecast.company)}</small>
          </div>
          {isOwner && (
            <div className="panel-actions">
              <input
                aria-label="Лимит компании"
                inputMode="numeric"
                placeholder="без лимита"
                value={drafts[forecast.company.id] ?? ""}
                onChange={(event) => setDrafts((current) => ({ ...current, [forecast.company!.id]: event.target.value }))}
              />
              <button
                className="primary-button small"
                type="button"
                disabled={busyId === forecast.company.id}
                onClick={() => void saveLimit(forecast.company!.id, true)}
              >
                <Gauge size={16} />
                Сохранить
              </button>
            </div>
          )}
        </article>
      )}

      <div className="company-mini-list">
        <h3>Отделы</h3>
        {forecast.departments.length === 0 ? (
          <div className="instruction-empty standalone">Отделов пока нет.</div>
        ) : (
          forecast.departments.map((department) => (
            <article className="company-mini-card" key={department.id}>
              <div>
                <strong>{department.name}</strong>
                <small>{spendingSummary(department)}</small>
              </div>
              <div className="panel-actions">
                <input
                  aria-label={`Лимит отдела ${department.name}`}
                  inputMode="numeric"
                  placeholder="без лимита"
                  value={drafts[department.id] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [department.id]: event.target.value }))}
                />
                <button
                  className="ghost-button small"
                  type="button"
                  disabled={busyId === department.id}
                  onClick={() => void saveLimit(department.id, false)}
                >
                  Сохранить
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function limitDraft(spending: CreditSpending) {
  return spending.limit_credits === null || spending.limit_credits === undefined
    ? ""
    : String(spending.limit_credits);
}

function spendingSummary(spending: CreditSpending) {
  const used = spending.used_credits.toLocaleString("ru-RU");
  const forecast = spending.forecast_credits.toLocaleString("ru-RU");
  if (spending.limit_credits === null || spending.limit_credits === undefined) {
    return `Потрачено ${used} · к концу периода ожидается ${forecast}`;
  }
  const limit = spending.limit_credits.toLocaleString("ru-RU");
  const fits = spending.forecast_credits <= spending.limit_credits;
  return `Потрачено ${used} из ${limit} · ${fits ? "уложится" : "не уложится"} по текущему темпу`;
}
