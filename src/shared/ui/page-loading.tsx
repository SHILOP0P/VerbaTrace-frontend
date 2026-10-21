import type { AppPage } from "../../types";
import { AnalysisResultSkeleton, CallDetailSkeleton, CallListSkeleton, InstructionListSkeleton, SkeletonLine, TextBlockSkeleton } from "./loading";

/** Only the region waiting for a response is busy; its page controls stay mounted. */
export function DataLoading({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`data-loading ${className}`} role="status" aria-label={label} aria-busy="true"><div aria-hidden="true">{children}</div></div>;
}

export function RowsSkeleton({ kind, count = 4 }: { kind: "actions" | "quality" | "notifications" | "contacts" | "devices" | "reports" | "companies" | "invitations" | "members"; count?: number }) {
  return <DataLoading label="Загрузка списка" className={`loading-rows loading-rows-${kind}`}>
    {Array.from({ length: count }, (_, index) => <div className="loading-data-row" key={index}>
      {kind === "actions" || kind === "quality" ? <span className="skeleton-pill" /> : <span className="skeleton-circle" />}
      <div className="loading-row-copy"><SkeletonLine className="title" /><SkeletonLine className="short" />{kind === "devices" && <SkeletonLine className="tiny" />}</div>
      <div className="loading-row-meta"><SkeletonLine /><SkeletonLine className="short" /></div>
    </div>)}
  </DataLoading>;
}

export function MetricsSkeleton({ count = 4 }: { count?: number }) {
  return <DataLoading label="Загрузка показателей" className="loading-metrics"><div className="loading-metric-grid">{Array.from({ length: count }, (_, index) => <div className="loading-surface" key={index}><SkeletonLine className="short" /><SkeletonLine className="skeleton-metric-value" /><SkeletonLine className="tiny" /></div>)}</div></DataLoading>;
}

export function ChartSkeleton() {
  return <DataLoading label="Загрузка графика" className="loading-chart"><div className="loading-chart-bars">{[45, 70, 55, 85, 60, 75, 95, 65].map((height, index) => <span className={`skeleton-line loading-bar loading-bar-${height}`} key={index} />)}</div></DataLoading>;
}

export function TableSkeleton() {
  return <DataLoading label="Загрузка таблицы" className="loading-table"><div className="loading-table-head">{[0, 1, 2, 3].map(index => <SkeletonLine key={index} />)}</div>{[0, 1, 2, 3, 4].map(index => <div className="loading-table-row" key={index}><SkeletonLine /><SkeletonLine className="short" /><SkeletonLine className="short" /><SkeletonLine className="tiny" /></div>)}</DataLoading>;
}

export function FieldsSkeleton({ count = 3 }: { count?: number }) {
  return <DataLoading label="Загрузка настроек" className="loading-fields">{Array.from({ length: count }, (_, index) => <div className="loading-field" key={index}><SkeletonLine className="short" /><SkeletonLine className="loading-input" /></div>)}</DataLoading>;
}

export function AnalyticsSkeleton({ profile = false }: { profile?: boolean }) {
  return <div className="loading-stack">{profile && <div className="loading-surface loading-profile"><span className="skeleton-circle large" /><TextBlockSkeleton rows={2} /></div>}<MetricsSkeleton /><ChartSkeleton /><TableSkeleton /></div>;
}

export function ActionSkeleton() {
  return <DataLoading label="Загрузка действия"><div className="loading-stack"><div className="loading-surface"><SkeletonLine className="title" /><TextBlockSkeleton rows={2} /></div><div className="loading-two-columns"><div className="loading-surface"><h2>Основание задачи</h2><TextBlockSkeleton rows={5} /></div><div className="loading-surface"><h2>Статус задачи</h2><FieldsSkeleton count={2} /></div></div></div></DataLoading>;
}

export function TranscriptSkeleton({ compare = false }: { compare?: boolean }) {
  return <DataLoading label={compare ? "Загрузка версий транскрипции" : "Загрузка транскрипции"}><div className={compare ? "loading-two-columns" : "loading-stack"}>{Array.from({ length: compare ? 2 : 1 }, (_, index) => <div className="loading-surface" key={index}><SkeletonLine className="loading-audio" /><TextBlockSkeleton rows={10} /></div>)}</div></DataLoading>;
}

export function InstructionSkeleton() {
  return <div className="loading-two-columns"><div className="loading-surface"><h2>Документ</h2><TextBlockSkeleton rows={12} /></div><div className="loading-surface"><h2>Критерии</h2><TableSkeleton /></div></div>;
}

const titles: Record<AppPage, string> = {
  overview: "Обзор", teamAnalytics: "Аналитика", teamAnalyticsEmployee: "Аналитика сотрудника", calls: "Звонки", analysis: "AI-анализ", reports: "AI-отчеты", actions: "Действия", action: "Действие", qualityReviews: "Проверка качества", qualityReview: "Проверка качества", notifications: "Все уведомления", contacts: "Контакты", monitoring: "Мониторинг", admin: "Админ-панель", settings: "Настройки", settingsTariffs: "Тарифы", settingsIntegrations: "Интеграции и API", settingsCompanies: "Компании", companyCreate: "Создание компании", settingsInstructions: "Инструкции", instruction: "Инструкция", instructionHistory: "Применённая инструкция", instructionCreate: "Новая инструкция", settingsPrivacy: "Защита данных", settingsInvitations: "Приглашения", settingsNotifications: "Уведомления", profile: "Профиль", profileEdit: "Изменение профиля", profileDevices: "Устройства", upload: "Загрузка", transcriptionEdit: "Редактирование транскрипции", transcriptionCompare: "Сравнение версий"
};

