import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  CloudUpload,
  FileText,
  LockKeyhole,
  Menu,
  Moon,
  Play,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  WandSparkles,
  X
} from "lucide-react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "../../api";
import type {
  Plan,
  SessionState
} from "../../types";

import { AppTheme, ThemeToggleEvent, useRevealOnScroll } from "../../app/runtime";
import { useDismissibleLayer, useEscapeDismiss } from "../../shared/ui/dismissible-layer";
import { normalTimelineSteps, statusMeta } from "../../shared/lib/call-status";
import { comparePlans } from "../../shared/lib/plans";
import { Logo } from "../../shared/ui/primitives";
import { TariffSection, TariffSkeleton } from "../tariffs/TariffsPage";
import { BrainIcon } from "./BrainIcon";

export function Landing({
  session,
  theme,
  onAuth,
  onGetStarted,
  onToggleTheme
}: {
  session: SessionState | null;
  theme: AppTheme;
  onAuth: (session: SessionState) => void;
  onGetStarted: () => void;
  onToggleTheme: (event: ThemeToggleEvent) => void;
}) {
  const [showAuth, setShowAuth] = useState<"login" | "register" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const benefitsRef = useRef<HTMLElement | null>(null);
  const workflowRef = useRef<HTMLElement | null>(null);
  const securityRef = useRef<HTMLElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  useRevealOnScroll<HTMLElement>();
  const themeLabel = theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  // The menu dismisses like every other layer in the application: a click
  // anywhere outside the header, or Escape. The whole header is the layer
  // because the burger lives in it and a click on the burger must toggle
  // rather than close and reopen.
  useDismissibleLayer(mobileMenuOpen, headerRef, () => setMobileMenuOpen(false));

  useEffect(() => {
    const sections = [benefitsRef.current, workflowRef.current].filter(Boolean) as HTMLElement[];
    if (!sections.length) return;

    let frame = 0;

    const updateEmblemGlow = () => {
      frame = 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, (viewportHeight - rect.top) / (viewportHeight + rect.height)));
        const shine = -36 + progress * 125;
        const light = 0.42 + Math.sin(progress * Math.PI) * 0.28;
        const bandY = viewportHeight * 0.34;
        const bandSoftness = 150;

        section.style.setProperty("--workflow-scroll-shine", `${shine.toFixed(2)}px`);
        section.style.setProperty("--workflow-scroll-light", light.toFixed(3));

        section.querySelectorAll<HTMLElement>(".landing-emblem, .workflow-emblem").forEach((target) => {
          const targetRect = target.getBoundingClientRect();
          const rawLocalY = bandY - targetRect.top;
          const localY = targetRect.height / 2 + (rawLocalY - targetRect.height / 2) * 0.55;
          const centerDistance = Math.abs(localY - targetRect.height / 2);
          const influence = Math.max(targetRect.height / 2 + bandSoftness, 1);
          const strength = Math.max(0, Math.min(1, 1 - centerDistance / influence));

          target.style.setProperty("--emblem-shine-local-y", `${localY.toFixed(2)}px`);
          target.style.setProperty("--emblem-shine-strength", strength.toFixed(3));
        });
      });
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateEmblemGlow);
    };

    updateEmblemGlow();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  useEffect(() => {
    const section = securityRef.current;
    if (!section) return;

    let frame = 0;
    const shineTargets = () => Array.from(section.querySelectorAll<HTMLElement>(".security-scroll-shine"));

    const updateSecurityShine = () => {
      frame = 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const bandY = viewportHeight * 0.34;
      const bandSoftness = 160;

      shineTargets().forEach((target) => {
        const rect = target.getBoundingClientRect();
        const rawLocalY = bandY - rect.top;
        const localY = rect.height / 2 + (rawLocalY - rect.height / 2) * 0.55;
        const centerDistance = Math.abs(localY - rect.height / 2);
        const influence = Math.max(rect.height / 2 + bandSoftness, 1);
        const strength = Math.max(0, Math.min(1, 1 - centerDistance / influence));

        target.style.setProperty("--security-shine-local-y", `${localY.toFixed(2)}px`);
        target.style.setProperty("--security-shine-strength", strength.toFixed(3));
      });
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateSecurityShine);
    };

    updateSecurityShine();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  function handleStart() {
    if (session) {
      onGetStarted();
      return;
    }

    setShowAuth("register");
  }

  return (
    <main className="landing">
      <div className="landing-bg" />
      <header className="landing-header" ref={headerRef}>
        <Logo />
        <nav className={mobileMenuOpen ? "mobile-open" : ""}>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Возможности</a>
          <a href="#workflow" onClick={() => setMobileMenuOpen(false)}>Как это работает</a>
          <a href="#security" onClick={() => setMobileMenuOpen(false)}>Безопасность</a>
          <a href="#tariffs" onClick={() => setMobileMenuOpen(false)}>Тарифы</a>
        </nav>
        <div className="landing-actions">
          <button
            className="icon-button landing-menu-toggle"
            type="button"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button className="icon-button theme-toggle" type="button" onClick={onToggleTheme} aria-label={themeLabel}>
            <Moon size={19} fill={theme === "dark" ? "currentColor" : "none"} />
          </button>
          <button className="ghost-button dark" onClick={session ? onGetStarted : () => setShowAuth("login")}>
            {session ? "В кабинет" : "Войти"}
          </button>
          <button className="primary-button" onClick={handleStart}>
            Приступить к работе
          </button>
        </div>
      </header>

      <section className="landing-hero" data-reveal>
        <div className="hero-copy" data-reveal-item>
          <h1>
            <span className="headline-main">Аналитика звонков</span>
            <span>без ручного прослушивания</span>
          </h1>
          <p>
            Загружайте звонки, получайте расшифровку, AI-анализ и статусы обработки.
            Управляйте командой, отделами и всей компанией в одном месте.
          </p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={handleStart}>
              Приступить к работе
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <ProductPreview compact={false} />
      </section>

      <section className="benefits" id="features" ref={benefitsRef} data-reveal>
        <div className="section-heading" data-reveal-item>
          <span>Возможности</span>
          <h2>Что можно делать в VerbaTrace</h2>
          <p>
            Рабочее пространство закрывает путь звонка от загрузки аудио до управленческого вывода:
            статусы, расшифровка, AI-анализ, инструкции и командный доступ собраны в одном интерфейсе.
          </p>
        </div>
        <div className="benefit-grid">
          <Benefit emblem="upload" title="Загрузка звонков" text="Добавляйте аудиофайлы и отслеживайте обработку по статусам." />
          <Benefit emblem="transcript" title="Расшифровка" text="Получайте текстовую расшифровку звонка после обработки." />
          <Benefit emblem="analysis" title="AI-анализ" text="Смотрите резюме, вопросы клиента, качество менеджера и следующие шаги." />
          <Benefit emblem="quality" title="Качество разговора" text="Находите риски, возражения, вопросы клиента и сильные места менеджера." />
        </div>
        <div className="landing-showcase-grid">
          <FeatureShowcase
            visual={<CompanyStructureEmblem />}
            title="Понятная структура компании"
            text="Компания, отделы и сотрудники связаны в одну схему: можно разделять звонки, инструкции и доступы по рабочему контексту."
          />
          <FeatureShowcase
            visual={<ExportReportEmblem />}
            title="Экспорт готовых материалов"
            text="После анализа можно выгружать отчеты с метаданными, расшифровкой и AI-выводами в удобный файл."
          />
        </div>
      </section>

      <section className="landing-section workflow-section" id="workflow" ref={workflowRef} data-reveal>
        <div className="section-heading" data-reveal-item>
          <span>Как это работает</span>
          <h2>Понятный цикл обработки звонка</h2>
          <p>
            Каждый звонок проходит одинаковый маршрут: файл принят, аудио обработано,
            расшифровка готова, затем появляется AI-анализ с рекомендациями.
          </p>
        </div>
        <div className="workflow-grid">
          <WorkflowStep emblem="upload" title="1. Загрузите аудио" text="Выберите файл, область видимости и инструкцию анализа для нужного отдела или компании." />
          <WorkflowStep emblem="process" title="2. Дождитесь обработки" text="Статусная линия показывает, где сейчас звонок: новый, в обработке, расшифрован или проанализирован." />
          <WorkflowStep emblem="document" title="3. Проверьте разговор" text="Откройте расшифровку по репликам, чтобы быстро найти важные вопросы и ответы." />
          <WorkflowStep emblem="brain" title="4. Используйте выводы" text="AI-анализ подсветит следующий шаг, риски, возражения и качество работы менеджера." />
        </div>
      </section>

      <section className="landing-section security-section" id="security" ref={securityRef} data-reveal>
        <article className="security-glass-card security-main-card" data-reveal-item>
          <div className="security-main-top">
            <SecurityShieldIllustration />
            <div className="security-main-content">
              <span className="security-kicker">
                <span className="security-kicker-emblem security-scroll-shine">
                  <ShieldCheck size={18} />
                </span>
                Безопасность
              </span>
              <h2>Доступы и данные под контролем команды</h2>
              <p>
                Интерфейс построен вокруг ролей, компаний, отделов и областей видимости звонков.
                Это помогает показывать записи только тем пользователям, которым они нужны для работы.
              </p>
            </div>
          </div>
          <div className="security-feature-dock">
            <SecurityItem icon={<LockKeyhole />} tone="coral" title="Авторизация" text="Доступ к кабинету после входа." />
            <SecurityItem icon={<Building2 />} tone="amber" title="Контекст компании" text="Звонки и инструкции по уровням доступа." />
            <SecurityItem icon={<ShieldCheck />} tone="violet" title="Тарифные ограничения" text="Доступ к экспорту, аналитике и API по тарифу." />
          </div>
        </article>
        <article className="security-glass-card security-access-card" data-reveal-item>
          <SalesGlassIllustration />
          <div className="security-access-copy">
            <span className="status-chip ok security-status-chip security-scroll-shine">
              <Check size={15} />
              Доступ настроен
            </span>
            <h3>Отдел продаж</h3>
            <p>Руководитель видит командные звонки, менеджер работает со своими записями и инструкциями.</p>
          </div>
          <div className="access-list">
            <AccessRow icon={<UsersRound size={22} />} label="Команда" value="Доступно" tone="green" />
            <AccessRow icon={<FileText size={22} />} label="Экспорт" value="По тарифу" tone="orange" />
            <AccessRow icon={<BriefcaseBusiness size={22} />} label="Компания" value="Подключена" tone="violet" />
          </div>
        </article>
      </section>

      <section className="landing-section tariff-preview-section" id="tariffs" data-reveal>
        <div className="section-heading" data-reveal-item>
          <span>Тарифы</span>
          <h2>Выберите объем под свою работу</h2>
          <p>
            В кабинете доступны персональные и бизнес-тарифы. Карточки показывают лимиты,
            срок действия, уровень анализа и доступность командных возможностей.
          </p>
        </div>
        <LandingTariffPreview />
      </section>

      {showAuth && (
        <AuthDialog
          initialMode={showAuth}
          onClose={() => setShowAuth(null)}
          onAuth={onAuth}
        />
      )}
    </main>
  );
}

