import {
  BrainCircuit,
  Building2,
  FileBarChart2,
  LayoutDashboard,
  CloudUpload,
  PhoneCall,
  ListTodo,
  ShieldCheck,
  ClipboardCheck,
  BookOpenText
} from "lucide-react";
import { useEffect } from "react";
import type {
  AppPage,
  SessionState
} from "../types";

export const THEME_KEY = "verbatrace.theme.v1";

export type AppTheme = "light" | "dark";

export type ThemePreference = AppTheme | "system";

export type ThemeToggleEvent = React.MouseEvent<HTMLButtonElement>;

export type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void>; };
};

export function getSystemTheme(): AppTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  const storedTheme = localStorage.getItem(THEME_KEY);
  return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
}

export const pageRoutes: Record<AppPage, string> = {
  overview: "/app/overview",
  calls: "/app/calls",
  transcriptionEdit: "/app/calls/transcription-edit",
  transcriptionCompare: "/app/calls/transcription-compare",
  instructionHistory: "/app/calls/instruction-history",
  instructionCompare: "/app/instructions/compare",
  instruction: "/app/instructions",
  instructionCreate: "/app/instructions/new",
  qualityReviews: "/app/quality-reviews",
  qualityReview: "/app/quality-reviews/review",
  actions: "/app/actions",
  action: "/app/actions/action",
  notifications: "/app/notifications",
  companyCreate: "/app/companies/new",
  analysis: "/app/analysis",
  reports: "/app/reports",
  contacts: "/app/contacts",
  monitoring: "/app/admin/monitoring",
  settings: "/app/settings",
  settingsTariffs: "/app/settings/tariffs",
  settingsIntegrations: "/app/settings/integrations",
  settingsCompanies: "/app/settings/companies",
  settingsInstructions: "/app/instructions",
  settingsPrivacy: "/app/settings/privacy",
  settingsInvitations: "/app/settings/invitations",
  profile: "/app/profile",
  profileEdit: "/app/profile/edit",
  profileDevices: "/app/settings/devices",
  upload: "/app/upload",
  admin: "/app/admin"
};

export const navItems: Array<{ page: AppPage; label: string; }> = [
  { page: "overview", label: "Обзор" },
  { page: "calls", label: "Звонки" },
  { page: "analysis", label: "Аналитика" },
  { page: "reports", label: "AI-отчеты" },
  { page: "actions", label: "Действия" }
];

export const sidebarItems: Array<{ page: AppPage; label: string; icon: React.ReactNode; }> = [
  { page: "overview", label: "Обзор", icon: <LayoutDashboard size={19} /> },
  { page: "calls", label: "Звонки", icon: <PhoneCall size={19} /> },
  { page: "qualityReviews", label: "QA-проверка", icon: <ClipboardCheck size={19} /> },
  { page: "actions", label: "Действия", icon: <ListTodo size={19} /> },
  { page: "reports", label: "AI-отчеты", icon: <FileBarChart2 size={19} /> },
  { page: "settingsInstructions", label: "Инструкции", icon: <BookOpenText size={19} /> },
  { page: "settingsCompanies", label: "Компании", icon: <Building2 size={19} /> }
];

export const adminSidebarItem = { page: "admin" as const, label: "Админ-панель", icon: <ShieldCheck size={19} /> };

export const quickActionItems: Array<{ page: AppPage; label: string; icon: React.ReactNode; }> = [
  { page: "upload", label: "Загрузка", icon: <CloudUpload size={18} /> },
  { page: "analysis", label: "AI-анализ", icon: <BrainCircuit size={18} /> }
];

export const settingsRoutes: Array<{ page: AppPage; label: string; description: string; }> = [
  {
    page: "settingsTariffs",
    label: "Тарифы",
    description: "План, кредиты и условия команды."
  },
  {
    page: "settingsIntegrations",
    label: "Интеграции и API",
    description: "Тестовые и рабочие приложения, API-ключи внешних систем."
  },
  {
    page: "settingsCompanies",
    label: "Компании",
    description: "Организации, отделы, участники и роли доступа."
  },
  {
    page: "settingsInstructions",
    label: "Инструкции",
    description: "Правила и критерии для AI-анализа звонков."
  },
  {
    page: "settingsPrivacy",
    label: "Защита данных",
    description: "Русские смысловые маркеры, доступ к оригиналу и очищенные записи."
  },
  {
    page: "profileDevices",
    label: "Устройства",
    description: "Активные входы, завершение отдельных сеансов и выход со всех устройств."
  }
];

