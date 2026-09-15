import {
  Bell,
  Check,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Menu,
  Moon,
  Search,
  SearchCheck,
  CheckCheck,
  Settings,
  UsersRound,
  UserRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, openAuthorizedEventStream } from "../../api";
import type {
  AppPage,
  CallResponse,
	CompanyResponse,
	CreditDashboardResponse,
  NotificationResponse,
  SessionState,
  SearchResponse,
  Subscription,
  SubscriptionUsageResponse,
  AdminCapabilitiesResponse
} from "../../types";

import { adminSidebarItem, AppTheme, isSettingsPage, sidebarItems, ThemeToggleEvent } from "../../app/runtime";
import { Logo } from "../../shared/ui/primitives";
import { useDismissibleLayer } from "../../shared/ui/dismissible-layer";
import { CustomScrollbar } from "../../shared/ui/custom-scrollbar";
import { notificationPresentation } from "../../shared/ui/notification-presentation";
import { ToolButton } from "../assistant/AssistantControls";
import { AssistantWorkspace } from "../assistant/AssistantWorkspace";

const WORKSPACE_COMPANY_STORAGE_KEY = "verbatrace.activeWorkspaceCompanyId";
const PERSONAL_WORKSPACE_VALUE = "__personal__";
const MOBILE_NAV_PAGES: AppPage[] = ["overview", "calls", "actions", "reports"];

