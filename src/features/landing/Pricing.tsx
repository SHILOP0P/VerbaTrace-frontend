import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, Check, CheckCircle2, Info, RefreshCw, Building2, UserRound } from "lucide-react";
import type { Plan, PlanType } from "../../types";
import { comparePlans, formatHistoryDays, pluralizeRu } from "../../shared/lib/plans";

import { MotionSwitch } from "./Motion";

export function usePublicPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetch("/api/v1/plans", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Plans unavailable");
      const data = await response.json() as { plans?: Plan[] };
      if (!Array.isArray(data.plans)) throw new Error("Invalid plans response");
      if (!controller.signal.aborted) setPlans([...data.plans].sort(comparePlans));
    }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  return { plans, loading, error, reload: () => setRetry(value => value + 1) };
}

export type PricingData = ReturnType<typeof usePublicPlans>;
const number = (value: number) => value.toLocaleString("ru-RU");
const tierName = (plan: Plan) => plan.code.endsWith("_start") ? "Старт" : plan.code.endsWith("_plus") ? "Плюс" : "Про";

function PlanCard({ plan, index, features }: { plan: Plan; index: number; features: string[] }) {
  const card = useRef<HTMLElement>(null);
  const light = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, frame: 0, time: 0 });
  const stop = () => { cancelAnimationFrame(light.current.frame); light.current.frame = 0; };
  useEffect(() => stop, []);
  const position = (event: PointerEvent<HTMLElement>, entering = false) => {
    if (event.pointerType !== "mouse") return;
    const element = card.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const state = light.current;
    state.targetX = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left));
    state.targetY = Math.max(0, Math.min(bounds.height, event.clientY - bounds.top));
    const paint = () => {
      element.style.setProperty("--c-glow-x", `${state.x}px`);
      element.style.setProperty("--c-glow-y", `${state.y}px`);
    };
    if (entering || document.documentElement.dataset.landingMotion === "reduce") {
      stop(); state.x = state.targetX; state.y = state.targetY; paint();
    }
    element.dataset.pointerGlow = "true";
    if (state.frame || (state.x === state.targetX && state.y === state.targetY)) return;
    state.time = performance.now();
    const follow = (time: number) => {
      const alpha = 1 - Math.exp(-16 * Math.min((time - state.time) / 1000, .05));
      state.time = time;
      state.x += (state.targetX - state.x) * alpha;
      state.y += (state.targetY - state.y) * alpha;
      if (Math.abs(state.x - state.targetX) + Math.abs(state.y - state.targetY) < .15) {
        state.x = state.targetX; state.y = state.targetY; state.frame = 0; paint(); return;
      }
      paint(); state.frame = requestAnimationFrame(follow);
    };
    state.frame = requestAnimationFrame(follow);
  };
  return <article ref={card} className={`c-plan-card ${index === 1 ? "c-plan-featured" : ""}`} data-tier={plan.code.split("_").at(-1)} onPointerEnter={event => position(event, true)} onPointerMove={event => position(event)} onPointerLeave={() => { stop(); if (card.current) delete card.current.dataset.pointerGlow; }}>
    <div className="c-plan-top"><span>{plan.type === "personal" ? "Личное пространство" : "Команда и компании"}</span>{index === 1 && <span className="c-badge c-badge-accent">Больше возможностей</span>}</div>
    <h3>{tierName(plan)}</h3><div className="c-plan-price">{number(plan.monthly_price_minor / 100)} <span>₽<small>/ 30 дней</small></span></div>
    <div className="c-plan-volume"><strong>≈ {number(plan.marketing_hours_hint)} ч</strong><span>обработки за период</span><small>{number(plan.monthly_credit_allowance)} кредитов</small></div>
    <ul>{features.map(item => <li key={item}><Check size={16} /><span>{item}</span></li>)}</ul>
    <a className={`c-button ${index === 1 ? "c-button-primary" : "c-button-secondary"}`} href="/app/settings/tariffs">{plan.monthly_price_minor === 0 ? "Начать бесплатно" : "Открыть в приложении"}<ArrowUpRight size={17} /></a>
  </article>;
}

function PlanSelector({ plans, features }: { plans: Plan[]; features: (plan: Plan) => string[] }) {
  const [index, setIndex] = useState(1);
  const active = plans[index] ?? plans[0];
  if (!active) return <div className="c-empty-panel">Для этой категории пока нет доступных тарифов.</div>;
  return <div className="c-plan-selector">
    <div className="c-plan-options" role="group" aria-label="Выбор тарифа">{plans.map((plan, position) => <button key={plan.id} aria-pressed={active.id === plan.id} onClick={() => setIndex(position)}><span>0{position + 1}</span><div><strong>{tierName(plan)}</strong><small>≈ {number(plan.marketing_hours_hint)} ч обработки</small></div><b>{number(plan.monthly_price_minor / 100)} ₽<small>/ 30 дней</small></b></button>)}</div>
    <MotionSwitch value={active.id} className="c-plan-focus"><article><div className="c-plan-focus-heading"><span className="c-eyebrow">{active.type === "personal" ? "Личное пространство" : "Компании и отделы"}</span><h2>{tierName(active)}</h2><div className="c-plan-price">{number(active.monthly_price_minor / 100)} <span>₽<small>/ 30 дней</small></span></div></div><div className="c-plan-capacity"><span>Обработка за период</span><strong>≈ {number(active.marketing_hours_hint)} <small>ч</small></strong><div aria-hidden="true">{plans.map((plan, position) => <i key={plan.id} className={position <= plans.indexOf(active) ? "is-filled" : ""}/>)}</div><small>{number(active.monthly_credit_allowance)} кредитов</small></div><ul>{features(active).map(item => <li key={item}><Check size={17}/>{item}</li>)}</ul><a className="c-button c-button-primary" href="/app/settings/tariffs">{active.monthly_price_minor === 0 ? "Начать бесплатно" : "Выбрать в приложении"}<ArrowUpRight size={17}/></a></article></MotionSwitch>
  </div>;
}

