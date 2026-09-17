import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Building2, CalendarClock, CheckCircle2, Headphones, ListTodo, RefreshCw, ScrollText, Search, ShieldCheck, Undo2, Users, X, XCircle } from "lucide-react";
import { api, ApiError, getAdminCallAudioBlob } from "../../api";
import { AuditTrailsPanel } from "./AuditTrailsPanel";
import { isVideoCall } from "../../shared/lib/media";
import { useEscapeDismiss } from "../../shared/ui/dismissible-layer";
import { SelectControl } from "../../shared/ui/primitives";
import { DateTimePicker } from "../../shared/ui/DateTimePicker";
import type {
  AppPage,
  AdminCapabilitiesResponse,
  AdminRestorableCompanyResponse,
  CallResponse,
  CallAction,
  CallActionAssignee,
  CompanyResponse,
  AdminSubscriptionResponse,
  Plan,
  UpdateAdminUserProfileRequest,
  UserResponse,
  UserSessionResponse
} from "../../types";

type AdminSection = "users" | "companies" | "actions" | "audit" | "restore";
type SubscriptionOwner = "users" | "companies";
type AdminDetailRoute = { section: AdminSection; id: string } | null;
type AdminAlert = { id: number; message: string; tone: "success" | "error" };
type AdminActionFilters = { status?: string; company_tag?: string; department?: string };

const adminAlertEvent = "verbatrace:admin-alert";

const has = (capabilities: AdminCapabilitiesResponse, permission: string) => capabilities.permissions.includes(permission);

function showAdminAlert(message: string, tone: AdminAlert["tone"] = "success") {
  window.dispatchEvent(new CustomEvent<AdminAlert>(adminAlertEvent, { detail: { id: Date.now(), message, tone } }));
}