export function AuthDialog({
  initialMode,
  onClose,
  onAuth
}: {
  initialMode: "login" | "register";
  onClose: () => void;
  onAuth: (session: SessionState) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("manager@test.com");
  const [password, setPassword] = useState("Qwerty123!");
  const [firstName, setFirstName] = useState("Иван");
  const [lastName, setLastName] = useState("Петров");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEscapeDismiss(!busy, onClose);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({
            email,
            password,
            full_name: firstName,
            full_surname: lastName,
            ...(username.trim() ? { username: username.trim() } : {})
          });

      onAuth({
        user: response.user
      });
    } catch (submitError) {
      const message =
        submitError instanceof ApiError
          ? `${submitError.message}${submitError.code ? ` (${submitError.code})` : ""}`
          : "Не удалось выполнить вход";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-layer"
      role="presentation"
      onPointerDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="auth-card" role="dialog" aria-modal="true" aria-label={mode === "login" ? "Вход" : "Регистрация"}>
        <button className="icon-button close" onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
        <Logo />
        <h2>{mode === "login" ? "Войти в VerbaTrace" : "Создать аккаунт"}</h2>
        <p>Войдите или зарегистрируйтесь, чтобы перейти к рабочему пространству.</p>

        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <div className="form-grid two">
              <label>
                Имя
                <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </label>
              <label>
                Фамилия
                <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </label>
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="@muxa"
                />
              </label>
            </div>
          )}

          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button wide" type="submit" disabled={busy}>
            {busy ? "Подключаем..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <button
          className="text-button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Нужна регистрация?" : "Уже есть аккаунт?"}
        </button>
      </div>
    </div>
  );
}