/** Chunk loading is separate from API loading. Keep a route's shape while its code arrives. */
export function PageSkeleton({ page }: { page: AppPage }) {
  return <section className={`app-page page-loading page-loading-${page}`} aria-label={titles[page]} aria-busy="true"><header className="app-page-heading"><h1>{titles[page]}</h1></header><PageSkeletonContent page={page} /></section>;
}

function PageSkeletonContent({ page }: { page: AppPage }) {
  switch (page) {
    case "overview": return <><MetricsSkeleton count={6} /><div className="loading-two-columns"><ChartSkeleton /><ChartSkeleton /></div><RowsSkeleton kind="quality" count={3} /></>;
    case "teamAnalytics": return <AnalyticsSkeleton />;
    case "teamAnalyticsEmployee": return <AnalyticsSkeleton profile />;
    case "calls": return <div className="loading-call-columns"><div className="loading-surface"><CallListSkeleton count={6} /></div><div className="loading-surface"><CallDetailSkeleton /></div></div>;
    case "analysis": return <div className="loading-call-columns"><div className="loading-surface"><CallListSkeleton compact count={5} /></div><div className="loading-surface"><AnalysisResultSkeleton /></div></div>;
    case "reports": return <><MetricsSkeleton /><div className="loading-two-columns"><RowsSkeleton kind="reports" /><div className="loading-surface"><h2>Создать отчет</h2><FieldsSkeleton count={2} /></div></div></>;
    case "actions": return <RowsSkeleton kind="actions" count={6} />;
    case "action": return <ActionSkeleton />;
    case "qualityReviews": return <RowsSkeleton kind="quality" count={5} />;
    case "qualityReview": return <div className="loading-two-columns"><div className="loading-surface"><h2>Критерии оценки</h2><TableSkeleton /></div><div className="loading-surface"><h2>Транскрипция</h2><TextBlockSkeleton rows={9} /></div></div>;
    case "settingsInstructions": return <div className="loading-two-columns"><div className="loading-surface"><InstructionListSkeleton count={5} /></div><div className="loading-surface"><TextBlockSkeleton rows={8} /></div></div>;
    case "instruction": case "instructionHistory": return <InstructionSkeleton />;
    case "transcriptionCompare": return <TranscriptSkeleton compare />;
    case "transcriptionEdit": return <TranscriptSkeleton />;
    case "upload": return <div className="loading-two-columns"><div className="loading-surface loading-dropzone"><SkeletonLine className="title" /><SkeletonLine className="short" /></div><div className="loading-surface"><h2>Параметры загрузки</h2><FieldsSkeleton /></div></div>;
    case "settingsCompanies": return <RowsSkeleton kind="companies" count={3} />;
    case "settingsInvitations": return <RowsSkeleton kind="invitations" count={3} />;
    case "contacts": return <RowsSkeleton kind="contacts" />;
    case "notifications": return <RowsSkeleton kind="notifications" count={6} />;
    case "profileDevices": return <RowsSkeleton kind="devices" count={3} />;
    case "settingsTariffs": return <><div className="loading-surface loading-profile"><span className="loading-credit-ring skeleton-circle" /><div><h2>Использование кредитов</h2><TextBlockSkeleton rows={3} /></div></div><div className="loading-three-columns">{[0, 1, 2].map(index => <div className="loading-surface" key={index}><SkeletonLine className="title" /><TextBlockSkeleton rows={6} /><SkeletonLine className="button" /></div>)}</div></>;
    case "settingsIntegrations": return <div className="loading-two-columns"><div className="loading-surface"><h2>Приложения</h2><RowsSkeleton kind="companies" count={2} /></div><div className="loading-surface"><h2>API-ключи</h2><TableSkeleton /></div></div>;
    case "profile": return <><div className="loading-surface loading-profile"><span className="skeleton-circle large" /><TextBlockSkeleton rows={3} /></div><div className="loading-two-columns"><div className="loading-surface"><h2>Данные профиля</h2><FieldsSkeleton /></div><div className="loading-surface"><h2>Компании пользователя</h2><RowsSkeleton kind="companies" count={2} /></div></div></>;
    case "profileEdit": return <div className="loading-two-columns"><div className="loading-surface"><h2>Данные профиля</h2><FieldsSkeleton count={4} /></div><div className="loading-surface"><h2>Аватар</h2><span className="skeleton-circle large" /></div></div>;
    case "settingsPrivacy": return <div className="loading-two-columns"><div className="loading-surface"><h2>Политика защиты</h2><FieldsSkeleton count={5} /></div><div className="loading-surface"><h2>Доступ к записи</h2><FieldsSkeleton count={2} /></div></div>;
    case "settingsNotifications": return <div className="loading-surface"><TableSkeleton /></div>;
    case "monitoring": return <><MetricsSkeleton /><div className="loading-surface"><h2>Пайплайн обработки</h2><TableSkeleton /></div></>;
    case "admin": return <div className="loading-surface"><TableSkeleton /></div>;
    case "instructionCreate": return <div className="loading-surface loading-document"><FieldsSkeleton count={2} /><TextBlockSkeleton rows={8} /></div>;
    case "companyCreate": return <div className="loading-surface loading-document"><FieldsSkeleton count={3} /></div>;
    case "settings": return null;
  }
}

export function SessionLoading() {
  return <div className="session-loading" role="status" aria-label="Проверка сессии"><span className="session-loading-spinner" aria-hidden="true" /><span>Загрузка рабочего пространства…</span></div>;
}