function AdminAlertViewport() {
  const [alert, setAlert] = useState<AdminAlert | null>(null);
  useEffect(() => {
    const onAlert = (event: Event) => setAlert((event as CustomEvent<AdminAlert>).detail);
    window.addEventListener(adminAlertEvent, onAlert);
    return () => window.removeEventListener(adminAlertEvent, onAlert);
  }, []);
  useEffect(() => {
    if (!alert) return;
    const timeout = window.setTimeout(() => setAlert(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [alert]);
  if (!alert) return null;
  return <div className={`admin-alert ${alert.tone}`} role="status"><CheckCircle2 size={18} /><span>{alert.message}</span><button className="icon-button" type="button" aria-label="Закрыть уведомление" onClick={() => setAlert(null)}><X size={16} /></button></div>;
}

function adminDetailFromPath(pathname: string): AdminDetailRoute {
  const match = pathname.match(/^\/app\/admin\/(users|companies)\/([^/]+)$/);
  return match ? { section: match[1] as AdminSection, id: decodeURIComponent(match[2]) } : null;
}

function adminSectionFromPath(pathname: string): AdminSection | null {
  const match = pathname.match(/^\/app\/admin\/(users|companies|actions|audit|restore)$/);
  return match ? match[1] as AdminSection : null;
}

export function AdminPage({ capabilities, onNavigate }: { capabilities: AdminCapabilitiesResponse; onNavigate: (page: AppPage) => void }) {
  const availableSections = useMemo<AdminSection[]>(() => [
    ...(has(capabilities, "admin.users.read") ? ["users" as const] : []),
    ...(has(capabilities, "admin.companies.read") ? ["companies" as const] : [])
    , ...(has(capabilities, "admin.actions.read") ? ["actions" as const] : [])
    // The audit trails name no customer content, so panel access is the only
    // thing they need — everyone who can open this page can read them.
    , "audit" as const
    // The superadmin's own section. A company on its way to being erased is
    // filtered out of the company list, so the one-time rescue needs a place
    // of its own to be reachable from at all.
    , ...(capabilities.role === "superadmin" ? ["restore" as const] : [])
  ], [capabilities]);
  const [section, setSection] = useState<AdminSection>(() => adminSectionFromPath(window.location.pathname) ?? availableSections[0] ?? "users");
  const [query, setQuery] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [actionCompanyTag, setActionCompanyTag] = useState("");
  const [actionDepartment, setActionDepartment] = useState("");
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [companies, setCompanies] = useState<CompanyResponse[]>([]);
  const [actions, setActions] = useState<CallAction[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [actionsTotal, setActionsTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyResponse | null>(null);
  const [selectedAction, setSelectedAction] = useState<CallAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<Record<AdminSection, boolean>>({ users: false, companies: false, actions: false, audit: false, restore: false });
  const [notice, setNotice] = useState("");
  const [routeLoading, setRouteLoading] = useState(() => Boolean(adminDetailFromPath(window.location.pathname)));
  const requestSequence = useRef(0);

  const load = useCallback(async (nextSection: AdminSection, search: string, actionFilters: AdminActionFilters = {}) => {
    // The audit and restore panels keep their own state and load themselves;
    // this list is for the three searchable sections.
    if (nextSection === "audit" || nextSection === "restore") return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setNotice("");
    try {
      if (nextSection === "users") {
        const response = await api.listAdminUsers({ q: search.trim(), limit: 50, offset: 0 });
        if (requestId !== requestSequence.current) return;
        setUsers(response.items);
        setUsersTotal(response.total);
      } else if (nextSection === "companies") {
        const response = await api.listAdminCompanies({ q: search.trim(), limit: 50, offset: 0 });
        if (requestId !== requestSequence.current) return;
        setCompanies(response.items);
        setCompaniesTotal(response.total);
      } else {
        const response = await api.listAdminActions({ q: search.trim(), ...actionFilters, limit: 50, offset: 0 });
        if (requestId !== requestSequence.current) return;
        setActions(response.items);
        setActionsTotal(response.total);
      }
    } catch (error) {
      if (requestId === requestSequence.current) setNotice(message(error));
    } finally {
      if (requestId !== requestSequence.current) return;
      setLoaded((current) => ({ ...current, [nextSection]: true }));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!availableSections.includes(section)) setSection(availableSections[0] ?? "users");
  }, [availableSections, section]);

  useEffect(() => {
    void load(section, "");
  }, [load, section]);

  useEffect(() => {
    let cancelled = false;
    async function restoreDetailFromRoute() {
      const route = adminDetailFromPath(window.location.pathname);
      if (!route) {
        const routeSection = adminSectionFromPath(window.location.pathname);
        if (routeSection && availableSections.includes(routeSection)) setSection(routeSection);
        setSelectedUser(null);
        setSelectedCompany(null);
        setRouteLoading(false);
        return;
      }
      setRouteLoading(true);
      setNotice("");
      try {
        if (route.section === "users") {
          if (!has(capabilities, "admin.users.read")) return;
          const user = await api.getAdminUser(route.id);
          if (!cancelled) { setSection("users"); setSelectedCompany(null); setSelectedUser(user); }
        } else {
          if (!has(capabilities, "admin.companies.read")) return;
          const company = await api.getAdminCompany(route.id);
          if (!cancelled) { setSection("companies"); setSelectedUser(null); setSelectedCompany(company); }
        }
      } catch (error) {
        if (!cancelled) setNotice(message(error));
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }
    void restoreDetailFromRoute();
    window.addEventListener("popstate", restoreDetailFromRoute);
    return () => { cancelled = true; window.removeEventListener("popstate", restoreDetailFromRoute); };
  }, [availableSections, capabilities]);

  async function openUser(user: UserResponse) {
    setNotice("");
    try {
      setSelectedUser(await api.getAdminUser(user.id));
      window.history.pushState({}, "", `/app/admin/users/${encodeURIComponent(user.id)}`);
    } catch (error) {
      setNotice(message(error));
    }
  }

  async function openCompany(company: CompanyResponse) {
    setNotice("");
    try {
      setSelectedCompany(await api.getAdminCompany(company.id));
      window.history.pushState({}, "", `/app/admin/companies/${encodeURIComponent(company.id)}`);
    } catch (error) {
      setNotice(message(error));
    }
  }

  async function openAction(action: CallAction) {
    setNotice("");
    try { setSelectedAction(await api.getAdminAction(action.id)); } catch (error) { setNotice(message(error)); }
  }

  async function openActionScope(action: CallAction) {
    setNotice("");
    try {
      if (action.company_uuid) {
        setSelectedCompany(await api.getAdminCompany(action.company_uuid));
        window.history.pushState({}, "", `/app/admin/companies/${encodeURIComponent(action.company_uuid)}`);
      } else {
        setSelectedUser(await api.getAdminUser(action.assignee_user_uuid));
        window.history.pushState({}, "", `/app/admin/users/${encodeURIComponent(action.assignee_user_uuid)}`);
      }
    } catch (error) { setNotice(message(error)); }
  }

  function replaceAction(updated: CallAction) {
    setSelectedAction(updated);
    setActions((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  function replaceUser(updated: UserResponse) {
    setSelectedUser(updated);
    setUsers((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  function replaceCompany(updated: CompanyResponse) {
    setSelectedCompany(updated);
    setCompanies((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  function closeDetail(section: AdminSection) {
    setSelectedUser(null);
    setSelectedCompany(null);
    setSection(section);
    window.history.pushState({}, "", `/app/admin/${section}`);
  }

  function selectSection(nextSection: AdminSection) {
    setSection(nextSection);
    setSelectedUser(null);
    setSelectedCompany(null);
    window.history.pushState({}, "", `/app/admin/${nextSection}`);
  }

  function openMonitoring() {
    onNavigate("monitoring");
    window.history.replaceState({}, "", `/app/admin/monitoring?from=${encodeURIComponent(section)}`);
  }

  if (routeLoading) {
    return <><AdminAlertViewport /><section className="admin-page"><p className="admin-empty">Открываю карточку…</p></section></>;
  }
  if (selectedUser) {
    return <><AdminAlertViewport /><UserDetail user={selectedUser} capabilities={capabilities} onBack={() => closeDetail("users")} onUpdated={replaceUser} /></>;
  }
  if (selectedCompany) {
    return <><AdminAlertViewport /><CompanyDetail company={selectedCompany} capabilities={capabilities} onBack={() => closeDetail("companies")} onUpdated={replaceCompany} /></>;
  }
  if (selectedAction) {
    return <><AdminAlertViewport /><ActionAdminDetail action={selectedAction} canManage={has(capabilities, "admin.actions.manage")} onBack={() => setSelectedAction(null)} onUpdated={replaceAction} /></>;
  }

  return <><AdminAlertViewport /><section className="admin-page">
    <AdminHeading capabilities={capabilities} />
    <div className="admin-layout">
      <nav className="admin-nav" aria-label="Административные разделы">
        {has(capabilities, "admin.users.read") && <button className={section === "users" ? "active" : ""} type="button" onClick={() => selectSection("users")}><span><Users size={17} />Пользователи</span></button>}
        {has(capabilities, "admin.companies.read") && <button className={section === "companies" ? "active" : ""} type="button" onClick={() => selectSection("companies")}><span><Building2 size={17} />Компании</span></button>}
        {has(capabilities, "admin.actions.read") && <button className={section === "actions" ? "active" : ""} type="button" onClick={() => selectSection("actions")}><span><ListTodo size={17} />Действия</span></button>}
        {has(capabilities, "admin.monitoring.read") && <button type="button" onClick={openMonitoring}><span><Activity size={17} />Мониторинг</span></button>}
        <button className={section === "audit" ? "active" : ""} type="button" onClick={() => selectSection("audit")}><span><ScrollText size={17} />Журналы</span></button>
        {capabilities.role === "superadmin" && <button className={section === "restore" ? "active" : ""} type="button" onClick={() => selectSection("restore")}><span><Undo2 size={17} />Восстановление</span></button>}
      </nav>
      <div className="admin-content">
        {section === "audit" ? <AuditTrailsPanel /> : section === "restore" ? <CompanyRestoreQueue /> : <>
          <form className={`admin-toolbar${section === "actions" ? " admin-actions-toolbar" : ""}`} onSubmit={(event) => { event.preventDefault(); void load(section, query, { status: actionStatus || undefined, company_tag: actionCompanyTag.trim() || undefined, department: actionDepartment.trim() || undefined }); }}>
            <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "users" ? "Имя, @username или email" : section === "companies" ? "Название или тег компании" : "Действие, ответственный, компания или отдел"} /></label>
            {section === "actions" && <div className="admin-action-filter-fields"><SelectControl aria-label="Статус действия" value={actionStatus} onChange={(event) => setActionStatus(event.target.value)}><option value="">Все статусы</option><option value="open">Открыто</option><option value="in_progress">В работе</option><option value="completed">Выполнено</option><option value="cancelled">Отменено</option><option value="overdue">Просрочено</option></SelectControl><input aria-label="Тег компании" value={actionCompanyTag} onChange={(event) => setActionCompanyTag(event.target.value)} placeholder="Тег компании"/><input aria-label="Отдел" value={actionDepartment} onChange={(event) => setActionDepartment(event.target.value)} placeholder="Отдел"/></div>}
            <button className="ghost-button small" type="submit">Найти</button>
            <button className="icon-button" type="button" aria-label="Обновить" aria-busy={loading} disabled={loading} onClick={() => void load(section, query, { status: actionStatus || undefined, company_tag: actionCompanyTag.trim() || undefined, department: actionDepartment.trim() || undefined })}><RefreshCw className={loading ? "refresh-icon spinning" : "refresh-icon"} size={17} /></button>
          </form>
          <p className="admin-section-summary">{section === "users" ? `Пользователей: ${usersTotal}` : section === "companies" ? `Компаний: ${companiesTotal}` : `Действий: ${actionsTotal}`}</p>
          {notice && <p className="admin-notice" role="status">{notice}</p>}
          <div className="admin-results" aria-busy={loading}>
            {loading && !loaded[section] ? <p className="admin-empty">Загрузка данных…</p> : section === "users" ? <UsersTable users={users} onOpen={openUser} /> : section === "companies" ? <CompaniesTable companies={companies} onOpen={openCompany} /> : <ActionsTable actions={actions} onOpen={openAction} onOpenScope={openActionScope} />}
          </div>
        </>}
      </div>
    </div>
  </section></>;
}

function AdminHeading({ capabilities }: { capabilities: AdminCapabilitiesResponse }) {
  return <header className="admin-page-head app-page-heading settings-heading admin-heading"><span className="settings-heading-icon" aria-hidden="true"><ShieldCheck size={30} /></span><div><p className="eyebrow">ОПЕРАЦИОННАЯ ЗОНА</p><h1>Администрирование</h1></div><span className="admin-role-badge"><ShieldCheck size={15} />{roleLabel(capabilities.role)}</span></header>;
}

function UserDetail({ user, capabilities, onBack, onUpdated }: { user: UserResponse; capabilities: AdminCapabilitiesResponse; onBack: () => void; onUpdated: (user: UserResponse) => void }) {
  const [notice, setNotice] = useState("");
  const canEditProfile = has(capabilities, "admin.users.manage") && canTargetRole(capabilities.role, user.role);
  const canManageRole = canChangeRole(capabilities, user.role);
  return <section className="admin-page admin-user-page">
    <div className="settings-back-row"><button className="ghost-button small" type="button" onClick={onBack}><ArrowLeft size={16} />К пользователям</button></div>
    <header className="admin-page-head app-page-heading settings-heading admin-heading admin-profile-heading"><UserAvatar user={user} /><div><p className="eyebrow">КАРТОЧКА ПОЛЬЗОВАТЕЛЯ</p><h1>{fullName(user)}</h1><p>{user.username}</p><span className="chip admin-profile-role">{roleLabel(user.role)}</span></div></header>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="admin-profile-grid">
      <section className="admin-detail"><h2>Профиль</h2><UserFacts user={user} />
        {canEditProfile && <ProfileEditor user={user} onSaved={onUpdated} onNotice={setNotice} />}
        {canManageRole && <RoleEditor user={user} capabilities={capabilities} onSaved={onUpdated} onNotice={setNotice} />}
        {capabilities.role === "superadmin" && has(capabilities, "admin.subscriptions.manage") && <UsageResetPanel kind="users" id={user.id} />}
      </section>
      <section className="admin-detail"><h2>Доступ и безопасность</h2>
        {has(capabilities, "admin.sessions.read") && <SessionsPanel userId={user.id} canManage={has(capabilities, "admin.sessions.manage")} onNotice={setNotice} />}
        {has(capabilities, "admin.subscriptions.read") && <SubscriptionPanel kind="users" id={user.id} canManage={has(capabilities, "admin.subscriptions.manage")} />}
        {has(capabilities, "admin.calls.read") && <UserCallsPanel user={user} />}
      </section>
    </div>
  </section>;
}

function UserFacts({ user }: { user: UserResponse }) {
  return <dl><dt>Роль</dt><dd>{roleLabel(user.role)}</dd><dt>Имя пользователя</dt><dd>{user.username}</dd><dt>Профессиональное описание</dt><dd>{user.headline || "Не указано"}</dd><dt>Создан</dt><dd>{date(user.created_at)}</dd></dl>;
}

function ProfileEditor({ user, onSaved, onNotice }: { user: UserResponse; onSaved: (user: UserResponse) => void; onNotice: (notice: string) => void }) {
  const [values, setValues] = useState({ full_name: user.full_name, full_surname: user.full_surname, username: user.username, headline: user.headline ?? "", reason: "" });
  const [busy, setBusy] = useState(false);
  function setField(field: keyof typeof values, value: string) { setValues((current) => ({ ...current, [field]: value })); }
  async function save() {
    const changed: Partial<UpdateAdminUserProfileRequest> = {};
    (["full_name", "full_surname", "username", "headline"] as const).forEach((field) => {
      const value = values[field].trim();
      if (value && value !== (user[field] ?? "")) changed[field] = value;
    });
    if (!Object.keys(changed).length) return onNotice("Измените хотя бы одно поле профиля");
    if (!values.reason.trim()) return onNotice("Укажите причину изменения профиля");
    if (("full_name" in changed && !changed.full_name) || ("full_surname" in changed && !changed.full_surname)) return onNotice("Имя и фамилия не могут быть пустыми");
    setBusy(true);
    try {
      onSaved(await api.updateAdminUserProfile(user.id, { ...changed, reason: values.reason.trim() }));
      setValues((current) => ({ ...current, reason: "" }));
      onNotice("Профиль обновлён"); showAdminAlert("Профиль пользователя обновлён");
    } catch (error) {
      onNotice(error instanceof ApiError && error.code === "user_already_exists" ? "Этот username уже занят" : message(error));
    } finally { setBusy(false); }
  }
  return <div className="admin-action-block"><h3>Редактировать профиль</h3><div className="admin-form-grid">
    <label>Имя<input value={values.full_name} onChange={(event) => setField("full_name", event.target.value)} /></label><label>Фамилия<input value={values.full_surname} onChange={(event) => setField("full_surname", event.target.value)} /></label>
    <label>Username<input value={values.username} onChange={(event) => setField("username", event.target.value)} /></label><label>Профессиональное описание<input value={values.headline} onChange={(event) => setField("headline", event.target.value)} /></label>
  </div><label>Причина<textarea value={values.reason} onChange={(event) => setField("reason", event.target.value)} placeholder="Обязательна для аудита" /></label><button className="primary-button small" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Сохраняю…" : "Сохранить профиль"}</button></div>;
}

function RoleEditor({ user, capabilities, onSaved, onNotice }: { user: UserResponse; capabilities: AdminCapabilitiesResponse; onSaved: (user: UserResponse) => void; onNotice: (notice: string) => void }) {
  const options = availableRoleTargets(capabilities).filter((role) => role !== user.role);
  const [role, setRole] = useState(options[0] ?? "user");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!options.length) return null;
  async function save() {
    if (!reason.trim()) return onNotice("Укажите причину изменения роли");
    setBusy(true);
    try {
      onSaved(await api.changeAdminUserRole(user.id, { role, expected_role: user.role, reason: reason.trim() }));
      setReason(""); onNotice("Роль пользователя обновлена"); showAdminAlert("Роль пользователя обновлена");
    } catch (error) {
      if (error instanceof ApiError && error.code === "admin_user_role_changed") {
        try { onSaved(await api.getAdminUser(user.id)); } catch { /* The conflict message remains actionable even if reload fails. */ }
        onNotice("Роль изменилась в другой вкладке. Карточка обновлена.");
      } else onNotice(message(error));
    } finally { setBusy(false); }
  }
  return <div className="admin-action-block"><h3>Изменить роль</h3><label>Новая роль<SelectControl value={role} onChange={(event) => setRole(event.target.value)}>{options.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</SelectControl></label><label>Причина<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Обязательна для аудита" /></label><button className="primary-button small" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Сохраняю…" : "Сохранить роль"}</button></div>;
}

function SessionsPanel({ userId, canManage, onNotice }: { userId: string; canManage: boolean; onNotice: (notice: string) => void }) {
  const [sessions, setSessions] = useState<UserSessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [pending, setPending] = useState<{ id?: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; api.listAdminUserSessions(userId).then((result) => { if (alive) setSessions(result.sessions); }).catch((error) => { if (!alive) return; if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { setAvailable(false); return; } onNotice(message(error)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [userId]);
  async function revoke() {
    if (!pending || !reason.trim()) return onNotice("Укажите причину завершения сессии");
    setBusy(true);
    try {
      if (pending.id) await api.revokeAdminUserSession(userId, pending.id, reason.trim()); else await api.revokeAllAdminUserSessions(userId, reason.trim());
      setSessions((items) => pending.id ? items.filter((item) => item.id !== pending.id) : []);
      setPending(null); setReason(""); onNotice("Сессии пользователя завершены"); showAdminAlert("Сессии пользователя завершены");
    } catch (error) { onNotice(message(error)); } finally { setBusy(false); }
  }
  if (!available) return null;
  return <div className="admin-action-block"><h3>Сессии</h3>{loading ? <p className="admin-session-summary">Загрузка сессий…</p> : sessions.length ? <ul className="admin-sessions">{sessions.map((item) => <li key={item.id}><span><strong>{item.current ? "Текущая сессия" : "Сессия"}</strong><small>{item.user_agent || "Устройство не определено"} · {item.ip || "IP скрыт"}<br />{date(item.last_seen_at || item.created_at)}</small></span>{canManage && <button className="ghost-button small" type="button" onClick={() => setPending({ id: item.id, label: "Завершить сессию" })}>Завершить</button>}</li>)}</ul> : <p className="admin-session-summary">Активных сессий нет</p>}{canManage && sessions.length > 0 && <button className="admin-session-danger" type="button" onClick={() => setPending({ label: "Завершить все сессии" })}>Завершить все сессии</button>}{pending && <ReasonDialog title={pending.label} busy={busy} reason={reason} onReason={setReason} onCancel={() => setPending(null)} onConfirm={() => void revoke()} />}</div>;
}

function CompanyDetail({ company, capabilities, onBack, onUpdated }: { company: CompanyResponse; capabilities: AdminCapabilitiesResponse; onBack: () => void; onUpdated: (company: CompanyResponse) => void }) {
  const [notice, setNotice] = useState("");
  const canEditTag = has(capabilities, "admin.companies.manage") || capabilities.role === "admin" || capabilities.role === "superadmin";
  const [tag, setTag] = useState(company.tag ?? "");
  // Changing a customer's own data needs a reason: it lands in the audit trail
  // the customer can read, which is what protects them from arbitrary edits.
  const [tagReason, setTagReason] = useState("");
  const [tagReasonInvalid, setTagReasonInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const tagReasonRef = useRef<HTMLInputElement>(null);
  async function saveTag() {
    if (!tag.trim()) return setNotice("Введите тег компании");
    if (!tagReason.trim()) { setTagReasonInvalid(true); setNotice("Укажите причину: она обязательна для аудита."); tagReasonRef.current?.focus(); return; }
    setBusy(true);
    try { onUpdated(await api.updateAdminCompanyTag(company.id, tag, tagReason.trim()) as unknown as CompanyResponse); setTagReason(""); setNotice("Тег компании обновлён"); showAdminAlert("Тег компании обновлён"); } catch (error) { setNotice(message(error)); showAdminAlert(message(error), "error"); } finally { setBusy(false); }
  }
  return <section className="admin-page admin-user-page"><button className="text-button" type="button" onClick={onBack}>← К компаниям</button><header className="admin-page-head"><div><p className="eyebrow">КАРТОЧКА КОМПАНИИ</p><h1>{company.name}</h1><p>{company.tag || "Тег не задан"}</p></div></header>{notice && <p className="admin-notice" role="status">{notice}</p>}<div className="admin-profile-grid"><section className="admin-detail"><h2>Компания</h2><dl><dt>Тег</dt><dd>{company.tag || "Тег не задан"}</dd><dt>Создана</dt><dd>{date(company.created_at)}</dd></dl>{canEditTag && <div className="admin-action-block"><h3>Изменить тег</h3><p>Нужен временный доступ, одобренный компанией. Суперадмин действует без одобрения, но причина обязательна всегда.</p><label>Тег<input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="@verbatrace_team" /></label><label className={tagReasonInvalid ? "admin-required-field" : undefined}>Причина<input ref={tagReasonRef} aria-invalid={tagReasonInvalid} value={tagReason} onChange={(event) => { setTagReason(event.target.value); setTagReasonInvalid(false); }} placeholder="Обязательна для аудита" /></label><button className="primary-button small admin-action-button" type="button" disabled={busy} onClick={() => void saveTag()}>{busy ? "Сохраняю…" : "Сохранить тег"}</button></div>}{capabilities.role === "superadmin" && <CompanyRestorePanel companyId={company.id} />}{capabilities.role === "superadmin" && has(capabilities, "admin.subscriptions.manage") && <UsageResetPanel kind="companies" id={company.id} />}</section><section className="admin-detail">{has(capabilities, "admin.subscriptions.read") && <SubscriptionPanel kind="companies" id={company.id} canManage={has(capabilities, "admin.subscriptions.manage")} />}</section></div></section>;
}

/**
 * CompanyRestorePanel is the superadmin's last-chance rescue of a company that
 * is being deleted. It brings the company back to a freeze and gives nobody
 * access to its content, and it works once per company.
 */
function CompanyRestorePanel({ companyId, onRestored }: { companyId: string; onRestored?: () => void }) {
  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const reasonRef = useRef<HTMLInputElement>(null);
  async function restore() {
    if (!reason.trim()) { setReasonInvalid(true); setStatus("Укажите причину восстановления."); reasonRef.current?.focus(); return; }
    setBusy(true); setStatus("");
    try { const lifecycle = await api.restoreAdminCompany(companyId, reason.trim()); setReason(""); setStatus(`Компания возвращена в заморозку на 30 дней. Повторное восстановление недоступно: ${lifecycle.restore_used ? "уже использовано" : "доступно"}.`); showAdminAlert("Компания восстановлена"); onRestored?.(); } catch (error) { setStatus(message(error)); showAdminAlert(message(error), "error"); } finally { setBusy(false); }
  }
  return <div className="admin-action-block"><h3>Восстановить удаляемую компанию</h3><p>Возвращает компанию из мягкого удаления в заморозку ещё на 30 дней, без доступа к её содержимому. Доступно один раз на компанию.</p><label className={reasonInvalid ? "admin-required-field" : undefined}>Причина<input ref={reasonRef} aria-invalid={reasonInvalid} value={reason} onChange={(event) => { setReason(event.target.value); setReasonInvalid(false); }} placeholder="Обязательна для аудита" /></label>{status && <p className="admin-action-status" role="status">{status}</p>}<button className="ghost-button small admin-action-button" type="button" disabled={busy} onClick={() => void restore()}>{busy ? "Восстанавливаю…" : "Восстановить компанию"}</button></div>;
}

/**
 * CompanyRestoreQueue is the superadmin's own section: the companies on their
 * way to being erased. They are filtered out of the company list — that is what
 * deleted means there — so before this the rescue on the company card could not
 * be reached for any company that actually needed it.
 */
function CompanyRestoreQueue() {
  const [companies, setCompanies] = useState<AdminRestorableCompanyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const response = await api.listRestorableAdminCompanies();
      setCompanies(response.items);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <>
    <div className="admin-toolbar">
      <p className="admin-restore-intro">Компании в мягком удалении, которые ещё можно вернуть. После срока очистки компания удаляется полностью и из этого списка исчезает.</p>
      <button className="icon-button" type="button" aria-label="Обновить" aria-busy={loading} disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "refresh-icon spinning" : "refresh-icon"} size={17} /></button>
    </div>
    <p className="admin-section-summary">Компаний к восстановлению: {companies.length}</p>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="admin-results" aria-busy={loading}>
      {loading ? <p className="admin-empty">Загрузка списка…</p>
        : companies.length === 0 ? <p className="admin-empty">Удаляемых компаний нет.</p>
          : <div className="admin-restore-list">
            {companies.map((company) => <article className="admin-detail admin-restore-card" key={company.company_uuid}>
              <h2>{company.name}</h2>
              <dl>
                <dt>Тег</dt>
                <dd>{normalizeTag(company.tag)}</dd>
                <dt>Удаление начато</dt>
                <dd>{date(company.soft_deleted_at)}</dd>
                <dt>Очистка после</dt>
                <dd>{company.purge_after ? date(company.purge_after) : "срок не задан"}</dd>
              </dl>
              <CompanyRestorePanel companyId={company.company_uuid} onRestored={() => void load()} />
            </article>)}
          </div>}
    </div>
  </>;
}

function SubscriptionPanel({ kind, id, canManage }: { kind: SubscriptionOwner; id: string; canManage: boolean }) {
  const [subscription, setSubscription] = useState<AdminSubscriptionResponse | null>(null);
  const [status, setStatus] = useState("Загрузка…");
  const [available, setAvailable] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planCode, setPlanCode] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set when the new plan covers fewer companies than the owner has: the
  // administrator picks which ones stay active before anything changes.
  const [selection, setSelection] = useState<{ companyIds: string[]; limit: number; chosen: string[] } | null>(null);
  // Choosing between three raw uuids is not a choice, so the names are looked up.
  const [selectionNames, setSelectionNames] = useState<Record<string, string>>({});
  const reasonRef = useRef<HTMLInputElement>(null);
  useEffect(() => { let alive = true; Promise.all([api.getAdminSubscription(kind, id), api.listPlans()]).then(([current, allPlans]) => { if (!alive) return; setSubscription(current); setStatus(""); const allowed = allPlans.plans.filter((plan) => plan.type === (kind === "users" ? "personal" : "business")); setPlans(allowed); setPlanCode(allowed[0]?.code ?? ""); }).catch((error) => { if (!alive) return; if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { setAvailable(false); return; } setStatus(error instanceof ApiError && error.code === "subscription_not_found" ? "Активной подписки нет" : message(error)); api.listPlans().then((response) => { if (alive) { const allowed = response.plans.filter((plan) => plan.type === (kind === "users" ? "personal" : "business")); setPlans(allowed); setPlanCode(allowed[0]?.code ?? ""); } }).catch(() => undefined); }); return () => { alive = false; }; }, [id, kind]);
  function requireReason(action: string) { if (reason.trim()) return true; setReasonInvalid(true); setStatus(`Укажите причину: ${action}.`); reasonRef.current?.focus(); return false; }
  // Lowering a business plan below the number of companies the owner runs is
  // refused until somebody says which ones keep working. The answer carries the
  // list, so the choice is made here rather than discovered afterwards.
  async function grant(activeCompanyIds?: string[]) {
    if (!requireReason("она обязательна для аудита")) return;
    if (!planCode || !endsAt) return setStatus("Выберите тариф и дату окончания");
    setBusy(true);
    try {
      const updated = await api.grantAdminSubscription(kind, id, { plan_code: planCode as Plan["code"], ends_at: new Date(`${endsAt}T23:59:59`).toISOString(), reason: reason.trim(), ...(activeCompanyIds ? { active_company_uuids: activeCompanyIds } : {}) });
      setSubscription(updated); setStatus(""); setReason(""); setSelection(null); showAdminAlert("Подписка выдана или продлена");
    } catch (error) {
      if (error instanceof ApiError && error.code === "company_selection_required") {
        const ids = Array.isArray(error.details?.company_uuids) ? (error.details?.company_uuids as string[]) : [];
        const limit = typeof error.details?.company_limit === "number" ? (error.details?.company_limit as number) : 1;
        setSelection({ companyIds: ids, limit, chosen: ids.slice(0, limit) });
        setStatus("Новый тариф покрывает меньше компаний. Выберите, какие останутся активными.");
        void Promise.all(ids.map((companyId) => api.getAdminCompany(companyId).then((company) => [companyId, company.name] as const).catch(() => [companyId, ""] as const)))
          .then((pairs) => setSelectionNames(Object.fromEntries(pairs.filter(([, name]) => name))));
        return;
      }
      setStatus(message(error)); showAdminAlert(message(error), "error");
    } finally { setBusy(false); }
  }
  async function cancel() { if (!requireReason("она обязательна для отмены")) return; setBusy(true); try { const updated = await api.cancelAdminSubscription(kind, id, reason.trim()); setSubscription(updated); setReason(""); showAdminAlert("Подписка отменена"); } catch (error) { setStatus(message(error)); showAdminAlert(message(error), "error"); } finally { setBusy(false); } }
  const subscriptionPlanName = subscription ? plans.find((plan) => plan.code === subscription.plan_code)?.name ?? subscription.plan_code : "";
  function toggleChosen(companyId: string) {
    setSelection((current) => {
      if (!current) return current;
      const chosen = current.chosen.includes(companyId)
        ? current.chosen.filter((item) => item !== companyId)
        : [...current.chosen, companyId];
      return { ...current, chosen };
    });
  }
  if (!available) return null;
  return <div className="admin-subscription"><strong>Подписка</strong><p>{subscription ? `${subscriptionPlanName} · ${subscription.status}` : status}</p>{subscription?.ends_at && <small>Действует до {date(subscription.ends_at)}</small>}{canManage && <><label>Тариф<SelectControl value={planCode} onChange={(event) => setPlanCode(event.target.value)}>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</SelectControl></label><label>Дата окончания<input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label><label className={reasonInvalid ? "admin-required-field" : undefined}>Причина<input ref={reasonRef} aria-invalid={reasonInvalid} value={reason} onChange={(event) => { setReason(event.target.value); setReasonInvalid(false); }} placeholder="Обязательна для аудита" /></label><div className="admin-button-row"><button className="primary-button small admin-action-button" type="button" disabled={busy} onClick={() => void grant()}>{subscription ? "Продлить / выдать" : "Выдать подписку"}</button>{subscription && <button className="ghost-button small admin-action-button" type="button" disabled={busy} onClick={() => void cancel()}>Отменить</button>}</div>{selection && <div className="admin-company-selection"><h3>Какие компании останутся активными</h3><p>Новый тариф покрывает {selection.limit} из {selection.companyIds.length}. Остальные будут заморожены: данные сохранятся, изменения прекратятся.</p><div className="admin-company-selection-list">{selection.companyIds.map((companyId) => <label className="checkbox-row" key={companyId}><input type="checkbox" checked={selection.chosen.includes(companyId)} onChange={() => toggleChosen(companyId)} /><span>{selectionNames[companyId] ?? "Компания без названия"}</span></label>)}</div><div className="admin-button-row"><button className="primary-button small admin-action-button" type="button" disabled={busy || selection.chosen.length === 0 || selection.chosen.length > selection.limit} onClick={() => void grant(selection.chosen)}>Применить тариф</button><button className="ghost-button small admin-action-button" type="button" disabled={busy} onClick={() => setSelection(null)}>Отмена</button></div></div>}</>}</div>;
}

function UsageResetPanel({ kind, id }: { kind: SubscriptionOwner; id: string }) {
  const [reason, setReason] = useState("");
  const [reasonInvalid, setReasonInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const reasonRef = useRef<HTMLInputElement>(null);
  async function resetUsage() {
    if (!reason.trim()) { setReasonInvalid(true); setStatus("Укажите причину сброса лимитов."); reasonRef.current?.focus(); return; }
    setBusy(true); setStatus("");
    try { await api.resetAdminUsage(kind, id, reason.trim()); setReason(""); setStatus("Лимит кредитов за текущий период сброшен. Купленный кошелёк не изменён."); showAdminAlert("Лимит кредитов сброшен"); } catch (error) { setStatus(message(error)); showAdminAlert(message(error), "error"); } finally { setBusy(false); }
  }
  return <div className="admin-action-block admin-usage-reset"><h3>Сброс лимита кредитов</h3><p>Создаёт новый allowance подписки до ближайшего сброса — период идёт 30 дней от покупки. Купленные кредиты кошелька не меняются.</p><label className={reasonInvalid ? "admin-required-field" : undefined}>Причина<input ref={reasonRef} aria-invalid={reasonInvalid} value={reason} onChange={(event) => { setReason(event.target.value); setReasonInvalid(false); }} placeholder="Обязательна для аудита" /></label>{status && <p className="admin-action-status" role="status">{status}</p>}<button className="ghost-button small admin-action-button admin-reset-button" type="button" disabled={busy} onClick={() => void resetUsage()}>{busy ? "Сбрасываю…" : "Сбросить лимит"}</button></div>;
}

function UserCallsPanel({ user }: { user: UserResponse }) {
  const [open, setOpen] = useState(false); const [calls, setCalls] = useState<CallResponse[]>([]); const [selectedCall, setSelectedCall] = useState<CallResponse | null>(null); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState("");
  async function loadCalls() { setOpen(true); setLoading(true); setNotice(""); try { const response = await api.listAdminUserCalls(user.id, { limit: 50, offset: 0 }); setCalls(response.items); setSelectedCall((current) => current ? response.items.find((call) => call.id === current.id) ?? null : null); } catch (error) { if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { setOpen(false); return; } setNotice(message(error)); } finally { setLoading(false); } }
  if (!open) return <div className="admin-action-block"><h3>Звонки</h3><button className="ghost-button small" type="button" onClick={() => void loadCalls()}>Звонки пользователя</button></div>;
  return <div className="admin-action-block"><div className="admin-panel-head"><h3>Звонки пользователя</h3><button className="ghost-button small" type="button" disabled={loading} aria-busy={loading} onClick={() => void loadCalls()}><RefreshCw className={loading ? "refresh-icon spinning" : "refresh-icon"} size={14} />Обновить</button></div>{loading && calls.length === 0 ? <p className="admin-session-summary">Загрузка звонков…</p> : notice ? <p className="admin-notice">{notice}</p> : calls.length === 0 ? <p className="admin-session-summary">Звонков пока нет</p> : <ul className="admin-calls" aria-busy={loading}>{calls.map((call) => <li key={call.id}><button type="button" className={selectedCall?.id === call.id ? "active" : ""} onClick={() => setSelectedCall(call)}><span><strong>{call.title}</strong><small>{date(call.created_at)} · {callStatusLabel(call.status)}</small></span><Headphones size={16} /></button></li>)}</ul>}{selectedCall && <div className="admin-call-card"><h2>{selectedCall.title}</h2><p>{date(selectedCall.created_at)} · {callStatusLabel(selectedCall.status)}</p><AdminMediaPlayer call={selectedCall} /></div>}</div>;
}

function AdminMediaPlayer({ call }: { call: CallResponse }) {
  const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; let objectUrl = ""; setUrl(""); setError(""); setLoading(true); getAdminCallAudioBlob(call.id).then((blob) => { if (!alive) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch((loadError) => { if (alive) setError(loadError instanceof ApiError && loadError.code === "audio_file_not_found" ? "Файл записи недоступен" : message(loadError)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [call.id]);
  if (loading) return <p className="admin-session-summary">Загрузка записи…</p>; if (error) return <p className="admin-notice">{error}</p>; return isVideoCall(call) ? <video className="admin-media" controls src={url} /> : <audio className="admin-audio" controls src={url} />;
}

function UserAvatar({ user }: { user: UserResponse }) {
  return <span className={`admin-avatar ${user.avatar_url ? "has-image" : ""}`} aria-label={`Аватар пользователя ${fullName(user)}`}>{user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{initials(user)}</span>}</span>;
}

function ReasonDialog({ title, reason, busy, onReason, onCancel, onConfirm }: { title: string; reason: string; busy: boolean; onReason: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  useEscapeDismiss(!busy, onCancel);

  return <div className="confirm-dialog-layer" role="presentation" onPointerDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}><form className="confirm-dialog danger" role="dialog" aria-modal="true" aria-label={title} onSubmit={(event) => { event.preventDefault(); if (!busy && reason.trim()) onConfirm(); }}><div className="confirm-dialog-content"><div className="confirm-dialog-head"><h2>{title}</h2></div><p>Причина обязательна для аудита действия.</p><label className="admin-dialog-field">Причина<input autoFocus value={reason} onChange={(event) => onReason(event.target.value)} /></label><div className="confirm-dialog-actions"><button className="primary-button small danger-confirm" type="submit" disabled={busy || !reason.trim()}>{busy ? "Выполняю…" : "Подтвердить"}</button><button className="ghost-button small" type="button" disabled={busy} onClick={onCancel}>Отмена</button></div></div></form></div>;
}

function UsersTable({ users, onOpen }: { users: UserResponse[]; onOpen: (user: UserResponse) => void }) { return <div className="admin-table-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th>Создан</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{fullName(user)}</strong><small>{user.username} · {user.email}</small></td><td><span className="chip">{roleLabel(user.role)}</span></td><td>{date(user.created_at)}</td><td><button className="ghost-button small" type="button" onClick={() => onOpen(user)}>Открыть</button></td></tr>)}</tbody></table>{users.length === 0 && <p className="admin-empty">Пользователи не найдены</p>}</div>; }
function CompaniesTable({ companies, onOpen }: { companies: CompanyResponse[]; onOpen: (company: CompanyResponse) => void }) { return <div className="admin-table-wrap"><table><thead><tr><th>Компания</th><th>Тег</th><th>Создана</th><th /></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><strong>{company.name}</strong></td><td>{company.tag || "Тег не задан"}</td><td>{date(company.created_at)}</td><td><button className="ghost-button small" type="button" onClick={() => onOpen(company)}>Открыть</button></td></tr>)}</tbody></table>{companies.length === 0 && <p className="admin-empty">Компании не найдены</p>}</div>; }

function ActionsTable({ actions, onOpen, onOpenScope }: { actions: CallAction[]; onOpen: (action: CallAction) => void; onOpenScope: (action: CallAction) => void }) {
  return <div className="admin-actions-list"><div className="admin-action-list-head" aria-hidden="true"><span>Действие, компания и отдел</span><span>Ответственный</span><span>Статус</span><span>Срок</span><span/></div>{actions.map((action) => <article className="admin-action-list-row" key={action.id}><div className="admin-action-title"><strong>{action.title}</strong><small className="admin-action-scope"><span>{action.company_uuid ? (action.company_name || "Компания") : "Персональное действие"}</span> · <button type="button" onClick={() => void onOpenScope(action)}>{actionScopeTag(action)}</button>{action.target_department_name ? <> · <span>{action.target_department_name}</span></> : null}</small></div><div className="admin-action-assignee"><small>Ответственный</small>{usernameLabel(action.assignee_username)}</div><div className="admin-action-state"><small>Статус</small><span className={`admin-action-status-chip is-${action.status}`}>{actionStatusLabel(action.status)}</span></div><div className="admin-action-due"><small>Срок</small>{date(action.due_at)}</div><button className="ghost-button small" type="button" onClick={() => onOpen(action)}>Открыть</button></article>)}{actions.length === 0 && <p className="admin-empty">Действия не найдены</p>}</div>;
}

function ActionAdminDetail({ action, canManage, onBack, onUpdated }: { action: CallAction; canManage: boolean; onBack: () => void; onUpdated: (action: CallAction) => void }) {
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState(() => localDateTime(action.due_at));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignees, setAssignees] = useState<CallActionAssignee[]>([]);
  const [assigneeId, setAssigneeId] = useState(action.assignee_user_uuid);
  const [departmentId, setDepartmentId] = useState(action.target_department_uuid);
  const terminal = action.status === "completed" || action.status === "cancelled";
  useEffect(() => {
    if (!canManage || !action.company_uuid) return;
    let cancelled = false;
    api.listAdminActionAssignees(action.company_uuid).then((response) => { if (!cancelled) setAssignees(response.items); }).catch((error) => { if (!cancelled) setNotice(message(error)); });
    return () => { cancelled = true; };
  }, [action.company_uuid, canManage]);
  const selectedAssignee = assignees.find((item) => item.user_uuid === assigneeId);
  async function mutate(operation: "complete" | "cancel" | "reschedule" | "reassign") {
    if (reason.trim().length < 10) { setNotice("Укажите причину не короче 10 символов"); return; }
    if (operation === "reschedule" && (!dueAt || new Date(dueAt) <= new Date())) { setNotice("Укажите будущий срок выполнения"); return; }
    setBusy(true); setNotice("");
    try {
      const updated = await api.mutateAdminAction(action.id, operation, { expected_lock_version: action.lock_version, reason: reason.trim(), ...(operation === "reschedule" ? { due_at: new Date(dueAt).toISOString() } : {}), ...(operation === "reassign" ? { assignee_user_uuid: assigneeId, target_department_uuid: departmentId } : {}) });
      onUpdated(updated); setReason(""); setDueAt(localDateTime(updated.due_at));
      setAssigneeId(updated.assignee_user_uuid); setDepartmentId(updated.target_department_uuid);
      const labels = { complete: "Действие завершено", cancel: "Действие отменено", reschedule: "Срок действия изменён", reassign: "Ответственный изменён" };
      setNotice(labels[operation]); showAdminAlert(labels[operation]);
    } catch (error) { setNotice(message(error)); } finally { setBusy(false); }
  }
  return <section className="admin-page admin-action-page">
    <div className="settings-back-row"><button className="text-button action-back" type="button" onClick={onBack}><ArrowLeft size={16}/>К действиям</button></div>
    <header className="admin-page-head admin-action-card-head"><span className="admin-action-card-icon" aria-hidden="true"><ListTodo size={25}/></span><div className="admin-action-card-copy"><p className="eyebrow">КАРТОЧКА ДЕЙСТВИЯ</p><h1>{action.title}</h1><p>{action.description || "Описание не указано"}</p></div><span className={`admin-action-status-chip is-${action.status}`}>{actionStatusLabel(action.status)}</span></header>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="admin-profile-grid"><section className="admin-detail"><h2>Сведения</h2><dl><dt>Область</dt><dd>{action.company_uuid ? (action.company_name || "Компания") : "Персональное действие"} · {actionScopeTag(action)}</dd>{action.target_department_name ? <><dt>Целевой отдел</dt><dd>{action.target_department_name}</dd></> : null}{action.source_department_name ? <><dt>Исходный отдел</dt><dd>{action.source_department_name}</dd></> : null}<dt>Ответственный</dt><dd>{usernameLabel(action.assignee_username)}</dd><dt>Срок</dt><dd>{dateTime(action.due_at)}</dd><dt>Статус</dt><dd>{actionStatusLabel(action.status)}</dd><dt>Версия</dt><dd>{action.lock_version}</dd></dl></section>
    {canManage && <section className="admin-detail admin-action-management admin-action-block" aria-busy={busy}><h2>Корректировка</h2><p className="muted">Каждое изменение фиксируется в истории действия. Завершённое или отменённое действие не меняется — создайте новое.</p><label>Причина<textarea value={reason} maxLength={2000} onChange={(event) => { setReason(event.target.value); setNotice(""); }} placeholder="Обязательно, не менее 10 символов"/></label>{notice && <p className="admin-notice admin-action-inline-notice" role="status">{notice}</p>}{terminal ? <p className="muted">Действие закрыто. Чтобы вернуться к задаче, создайте новое действие.</p> : <>{action.company_uuid ? <><label>Ответственный<SelectControl value={assigneeId} onChange={(event) => { const next = event.target.value; setAssigneeId(next); const user = assignees.find((item) => item.user_uuid === next); setDepartmentId(user?.departments[0]?.id ?? ""); }}>{assignees.map((item) => <option key={item.user_uuid} value={item.user_uuid}>{usernameLabel(item.username)} · {item.full_name} {item.full_surname}</option>)}</SelectControl></label><label>Отдел<SelectControl value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>{selectedAssignee?.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectControl></label><button className="ghost-button" type="button" disabled={busy || !assigneeId || !departmentId} onClick={() => void mutate("reassign")}><Users size={17}/>{busy ? "Сохраняю…" : "Переназначить"}</button></> : <p className="muted">Персональное действие закреплено за владельцем звонка и не может быть переназначено.</p>}<label>Новый срок<DateTimePicker value={dueAt} onChange={setDueAt}/></label><div className="admin-action-buttons"><button className="ghost-button" type="button" disabled={busy} onClick={() => void mutate("reschedule")}><CalendarClock size={17}/>{busy ? "Сохраняю…" : "Изменить срок"}</button><button className="primary-button" type="button" disabled={busy} onClick={() => void mutate("complete")}><CheckCircle2 size={17}/>{busy ? "Сохраняю…" : "Завершить"}</button><button className="ghost-button danger" type="button" disabled={busy} onClick={() => void mutate("cancel")}><XCircle size={17}/>{busy ? "Сохраняю…" : "Отменить"}</button></div></>}</section>}
    </div>
  </section>;
}

function canTargetRole(actor: AdminCapabilitiesResponse["role"], target: string) { return target !== "superadmin" && (actor === "superadmin" || (actor === "admin" && (target === "user" || target === "helper"))); }
function canChangeRole(capabilities: AdminCapabilitiesResponse, target: string) { if (target === "superadmin") return false; return target === "admin" ? has(capabilities, "admin.roles.manage_admins") : has(capabilities, "admin.roles.manage_helpers"); }
function availableRoleTargets(capabilities: AdminCapabilitiesResponse) { const roles = has(capabilities, "admin.roles.manage_helpers") ? ["user", "helper"] : []; return has(capabilities, "admin.roles.manage_admins") ? [...roles, "admin"] : roles; }
function roleLabel(role: string) { return ({ user: "Пользователь", helper: "Помощник", admin: "Администратор", superadmin: "Супер-администратор" } as Record<string, string>)[role] ?? role; }
function callStatusLabel(status: string) { return ({ new: "Новый", processing: "Обрабатывается", transcribed: "Расшифрован", analyzed: "Проанализирован", failed: "Не обработан" } as Record<string, string>)[status] ?? "Статус неизвестен"; }
function actionStatusLabel(status: string) { return ({ open: "Открыто", in_progress: "В работе", completed: "Выполнено", cancelled: "Отменено", overdue: "Просрочено" } as Record<string, string>)[status] ?? status; }
function usernameLabel(username: string) { const normalized = username.trim().replace(/^@+/, ""); return normalized ? `@${normalized}` : "—"; }
function normalizeTag(tag?: string | null) { const normalized = (tag ?? "").trim().replace(/^@+/, ""); return normalized ? `@${normalized}` : "Тег не задан"; }
// A raw uuid must never reach the screen. An untagged company falls back to the
// same wording its card uses, and only a personal action shows the owner's handle.
function actionScopeTag(action: CallAction) { return normalizeTag(action.scope_tag || action.company_tag || (action.company_uuid ? "" : action.assignee_username)); }
function fullName(user: UserResponse) { return `${user.full_name} ${user.full_surname}`.trim() || user.username; }
function initials(user: UserResponse) { return fullName(user).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function date(value: string) { const parsed = new Date(value); return value && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(parsed) : "—"; }
function dateTime(value: string) { const parsed = new Date(value); return value && !Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(parsed) : "—"; }
function localDateTime(value: string) { const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return ""; const offset = parsed.getTimezoneOffset() * 60_000; return new Date(parsed.getTime() - offset).toISOString().slice(0, 16); }
function message(error: unknown) { return error instanceof Error ? error.message : "Не удалось выполнить операцию"; }