export function ProductPreview({ compact }: { compact: boolean; }) {
  return (
    <div className={`product-preview ${compact ? "compact" : ""}`} data-reveal-item>
      <div className="preview-title">Последний звонок</div>
      <div className="preview-overview">
        <div className="preview-selected-call">
          <span className="play-large">
            <Play size={22} fill="currentColor" />
          </span>
          <div>
            <span>Выбранный звонок</span>
            <strong>Обсуждение условий.mp3</strong>
            <small>21 мая 2025 · 18:47 · Отдел продаж</small>
          </div>
          <span className="status-chip ok">Анализ готов</span>
        </div>
        <div className="preview-timeline">
          {normalTimelineSteps.map((step) => (
            <div className={`preview-timeline-step ${step === "analyzed" ? "current" : "done"}`} key={step}>
              <span>
                {step === "new" && <CloudUpload size={15} />}
                {step === "processing" && <RefreshCw size={15} />}
                {step === "transcribed" && <FileText size={15} />}
                {step === "analyzed" && <Check size={15} />}
              </span>
              <strong>{statusMeta[step].label}</strong>
              <small>{step === "analyzed" ? "сейчас" : "готово"}</small>
            </div>
          ))}
        </div>
        <div className="preview-grid">
          <div>
            <div className="preview-card-title">
              <h3>Расшифровка</h3>
              <span className="status-chip ok">Готово</span>
            </div>
            <div className="preview-transcript">
              <p><strong>Спикер 1</strong> Нужно согласовать условия поставки и интеграцию.</p>
              <p><strong>Спикер 2</strong> Срок поставки 3-5 рабочих дней, API доступен.</p>
            </div>
          </div>
          <div>
            <div className="preview-card-title">
              <h3>AI-анализ</h3>
              <span className="status-chip ok">Анализ готов</span>
            </div>
            <div className="preview-analysis">
              <p><Check size={15} /> Общая оценка разговора: хорошо</p>
              <p><CircleAlert size={15} /> Риск: клиент ждет точный расчет</p>
              <p><ChevronRight size={15} /> Следующий шаг: отправить КП</p>
            </div>
          </div>
        </div>
        <div className="preview-next-step">
          <span>
            <WandSparkles size={17} />
          </span>
          <div>
            <strong>Следующий шаг</strong>
            <small>Подготовить коммерческое предложение по двум тарифам.</small>
          </div>
          <button className="ghost-button dark" type="button">Открыть</button>
        </div>
      </div>
    </div>
  );
}

