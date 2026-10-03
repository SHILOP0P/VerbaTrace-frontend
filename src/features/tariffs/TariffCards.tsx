import { Check, ShieldCheck } from "lucide-react";
import type { Plan } from "../../types";
import { analysisLevelLabel, formatHistoryDays, formatInstructionLimit, formatPendingQueueLimit } from "../../shared/lib/plans";
import { SkeletonLine, TextBlockSkeleton } from "../../shared/ui/loading";

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
      <div className="tariff-section-heading"><h2>{title}</h2><p>{business ? "Общий объём обработки и инструменты для компаний и отделов." : "Расшифровка и анализ для личного рабочего пространства."}</p></div>
      <div className="tariff-grid">
        {plans.map((plan) => (
          <TariffCard key={plan.id} plan={plan} business={business} />
        ))}
      </div>
    </section>
  );
}
export function TariffCard({ plan, business }: { plan: Plan; business?: boolean; }) {
  const activeInstructionLimit =
    business ? plan.instructions_per_department_limit ?? plan.active_instruction_limit : plan.active_instruction_limit;
  const features = [
    `Звонков в очереди без кредитов: ${formatPendingQueueLimit(plan.pending_credit_calls_limit)}`,
    `Активных инструкций: ${formatInstructionLimit(activeInstructionLimit)}`,
    business && plan.company_limit !== null ? `Компаний: ${plan.company_limit}` : "",
    business && plan.departments_per_company_limit !== null
      ? `Отделов на компанию: ${plan.departments_per_company_limit}`
      : "",
		business ? "Без ограничений по сотрудникам и пользователям" : "",
    `Хранение истории: ${formatHistoryDays(plan.history_retention_days)}`,
    plan.export_enabled ? "Экспорт отчетов" : "",
    business && plan.team_analytics_enabled ? "Командная аналитика" : "",
		plan.api_access_enabled ? "API" : "",
		plan.webhooks_enabled ? "Webhooks" : ""
  ].filter(Boolean);

  return (
    <article className={`tariff-card glass tariff-card-refined${plan.code.endsWith("_pro") ? " is-pro" : ""}`} data-plan={plan.code} data-reveal-item>
      <div className="tariff-card-head">
        <div className="tariff-card-label"><span>{plan.type === "personal" ? "Личное пространство" : "Команда и компании"}</span><span>{analysisLevelLabel(plan.analysis_level)}</span></div>
        <h3>{plan.name}</h3>
				<div className="tariff-price">
					<strong>{(plan.monthly_price_minor / 100).toLocaleString("ru-RU")} ₽</strong>
					<span>/ 30 дней</span>
				</div>
      </div>
      <div className="tariff-volume"><strong>≈ {plan.marketing_hours_hint.toLocaleString("ru-RU")} <span>ч</span></strong><span>обработки за 30 дней</span><small>{plan.monthly_credit_allowance.toLocaleString("ru-RU")} кредитов</small></div>
      <ul className="tariff-feature-list">
        {features.map((feature) => (
          <li key={feature}>
            <Check size={16} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <p className="tariff-card-activation"><ShieldCheck size={14} />Подключает администратор</p>
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
