import {
  ArrowLeft,
  Check,
  CreditCard,
  ShieldCheck,
  X
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type {
  CompanyResponse,
  Plan,
  SessionState,
  Subscription
} from "../../types";

import { analysisLevelLabel, comparePlans, formatHistoryDays, formatInstructionLimit, formatMinutesLimit, formatPendingQueueLimit, planGradients } from "../../shared/lib/plans";
import { SkeletonLine, TextBlockSkeleton } from "../../shared/ui/loading";

if (typeof window !== "undefined" && window.location.pathname === "/app/settings/tariffs" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

export function TariffsPage({
  session,
  companies,
  personalSubscription,
  companySubscriptions,
  onPersonalSubscriptionChanged,
  onCompanySubscriptionChanged,
  onBackToSettings
}: {
  session: SessionState;
  companies: CompanyResponse[];
  personalSubscription: Subscription | null;
  companySubscriptions: Record<string, Subscription | null>;
  onPersonalSubscriptionChanged: (subscription: Subscription | null) => void;
  onCompanySubscriptionChanged: (subscription: Subscription) => void;
  onBackToSettings: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useTariffsScrollRestoration(loading);

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      try {
        setLoading(true);
        setError("");
        const response = await api.listPlans();
        if (!cancelled) {
          setPlans([...response.plans].sort(comparePlans));
        }
      } catch (loadError) {
        if (!cancelled) {
          const notConfiguredHint =
            loadError instanceof ApiError && loadError.status === 404
              ? " Каталог тарифов пока не настроен."
              : "";
          setError(`Не удалось загрузить тарифы.${notConfiguredHint}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  const personalPlans = plans.filter((plan) => plan.type === "personal");
  const businessPlans = plans.filter((plan) => plan.type === "business");

  return (
    <section className="tariffs-layout app-page">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBackToSettings}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <div className="app-page-heading settings-heading tariff-heading">
        <span className="settings-heading-icon" aria-hidden="true">
          <CreditCard size={26} />
        </span>
        <div>
          <h1>Тарифы</h1>
          <p>Доступные планы, лимиты и подписки для личного аккаунта и компаний.</p>
        </div>
      </div>
      {loading && <TariffSkeleton />}
      {!loading && error && <div className="form-error tariff-message">{error}</div>}
      {!loading && !error && plans.length === 0 && (
        <div className="empty-panel glass">Тарифы пока не настроены.</div>
      )}
      {!loading && !error && plans.length > 0 && (
        <>
          <PersonalSubscriptionPanel
            personalPlans={personalPlans}
            initialSubscription={personalSubscription}
            onSubscriptionChanged={onPersonalSubscriptionChanged}
          />
          <CompanySubscriptionPanel
            session={session}
            companies={companies}
            businessPlans={businessPlans}
            subscriptions={companySubscriptions}
            onSubscriptionChanged={onCompanySubscriptionChanged}
          />
          <TariffSection title="Персональные тарифы" plans={personalPlans} />
          <TariffSection title="Бизнес-тарифы" plans={businessPlans} business />
        </>
      )}
    </section>
  );
}

export function PersonalSubscriptionPanel({
  personalPlans,
  initialSubscription,
  onSubscriptionChanged
}: {
  personalPlans: Plan[];
  initialSubscription: Subscription | null;
  onSubscriptionChanged: (subscription: Subscription | null) => void;
}) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSubscription(initialSubscription);
  }, [initialSubscription]);

  useEffect(() => {
    let cancelled = false;

    async function loadSubscription() {
      try {
        setLoading(true);
        setError("");
        const response = await api.getSubscription();
        if (!cancelled) {
          setSubscription(response);
          onSubscriptionChanged(response);
        }
      } catch (loadError) {
        if (cancelled) return;
        if (
          loadError instanceof ApiError &&
          (loadError.status === 404 || loadError.code === "subscription_not_found")
        ) {
          setSubscription(null);
          onSubscriptionChanged(null);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить подписку");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSubscription();

    return () => {
      cancelled = true;
    };
  }, []);

  const active = subscription?.status === "active";

  return (
    <section className="subscription-panel glass">
      <div className="panel-heading large">
        <div>
          <h2>Персональная подписка</h2>
          <p>Подключение личного тарифа без платежной формы.</p>
        </div>
        <span className="status-chip warn">Без оплаты</span>
      </div>
      <div className="subscription-company readonly">
        <div>
          <strong>{subscription?.plan.name ?? "Личный тариф"}</strong>
          <small>
            {loading
              ? "Загружаю текущую подписку..."
              : active
                ? "Подписка привязана к вашему аккаунту."
                : "Тариф подключает администратор. Напишите в поддержку, чтобы его выдали."}
          </small>
        </div>
        <span className={`status-chip ${active ? "ok" : "warn"}`}>
          {active ? "Активна" : subscription?.status === "canceled" ? "Отменена" : "Не подключена"}
        </span>
      </div>
      <p className="tariff-note">
        <ShieldCheck size={16} />
        Самостоятельной покупки пока нет: тариф выдаёт администратор.
      </p>
      {message && <div className="form-success tariff-message">{message}</div>}
      {error && <div className="form-error tariff-message">{error}</div>}
    </section>
  );
}

export function CompanySubscriptionPanel({
  session,
  companies,
  businessPlans,
  subscriptions,
  onSubscriptionChanged
}: {
  session: SessionState;
  companies: CompanyResponse[];
  businessPlans: Plan[];
  subscriptions: Record<string, Subscription | null>;
  onSubscriptionChanged: (subscription: Subscription) => void;
}) {
  const managedCompanies = companies.filter((company) => company.manager_user_uuid === session.user.id);
  const [busyCompanyId, setBusyCompanyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (managedCompanies.length === 0) {
    return null;
  }

  async function cancel(companyId: string) {
    setBusyCompanyId(companyId);
    setMessage("");
    setError("");

    try {
      const subscription = await api.cancelCompanySubscription(companyId);
      onSubscriptionChanged(subscription);
      setMessage("Подписка отменена.");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Не удалось отменить подписку");
    } finally {
      setBusyCompanyId("");
    }
  }

  return (
    <section className="subscription-panel glass">
      <div className="panel-heading large">
        <div>
          <h2>Бизнес-подписка компании</h2>
          <p>Тариф покрывает компании владельца, кредиты у них общие.</p>
        </div>
        <span className="status-chip warn">Без оплаты</span>
      </div>
      <div className="subscription-company-list">
        {managedCompanies.map((company) => {
          const subscription = subscriptions[company.id];
          const active = subscription?.status === "active";

          return (
            <div className="subscription-company readonly" key={company.id}>
              <div>
                <strong>{company.name}</strong>
                <small>{subscription?.plan.name ?? "Бизнес-тариф не подключён"}</small>
              </div>
              <span className={`status-chip ${active ? "ok" : "warn"}`}>
                {active ? "Активна" : subscription?.status === "canceled" ? "Отменена" : "Не подключена"}
              </span>
              <div className="subscription-actions">
                {active ? (
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => cancel(company.id)}
                    disabled={busyCompanyId === company.id}
                  >
                    <X size={16} />
                    {busyCompanyId === company.id ? "Отменяю…" : "Отменить подписку"}
                  </button>
                ) : (
                  <small className="subscription-hint">Тариф подключает администратор</small>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="tariff-note">
        <ShieldCheck size={16} />
        Подписку выдаёт администратор. Отменить её может владелец компании.
      </p>
      {message && <div className="form-success tariff-message">{message}</div>}
      {error && <div className="form-error tariff-message">{error}</div>}
    </section>
  );
}

export function TariffSection({
  title,
  plans,
  business
}: {
  title: string;
  plans: Plan[];
  business?: boolean;
}) {
  if (plans.length === 0) {
    return (
      <section className="tariff-section">
        <h2>{title}</h2>
        <div className="empty-panel glass">Тарифы пока не настроены.</div>
      </section>
    );
  }

  return (
    <section className="tariff-section">
      <h2>{title}</h2>
      <div className="tariff-grid">
        {plans.map((plan) => (
          <TariffCard key={plan.id} plan={plan} business={business} />
        ))}
      </div>
    </section>
  );
}

export function TariffCard({ plan, business }: { plan: Plan; business?: boolean; }) {
  const cardStyle = {
    "--tariff-card-gradient": planGradients[plan.code]
  } as CSSProperties;
  const activeInstructionLimit =
    business ? plan.instructions_per_department_limit ?? plan.active_instruction_limit : plan.active_instruction_limit;
  const features = [
		`Около ${plan.marketing_hours_hint.toLocaleString("ru-RU")} ч обработки за 30 дней`,
		`Кредитов: ${plan.monthly_credit_allowance.toLocaleString("ru-RU")}`,
    `Звонков в очереди без кредитов: ${formatPendingQueueLimit(plan.pending_credit_calls_limit)}`,
    `Активных инструкций: ${formatInstructionLimit(activeInstructionLimit)}`,
    business && plan.company_limit !== null ? `Компаний: ${plan.company_limit}` : "",
    business && plan.departments_per_company_limit !== null
      ? `Отделов на компанию: ${plan.departments_per_company_limit}`
      : "",
		business ? "Без ограничений по сотрудникам и пользователям" : "",
    `Уровень анализа: ${analysisLevelLabel(plan.analysis_level)}`,
    `Хранение истории: ${formatHistoryDays(plan.history_retention_days)}`,
    plan.export_enabled ? "Экспорт отчетов" : "",
    business && plan.team_analytics_enabled ? "Командная аналитика" : "",
		plan.api_access_enabled ? "API" : "",
		plan.webhooks_enabled ? "Webhooks" : ""
  ].filter(Boolean);

  return (
    <article className="tariff-card glass" style={cardStyle} data-reveal-item>
      <div className="tariff-card-head">
        <span className="status-chip warn">{plan.type === "personal" ? "Персональный" : "Бизнес"}</span>
        <h3>{plan.name}</h3>
				<div className="tariff-price">
					<strong>{(plan.monthly_price_minor / 100).toLocaleString("ru-RU")} ₽</strong>
					<span>/ 30 дней</span>
				</div>
      </div>
      <ul className="tariff-feature-list">
        {features.map((feature) => (
          <li key={feature}>
            <Check size={16} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button className="ghost-button wide" disabled>
        Скоро
      </button>
    </article>
  );
}

export function TariffSkeleton() {
  return (
    <>
      <section className="credit-usage-panel credit-usage-skeleton glass" aria-label="Загрузка использования кредитов">
        <div className="credit-skeleton-heading"><SkeletonLine className="button"/><div><SkeletonLine className="title"/><SkeletonLine/></div></div>
        <div className="credit-skeleton-summary"><div className="credit-skeleton-ring"/><div className="credit-skeleton-copy"><SkeletonLine className="title"/><SkeletonLine/><SkeletonLine className="button"/></div><div className="credit-skeleton-card"><SkeletonLine className="title"/><TextBlockSkeleton rows={3}/></div></div>
        <div className="credit-skeleton-toolbar"><SkeletonLine className="title"/><SkeletonLine className="button"/></div>
        <div className="credit-skeleton-heatmap">{Array.from({ length: 126 }).map((_, index)=><span key={index}/>)}</div>
        <div className="credit-skeleton-history"><SkeletonLine className="title"/><SkeletonLine className="title"/></div>
      </section>
      <section className="subscription-panel glass skeleton-card tariff-subscription-skeleton"><SkeletonLine className="title"/><TextBlockSkeleton rows={3}/></section>
      <section className="tariff-section">
        <h2>Персональные тарифы</h2>
        <div className="tariff-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="tariff-card glass skeleton-card" key={index}>
              <SkeletonLine className="button" />
              <SkeletonLine className="title" />
              <TextBlockSkeleton rows={5} />
              <SkeletonLine className="button" />
            </div>
          ))}
        </div>
      </section>
      <section className="tariff-section">
        <h2>Бизнес-тарифы</h2>
        <div className="tariff-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="tariff-card glass skeleton-card" key={index}>
              <SkeletonLine className="button" />
              <SkeletonLine className="title" />
              <TextBlockSkeleton rows={7} />
              <SkeletonLine className="button" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

const tariffsScrollKey = "verbatrace:tariffs-scroll-y";

function useTariffsScrollRestoration(loading: boolean) {
  const [restoreY] = useState(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type !== "reload") return null;
    const saved = Number(sessionStorage.getItem(tariffsScrollKey));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });

  useEffect(() => {
    const save = () => sessionStorage.setItem(tariffsScrollKey, String(Math.max(0, window.scrollY)));
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", save);
    };
  }, []);

  useLayoutEffect(() => {
    if (loading || restoreY === null) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [loading, restoreY]);
}