export function Pricing({ data, full = false }: { data: PricingData; full?: boolean }) {
  const [type, setType] = useState<PlanType>("personal");
  const plans = data.plans.filter(plan => plan.type === type);
  const features = (plan: Plan) => [
    type === "business" ? `${plan.company_limit} ${plan.company_limit === 1 ? "компания" : "компании"} · до ${plan.departments_per_company_limit} отделов на компанию` : "Личное рабочее пространство",
    type === "business" ? `${plan.instructions_per_department_limit} ${pluralizeRu(plan.instructions_per_department_limit ?? 0,"инструкция","инструкции","инструкций")} на отдел` : `${plan.active_instruction_limit} ${pluralizeRu(plan.active_instruction_limit,"активная инструкция","активные инструкции","активных инструкций")}`,
    `История ${formatHistoryDays(plan.history_retention_days)}`,
    type === "business" && plan.team_analytics_enabled ? "Командная аналитика" : "",
    plan.export_enabled ? "Экспорт отчётов" : "",
    plan.api_access_enabled ? "Доступ к API" : "",
    plan.webhooks_enabled ? "Webhooks" : "",
  ].filter(Boolean);

  return <div className="c-pricing">
    <div className="c-pricing-toolbar"><div className="c-segmented" role="group" aria-label="Тип тарифа"><button aria-pressed={type === "personal"} onClick={() => setType("personal")}><UserRound size={17} />Для себя</button><button aria-pressed={type === "business"} onClick={() => setType("business")}><Building2 size={17} />Для команды</button></div><span>Оплата за 30 дней</span></div>
    <MotionSwitch value={type}>
    {data.error ? <div className="c-empty-panel" role="status"><Info size={22} /><h3>Тарифы сейчас недоступны</h3><p>Не удалось получить условия из сервиса. Попробуйте загрузить их снова.</p><button className="c-button c-button-secondary" onClick={data.reload}><RefreshCw size={16} />Повторить</button></div> : data.loading ? <div className="c-pricing-grid" aria-label="Загрузка тарифов" aria-busy="true">{[0, 1, 2].map(index => <div className="c-plan-card c-plan-skeleton" key={index}><i /><i /><i /></div>)}</div> : full ? <PlanSelector key={type} plans={plans} features={features}/> : <div className="c-pricing-grid">{plans.map((plan, index) => <PlanCard key={plan.id} plan={plan} index={index} features={features(plan)} />)}</div>}
    </MotionSwitch>
    <div className="c-pricing-footnote"><Info size={15} /><p>Объём в часах — ориентир. Расход зависит от длительности записи и анализа; учёт ведётся в кредитах. Условия загружаются из VerbaTrace.</p></div>
    {full && !data.loading && !data.error && <div className="c-comparison"><h2 key={type} className="c-heading-change">{type === "personal" ? "Возможности личных тарифов" : "Возможности бизнес-тарифов"}</h2><MotionSwitch value={type}><div className="c-table-scroll" tabIndex={0} role="region" aria-label="Сравнение тарифов"><table><thead><tr><th>Возможность</th>{plans.map(plan => <th key={plan.id}>{tierName(plan)}</th>)}</tr></thead><tbody>{[
      { name: "Кредиты за период", value: (plan: Plan) => number(plan.monthly_credit_allowance) },
      ...(type === "business" ? [{ name: "Компании", value: (plan: Plan) => plan.company_limit }, { name: "Отделы на компанию", value: (plan: Plan) => plan.departments_per_company_limit }] : []),
      { name: type === "business" ? "Инструкции на отдел" : "Активные инструкции", value: (plan: Plan) => type === "business" ? `${plan.instructions_per_department_limit} на отдел` : plan.active_instruction_limit },
      { name: "Хранение истории", value: (plan: Plan) => formatHistoryDays(plan.history_retention_days) },
      { name: "Экспорт отчётов", value: (plan: Plan) => plan.export_enabled },
      ...(type === "business" ? [{ name: "Командная аналитика", value: (plan: Plan) => plan.team_analytics_enabled }] : []),
      { name: "Доступ к API", value: (plan: Plan) => plan.api_access_enabled },
      { name: "Webhooks", value: (plan: Plan) => plan.webhooks_enabled },
    ].map(row => <tr key={row.name}><th scope="row">{row.name}</th>{plans.map(plan => { const value = row.value(plan); return <td key={plan.id}>{typeof value === "boolean" ? value ? <CheckCircle2 size={18} aria-label="Доступно" /> : <span aria-label="Недоступно">—</span> : value}</td>; })}</tr>)}</tbody></table></div></MotionSwitch></div>}
    {!full && <a className="c-text-link c-pricing-more" href="/pricing">Подробное сравнение тарифов <ArrowUpRight size={17} /></a>}
  </div>;
}
