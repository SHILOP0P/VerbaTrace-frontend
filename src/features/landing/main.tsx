import React, { Component, lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../../api";
import type { SessionState } from "../../types";
import { AuthDialog, type AuthMode } from "../auth/AuthDialog";
import { ThemeToggle } from "../../shared/ui/theme-toggle";
import { ArrowUpRight, ArrowRight, ChevronDown, ShieldCheck, AudioLines, FileText, SlidersHorizontal, Layers3, X, Menu, Sun, Moon, PhoneCall, Building2, ListTodo, UsersRound, Link2, Quote } from "lucide-react";
import { fragments } from "./data";
import { CallExample } from "./CallExample";
import { Pricing, usePublicPlans, type PricingData } from "./Pricing";
import { useLandingTheme } from "./useLandingTheme";
import { ConnectionGraph, RoleExplorer, InstructionPlayground } from "./ProductObjects";
import { IntegrationsPage } from "./Integrations";
import { CapabilityExplorer } from "./Capabilities";
import { ProductDetails } from "./ProductDetails";
import { MotionSwitch, Disclosure } from "./Motion";
import { ScenePoster } from "./ScenePoster";
import { LegalPage, legalDocuments } from "./Legal";
import "@fontsource-variable/inter";
import "./style.css";

const home = "/";
const product = "/product";
const pricing = "/pricing";
const integrations = "/integrations";
const legalDocument = legalDocuments.find(document => document.path === location.pathname) ?? (location.pathname === "/legal.html" ? legalDocuments[0] : null);
const footerDocuments = [legalDocuments[0], legalDocuments[3], legalDocuments[4], legalDocuments[1], legalDocuments[2], legalDocuments[5]];
const page = legalDocument ? "legal" : location.pathname === "/integrations" || location.pathname === "/integrations.html" ? "integrations" : location.pathname === "/pricing" || location.pathname === "/pricing.html" ? "pricing" : location.pathname === "/product" || location.pathname === "/product.html" ? "product" : "home";

const sceneModule = page === "home" ? import("./Conversation") : null;
const Conversation = lazy(() => sceneModule ?? import("./Conversation"));

class SceneBoundary extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Sculpture({ selected, onSelect, reduced, theme, layers = false }: { selected: number; onSelect: (value: number) => void; reduced: boolean; theme: "light" | "dark"; layers?: boolean }) {
  const variant = layers ? "layers" : "ribbon";
  return <SceneBoundary fallback={<ScenePoster theme={theme} variant={variant} loading={false}/>}><Suspense fallback={<ScenePoster theme={theme} variant={variant}/>}><Conversation selected={selected} onSelect={onSelect} reducedMotion={reduced} theme={theme} variant={variant} priority={!layers} /></Suspense></SceneBoundary>;
}

function Wordmark() {
  return <a href={home} className="c-logo" aria-label="VerbaTrace — главная"><span className="c-logomark" aria-hidden="true"><i /><i /><i /><i /></span>VerbaTrace</a>;
}


function nextWorkspacePath() {
  try {
    const requested = new URLSearchParams(location.search).get("next");
    if (requested) {
      const url = new URL(requested, location.origin);
      if (url.origin === location.origin && url.pathname.startsWith("/app/")) return url.pathname + url.search + url.hash;
    }
  } catch { /* Fall back to the overview for an invalid return address. */ }
  return "/app/overview";
}

function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(() => location.pathname === "/register" ? "register" : location.pathname === "/login" ? "login" : location.pathname === "/reset-password" ? "reset" : null);
  useEffect(() => {
    let cancelled = false;
    api.refreshSession().then(({ user }) => {
      if (cancelled) return;
      setSession({ user });
      if (location.pathname === "/login" || location.pathname === "/register") location.replace(nextWorkspacePath());
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const openAuth = (event: React.MouseEvent<HTMLAnchorElement>, mode: AuthMode) => {
    if (session) return;
    event.preventDefault();
    setAuthMode(mode);
  };
  const closeAuth = () => {
    setAuthMode(null);
    if (["/login", "/register", "/reset-password"].includes(location.pathname)) history.replaceState({}, "", "/");
  };
  const authenticated = () => location.assign(nextWorkspacePath());
  const [selected, setSelected] = useState(1);
  const [layer, setLayer] = useState(0);
  const [menu, setMenu] = useState(false);
  const [systemReduced, setSystemReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const reduced = systemReduced;
  const { theme, toggleTheme } = useLandingTheme(reduced);
  const plans = usePublicPlans();
  useEffect(() => { if (legalDocument) document.title = `${legalDocument.title} — VerbaTrace`; }, []);
  useLayoutEffect(() => {
    if (page !== "home" || location.hash !== "#capabilities") return;
    let cancelled = false;
    const jump = () => document.getElementById("capabilities")?.scrollIntoView({ behavior: "instant", block: "start" });
    jump();
    void document.fonts.ready.then(() => { if (!cancelled) jump(); });
    return () => { cancelled = true; };
  }, []);
  const navigatePublicPage = (path: string) => {
    setMenu(false);
    const target = new URL(path, location.origin);
    if (target.pathname === location.pathname && target.hash === "#capabilities") {
      history.pushState({}, "", path);
      document.getElementById("capabilities")?.scrollIntoView({ behavior: "instant", block: "start" });
    } else if (target.pathname === location.pathname && !target.hash) {
      window.scrollTo({ top: 0, behavior: "instant" });
    } else location.assign(path);
  };

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { document.documentElement.dataset.landingMotion = reduced ? "reduce" : "full"; }, [reduced]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [menu]);

  return <div className="c-site vt-portal">
    <div className="c-ambient" aria-hidden="true" />
    <header className="c-header">
      <Wordmark />
      <nav className={menu ? "c-nav is-open" : "c-nav"} aria-label="Основная навигация">
        <button type="button" aria-current={page === "product" ? "page" : undefined} onClick={() => navigatePublicPage(product)}>Продукт</button>
        <button type="button" onClick={() => navigatePublicPage(home + "#capabilities")}>Возможности</button>
        <button type="button" aria-current={page === "pricing" ? "page" : undefined} onClick={() => navigatePublicPage(pricing)}>Тарифы</button>
        <button type="button" aria-current={page === "integrations" ? "page" : undefined} onClick={() => navigatePublicPage(integrations)}>Интеграции</button>
      </nav>
      <div className="c-header-actions">
        <ThemeToggle theme={theme} onClick={toggleTheme} />
        <a className="c-header-login" href={session ? "/app/overview" : "/login"} onClick={event => openAuth(event, "login")}>{session ? "Кабинет" : "Войти"}</a>
        <a className="c-button c-button-primary c-header-cta" href={session ? "/app/overview" : "/register"} onClick={event => openAuth(event, "register")}>{session ? "Продолжить работу" : "Начать работу"} <ArrowUpRight size={17} /></a>
        <button className="c-mobile-menu c-icon-button" aria-label={menu ? "Закрыть меню" : "Открыть меню"} aria-expanded={menu} onClick={() => setMenu(value => !value)}>{menu ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
    </header>

    <main>
      {page === "home" ? <>
        <section className="c-hero" aria-labelledby="hero-title">
          <div className="c-hero-copy">
            <span className="c-eyebrow"><AudioLines size={15} />Речевая аналитика для вашей команды</span>
            <h1 id="hero-title">Разбор<br />звонков<br /><span>и задачи</span></h1>
            <p>Проверяйте разговоры по своим требованиям<br />и назначайте задачи по итогам звонка.</p>
            <p className="c-hero-detail">VerbaTrace связывает запись, расшифровку, оценку и договорённости — в одном рабочем пространстве.</p>
            <div className="c-hero-actions"><a href="#example" className="c-button c-button-primary">Посмотреть пример <ArrowUpRight size={19} /></a><a href={product} className="c-button c-button-secondary">О продукте <ArrowRight size={17} /></a></div>
            <span className="c-hero-note"><ShieldCheck size={16} />Выводы можно проверить по цитатам из звонка</span>
          </div>
          <div className="c-hero-art">
            <div className="c-art-badge"><PhoneCall size={16} /><span>Наведите на фрагмент, чтобы увидеть цитату</span></div>
            <div className="c-scene"><Sculpture selected={selected} onSelect={setSelected} reduced={reduced} theme={theme} /></div>
            <div className="c-fragment-tabs" role="group" aria-label="Моменты разговора">{fragments.map((item, index) => <button key={item.time} aria-pressed={selected === index} onPointerEnter={event => { if (event.pointerType === "mouse") setSelected(index); }} onClick={() => setSelected(index)} onFocus={() => setSelected(index)}><span>{item.time}</span>{item.label}<ArrowUpRight size={14} /></button>)}</div>
            <MotionSwitch value={selected}><div className="c-fragment-card" aria-live="polite"><div><span>{fragments[selected].speaker}</span><Quote size={17} /></div><p>«{fragments[selected].quote}»</p><span className={"c-badge c-badge-" + fragments[selected].tone}>{fragments[selected].result}</span></div></MotionSwitch>
          </div>
        </section>
        <div className="c-trust-line"><span><FileText size={17} />Расшифровка с участниками</span><span><SlidersHorizontal size={17} />Оценка по вашим правилам</span><span><ShieldCheck size={17} />Проверка человеком</span><a href="#example" aria-label="Перейти к примеру звонка"><ChevronDown size={20} /></a></div>
        <ConnectionGraph />
        <section className="c-section c-example-section" id="example"><div className="c-section-heading"><div><span className="c-eyebrow">Пример анализа звонка</span><h2>Оценка с объяснением<br />и цитатой</h2></div><p>Выберите требование инструкции, посмотрите объяснение и раскройте цитату. Каждый вывод остаётся связан с разговором.</p></div><CallExample /></section>
        <section className="c-section c-process"><div className="c-process-layout">
          <div className="c-process-art"><Sculpture selected={layer} onSelect={setLayer} reduced={reduced} theme={theme} layers /></div>
          <div className="c-process-copy"><span className="c-eyebrow"><Layers3 size={16} />От голоса к действию</span><h2>Три этапа<br />работы со звонком</h2><p>Расшифровка сохраняет сказанное, анализ проверяет требования, а действия помогают выполнить договорённости. Каждый этап связан с исходным звонком.</p>
            <div className="c-process-steps" role="group" aria-label="Этапы разбора">{[{ title: "Сохранить сказанное", text: "Текст, участники и временные отметки.", icon: <FileText size={20} /> }, { title: "Понять результат", text: "Критерии, оценки и объяснения.", icon: <ShieldCheck size={20} /> }, { title: "Продолжить работу", text: "Договорённости, задачи и ответственные.", icon: <ListTodo size={20} /> }].map((item, index) => <button key={item.title} aria-pressed={layer === index} onClick={() => setLayer(index)}>{item.icon}<span><strong>{item.title}</strong><small>{item.text}</small></span><ChevronDown size={17} /></button>)}</div>
          </div>
        </div></section>
        <section className="c-section" id="capabilities"><div className="c-section-heading"><div><span className="c-eyebrow">Возможности продукта</span><h2>От расшифровки<br />до задач и аналитики</h2></div><a className="c-text-link" href={product}>Все возможности <ArrowUpRight size={18} /></a></div><CapabilityExplorer /></section>
        <InstructionPlayground />
        <RoleExplorer />
        <section className="c-section" id="pricing"><div className="c-section-heading"><div><span className="c-eyebrow">Для одного человека и всей команды</span><h2>Личные и бизнес-тарифы</h2></div><p>Личное пространство или компании и отделы. Выберите подходящий объём и инструменты.</p></div><Pricing data={plans} /></section>
        <FAQ />
      </> : legalDocument ? <LegalPage document={legalDocument} /> : page === "product" ? <ProductDetails /> : page === "integrations" ? <IntegrationsPage /> : <PricingPage data={plans} />}
      {page === "home" && <section className="c-final"><div><span className="c-eyebrow">Следующий шаг</span><h2>Загрузите звонок<br /><span>и посмотрите разбор</span></h2><p>Получите расшифровку и оценку по выбранной инструкции.</p></div><div><a href={session ? "/app/overview" : "/register"} onClick={event => openAuth(event, "register")} className="c-button c-button-primary">Перейти в VerbaTrace <ArrowUpRight size={19} /></a><a href={product} className="c-text-link">Сначала изучить продукт <ArrowRight size={17} /></a></div></section>}
    </main>
    <footer className="c-footer">
      <div className="c-footer-brand"><Wordmark /><p>Расшифровка, анализ и действия по звонкам</p><small>© {new Date().getFullYear()} VerbaTrace</small></div>
      <nav className="c-footer-product" aria-label="Дополнительные страницы"><span>Продукт</span><a href={product}>Возможности</a><a href={pricing}>Тарифы</a><a href={integrations}>Интеграции</a></nav>
      <nav className="c-footer-legal" aria-label="Документы и контакты"><span>Документы и контакты</span>{footerDocuments.map(document => <a href={document.path} key={document.path}>{document.label}</a>)}</nav>
    </footer>
    {authMode && <AuthDialog initialMode={authMode} onClose={closeAuth} onAuth={authenticated} />}
  </div>;
}

function FAQ() {
  return <section className="c-section c-faq"><div><span className="c-eyebrow">Ответы перед началом</span><h2>Частые вопросы</h2></div><div>{[
    ["Можно ли оценивать по своим правилам?", "Да, в VerbaTrace есть инструкции анализа и взвешенные критерии. Они позволяют описать требования вашего процесса и смотреть, какие из них выполнены в разговоре."],
    ["Что показано в примере звонка?", "Это демонстрационные данные из примера рабочего интерфейса VerbaTrace. Можно переключать требования и вопросы, раскрывать цитаты и менять статус примера задачи. Эти действия не изменяют данные вашего аккаунта."],
    ["Откуда цены и объёмы в тарифах?", "Условия на этой странице загружаются из действующего API VerbaTrace. Часы обработки — ориентир, а фактический расход учитывается в кредитах."],
    ["Как проверить автоматическую оценку?", "В разборе звонка доступны объяснения и цитаты. В продукте также предусмотрен пересмотр человеком. Это помогает уточнить вывод, сохранив исходный разговор."],
  ].map(([question, answer]) => <Disclosure key={question} title={question} icon={<ChevronDown size={18} />}>{answer}</Disclosure>)}</div></section>;
}

function PricingPage({ data }: { data: PricingData }) {
  return <><section className="c-page-hero c-pricing-hero"><a className="c-text-link" href={home}>Главная <ArrowRight size={16} /> Тарифы</a><span className="c-eyebrow">Нужный масштаб для работы</span><h1>Тарифы для себя<br />и для компании</h1><p>Сравните объём обработки и инструменты. Начните с личного пространства или организуйте работу компаний и отделов.</p></section><section className="c-section c-pricing-page"><Pricing data={data} full /></section><section className="c-section c-billing-notes"><div><span className="c-eyebrow">Как читать условия</span><h2>Объём и возможности</h2></div><div>{[["Как связаны часы и кредиты?","Часы в тарифе — ориентир. Расход учитывается в кредитах и зависит от длительности записи и анализа. Текущие условия и остаток доступны в приложении."],["Почему личные и бизнес-тарифы сравниваются отдельно?","Личный тариф относится к личному пространству. Бизнес-тариф определяет возможности компании, отделов и командной аналитики."],["Где проверить условия перед оплатой?","Цены и лимиты на этой странице загружаются из действующего API. Для выбора и изменения тарифа перейдите в приложение."]].map(([question,answer])=><Disclosure key={question} title={question} icon={<ChevronDown size={18}/>}>{answer}</Disclosure>)}</div></section></>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
