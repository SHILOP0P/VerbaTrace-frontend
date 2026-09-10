import { Activity, ArrowDownLeft, ArrowUpRight, FlaskConical, RefreshCw, TrendingDown, WalletCards } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api";
import type { CompanyResponse, CreditDashboardResponse, CreditWalletEntry, SandboxWalletDashboard, SessionState } from "../../types";
import { SelectControl } from "../../shared/ui/primitives";
import { CreditActivityChart } from "./CreditActivityChart";
import { CreditLimitRing } from "./CreditLimitRing";
import { creditActivityRange } from "./credit-activity";

export function CreditUsagePanel({ session, companies, companyId, embeddedHeader }: { session: SessionState; companies: CompanyResponse[]; companyId?: string; embeddedHeader?: ReactNode }) {
  const managed = companies.filter((company) => company.manager_user_uuid === session.user.id);
  const [scope, setScope] = useState(companyId ?? "personal");
  const [data, setData] = useState<CreditDashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [hiddenByManager, setHiddenByManager] = useState(false);
  const [integrationAccess, setIntegrationAccess] = useState(false);
  const [sandboxWallet, setSandboxWallet] = useState<SandboxWalletDashboard | null>(null);
  const [sandboxWalletError, setSandboxWalletError] = useState(false);

  useEffect(() => {
    if (companyId) setScope(companyId);
  }, [companyId]);

  useEffect(() => {
    let active = true;
    setError("");
    setHiddenByManager(false);
    setData(null);
    const { from, to } = creditActivityRange();
    const request = scope === "personal" ? api.getCreditDashboard(from, to) : api.getCompanyCreditDashboard(scope, from, to);
    request.then((value) => { if (active) setData(value); }).catch((reason) => {
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
    const ownerType = scope === "personal" ? "user" : "company";
    const ownerId = scope === "personal" ? undefined : scope;
    api.listDeveloperApplications(ownerType, ownerId).then(async ({ applications }) => {
      if (!active) return;
      setIntegrationAccess(true);
      const sandbox = applications.find((application) => application.environment === "sandbox" && application.status !== "revoked");
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
  }, [scope, refresh]);

  async function mockPurchase() {
    setPurchasing(true); setError("");
    try { await api.mockPurchaseCredits({ owner_type: scope === "personal" ? "user" : "company", owner_uuid: scope === "personal" ? undefined : scope, credits: 25_000 }); setRefresh((value) => value + 1); }
    catch { setError("Не удалось выполнить тестовое пополнение."); }
    finally { setPurchasing(false); }
  }

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

  if (hiddenByManager) return null;

  return <section className={`credit-usage-panel${embeddedHeader ? " is-profile-overview" : " glass"}`} aria-labelledby="credit-usage-title">
    {embeddedHeader}
    <div className="credit-usage-head">
      <div><span className="credit-usage-icon"><Activity size={20} /></span><h2 id="credit-usage-title">Использование кредитов</h2><p>Остаток месячного лимита и фактическая активность.</p></div>
      {!companyId && managed.length > 0 && <label>Аккаунт<SelectControl value={scope} onChange={(event) => setScope(event.target.value)}><option value="personal">Личный</option>{managed.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectControl></label>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!error && !data && <CreditDashboardSkeleton />}
    {data && <>
      <div className={`credit-limit-row${integrationAccess ? " has-sandbox" : ""}`}>
        <div className="credit-balance-summary"><CreditLimitRing percent={data.allowance_remaining_percent} /><div className="credit-limit-copy"><strong>{data.days_until_reset} дн. до сброса лимита</strong><small>Сброс {new Date(data.resets_at).toLocaleDateString("ru-RU")}</small><p className="credit-limit-values"><strong>{data.allowance_remaining.toLocaleString("ru-RU")}</strong><span>из {data.allowance_credits.toLocaleString("ru-RU")} кредитов</span></p></div></div>
        <section className="credit-main-wallet credit-summary-card" aria-label="Основной кошелёк"><header><span><WalletCards size={17}/></span><div><strong>Основной кошелёк</strong><small>Купленные кредиты</small></div></header><p><strong>{data.wallet_credits === null ? "—" : data.wallet_credits.toLocaleString("ru-RU")}</strong>{data.wallet_credits !== null && <span>кредитов</span>}</p>{!companyId && <button className="ghost-button small credit-mock-purchase" type="button" disabled={purchasing} onClick={()=>void mockPurchase()}>{purchasing?"Пополняю…":"Тестово пополнить 25 000"}</button>}</section>
        {forecast && <section className="credit-forecast credit-summary-card" aria-label="Прогноз расхода"><header><span><TrendingDown size={17}/></span><div><strong>Прогноз расхода</strong><small>По текущему темпу</small></div></header><dl><div><dt>Потрачено</dt><dd>{forecast.used.toLocaleString("ru-RU")}</dd></div><div><dt>В среднем за день</dt><dd>{forecast.daily.toLocaleString("ru-RU")}</dd></div><div><dt>Останется к сбросу</dt><dd>{forecast.atReset.toLocaleString("ru-RU")}</dd></div><div><dt>Лимита хватит</dt><dd>{forecast.depletion}</dd></div></dl></section>}
        {integrationAccess && <section className="credit-sandbox-wallet credit-summary-card" aria-label="Тестовый кошелёк"><header><span><FlaskConical size={17}/></span><div><strong>Тестовый кошелёк</strong><small>{sandboxWalletError ? "Не удалось загрузить баланс" : sandboxWallet?.application_name ?? "Тестовое приложение не создано"}</small></div></header><p><strong>{sandboxWalletError ? "—" : (sandboxWallet?.balance_credits ?? 0).toLocaleString("ru-RU")}</strong>{!sandboxWalletError && <span>кредитов</span>}</p><small>{sandboxWalletError ? "Обновите страницу или проверьте интеграцию" : "Не влияет на основной лимит"}</small></section>}
      </div>
      {companyId && data.can_manage_visibility && <label className="credit-visibility-setting"><input type="checkbox" checked={data.visible_to_members !== false} disabled={visibilitySaving} onChange={(event) => void updateVisibility(event.target.checked)} /><span><strong>Показывать лимиты участникам</strong><small>По умолчанию сотрудники компании видят лимиты, активность и историю. Отключите, чтобы скрыть весь раздел от участников.</small></span></label>}
      <CreditActivityChart key={scope} activity={data.activity} />
      <div className={`credit-wallet-histories${integrationAccess ? " has-sandbox" : ""}`}><WalletHistory title="История кредитов" entries={data.wallet_entries} timeZone={session.user.timezone}/>{integrationAccess ? <WalletHistory title="История тестового кошелька" entries={sandboxWallet?.entries ?? []} timeZone={session.user.timezone} sandbox/> : <div className="credit-history-reserved" aria-hidden="true"/>}</div>
    </>}
  </section>;
}

function CreditDashboardSkeleton() {
  return <div className="credit-dashboard-skeleton" aria-label="Загрузка использования кредитов">
    <div className="credit-dashboard-skeleton-summary"><span className="credit-dashboard-skeleton-ring"/><span/><span/></div>
    <div className="credit-dashboard-skeleton-toolbar"><span/><span/></div>
    <div className="credit-dashboard-skeleton-grid">{Array.from({ length: 126 }).map((_, index)=><span key={index}/>)}</div>
    <div className="credit-dashboard-skeleton-history"><span/><span/></div>
  </div>;
}

function WalletHistory({ title, entries, timeZone, sandbox = false }: { title: string; entries: CreditWalletEntry[]; timeZone?: string | null; sandbox?: boolean }) {
  const resolvedTimeZone = validTimeZone(timeZone) ? timeZone! : Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <section className={`credit-wallet-history${sandbox ? " is-sandbox" : ""}`}>
    <header><h3>{sandbox && <FlaskConical size={17}/>} {title}</h3><span title={`Время операций: ${resolvedTimeZone}`}>{timeZoneLabel(resolvedTimeZone)}</span></header>
    {entries.length === 0 ? <p className="credit-history-empty">{sandbox ? "Операций с тестовыми кредитами пока нет." : "Операций с кредитами пока нет."}</p> : <div className={`credit-wallet-entry-list${entries.length > 8 ? " is-scrollable" : ""}`}>{entries.map((entry) => {
      const kind = walletEntryKind(entry);
      const Icon = kind === "credit" ? ArrowDownLeft : kind === "debit" ? ArrowUpRight : RefreshCw;
      return <article className={`credit-wallet-entry is-${kind}`} key={entry.transaction_uuid}>
        <span className="credit-wallet-entry-icon" aria-hidden="true"><Icon size={17}/></span>
        <time dateTime={entry.created_at}>{formatWalletDateTime(entry.created_at, resolvedTimeZone)}</time>
        <strong>{entry.credits>0?"+":""}{entry.credits.toLocaleString("ru-RU")}</strong>
        <small>{walletReason(entry.reason, sandbox)}</small>
      </article>;
    })}</div>}
  </section>;
}

function walletEntryKind(entry: CreditWalletEntry): "credit" | "debit" | "adjustment" {
  if (entry.reason === "sandbox wallet set" || entry.reason === "sandbox wallet reset" || entry.credits === 0) return "adjustment";
  return entry.credits > 0 ? "credit" : "debit";
}

function validTimeZone(timeZone?: string | null) {
  if (!timeZone) return false;
  try { new Intl.DateTimeFormat("ru-RU", { timeZone }).format(); return true; } catch { return false; }
}

function formatWalletDateTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

function timeZoneLabel(timeZone: string) {
  const names: Record<string, string> = {
    "Europe/Kaliningrad": "Калининград",
    "Europe/Moscow": "Москва",
    "Europe/Samara": "Самара",
    "Asia/Yekaterinburg": "Екатеринбург",
    "Asia/Omsk": "Омск",
    "Asia/Krasnoyarsk": "Красноярск",
    "Asia/Irkutsk": "Иркутск",
    "Asia/Yakutsk": "Якутск",
    "Asia/Vladivostok": "Владивосток",
    "Asia/Magadan": "Магадан",
    "Asia/Kamchatka": "Камчатка",
    "UTC": "всемирное время",
    "Europe/London": "Лондон",
    "Europe/Berlin": "Берлин",
    "Asia/Dubai": "Дубай",
    "Asia/Almaty": "Алматы",
    "Asia/Tashkent": "Ташкент",
    "Asia/Tokyo": "Токио",
    "America/New_York": "Нью-Йорк",
    "America/Los_Angeles": "Лос-Анджелес"
  };
  return `Время: ${names[timeZone] ?? localizedUtcOffset(timeZone)}`;
}

function localizedUtcOffset(timeZone: string) {
  try {
    const part = new Intl.DateTimeFormat("ru-RU", { timeZone, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((item) => item.type === "timeZoneName")?.value;
    return part?.replace("GMT", "UTC") ?? "по часовому поясу профиля";
  } catch {
    return "по часовому поясу профиля";
  }
}

function walletReason(reason: string, sandbox: boolean) {
  if (!sandbox && reason === "transcription") return "Транскрибация звонка";
  if (!sandbox && reason === "analysis") return "Анализ звонка";
  if (!sandbox && reason === "deep_analysis") return "Глубокий анализ звонка";
  if (!sandbox && reason === "assistant_generation") return "Ответ помощника по звонкам";
  if (!sandbox && reason === "sandbox wallet add") return "Тестовое пополнение основного кошелька";
  if (!sandbox && reason === "mock payment checkout") return "Тестовое пополнение основного кошелька";
  if (!sandbox) return reason;
  if (reason === "sandbox wallet add") return "Пополнение тестового кошелька";
  if (reason === "sandbox wallet set") return "Изменение тестового баланса";
  if (reason === "sandbox wallet reset") return "Сброс тестового баланса";
  return "Операция с тестовыми кредитами";
}

function creditForecast(data: CreditDashboardResponse) {
  const used = Math.max(0, data.allowance_credits - data.allowance_remaining);
  const reset = new Date(data.resets_at);
  const start = new Date(reset);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const elapsed = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
  const daily = Math.round(used / elapsed);
  const atReset = Math.max(0, data.allowance_remaining - daily * Math.max(0, data.days_until_reset));
  const daysLeft = daily > 0 ? Math.floor(data.allowance_remaining / daily) : Number.POSITIVE_INFINITY;
  const depletion = !Number.isFinite(daysLeft) || daysLeft > data.days_until_reset ? "до сброса" : `${daysLeft} дн.`;
  return { used, daily, atReset, depletion };
}
