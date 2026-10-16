import { Activity, FlaskConical, TrendingDown, WalletCards } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api";
import type { CompanyResponse, CreditDashboardResponse, SandboxWalletDashboard, SessionState } from "../../types";
import { creditForecast } from "../../shared/lib/credits";
import { SelectControl } from "../../shared/ui/primitives";
import { CreditActivityChart } from "./CreditActivityChart";
import { CreditLimitRing } from "./CreditLimitRing";
import { creditActivityRange } from "./credit-activity";

export function CreditUsagePanel({ session, companies, companyId, embeddedHeader }: { session: SessionState; companies: CompanyResponse[]; companyId?: string; embeddedHeader?: ReactNode }) {
  const managed = companies.filter((company) => company.manager_user_uuid === session.user.id);
  const [scope, setScope] = useState(companyId ?? "personal");
  const [data, setData] = useState<CreditDashboardResponse | null>(null);
  const [dataScope, setDataScope] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [hiddenByManager, setHiddenByManager] = useState(false);
  const [integrationAccess, setIntegrationAccess] = useState(false);
  const [sandboxWallet, setSandboxWallet] = useState<SandboxWalletDashboard | null>(null);
  const [sandboxWalletError, setSandboxWalletError] = useState(false);
  const canReadIntegrationScope = scope === "personal" || (dataScope === scope && data?.can_manage_visibility === true);

  useEffect(() => {
    if (companyId) setScope(companyId);
  }, [companyId]);

  useEffect(() => {
    let active = true;
    setError("");
    setHiddenByManager(false);
    setData(null);
    setDataScope("");
    const { from, to } = creditActivityRange();
    const request = scope === "personal" ? api.getCreditDashboard(from, to) : api.getCompanyCreditDashboard(scope, from, to);
    request.then((value) => { if (active) { setData(value); setDataScope(scope); } }).catch((reason) => {
      if (!active) return;
      setData(null);
      if (reason instanceof ApiError && reason.status === 403 && companyId) {
        setHiddenByManager(true);
        return;
      }
      setError(reason instanceof ApiError && reason.code === "subscription_not_found"
          ? "Для выбранного аккаунта нет активной подписки."
          : "Не удалось загрузить расход кредитов.");
    });
    return () => { active = false; };
  }, [scope, refresh]);

  useEffect(() => {
    let active = true;
    setIntegrationAccess(false);
    setSandboxWallet(null);
    setSandboxWalletError(false);
    if (!canReadIntegrationScope) return;
    const ownerType = scope === "personal" ? "user" : "company";
    const ownerId = scope === "personal" ? undefined : scope;
    const subscription = scope === "personal" ? api.getSubscription() : api.getCompanySubscription(scope);
    subscription.then((value) => {
      if (!active || !value.plan.api_access_enabled) return null;
      return api.listDeveloperApplications(ownerType, ownerId);
    }).then(async (value) => {
      if (!active || !value) return;
      setIntegrationAccess(true);
      const sandbox = value.applications.find((application) => application.environment === "sandbox" && application.status !== "revoked");
      if (!sandbox) return;
      try {
        const wallet = await api.getSandboxWallet(sandbox.application_uuid);
        if (active) setSandboxWallet(wallet);
      } catch {
        if (active) setSandboxWalletError(true);
      }
    }).catch(() => {
      if (active) {
        setIntegrationAccess(false);
        setSandboxWallet(null);
      }
    });
    return () => { active = false; };
  }, [scope, refresh, canReadIntegrationScope]);


  async function updateVisibility(visible: boolean) {
    if (!companyId || !data?.can_manage_visibility) return;
    setVisibilitySaving(true);
    setError("");
    try {
      const updated = await api.updateCompanyCreditVisibility(companyId, visible);
      setData((current) => current ? { ...current, ...updated } : current);
    } catch {
      setError("Не удалось изменить видимость лимитов.");
    } finally {
      setVisibilitySaving(false);
    }
  }

  const forecast = useMemo(() => data ? creditForecast(data) : null, [data]);
  // The waiting queue only matters once something is actually waiting or the
  // limit has run out; the rest of the time it is noise on the card.
  const queueNote = useMemo(() => data ? pendingQueueNote(data) : "", [data]);

  if (hiddenByManager) return null;

  return <section className={`credit-usage-panel${embeddedHeader ? " is-profile-overview" : " glass"}`} aria-labelledby="credit-usage-title">
    {embeddedHeader}
    <div className="credit-usage-head">
      <div><span className="credit-usage-icon"><Activity size={20} /></span><h2 id="credit-usage-title">Использование кредитов</h2><p>Остаток лимита за период подписки (30 дней) и фактическая активность.</p></div>
      {!companyId && managed.length > 0 && <label>Аккаунт<SelectControl value={scope} onChange={(event) => setScope(event.target.value)}><option value="personal">Личный</option>{managed.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectControl></label>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!error && !data && <CreditDashboardSkeleton />}
    {data && <>
      <div className={`credit-limit-row${integrationAccess ? " has-sandbox" : ""}`}>
        <div className="credit-balance-summary"><CreditLimitRing percent={data.allowance_remaining_percent} /><div className="credit-limit-copy"><strong>{data.days_until_reset} дн. до сброса лимита</strong><small>Сброс {new Date(data.resets_at).toLocaleDateString("ru-RU")}</small><p className="credit-limit-values"><strong>{data.allowance_remaining.toLocaleString("ru-RU")}</strong><span>из {data.allowance_credits.toLocaleString("ru-RU")} кредитов</span></p>{queueNote && <small className="credit-queue-note">{queueNote}</small>}</div></div>
        <section className="credit-main-wallet credit-summary-card" aria-label="Основной кошелёк"><header><span><WalletCards size={17}/></span><div><strong>Основной кошелёк</strong><small>Купленные кредиты</small></div></header><p><strong>{data.wallet_credits === null ? "—" : data.wallet_credits.toLocaleString("ru-RU")}</strong>{data.wallet_credits !== null && <span>кредитов</span>}</p>{!companyId && <small className="credit-wallet-note">Пополнение появится вместе с оплатой.</small>}</section>
        {forecast && <section className="credit-forecast credit-summary-card" aria-label="Прогноз расхода"><header><span><TrendingDown size={17}/></span><div><strong>Прогноз расхода</strong><small>По текущему темпу</small></div></header><dl><div><dt>Потрачено</dt><dd>{forecast.used.toLocaleString("ru-RU")}</dd></div><div><dt>В среднем за день</dt><dd>{forecast.daily.toLocaleString("ru-RU")}</dd></div><div><dt>Останется к сбросу</dt><dd>{forecast.atReset.toLocaleString("ru-RU")}</dd></div><div><dt>Лимита хватит</dt><dd>{forecast.depletion}</dd></div></dl></section>}
        {integrationAccess && <section className="credit-sandbox-wallet credit-summary-card" aria-label="Тестовый кошелёк"><header><span><FlaskConical size={17}/></span><div><strong>Тестовый кошелёк</strong><small>{sandboxWalletError ? "Не удалось загрузить баланс" : sandboxWallet?.application_name ?? "Тестовое приложение не создано"}</small></div></header><p><strong>{sandboxWalletError ? "—" : (sandboxWallet?.balance_credits ?? 0).toLocaleString("ru-RU")}</strong>{!sandboxWalletError && <span>кредитов</span>}</p><small>{sandboxWalletError ? "Обновите страницу или проверьте интеграцию" : "Не влияет на основной лимит"}</small></section>}
      </div>
      {companyId && data.can_manage_visibility && <label className="credit-visibility-setting"><input type="checkbox" checked={data.visible_to_members !== false} disabled={visibilitySaving} onChange={(event) => void updateVisibility(event.target.checked)} /><span><strong>Показывать лимиты участникам</strong><small>По умолчанию сотрудники компании видят лимиты и активность. Отключите, чтобы скрыть весь раздел от участников.</small></span></label>}
      <CreditActivityChart key={scope} activity={data.activity} />
    </>}
  </section>;
}

function CreditDashboardSkeleton() {
  return <div className="credit-dashboard-skeleton" aria-label="Загрузка использования кредитов">
    <div className="credit-dashboard-skeleton-summary"><span className="credit-dashboard-skeleton-ring"/><span/><span/></div>
    <div className="credit-dashboard-skeleton-toolbar"><span/><span/></div>
    <div className="credit-dashboard-skeleton-grid">{Array.from({ length: 126 }).map((_, index)=><span key={index}/>)}</div>
  </div>;
}

function pendingQueueNote(data: CreditDashboardResponse) {
  const waiting = data.calls_awaiting_credits ?? 0;
  if (waiting === 0 && !data.allowance_exhausted) return "";
  const limit = data.pending_credit_calls_limit;
  if (limit === null || limit === undefined) return `Ждут кредитов: ${waiting} звонк${waiting === 1 ? "" : "ов"}`;
  if (limit === 0) return "Звонки без кредитов не принимаются";
  return `Ждут кредитов: ${waiting} из ${limit}`;
}