const pathAliases: Record<string, AppPage> = {
  "/app/tariffs": "settingsTariffs",
  "/app/companies": "settingsCompanies",
  "/app/instructions": "settingsInstructions",
  "/app/settings/instructions": "settingsInstructions",
  "/app/invitations": "settingsInvitations",
  "/app/settings/profile": "profile",
  "/app/settings/profile/edit": "profileEdit",
  "/app/profile/devices": "profileDevices",
  "/app/settings/devices": "profileDevices",
  "/app/devices": "profileDevices"
};

export function isSettingsPage(page: AppPage) {
  return page === "settings" || page.startsWith("settings");
}

export function readStoredSession(): SessionState | null {
  return null;
}

export function pageFromPath(pathname: string): AppPage {
  if (pathname === "/app/monitoring") return "monitoring";
  if (pathname === "/app/instructions") return "settingsInstructions";
  if (/^\/app\/actions\/[^/]+$/.test(pathname)) return "action";
  if (/^\/app\/calls\/[^/]+\/analyses\/[^/]+\/instructions\/[^/]+$/.test(pathname)) return "instructionHistory";
  if (pathname === "/app/instructions/new") return "instructionCreate";
  if (/^\/app\/instructions\/[^/]+\/compare$/.test(pathname)) return "instructionCompare";
  if (/^\/app\/instructions\/[^/]+$/.test(pathname)) return "instruction";
  if (/^\/app\/admin\/(?:users|companies|actions)$/.test(pathname)) return "admin";
  if (pathname === "/app/companies/new") return "companyCreate";
  if (/^\/app\/quality-reviews\/[^/]+$/.test(pathname)) return "qualityReview";
  if (pathname === "/app/calls/transcription-edit") return "transcriptionEdit";
  if (pathname === "/app/calls/transcription-compare") return "transcriptionCompare";
  if (/^\/app\/admin\/(?:users|companies)\/[^/]+$/.test(pathname)) return "admin";
  if (/^\/app\/settings\/companies\/[^/]+(?:\/departments\/[^/]+)?$/.test(pathname)) return "settingsCompanies";
  if (/^\/app\/companies\/[^/]+(?:\/departments\/[^/]+)?$/.test(pathname)) return "settingsCompanies";
  if (pathname === "/app/profile/edit") return "profileEdit";

  const entry = Object.entries(pageRoutes).find(([, route]) => route === pathname);
  if (entry) return entry[0] as AppPage;

  const alias = pathAliases[pathname];
  return alias ?? "overview";
}

export function companyIdFromPath(pathname: string) {
  const match = pathname.match(/^\/app\/(?:settings\/)?companies\/([^/]+)(?:\/departments\/[^/]+)?$/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function departmentIdFromPath(pathname: string) {
  const match = pathname.match(/^\/app\/(?:settings\/)?companies\/[^/]+\/departments\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function persistSession(session: SessionState | null) {
  void session;
}

export function useRevealOnScroll<T extends HTMLElement>() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll<T>("[data-reveal], [data-reveal-item]").forEach((target) => {
        target.classList.add("is-visible");
      });
      return;
    }

    document.documentElement.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.16
      }
    );

    const observed = new WeakSet<Element>();
    const observeTargets = () => {
      document.querySelectorAll<T>("[data-reveal], [data-reveal-item]").forEach((target) => {
        if (observed.has(target) || target.classList.contains("is-visible")) return;
        observed.add(target);
        observer.observe(target);
      });
    };

    observeTargets();

    const revealFallback = window.setTimeout(() => {
      if (document.querySelector("[data-reveal-item].is-visible")) return;
      document.querySelectorAll<T>("[data-reveal], [data-reveal-item]").forEach((target) => {
        target.classList.add("is-visible");
      });
    }, 900);

    const mutationObserver = new MutationObserver(observeTargets);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      window.clearTimeout(revealFallback);
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, []);
}