type WorkflowEmblemVariant = "upload" | "process" | "document" | "brain";

export function WorkflowStep({ emblem, title, text }: { emblem: WorkflowEmblemVariant; title: string; text: string; }) {
  return (
    <div className="workflow-step" data-reveal-item>
      <WorkflowEmblem variant={emblem} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function WorkflowEmblem({ variant }: { variant: WorkflowEmblemVariant; }) {
  if (variant === "brain") {
    return (
      <span className="workflow-emblem brain" aria-hidden="true">
        <BrainIcon className="workflow-brain-icon" />
      </span>
    );
  }

  return (
    <span className={`workflow-emblem ${variant}`} aria-hidden="true">
      <svg viewBox="0 0 96 96" className="workflow-emblem-svg">
        {variant === "upload" && (
          <>
            <path className="workflow-emblem-cloud" d="M25 65c-9 0-16-7-16-16 0-8 5-15 12-17 4-12 14-20 27-20 15 0 26 10 29 24 7 2 12 8 12 16 0 8-7 13-15 13H25Z" />
            <path className="workflow-emblem-accent" d="M48 66V32m0 0 12 12M48 32 36 44" />
          </>
        )}
        {variant === "process" && (
          <>
            <path className="workflow-emblem-gear" d="M48 17l7 3 4-5 8 5-2 7 6 6 7-1 4 9-6 5v8l6 5-4 9-7-1-6 6 2 7-8 5-4-5-7 3-7-3-4 5-8-5 2-7-6-6-7 1-4-9 6-5v-8l-6-5 4-9 7 1 6-6-2-7 8-5 4 5 7-3Z" />
            <circle className="workflow-emblem-core" cx="48" cy="50" r="11" />
          </>
        )}
        {variant === "document" && (
          <>
            <rect className="workflow-emblem-document" x="28" y="18" width="40" height="60" rx="7" />
            <path className="workflow-emblem-line" d="M38 34h20M38 46h20M38 58h16" />
            <circle className="workflow-emblem-dot" cx="58" cy="58" r="2.4" />
          </>
        )}
      </svg>
    </span>
  );
}

export function SecurityItem({
  icon,
  tone,
  title,
  text
}: {
  icon: React.ReactNode;
  tone: "coral" | "amber" | "violet";
  title: string;
  text: string;
}) {
  return (
    <div className={`security-item ${tone}`}>
      <span className="security-scroll-shine">{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </div>
  );
}

export function AccessRow({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "orange" | "violet";
}) {
  return (
    <div className={`access-row ${tone}`}>
      <span className="access-icon-box security-scroll-shine">{icon}</span>
      <strong>{label}</strong>
      <em>{value}</em>
      <ChevronRight size={21} />
    </div>
  );
}

export function SecurityShieldIllustration() {
  const shieldPrefix = useId().replace(/:/g, "");
  const shieldBgGradientId = `${shieldPrefix}-shieldBgGradient`;
  const shieldAccentGradientId = `${shieldPrefix}-shieldAccentGradient`;
  const lockGradientId = `${shieldPrefix}-lockGradient`;
  const shieldGlowId = `${shieldPrefix}-shieldGlow`;

  return (
    <div className="security-shield-visual" aria-hidden="true">
      <svg viewBox="0 0 260 220" className="security-shield-svg">
        <defs>
          <linearGradient id={shieldBgGradientId} x1="70" y1="24" x2="190" y2="174" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.48)" />
            <stop offset="52%" stopColor="rgba(255,255,255,0.14)" />
            <stop offset="100%" stopColor="rgba(255,90,56,0.10)" />
          </linearGradient>

          <linearGradient id={shieldAccentGradientId} x1="72" y1="34" x2="188" y2="168" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--security-visual-coral-2)" />
            <stop offset="100%" stopColor="var(--security-visual-coral)" />
          </linearGradient>

          <linearGradient id={lockGradientId} x1="102" y1="86" x2="158" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ff9a72" />
            <stop offset="58%" stopColor="var(--security-visual-coral)" />
            <stop offset="100%" stopColor="#ef3f22" />
          </linearGradient>

          <filter id={shieldGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="var(--security-visual-coral)" floodOpacity="0.28" />
            <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="var(--security-visual-coral)" floodOpacity="0.16" />
          </filter>
        </defs>

        <g className="security-flat-shield">
          <ellipse className="security-flat-ring security-flat-ring-main" cx="130" cy="170" rx="78" ry="18" fill="none" stroke="var(--security-visual-ring)" strokeWidth="1.25" />
          <ellipse className="security-flat-ring security-flat-ring-soft" cx="130" cy="176" rx="58" ry="12" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="1" />
          <ellipse className="security-flat-shadow" cx="130" cy="184" rx="75" ry="12" fill="rgba(85, 45, 28, 0.13)" stroke="none" />

          <path
            className="security-flat-shield-bg"
            d="M130 28 L188 54 V105 C188 144 166 174 130 192 C94 174 72 144 72 105 V54 L130 28 Z"
            fill={`url(#${shieldBgGradientId})`}
            stroke="var(--security-visual-tile-border)"
            strokeWidth="1.4"
          />

          <path
            className="security-flat-shield-outline"
            d="M130 48 L172 67 V105 C172 133 156 157 130 172 C104 157 88 133 88 105 V67 L130 48 Z"
            fill="none"
            stroke={`url(#${shieldAccentGradientId})`}
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${shieldGlowId})`}
          />

          <path
            className="security-flat-shield-highlight"
            d="M93 68 L130 51 L166 68"
            fill="none"
            stroke="rgba(255,255,255,0.62)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <g className="security-flat-lock" transform="translate(0 -7)">
            <path d="M111 112 V96 C111 84 119 76 130 76 C141 76 149 84 149 96 V112" fill="none" stroke="var(--security-visual-coral-2)" strokeWidth="8" strokeLinecap="round" />
            <path d="M117 111 V98 C117 89 122 84 130 84 C138 84 143 89 143 98 V111" fill="none" stroke="rgba(255,255,255,0.56)" strokeWidth="2" strokeLinecap="round" />
            <rect x="104" y="107" width="52" height="46" rx="13" fill={`url(#${lockGradientId})`} stroke="rgba(255,255,255,0.36)" strokeWidth="1.1" />
            <path d="M118 119 H142" fill="none" stroke="rgba(255,255,255,0.54)" strokeWidth="2" strokeLinecap="round" />
            <path d="M130 128 a6 6 0 0 0-3 11 v9 h6 v-9 a6 6 0 0 0-3-11Z" fill="rgba(255,255,255,0.9)" stroke="none" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function SalesGlassIllustration() {
  const salesPrefix = useId().replace(/:/g, "");
  const panelGradientId = `${salesPrefix}-panelGradient`;
  const tileGradientId = `${salesPrefix}-tileGradient`;
  const greenGlowId = `${salesPrefix}-greenGlow`;

  return (
    <div className="sales-glass-visual" aria-hidden="true">
      <svg viewBox="0 0 360 230" className="sales-glass-svg">
        <defs>
          <linearGradient id={panelGradientId} x1="60" y1="40" x2="330" y2="150" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--security-visual-tile-inner)" />
            <stop offset="100%" stopColor="var(--security-visual-blue-soft)" />
          </linearGradient>

          <linearGradient id={tileGradientId} x1="150" y1="62" x2="262" y2="174" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(255,255,255,0.66)" />
            <stop offset="56%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="var(--security-visual-green-soft)" />
          </linearGradient>

          <filter id={greenGlowId} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="var(--security-visual-green)" floodOpacity="0.28" />
            <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="var(--security-visual-green)" floodOpacity="0.16" />
          </filter>
        </defs>

        <g className="sales-flat-scene">
          <g className="sales-flat-panel sales-flat-check-panel" transform="rotate(-3 114 84)">
            <rect x="58" y="46" width="112" height="76" rx="18" fill={`url(#${panelGradientId})`} stroke="var(--security-visual-blue)" strokeWidth="1.45" />
            <path d="M76 62 C98 56 128 56 151 64" fill="none" stroke="rgba(255,255,255,0.52)" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="82" cy="78" r="4.4" fill="none" stroke="var(--security-visual-green)" strokeWidth="2.2" />
            <path d="M98 78 H145" fill="none" stroke="var(--security-visual-green)" strokeWidth="3.4" strokeLinecap="round" />
            <circle cx="82" cy="98" r="4.4" fill="none" stroke="rgba(47,168,79,0.50)" strokeWidth="2.2" />
            <path d="M98 98 H138" fill="none" stroke="rgba(47,168,79,0.46)" strokeWidth="3.4" strokeLinecap="round" />
          </g>

          <g className="sales-flat-panel sales-flat-chart-panel" transform="rotate(3 290 84)">
            <rect x="238" y="42" width="104" height="84" rx="18" fill={`url(#${panelGradientId})`} stroke="var(--security-visual-blue)" strokeWidth="1.45" />
            <path d="M254 58 C276 52 304 52 326 60" fill="none" stroke="rgba(255,255,255,0.52)" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M260 104 V86" fill="none" stroke="rgba(47,168,79,0.42)" strokeWidth="6" strokeLinecap="round" />
            <path d="M282 104 V76" fill="none" stroke="rgba(47,168,79,0.52)" strokeWidth="6" strokeLinecap="round" />
            <path d="M304 104 V66" fill="none" stroke="rgba(47,168,79,0.60)" strokeWidth="6" strokeLinecap="round" />
            <path d="M326 104 V58" fill="none" stroke="var(--security-visual-green)" strokeWidth="6" strokeLinecap="round" />
          </g>

          <ellipse className="sales-flat-platform-shadow" cx="206" cy="188" rx="105" ry="20" fill="rgba(47, 82, 58, 0.12)" stroke="none" />
          <ellipse className="sales-flat-platform-main" cx="206" cy="176" rx="96" ry="24" fill="none" stroke="var(--sales-visual-ring)" strokeWidth="1.4" />
          <ellipse className="sales-flat-platform-inner" cx="206" cy="170" rx="70" ry="15" fill="none" stroke="rgba(47,168,79,0.28)" strokeWidth="1.2" />
          <ellipse className="sales-flat-platform-glow" cx="206" cy="168" rx="54" ry="11" fill="var(--security-visual-green-soft)" stroke="none" />

          <g className="sales-flat-headset-tile" filter={`url(#${greenGlowId})`}>
            <rect x="150" y="62" width="112" height="112" rx="30" fill={`url(#${tileGradientId})`} stroke="var(--security-visual-green)" strokeWidth="1.65" />
            <rect x="160" y="72" width="92" height="92" rx="24" fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="1.1" />
            <path d="M166 82 C184 70 226 70 246 84" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="1.7" strokeLinecap="round" />

            <path d="M178 122 C178 96 190 84 206 84 C222 84 234 96 234 122" fill="none" stroke="var(--security-visual-green)" strokeWidth="7" strokeLinecap="round" />
            <path d="M178 122 C178 96 190 84 206 84 C222 84 234 96 234 122" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="1.8" strokeLinecap="round" />

            <rect x="170" y="116" width="17" height="32" rx="8" fill="var(--security-visual-green-soft)" stroke="var(--security-visual-green)" strokeWidth="2.3" />
            <rect x="225" y="116" width="17" height="32" rx="8" fill="var(--security-visual-green-soft)" stroke="var(--security-visual-green)" strokeWidth="2.3" />

            <path d="M234 144 C229 155 220 160 208 160" fill="none" stroke="var(--security-visual-green)" strokeWidth="4.2" strokeLinecap="round" />
            <circle cx="204" cy="160" r="3.8" fill="var(--security-visual-green)" stroke="rgba(255,255,255,0.42)" strokeWidth="1" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function LandingTariffPreview() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить тарифы.");
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

  if (loading) {
    return <TariffSkeleton />;
  }

  if (error) {
    return <div className="form-error tariff-message">{error}</div>;
  }

  if (plans.length === 0) {
    return <div className="empty-panel glass">Тарифы пока не настроены.</div>;
  }

  return (
    <>
      <TariffSection title="Персональные тарифы" plans={personalPlans} />
      <TariffSection title="Бизнес-тарифы" plans={businessPlans} business />
    </>
  );
}

type EmblemVariant = "upload" | "transcript" | "analysis" | "quality";

export function Benefit({ emblem, title, text }: { emblem: EmblemVariant; title: string; text: string; }) {
  return (
    <div className="benefit" data-reveal-item>
      <LandingEmblem variant={emblem} />
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
    </div>
  );
}

export function FeatureShowcase({
  visual,
  title,
  text
}: {
  visual: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="landing-showcase-card" data-reveal-item>
      {visual}
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

export function LandingEmblem({ variant }: { variant: EmblemVariant; }) {
  return (
    <span className={`landing-emblem ${variant}`} aria-hidden="true">
      {variant === "upload" && (
      <svg viewBox="0 0 96 96" className="emblem-svg">
          <path className="emblem-halo" d="M21 58c0-18 11-31 28-31 13 0 22 7 26 18 9 2 15 9 15 19 0 12-9 21-22 21H31C18 85 8 76 8 64c0-10 5-18 13-21" />
          <path className="emblem-line upload-wave" pathLength="100" d="M10 65h28l5-13 9 27 8-22 5 8h21" />
          <path className="emblem-accent" d="M48 23v36m0-36 12 12M48 23 36 35" />
        </svg>
      )}
      {variant === "transcript" && (
        <svg viewBox="0 0 96 96" className="emblem-svg">
          <rect className="emblem-panel" x="18" y="14" width="60" height="68" rx="14" />
          <circle className="emblem-dot dot-one" cx="32" cy="35" r="5" />
          <path className="emblem-line" d="M44 32h20M44 40h28M30 55h31M30 67h22" />
          <path className="emblem-accent pulse-line" d="M25 24h22" />
        </svg>
      )}
      {variant === "analysis" && (
        <svg viewBox="0 0 96 96" className="emblem-svg analysis-emblem-svg">
          <defs>
            <linearGradient id="analysisRingGradient" x1="19" x2="76" y1="25" y2="75" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffbe85" />
              <stop offset="58%" stopColor="#ff8651" />
              <stop offset="100%" stopColor="#8f4931" />
            </linearGradient>
          </defs>
          <circle className="analysis-ring analysis-ring-main" cx="49" cy="50" r="28" />
          <path className="analysis-ring analysis-ring-glint" d="M24 48a27 27 0 0 1 18-22" />
          <circle className="analysis-wave-dot" cx="23" cy="60" r="2.9" />
          <g className="analysis-waveform">
            <path className="analysis-wavebar analysis-wavebar-one" d="M33 65V58" />
            <path className="analysis-wavebar analysis-wavebar-two" d="M41 65V52" />
            <path className="analysis-wavebar analysis-wavebar-three" d="M49 65V40" />
            <path className="analysis-wavebar analysis-wavebar-four" d="M57 65V52" />
            <path className="analysis-wavebar analysis-wavebar-five" d="M65 65V58" />
          </g>
          <path className="analysis-star analysis-star-core" d="M77 14l3 8.2 8.6 2.8-8.6 2.8L77 36l-3-8.4-8.6-2.8 8.6-2.8L77 14Z" />
          <path className="analysis-star analysis-star-shine" d="M77 10v4M77 36v5M61 25h5M88 25h5" />
          <g className="analysis-signal-dots">
            <circle cx="68" cy="76" r="1.7" />
            <circle cx="73" cy="71" r="1.4" />
            <circle cx="77" cy="67" r="1.1" />
          </g>
        </svg>
      )}
      {variant === "quality" && (
        <ConversationQualityIcon />
      )}
    </span>
  );
}

export function ConversationQualityIcon() {
  const greenNeedleMin = -12;
  const greenNeedleMax = 40;
  const greenNeedleRest = 14;
  const needleOrigin = { x: 48, y: 64 };
  const needleLength = 23.6;
  const iconRef = useRef<SVGSVGElement | null>(null);
  const [needleActive, setNeedleActive] = useState(false);
  const [needleAngle, setNeedleAngle] = useState(greenNeedleRest);
  const needleRadians = ((-45 + needleAngle) * Math.PI) / 180;
  const needleTip = {
    x: needleOrigin.x + Math.cos(needleRadians) * needleLength,
    y: needleOrigin.y + Math.sin(needleRadians) * needleLength
  };

  useEffect(() => {
    const icon = iconRef.current;
    if (!icon || needleActive) return;

    let activated = false;
    let frame = 0;
    let interval = 0;
    let observer: IntersectionObserver | null = null;

    const activate = () => {
      if (activated) return;
      activated = true;
      setNeedleActive(true);
      observer?.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("scroll", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
    };

    const checkVisibility = () => {
      const rect = icon.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < viewportHeight * 0.88 && rect.bottom > viewportHeight * 0.12) {
        activate();
      }
    };

    const scheduleCheck = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        checkVisibility();
      });
    };

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            activate();
          }
        },
        {
          rootMargin: "0px 0px -10% 0px",
          threshold: 0.28
        }
      );
      observer.observe(icon);
    }

    window.addEventListener("scroll", scheduleCheck, { passive: true });
    window.addEventListener("resize", scheduleCheck);
    interval = window.setInterval(checkVisibility, 180);
    checkVisibility();

    return () => {
      observer?.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("scroll", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [needleActive]);

  useEffect(() => {
    if (!needleActive) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNeedleAngle(greenNeedleRest);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const settleDuration = 470;
    const loopDuration = 9600;
    const centerAngle = (greenNeedleMin + greenNeedleMax) / 2;
    const angleRange = (greenNeedleMax - greenNeedleMin) / 2;
    const edgeSlowdown = 0.9;
    const easeOut = (value: number) => 1 - Math.pow(1 - value, 4);

    const step = (timestamp: number) => {
      const elapsed = timestamp - start;
      const settleProgress = Math.min(elapsed / settleDuration, 1);
      const loopProgress = ((Math.max(elapsed - settleDuration, 0) % loopDuration) / loopDuration) * Math.PI * 2;
      const pendulumPosition = Math.sin(loopProgress);
      const slowedEdgePosition = Math.sign(pendulumPosition)
        * (1 - Math.pow(1 - Math.abs(pendulumPosition), edgeSlowdown));
      const targetAngle = centerAngle + slowedEdgePosition * angleRange;
      const angle = greenNeedleRest + (targetAngle - greenNeedleRest) * easeOut(settleProgress);

      setNeedleAngle(angle);
      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [needleActive, greenNeedleMax, greenNeedleMin, greenNeedleRest]);

  return (
    <svg
      ref={iconRef}
      viewBox="0 0 96 96"
      className={`emblem-svg conversation-quality-icon${needleActive ? " is-needle-active" : ""}`}
    >
      <circle className="quality-icon-glow" cx="63" cy="42" r="29" />
      <path className="quality-track" d="M22 64a26 26 0 0 1 52 0" />
      <path className="quality-arc quality-arc-low" d="M22 64a26 26 0 0 1 12.6-22.2" />
      <path className="quality-arc quality-arc-mid" d="M39 39.2a26 26 0 0 1 18 0" />
      <path className="quality-arc quality-arc-high" d="M61.4 41.8A26 26 0 0 1 74 64" />
      <path className="quality-ticks" d="M27 59.5l-4.4-1.4M32.8 48.2l-3.3-3.2M48 42.2v-4.7M63.2 48.2l3.3-3.2M69 59.5l4.4-1.4" />
      <path className="quality-needle" d={`M${needleOrigin.x} ${needleOrigin.y}L${needleTip.x.toFixed(2)} ${needleTip.y.toFixed(2)}`} />
      <circle className="quality-center-dot" cx={needleOrigin.x} cy={needleOrigin.y} r="2.7" />
    </svg>
  );
}

export function CompanyStructureEmblem() {
  return (
    <div className="showcase-visual company-structure-emblem" aria-hidden="true">
      <svg viewBox="0 0 560 320">
        <defs>
          <linearGradient id="companyGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffd29c" />
            <stop offset="100%" stopColor="#ff5a2f" />
          </linearGradient>
        </defs>
        <path className="org-road" d="M116 224V238M68 238H164M68 238V248M164 238V248" />
        <path className="org-road" d="M280 224V238M232 238H328M232 238V248M328 238V248" />
        <path className="org-road" d="M444 224V238M396 238H492M396 238V248M492 238V248" />
        <path className="org-road" d="M116 160V138H280V104M280 160V104M444 160V138H280" />
        <path className="org-flow-path flow-delay-one" d="M68 248V238H116V224M116 160V138H280V104" />
        <path className="org-flow-path flow-delay-two" d="M164 248V238H116V224M116 160V138H280V104" />
        <path className="org-flow-path flow-delay-three" d="M232 248V238H280V224M280 160V104" />
        <path className="org-flow-path flow-delay-four" d="M328 248V238H280V224M280 160V104" />
        <path className="org-flow-path flow-delay-five" d="M396 248V238H444V224M444 160V138H280V104" />
        <path className="org-flow-path flow-delay-six" d="M492 248V238H444V224M444 160V138H280V104" />

        <g className="company-node" transform="translate(207 10)">
          <rect width="146" height="92" rx="22" />
          <g className="company-building" transform="translate(32 7)">
            <path d="M8 23h18v24H8zM32 8h22v39H32zM60 25h16v22H60z" />
            <path d="M15 33h4M15 41h4M40 19h5M40 29h5M40 39h5M67 35h4M67 42h4" />
          </g>
          <text className="org-label org-label-strong" x="73" y="82">Компания</text>
        </g>
        <g className="org-level-chip" transform="translate(246 118)">
          <rect width="68" height="22" rx="11" />
          <text className="org-level-label" x="34" y="15">Отделы</text>
        </g>

        {[
          { x: 58, label: "Продажи" },
          { x: 222, label: "Поддержка" },
          { x: 386, label: "Контроль" }
        ].map((department) => (
          <g className="org-department-card" key={department.label} transform={`translate(${department.x} 160)`}>
            <rect width="116" height="64" rx="14" />
            <circle cx="27" cy="21" r="9" />
            <circle cx="50" cy="21" r="7" />
            <path d="M67 16h25M67 29h20" />
            <text className="org-label" x="58" y="54">{department.label}</text>
          </g>
        ))}

        {[68, 164, 232, 328, 396, 492].map((x) => (
          <g className="org-employee-card" key={x} transform={`translate(${x - 23} 248)`}>
            <rect width="46" height="42" rx="12" />
            <circle cx="23" cy="17" r="7" />
            <path d="M13 32c4-8 16-8 20 0" />
          </g>
        ))}
        <text className="org-level-label" x="280" y="310">Пользователи</text>
      </svg>
    </div>
  );
}

export function ExportReportEmblem() {
  return (
    <div className="showcase-visual export-report-emblem" aria-hidden="true">
      <svg viewBox="0 0 460 320">
        <defs>
          <linearGradient id="reportGlow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffe1b6" />
            <stop offset="100%" stopColor="#ff6a32" />
          </linearGradient>
        </defs>
        <rect className="report-frame" x="18" y="14" width="420" height="292" rx="38" />
        <path className="report-sheet" d="M76 46h156l56 55v174H76z" />
        <path className="report-fold" d="M232 46v56h56" />
        <text className="report-title" x="118" y="92">Отчёт</text>
        <path className="report-chart chart-a" d="M140 126a38 38 0 1 0 38 43h-38z" />
        <path className="report-chart chart-b" d="M146 119v44h45a45 45 0 0 0-45-44z" />
        <path className="report-line" d="M116 205h104M116 230h132M116 255h86" />

        <g className="export-file-card export-file-one" transform="translate(306 70)">
          <rect width="86" height="42" rx="12" />
          <text x="43" y="27">XLSX</text>
        </g>
        <g className="export-file-card export-file-two" transform="translate(306 126)">
          <rect width="86" height="42" rx="12" />
          <text x="43" y="27">PDF</text>
        </g>
        <g className="export-file-card export-file-three" transform="translate(306 182)">
          <rect width="86" height="42" rx="12" />
          <text x="43" y="27">DOCX</text>
        </g>
        <g className="export-file-card export-file-four" transform="translate(306 238)">
          <rect width="86" height="42" rx="12" />
          <text x="43" y="27">MD</text>
        </g>
        <path className="export-road" d="M288 91h18M288 147h18M288 203h18M288 259h18" />
        <path className="export-flow" d="M288 147h18" />
        <circle className="download-orb" cx="421" cy="268" r="25" />
        <path className="download-arrow" d="M421 253v28m0 0-11-11m11 11 11-11" />
      </svg>
    </div>
  );
}