export function AuthenticatedShell({
  activePage,
  session,
  theme,
  calls,
  companies,
  personalSubscription,
  companySubscriptions,
  invitationCount,
  pendingInvitationIds,
  adminCapabilities,
  children,
  onNavigate,
  onOpenCall,
  onOpenCompany,
	onOpenNotification,
  onOpenLanding,
  onToggleTheme,
  onLogout
}: {
  activePage: AppPage;
  session: SessionState;
  theme: AppTheme;
  calls: CallResponse[];
  companies: CompanyResponse[];
  personalSubscription: Subscription | null;
  companySubscriptions: Record<string, Subscription | null>;
  invitationCount: number;
  pendingInvitationIds: string[];
  adminCapabilities: AdminCapabilitiesResponse | null;
  children: React.ReactNode;
  onNavigate: (page: AppPage) => void;
  onOpenCall: (callId: string) => void;
  onOpenCompany: (companyId: string) => void;
	onOpenNotification: (notification: NotificationResponse) => void;
  onOpenLanding: () => void;
  onToggleTheme: (event: ThemeToggleEvent) => void;
  onLogout: () => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen,setAssistantOpen]=useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => readStoredWorkspaceCompanyId() ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const notificationIdsRef = useRef(new Set<string>());
  const [notificationsBootstrapped, setNotificationsBootstrapped] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(invitationCount);
  const [personalUsage, setPersonalUsage] = useState<SubscriptionUsageResponse | null>(null);
	const [companyUsage, setCompanyUsage] = useState<Record<string, SubscriptionUsageResponse | null>>({});
	const [personalCredits, setPersonalCredits] = useState<CreditDashboardResponse | null>(null);
	const [companyCredits, setCompanyCredits] = useState<Record<string, CreditDashboardResponse | null>>({});
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [mobileTransitionDirection, setMobileTransitionDirection] = useState<"forward" | "backward" | null>(null);
  const teamPopoverRef = useRef<HTMLDivElement>(null);
  const searchPopoverRef = useRef<HTMLLabelElement>(null);
  const notificationPopoverRef = useRef<HTMLDivElement>(null);
  const notificationListRef = useRef<HTMLDivElement>(null);
  const deferUnreadUntilNextCloseRef = useRef(new Set<string>());
  const calendarPopoverRef = useRef<HTMLDivElement>(null);
  const profilePopoverRef = useRef<HTMLDivElement>(null);
  const themeLabel = theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  const activeSidebarPage = activePage === "transcriptionCompare" ? "calls" : activePage === "qualityReview" ? "qualityReviews" : activePage === "settingsCompanies" ? "settingsCompanies" : isSettingsPage(activePage) ? "settings" : activePage;
  const fullName = `${session.user.full_name} ${session.user.full_surname}`.trim();
  const avatarInitial = profileInitial(session.user.full_surname || session.user.full_name || session.user.username);
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const hasCompanies = companies.length > 0;
  const hasMultipleCompanies = companies.length > 1;
  const teamLabel = selectedCompany?.name ?? "Личный кабинет";
  const displayTimeZone = session.user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selectedCompanySubscription = selectedCompany?.id ? companySubscriptions[selectedCompany.id] : null;
  const recentNotifications = notifications.filter((notification) => isRecentNotification(notification.created_at));
  const recentUnreadNotifications = recentNotifications.filter((notification) => !notification.read_at).length;

  useEffect(() => { setAssistantOpen(false); }, [activePage]);

  function navigateFromMobileBar(nextPage: AppPage) {
    const currentMobilePage = isSettingsPage(activePage) ? "settings" : activePage;
    const currentIndex = MOBILE_NAV_PAGES.indexOf(currentMobilePage);
    const nextIndex = MOBILE_NAV_PAGES.indexOf(nextPage);

    setMobileTransitionDirection(
      currentIndex >= 0 && nextIndex >= 0 && currentIndex !== nextIndex
        ? nextIndex > currentIndex ? "forward" : "backward"
        : null
    );
    onNavigate(nextPage);
  }
  const selectedCompanyUsage = selectedCompany?.id ? companyUsage[selectedCompany.id] : undefined;
  const activeUsage = selectedCompany ? selectedCompanyUsage ?? null : personalUsage;
  const usageSubscription =
    activeUsage?.subscription.status === "active" && activeUsage.subscription.id
      ? activeUsage.subscription
      : null;
  const fallbackSubscription = selectedCompany
    ? selectedCompanySubscription?.status === "active"
      ? selectedCompanySubscription
      : null
    : personalSubscription?.status === "active"
      ? personalSubscription
      : null;
  const subscription = usageSubscription ?? fallbackSubscription;
	const usageLoading = Boolean(subscription) &&
		(selectedCompany ? companyCredits[selectedCompany.id] === undefined : personalCredits === null);
	const activeCredits = selectedCompany ? companyCredits[selectedCompany.id] ?? null : personalCredits;
	const creditLimit = activeCredits?.allowance_credits ?? 0;
	const creditRemainingPercent = Math.min(100, Math.max(0, Math.round(activeCredits?.allowance_remaining_percent ?? 0)));
	const progress = Math.min(
    100,
    Math.max(
      0,
      Math.round(
			activeCredits ? 100 - activeCredits.allowance_remaining_percent : 0
      )
    )
  );
  const hasSearchResults = Boolean(
    searchResults &&
      (searchResults.calls.length > 0 ||
        searchResults.companies.length > 0 ||
        searchResults.reports.length > 0 ||
        searchResults.instructions.length > 0)
  );

  useEffect(() => {
    if (!companies.length) {
      setSelectedCompanyId("");
      storeWorkspaceCompanyId("");
      setTeamOpen(false);
      return;
    }

    if (selectedCompanyId && !companies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId("");
      storeWorkspaceCompanyId("");
      persistPreferences({ active_company_uuid: null });
    }
  }, [companies, selectedCompanyId]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    function handleNotificationReadState(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; readAt?: string | null }>).detail;
      if (!detail?.id) return;
      setNotifications((current) => current.map((item) => item.id === detail.id ? { ...item, read_at: detail.readAt ?? null } : item));
      setUnreadNotifications((current) => Math.max(0, current + (detail.readAt ? -1 : 1)));
    }
    window.addEventListener("verbatrace:notification-read-state", handleNotificationReadState);
    return () => window.removeEventListener("verbatrace:notification-read-state", handleNotificationReadState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUsage() {
		const [loadedPersonalUsage, loadedCompanyUsage, loadedPersonalCredits, loadedCompanyCredits] = await Promise.all([
			api.getSubscriptionUsage().catch(() => null),
        Promise.all(
          companies.map(async (company) => [
            company.id,
            await api.getCompanySubscriptionUsage(company.id).catch(() => null)
          ] as const)
			),
			api.getCreditDashboard().catch(() => null),
			Promise.all(companies.map(async (company) => [company.id, await api.getCompanyCreditDashboard(company.id).catch(() => null)] as const))
		]);

      if (cancelled) return;
		setPersonalUsage((current) => loadedPersonalUsage ?? current);
		setPersonalCredits((current) => loadedPersonalCredits ?? current);
      setCompanyUsage((current) => {
        const next = { ...current };
        for (const [companyId, usage] of loadedCompanyUsage) {
          if (usage) next[companyId] = usage;
        }
        return next;
		});
		setCompanyCredits((current) => {
			const next = { ...current };
			for (const [companyId, credits] of loadedCompanyCredits) next[companyId] = credits;
			return next;
		});
    }

    loadUsage();
    return () => {
      cancelled = true;
    };
  }, [companies, calls.length, personalSubscription?.id, companySubscriptions]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferencesAndNotifications() {
      const [preferences, notificationResponse] = await Promise.all([
        api.getPreferences().catch(() => null),
        api.listNotifications({ limit: 8 }).catch(() => null)
      ]);

      if (cancelled) return;
      if (preferences) {
        const storedCompanyId = readStoredWorkspaceCompanyId();
        const preferenceCompanyId = preferences.active_company_uuid ?? "";
        const nextCompanyId = storedCompanyId ?? preferenceCompanyId;
        setSelectedCompanyId(nextCompanyId);
        if (storedCompanyId === null && preferenceCompanyId) {
          storeWorkspaceCompanyId(preferenceCompanyId);
        }
        if (storedCompanyId !== null && storedCompanyId !== preferenceCompanyId) {
          persistPreferences({ active_company_uuid: storedCompanyId || null });
        }
      }
      if (notificationResponse) {
        notificationIdsRef.current = new Set(notificationResponse.notifications.map((notification) => notification.id));
        setNotifications(notificationResponse.notifications);
        setUnreadNotifications(notificationResponse.unread_count);
      }
      setNotificationsBootstrapped(true);
    }

    loadPreferencesAndNotifications();
    return () => {
      cancelled = true;
    };
  }, [companies]);

  useEffect(() => {
    if (!notificationsBootstrapped) return;
    const source = openAuthorizedEventStream(api.notificationEventsUrl());
    const handleNotification = (event: Event) => {
      try {
        const notification = JSON.parse((event as MessageEvent<string>).data) as NotificationResponse;
        if (!notification.id || notificationIdsRef.current.has(notification.id)) return;
        notificationIdsRef.current.add(notification.id);
        setNotifications((current) => [notification, ...current].slice(0, 50));
        if (!notification.read_at) setUnreadNotifications((current) => current + 1);
        window.dispatchEvent(new CustomEvent("verbatrace:notification-received", { detail: notification }));
      } catch {
        // Ignore malformed events and keep the stream alive.
      }
    };
    source.addEventListener("notification", handleNotification);
    return () => source.close();
  }, [notificationsBootstrapped, session.user.id]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      api
        .search({ q: query, types: ["calls", "companies", "reports", "instructions"], limit: 5 })
        .then((response) => {
          if (!cancelled) setSearchResults(response);
        })
        .catch(() => {
          if (!cancelled) setSearchResults(null);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useDismissibleLayer(teamOpen, teamPopoverRef, () => setTeamOpen(false));
  useDismissibleLayer(searchOpen, searchPopoverRef, () => setSearchOpen(false));
  useDismissibleLayer(dateOpen, calendarPopoverRef, () => setDateOpen(false));
  useDismissibleLayer(notificationsOpen, notificationPopoverRef, closeNotifications);

  useEffect(() => {
    function handleNotificationRead(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; readAt?: string }>).detail;
      if (!detail?.id) return;
      setNotifications((current) => current.map((item) => item.id === detail.id
        ? { ...item, read_at: item.read_at ?? detail.readAt ?? new Date().toISOString() }
        : item));
      setUnreadNotifications((current) => Math.max(0, current - 1));
    }
    window.addEventListener("verbatrace:notification-read", handleNotificationRead);
    return () => window.removeEventListener("verbatrace:notification-read", handleNotificationRead);
  }, []);
  useDismissibleLayer(profileOpen, profilePopoverRef, () => setProfileOpen(false));

  function persistPreferences(next: {
    active_company_uuid?: string | null;
  }) {
    api.updatePreferences(next).catch(() => undefined);
  }

  function selectWorkspaceCompany(companyId: string) {
    setSelectedCompanyId(companyId);
    storeWorkspaceCompanyId(companyId);
    persistPreferences({ active_company_uuid: companyId || null });
  }

  function openNotification(notification: NotificationResponse) {
    api.markNotificationRead(notification.id).catch(() => undefined);
    setNotifications((current) =>
      current.map((item) => item.id === notification.id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item)
    );
    setUnreadNotifications((current) => Math.max(0, current - (notification.read_at ? 0 : 1)));
    closeNotifications();

	onOpenNotification(notification);
  }

  async function markAllNotificationsRead() {
    await api.markAllNotificationsRead().catch(() => undefined);
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read_at: notification.read_at ?? new Date().toISOString() }))
    );
    setUnreadNotifications(0);
    deferUnreadUntilNextCloseRef.current.clear();
    window.dispatchEvent(new CustomEvent("verbatrace:notifications-read-all", { detail: { readAt: new Date().toISOString() } }));
  }

  function closeNotifications() {
    if (notificationsOpen) {
      const deferred = deferUnreadUntilNextCloseRef.current;
      const notificationIds = recentNotifications.filter((notification) => !notification.read_at && !deferred.has(notification.id)).map((notification) => notification.id);
      deferUnreadUntilNextCloseRef.current = new Set<string>();
      if (notificationIds.length > 0) {
        const readAt = new Date().toISOString();
        void Promise.all(notificationIds.map(async (id) => {
          try { await api.markNotificationRead(id); return id; } catch { return null; }
        })).then((results) => {
          results.forEach((id) => { if (id) window.dispatchEvent(new CustomEvent("verbatrace:notification-read-state", { detail: { id, readAt } })); });
        });
      }
    }
    setNotificationsOpen(false);
  }

  async function toggleNotificationRead(notification: NotificationResponse) {
    const readAt = notification.read_at ? null : new Date().toISOString();
    if (readAt) deferUnreadUntilNextCloseRef.current.delete(notification.id); else deferUnreadUntilNextCloseRef.current.add(notification.id);
    window.dispatchEvent(new CustomEvent("verbatrace:notification-read-state", { detail: { id: notification.id, readAt } }));
    try { if (readAt) await api.markNotificationRead(notification.id); else await api.markNotificationUnread(notification.id); }
    catch {
      deferUnreadUntilNextCloseRef.current.delete(notification.id);
      window.dispatchEvent(new CustomEvent("verbatrace:notification-read-state", { detail: { id: notification.id, readAt: notification.read_at } }));
    }
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="app-header">
        <div className="app-header-left">
          <Logo onClick={onOpenLanding} />
          {hasCompanies && (
            <div className="header-popover-wrap" ref={teamPopoverRef}>
              <button
                className={`team-switcher ${teamOpen ? "active" : ""} ${!hasMultipleCompanies ? "single" : ""}`}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={teamOpen}
                onClick={() => setTeamOpen((open) => !open)}
              >
                <span>{teamLabel}</span>
                <ChevronDown size={15} />
              </button>
              {teamOpen && (
                <div className="header-popover team-popover" role="listbox">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!selectedCompany}
                    className={!selectedCompany ? "active" : ""}
                    onClick={() => {
                      selectWorkspaceCompany("");
                      setTeamOpen(false);
                    }}
                  >
                    <span>
                      <strong>Личный кабинет</strong>
                      <small>{personalSubscription?.plan.name ?? "Личный тариф не активирован"}</small>
                    </span>
                  </button>
                  {companies.map((company) => {
                    const companySubscription = companySubscriptions[company.id];
                    return (
                      <button
                        type="button"
                        key={company.id}
                        role="option"
                        aria-selected={company.id === selectedCompany?.id}
                        className={company.id === selectedCompany?.id ? "active" : ""}
                        onClick={() => {
                          selectWorkspaceCompany(company.id);
                          setTeamOpen(false);
                        }}
                      >
                        <span>
                          <strong>{company.name}</strong>
                          <small>{companySubscription?.plan.name ?? "Подписка не активна"}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="app-header-center">
          <label className="global-search header-popover-wrap" ref={searchPopoverRef}>
            <Search size={19} />
            <input
              value={searchQuery}
              placeholder="Поиск по звонкам, компаниям, отчетам, инструкциям..."
              aria-label="Глобальный поиск"
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
            />
            {searchOpen && (
              <div className="header-popover search-popover">
                <div className="popover-head">
                  <strong>Результаты</strong>
                </div>
                {searchQuery.trim().length < 2 ? (
                  <span className="popover-empty">Введите минимум 2 символа</span>
                ) : searchLoading ? (
                  <span className="popover-empty">Ищу...</span>
                ) : !hasSearchResults ? (
                  <span className="popover-empty">Ничего не найдено</span>
                ) : (
                  <>
                    {searchResults?.calls.map((call) => (
                      <button
                        type="button"
                        key={call.id}
                        onClick={() => {
                          setSearchOpen(false);
                          onOpenCall(call.id);
                        }}
                      >
                        <span>
                          <strong>{call.title}</strong>
                          <small>Звонок · {formatShortDate(call.created_at)}</small>
                        </span>
                      </button>
                    ))}
                    {searchResults?.companies.map((company) => (
                      <button
                        type="button"
                        key={company.id}
                        onClick={() => {
                          setSearchOpen(false);
                          onOpenCompany(company.id);
                        }}
                      >
                        <span>
                          <strong>{company.name}</strong>
                          <small>Компания</small>
                        </span>
                      </button>
                    ))}
                    {searchResults?.reports.map((report) => (
                      <button
                        type="button"
                        key={report.id}
                        onClick={() => {
                          setSearchOpen(false);
                          onNavigate("reports");
                        }}
                      >
                        <span>
                          <strong>{report.file_name}</strong>
                          <small>Отчет · {report.status}</small>
                        </span>
                      </button>
                    ))}
                    {searchResults?.instructions.map((instruction) => (
                      <button
                        type="button"
                        key={instruction.id}
                        onClick={() => {
                          setSearchOpen(false);
                          onNavigate("settingsInstructions");
                        }}
                      >
                        <span>
                          <strong>{instruction.title}</strong>
                          <small>Инструкция · {instruction.scope}</small>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </label>
          <div className="header-popover-wrap" ref={calendarPopoverRef}>
            <button
              className={`date-range-control ${dateOpen ? "active" : ""}`}
              type="button"
              aria-expanded={dateOpen}
              onClick={() => setDateOpen((open) => !open)}
            >
              <CalendarDays size={18} />
              {formatCurrentDate(currentTime, displayTimeZone)}
            </button>
            {dateOpen && (
              <div className="header-popover calendar-popover">
                <div className="popover-head">
                  <strong>Текущая дата</strong>
                  <button type="button" onClick={() => setDateOpen(false)} aria-label="Закрыть">
                    <X size={15} />
                  </button>
                </div>
                <p className="date-display-timezone">
                  <span>Часовой пояс</span>
                  <strong>{displayTimeZone}</strong>
                </p>
                <button
                  className="date-timezone-action"
                  type="button"
                  onClick={() => {
                    setDateOpen(false);
                    onNavigate("profileEdit");
                  }}
                >
                  Настроить часовой пояс
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="profile-block">
          <div className="header-popover-wrap" ref={notificationPopoverRef}>
            <button
              className={`icon-button notification-button ${notificationsOpen ? "active" : ""}`}
              aria-label="Уведомления"
              onClick={() => { if (notificationsOpen) closeNotifications(); else setNotificationsOpen(true); }}
            >
              <Bell size={19} />
              {recentUnreadNotifications > 0 && <span className="notification-badge">{recentUnreadNotifications}</span>}
            </button>
            {notificationsOpen && (
              <div ref={notificationListRef} className="header-popover notifications-popover custom-scroll-target">
                <div className="popover-head">
                  <button className="notification-history-link" type="button" onClick={() => { closeNotifications(); onNavigate("notifications"); }}>Уведомления<ChevronRight size={15}/></button>
                  <button type="button" onClick={markAllNotificationsRead} aria-label="Прочитать все">
                    <CheckCheck size={15} />
                  </button>
                </div>
                {recentNotifications.length === 0 ? (
                  <span className="popover-empty">За последние 24 часа событий нет</span>
                ) : (
                  recentNotifications.map((notification) => {
                    const presentation = notificationPresentation(notification);
                    const TypeIcon = presentation.icon;
                    return (
                    <article
                      key={notification.id}
                      className={`notification-popover-item notification-tone-${presentation.tone}${notification.read_at ? "" : " unread"}`}
                    >
                      <div className="notification-popover-headline"><span className="notification-type-icon" title={presentation.label} aria-label={presentation.label}><TypeIcon size={18}/></span><strong>{notification.title}</strong><button className={`notification-read-state${notification.read_at ? " is-read" : ""}`} type="button" title={notification.read_at ? "Пометить непрочитанным" : "Пометить прочитанным"} aria-label={notification.read_at ? "Пометить непрочитанным" : "Пометить прочитанным"} onClick={() => void toggleNotificationRead(notification)}>{notification.read_at ? <CheckCheck size={15}/> : <Check size={15}/>}</button></div>
                      <button className="notification-popover-open" type="button" onClick={() => openNotification(notification)}><span className="notification-content">
                        <small>{notification.body}</small>
                        <span className="notification-meta"><time>{formatNotificationTime(notification.created_at)}</time><em>{notificationActionLabel(notification, pendingInvitationIds)}<ChevronRight size={13}/></em></span>
                      </span></button>
                    </article>
                    );
                  })
                )}
              </div>
            )}
            {notificationsOpen && <CustomScrollbar targetRef={notificationListRef} className="notifications-scroll-thumb" />}
          </div>
          <ToolButton label="Поиск и помощник по звонкам" className={`icon-button assistant-header-launcher ${assistantOpen?"active":""}`} aria-expanded={assistantOpen} onClick={()=>setAssistantOpen(v=>!v)}><SearchCheck size={20}/></ToolButton>
          <button className="icon-button theme-toggle" type="button" onClick={onToggleTheme} aria-label={themeLabel}>
            <Moon size={19} fill={theme === "dark" ? "currentColor" : "none"} />
          </button>
          <div className="header-popover-wrap" ref={profilePopoverRef}>
            <button
              className="header-profile-link"
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-label="Открыть меню профиля"
              aria-expanded={profileOpen}
            >
              <span className="avatar" aria-hidden="true">{session.user.avatar_url ? <img src={session.user.avatar_url} alt="" /> : avatarInitial}</span>
              <strong>{fullName || "Пользователь"}</strong>
            </button>
            {profileOpen && (
              <div className="header-popover profile-popover">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate("profile");
                  }}
                >
                  <UserRound size={17} />
                  <strong>Профиль</strong>
                </button>
                <button type="button" onClick={() => { setProfileOpen(false); onNavigate("contacts"); }}>
                  <UsersRound size={17} />
                  <strong>Контакты</strong>
                </button>
                <button type="button" onClick={() => { setProfileOpen(false); onNavigate("settings"); }}>
                  <Settings size={17} />
                  <strong>Настройки</strong>
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                >
                  <LogOut size={17} />
                  <strong>Выйти</strong>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="workspace-frame">
        <aside className="app-sidebar" aria-label="Рабочие разделы">
          <div className="app-sidebar-menu">
            {[...sidebarItems, ...(adminCapabilities ? [adminSidebarItem] : [])].map((item) => (
                <button
                  key={item.page}
                  className={activeSidebarPage === item.page ? "active" : ""}
                  type="button"
                  onClick={() => { setAssistantOpen(false); onNavigate(item.page); }}
                >
                  <span>
                    {item.icon}
                    <span className="sidebar-label">{item.label}</span>
                  </span>
                  {item.page === "settings" && invitationCount > 0 && <small>{invitationCount}</small>}
                </button>
              ))}
          </div>
          <div className="app-sidebar-plan" aria-label="Тариф и лимиты">
            <button
              className="sidebar-plan-card"
              type="button"
              aria-label="Открыть тарифы"
              onClick={() => onNavigate("settingsTariffs")}
            >
              <small className="sidebar-plan-badge">{subscription?.plan.name ?? "Подключите тариф"}</small>
            </button>
            <div className="sidebar-limit-card">
				<span>Кредиты</span>
				<strong>
					{usageLoading
						? "Загрузка баланса"
						: creditLimit > 0
							? `${creditRemainingPercent}%`
							: "Нет активных кредитов"}
				</strong>
				{creditLimit > 0 && !usageLoading && <small>осталось</small>}
              <div className="sidebar-progress" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            <button
              className="sidebar-collapse"
              type="button"
              aria-label={sidebarCollapsed ? "Развернуть сайдбар" : "Свернуть сайдбар"}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
              <span>{sidebarCollapsed ? "Развернуть" : "Свернуть"}</span>
            </button>
          </div>
        </aside>
        <main className="workspace" data-mobile-transition={mobileTransitionDirection ?? undefined}>{children}</main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Основная навигация">
        {[...sidebarItems.slice(0, 4), { page: "settings" as AppPage, label: "Ещё", icon: <Menu size={19} /> }].map((item) => (
          <button
            key={item.page}
            className={activeSidebarPage === item.page || (item.page === "settings" && isSettingsPage(activePage)) ? "active" : ""}
            type="button"
            onClick={() => navigateFromMobileBar(item.page)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <AssistantWorkspace open={assistantOpen} setOpen={setAssistantOpen} companies={companies} companyId={selectedCompanyId} onOpenCall={onOpenCall} />
    </div>
  );
}

function notificationActionLabel(notification:NotificationResponse,pendingInvitationIds:string[]){if(notification.entity_type==="support_access_request")return notification.type==="support_access_requested"?"Проверить доступ":"Посмотреть решение";if(notification.entity_type==="action_external_sync")return notification.type==="action_external_sync_requested"?"Согласовать отправку":"Открыть задачу";if(notification.entity_type==="call_action"){if(notification.type==="action_assigned")return"Открыть задачу";if(notification.type==="action_reminder"||notification.type==="action_grace_started"||notification.type==="action_overdue")return"Проверить срок";return"Посмотреть задачу"}if(notification.type==="invitation")return notification.entity_uuid&&pendingInvitationIds.includes(notification.entity_uuid)?"Ответить на приглашение":"Приглашение обработано";if(notification.entity_type==="report")return"Открыть отчёт";if(notification.entity_type==="call")return"Открыть звонок";return"Посмотреть"}
function formatNotificationTime(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))return"";return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(date)}
function isRecentNotification(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() - 24 * 60 * 60 * 1000;
}

function profileInitial(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() : "П";
}

function readStoredWorkspaceCompanyId() {
  try {
    const value = window.localStorage.getItem(WORKSPACE_COMPANY_STORAGE_KEY);
    if (value === null) return null;
    return value === PERSONAL_WORKSPACE_VALUE ? "" : value;
  } catch {
    return null;
  }
}

function storeWorkspaceCompanyId(companyId: string) {
  try {
    window.localStorage.setItem(
      WORKSPACE_COMPANY_STORAGE_KEY,
      companyId || PERSONAL_WORKSPACE_VALUE
    );
  } catch {
    // Local persistence is best-effort; backend preferences are still updated separately.
  }
}

function totalMinutes(calls: CallResponse[]) {
  return Math.ceil(calls.reduce((sum, call) => sum + call.duration_seconds, 0) / 60);
}

function formatMinutes(minutes: number) {
  return `${minutes} мин`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatCurrentDate(value: Date, timeZone?: string) {
  const options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };

  try {
    return new Intl.DateTimeFormat("ru-RU", { ...options, timeZone }).format(value);
  } catch {
    return new Intl.DateTimeFormat("ru-RU", options).format(value);
  }
}
