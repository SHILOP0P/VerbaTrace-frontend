import {
  ArrowLeft,
  Building2,
  ChevronRight,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type {
  AppPage,
  CallResponse,
  CompanyResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  Invitation,
  InvitationDepartmentRole,
  MembershipStatus,
  SessionState,
  Subscription,
  UserResponse
} from "../../types";

import { departmentRoleText, formatDate, membershipStatusText } from "../../shared/lib/formatters";
import { CallListSkeleton } from "../../shared/ui/loading";
import { ProfileField, SelectControl } from "../../shared/ui/primitives";
import { InvitationCreatePanel } from "../invitations/InvitationsPage";
import { CompanyMembersPanel } from "./CompanyMembersPanel";
import { CompanyLifecyclePanel } from "./CompanyLifecyclePanel";
import { CreditLimitsPanel } from "./CreditLimitsPanel";
import { OwnershipOffersPanel } from "./OwnershipOffersPanel";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { AnalysisPersonalizationCard } from "../analysis-context/AnalysisPersonalizationCard";
import { CreditUsagePanel } from "../tariffs/CreditUsagePanel";

export function CompaniesPage({
  session,
  companies,
  departments,
  departmentMembers,
  calls,
  companySubscriptions,
  loading,
  onBackToSettings,
  selectedCompanyId,
  selectedDepartmentId,
  onCompanyCreated,
  onDepartmentCreated,
  onCompanyLeft,
  onNavigate,
  onOpenCompany,
  onOpenDepartment,
  onInvitationCreated,
  onCreateCompany
}: {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  calls: CallResponse[];
  companySubscriptions: Record<string, Subscription | null>;
  loading: boolean;
  onBackToSettings: () => void;
  selectedCompanyId: string;
  selectedDepartmentId: string;
  onCompanyCreated: (company: CompanyResponse) => void | Promise<void>;
  onDepartmentCreated: (department: DepartmentResponse) => void;
  onCompanyLeft: (companyId: string) => void;
  onNavigate: (page: AppPage) => void;
  onOpenCompany: (companyId: string) => void;
  onOpenDepartment: (companyId: string, departmentId: string) => void;
  onInvitationCreated: (invitation: Invitation) => void;
  onCreateCompany?: () => void;
}) {
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const selectedDepartment = departments.find(
    (department) => department.company_uuid === selectedCompanyId && department.id === selectedDepartmentId
  );
  const [activeCompanyId, setActiveCompanyId] = useState("");
  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? companies[0];
  const hasManagedCompany = companies.some((company) => company.manager_user_uuid === session.user.id);
  const activeBusinessSubscriptions = Object.values(companySubscriptions).filter(
    (subscription): subscription is Subscription => Boolean(subscription && subscription.status === "active")
  );
  const companyLimit = activeBusinessSubscriptions.reduce<number | null>((limit, subscription) => {
    const planLimit = subscription.plan.company_limit;
    if (planLimit === null) return limit;
    return limit === null ? planLimit : Math.max(limit, planLimit);
  }, null);
  const freeSlots = companyLimit === null ? 0 : Math.max(0, companyLimit - companies.length);

  useEffect(() => {
    if (!companies.length) {
      setActiveCompanyId("");
      return;
    }

    if (!companies.some((company) => company.id === activeCompanyId)) {
      setActiveCompanyId(companies[0].id);
    }
  }, [activeCompanyId, companies]);

  if (companies.length === 0 && !loading) {
    return <section className="companies-layout"><div className="company-workspace-empty glass"><Building2 size={38}/><h1>Компании пока нет</h1><p>Создайте компанию, чтобы организовать отделы и назначать действия по звонкам.</p><button className="primary-button" type="button" onClick={onCreateCompany}><Plus size={18}/>Создать компанию</button></div></section>;
  }

  if (selectedCompanyId) {
    if (loading && (!selectedCompany || (selectedDepartmentId && !selectedDepartment))) {
      return (
        <section className="companies-layout">
          <div className="company-workspace-empty glass">
            <CallListSkeleton count={3} compact />
          </div>
        </section>
      );
    }

    if (selectedDepartmentId) {
      return (
        <DepartmentWorkspace
          company={selectedCompany}
          department={selectedDepartment}
          session={session}
          onNavigate={onNavigate}
          onOpenCompany={onOpenCompany}
        />
      );
    }

    return (
      <CompanyWorkspace
        company={selectedCompany}
        departments={departments.filter((department) => department.company_uuid === selectedCompanyId)}
        departmentMembers={departmentMembers}
        session={session}
        onNavigate={onNavigate}
        onDepartmentCreated={onDepartmentCreated}
        onCompanyLeft={onCompanyLeft}
        onOpenDepartment={onOpenDepartment}
        onInvitationCreated={onInvitationCreated}
      />
    );
  }

  return (
    <section className="companies-page app-page atmospheric-page">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBackToSettings}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <div className="app-page-heading settings-heading">
        <span className="settings-heading-icon" aria-hidden="true">
          <Building2 size={26} />
        </span>
        <div>
          <h1>Компании</h1>
          <p>Статус подписки, активная компания и лимиты по каждой организации.</p>
        </div>
      </div>

      <section className="company-summary-panel glass-panel">
        <div>
          <h2>Компании в бизнес-подписке</h2>
          <p>Лимиты, слоты и подписка отображаются отдельно для каждой компании.</p>
        </div>
        <div className="company-summary-stats">
          <ProfileField label="Слоты компаний" value={companyLimit === null ? `${companies.length}` : `${companies.length} / ${companyLimit}`} />
          <ProfileField label="Активных подписок" value={activeBusinessSubscriptions.length.toString()} />
          <ProfileField label="Подписка" value="По компаниям" />
        </div>
      </section>

      <OwnershipOffersPanel companies={companies} onOwnershipAccepted={() => window.location.reload()} />

      <div className="company-limits-grid">
        <section className="company-list-panel glass-panel">
          <div className="panel-heading large">
            <div>
              <h2>Список компаний</h2>
              <p>Активная компания выбирается здесь для текущей рабочей сессии.</p>
            </div>
            {!hasManagedCompany ? (
              <button className="primary-button small" type="button" onClick={onCreateCompany}>
                <Plus size={16} />
                Создать свою компанию
              </button>
            ) : companies.length > 0 ? (
              <SelectControl
                value={activeCompany?.id ?? ""}
                onChange={(event) => setActiveCompanyId(event.target.value)}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    Активная: {company.name}
                  </option>
                ))}
              </SelectControl>
            ) : null}
          </div>

          {loading ? (
            <CallListSkeleton count={3} compact />
          ) : (
            <div className="company-limit-list">
              {companies.map((company) => (
                <CompanyLimitRow
                  key={company.id}
                  company={company}
                  calls={calls.filter((call) => call.company_uuid === company.id)}
                  subscription={companySubscriptions[company.id] ?? null}
                  active={company.id === activeCompany?.id}
                  departments={departments.filter((department) => department.company_uuid === company.id)}
                  manager={company.manager_user_uuid === session.user.id}
                  onSelect={() => setActiveCompanyId(company.id)}
                  onOpen={() => onOpenCompany(company.id)}
                />
              ))}
              {Array.from({ length: freeSlots }).map((_, index) => (
                <div className="company-limit-row empty-slot" key={`slot-${index}`}>
                  <div>
                    <strong>Свободный слот</strong>
                    <span className="status-chip warn">Можно создать</span>
                    <small>Доступен в текущей бизнес-подписке</small>
                  </div>
                  <CreateCompanyForm onCreated={onCompanyCreated} compact />
                </div>
              ))}
            </div>
          )}
        </section>

        <CompanyLimitDetail
          company={activeCompany}
          calls={activeCompany ? calls.filter((call) => call.company_uuid === activeCompany.id) : []}
          subscription={activeCompany ? companySubscriptions[activeCompany.id] ?? null : null}
          departments={activeCompany ? departments.filter((department) => department.company_uuid === activeCompany.id) : []}
          manager={Boolean(activeCompany && activeCompany.manager_user_uuid === session.user.id)}
          onOpenCompany={onOpenCompany}
        />
      </div>
    </section>
  );
}

function CompanyLimitRow({
  company,
  calls,
  subscription,
  departments,
  manager,
  active,
  onSelect,
  onOpen
}: {
  company: CompanyResponse;
  calls: CallResponse[];
  subscription: Subscription | null;
  departments: DepartmentResponse[];
  manager: boolean;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const activeSubscription = subscription?.status === "active" ? subscription : null;
  const usedMinutes = totalMinutes(calls);
  const limitMinutes = activeSubscription?.plan.monthly_minutes_limit ?? 0;
  const progress = limitMinutes > 0 ? Math.min(100, Math.round((usedMinutes / limitMinutes) * 100)) : 0;

  return (
    <button className={`company-limit-row ${active ? "active" : ""}`} type="button" onClick={onSelect}>
      <div className="company-limit-main">
        <strong>{company.name}</strong>
        <span className={`status-chip ${manager ? "ok" : "warn"}`}>
          {activeSubscription ? activeSubscription.plan.name : manager ? "Подписка не активна" : "Статус скрыт"}
        </span>
        <small>{manager ? "Активная компания" : "Компания участника"} · {departments.length} отделов</small>
      </div>
      <div className="company-limit-progress">
        <span>Расшифровка</span>
        <strong>{limitMinutes > 0 ? `${formatMinutes(usedMinutes)} / ${formatMinutes(limitMinutes)}` : "Нет лимита"}</strong>
        <small>{activeSubscription ? "по загруженным звонкам" : "активируйте бизнес-тариф"}</small>
        <div className="limit-progress-track"><span style={{ width: `${progress}%` }} /></div>
      </div>
      <span
        className="text-button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        Открыть
      </span>
    </button>
  );
}

function CompanyLimitDetail({
  company,
  calls,
  subscription,
  departments,
  manager,
  onOpenCompany
}: {
  company?: CompanyResponse;
  calls: CallResponse[];
  subscription: Subscription | null;
  departments: DepartmentResponse[];
  manager: boolean;
  onOpenCompany: (companyId: string) => void;
}) {
  if (!company) {
    return (
      <aside className="company-detail-panel glass-panel">
        <Building2 size={34} />
        <h2>Компания не выбрана</h2>
        <p>Создайте компанию или выберите существующую.</p>
      </aside>
    );
  }
  const activeSubscription = subscription?.status === "active" ? subscription : null;
  const usedMinutes = totalMinutes(calls);
  const limitMinutes = activeSubscription?.plan.monthly_minutes_limit ?? 0;
  const minutesProgress = limitMinutes > 0 ? Math.min(100, Math.round((usedMinutes / limitMinutes) * 100)) : 0;
  const memberLimit = activeSubscription?.plan.members_per_company_limit ?? company.member_limit;

  return (
    <aside className="company-detail-panel glass-panel">
      <h2>{company.name}</h2>
      <span className={`status-chip ${manager ? "ok" : "warn"}`}>
        {manager ? "Менеджер компании" : "Участник компании"}
      </span>
      <p>Текущая активная компания команды продаж. Подписка и лимиты отображаются по данным компании.</p>
      <LimitLine
        label="Расшифровка звонков"
        value={limitMinutes > 0 ? `${formatMinutes(usedMinutes)} / ${formatMinutes(limitMinutes)}` : "Нет активного лимита"}
        progress={minutesProgress}
      />
      <LimitLine
        label="AI-отчеты"
        value={activeSubscription?.plan.export_enabled ? `Экспорт доступен · ${activeSubscription.plan.analysis_level}` : "Экспорт недоступен"}
        progress={activeSubscription?.plan.export_enabled ? 100 : 0}
      />
      <LimitLine label="Участники" value={`${departments.length} отделов · лимит ${memberLimit}`} progress={Math.min(100, departments.length * 18)} />
      <button className="primary-button" type="button" onClick={() => onOpenCompany(company.id)}>
        Открыть компанию
        <ChevronRight size={16} />
      </button>
    </aside>
  );
}

function LimitLine({
  label,
  value,
  progress
}: {
  label: string;
  value: string;
  progress: number;
}) {
  return (
    <div className="company-detail-limit">
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
      <div className="limit-progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function totalMinutes(calls: CallResponse[]) {
  return Math.ceil(calls.reduce((sum, call) => sum + call.duration_seconds, 0) / 60);
}

function formatMinutes(minutes: number) {
  return `${minutes} мин`;
}

export function CompanyWorkspace({
  company,
  departments,
  departmentMembers,
  session,
  onNavigate,
  onDepartmentCreated,
  onCompanyLeft,
  onOpenDepartment,
  onInvitationCreated
}: {
  company?: CompanyResponse;
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  session: SessionState;
  onNavigate: (page: AppPage) => void;
  onDepartmentCreated: (department: DepartmentResponse) => void;
  onCompanyLeft: (companyId: string) => void;
  onOpenDepartment: (companyId: string, departmentId: string) => void;
  onInvitationCreated: (invitation: Invitation) => void;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  if (!company) {
    return (
      <section className="companies-layout">
        <div className="company-workspace-empty glass">
          <Building2 size={34} />
          <div>
            <h1>Компания не найдена</h1>
            <p>Проверьте ссылку или вернитесь к списку компаний.</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => onNavigate("settingsCompanies")}>
            К списку компаний
          </button>
        </div>
      </section>
    );
  }

  const isManager = company.manager_user_uuid === session.user.id;
  const ledDepartmentIds = departments
    .filter((department) => departmentMembers.some((member) => member.department_uuid === department.id && member.user_uuid === session.user.id && member.role === "department_leader" && member.status === "active"))
    .map((department) => department.id);
  const canInvite = isManager || ledDepartmentIds.length > 0;

  async function leaveCompany() {
    if (!company) return;
    setLeaving(true);
    setLeaveError("");
    try {
      await api.leaveCompany(company!.id);
      onCompanyLeft(company!.id);
      onNavigate("settingsCompanies");
    } catch (error) {
      setLeaveError(error instanceof Error ? error.message : "Не удалось покинуть компанию");
      setLeaveOpen(false);
    } finally {
      setLeaving(false);
    }
  }

  return (
    <section className="company-workspace-layout">
      <div className="company-workspace-hero glass">
        <button className="text-button" type="button" onClick={() => onNavigate("settingsCompanies")}>
          Назад к компаниям
        </button>
        <div className="company-workspace-title">
          <div>
            <h1>{company.name}</h1>
            <p>{isManager ? "Рабочая область менеджера компании" : "Рабочая область участника компании"}</p>
          </div>
          <span className={`status-chip ${isManager ? "ok" : "warn"}`}>
            {isManager ? "Менеджер" : "Участник"}
          </span>
        </div>
        <div className="company-meta-grid">
          <ProfileField label="Создана" value={formatDate(company.created_at)} />
          <ProfileField label="Лимит участников" value={company.member_limit.toString()} />
          <ProfileField label="Отделов" value={departments.length.toString()} />
        </div>
        <CompanySubscriptionStatus company={company} isManager={isManager} onNavigate={onNavigate} />
        {!isManager && <div className="company-workspace-leave"><button className="ghost-button danger" type="button" onClick={() => setLeaveOpen(true)}>Покинуть компанию</button>{leaveError && <p className="form-error">{leaveError}</p>}</div>}
      </div>

      <CreditUsagePanel session={session} companies={[company]} companyId={company.id} />

      <div className="company-workspace-grid">
        {isManager && <AnalysisPersonalizationCard
          scope="company"
          ownerUuid={company.id}
          title="Персонализация компании"
          description="Используется для звонков компании и дополняется персонализацией отдела для звонков отдела."
          editable={isManager}
        />}
        <section className="company-card glass">
          <div className="panel-heading">
            <div>
              <h2>Отделы</h2>
              <p>Откройте отдел, чтобы посмотреть работников и роли.</p>
            </div>
          </div>
          {isManager && <CreateDepartmentForm companyId={company.id} onCreated={onDepartmentCreated} />}
          {departments.length === 0 ? (
            <div className="instruction-empty standalone">Отделов пока нет.</div>
          ) : (
            <div className="company-mini-list">
              {departments.map((department) => (
                <a
                  className="company-mini-card department-link"
                  href={`/app/settings/companies/${encodeURIComponent(company.id)}/departments/${encodeURIComponent(department.id)}`}
                  key={department.id}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenDepartment(company.id, department.id);
                  }}
                >
                  <div>
                    <strong>{department.name}</strong>
                    <small>Создан: {formatDate(department.created_at)}</small>
                  </div>
                  <span className="status-chip ok">
                    Открыть
                    <ChevronRight size={14} />
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* The panel hides itself for members who do not run the company. */}
        <CompanyMembersPanel
          companyId={company.id}
          departments={departments}
          session={session}
          isOwner={isManager}
        />
        {/* Hidden from members who do not run the company or a department. */}
        <CompanyLifecyclePanel companyId={company.id} isOwner={isManager} />
        <CreditLimitsPanel companyId={company.id} isOwner={isManager} />

        {canInvite ? (
          <InvitationCreatePanel
            companies={[company]}
            departments={departments}
            session={session}
            allowCompanyInvitations={isManager}
            allowedDepartmentIds={isManager ? undefined : ledDepartmentIds}
            onInvitationCreated={onInvitationCreated}
          />
        ) : (
          <section className="company-card glass">
            <div className="company-lock-note">
              <LockKeyhole size={18} />
              <p>Приглашать пользователей может менеджер компании или руководитель своего отдела.</p>
            </div>
          </section>
        )}
      </div>
      <ConfirmDialog open={leaveOpen} title="Покинуть компанию?" message="Вы потеряете доступ к звонкам, отделам и инструкциям этой компании. Вернуться можно будет только по новому приглашению." confirmLabel="Покинуть компанию" busy={leaving} variant="danger" onCancel={() => setLeaveOpen(false)} onConfirm={() => void leaveCompany()} />
    </section>
  );
}

export function DepartmentWorkspace({
  company,
  department,
  session,
  onNavigate,
  onOpenCompany
}: {
  company?: CompanyResponse;
  department?: DepartmentResponse;
  session: SessionState;
  onNavigate: (page: AppPage) => void;
  onOpenCompany: (companyId: string) => void;
}) {
  const [members, setMembers] = useState<DepartmentMemberResponse[]>([]);
  const [loading, setLoading] = useState(Boolean(company && department));
  const [error, setError] = useState("");
  const [busyMemberId, setBusyMemberId] = useState("");
  const isManager = company?.manager_user_uuid === session.user.id;

  useEffect(() => {
    if (!company || !department) return;

    let cancelled = false;
    const companyId = company.id;
    const departmentId = department.id;

    async function loadMembers() {
      try {
        setLoading(true);
        setError("");
        const response = await api.listDepartmentMembers(companyId, departmentId);
        if (!cancelled) setMembers(response);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить работников отдела");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMembers();

    return () => {
      cancelled = true;
    };
  }, [company?.id, department?.id]);

  async function updateMemberRole(member: DepartmentMemberResponse, role: InvitationDepartmentRole) {
    if (!company || !department) return;
    setBusyMemberId(member.user_uuid);
    setError("");
    try {
      const updated = await api.updateDepartmentMemberRole(company.id, department.id, member.user_uuid, role);
      setMembers((current) => current.map((item) => (item.user_uuid === updated.user_uuid ? updated : item)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить роль работника");
    } finally {
      setBusyMemberId("");
    }
  }

  async function updateMemberStatus(member: DepartmentMemberResponse, status: MembershipStatus) {
    if (!company || !department) return;
    setBusyMemberId(member.user_uuid);
    setError("");
    try {
      const updated = await api.updateDepartmentMemberStatus(company.id, department.id, member.user_uuid, status);
      setMembers((current) => current.map((item) => (item.user_uuid === updated.user_uuid ? updated : item)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить статус работника");
    } finally {
      setBusyMemberId("");
    }
  }

  async function updateMemberJobTitle(member: DepartmentMemberResponse, jobTitle: string) {
    if (!company) return;
    setBusyMemberId(member.user_uuid);
    setError("");
    try {
      const normalized = jobTitle.trim();
      const updated = await api.updateCompanyMemberJobTitle(company.id, member.user_uuid, normalized || null);
      setMembers((current) =>
        current.map((item) =>
          item.user_uuid === member.user_uuid ? { ...item, job_title: updated.job_title } : item
        )
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить должность сотрудника");
      throw updateError;
    } finally {
      setBusyMemberId("");
    }
  }

  if (!company || !department) {
    return (
      <section className="companies-layout">
        <div className="company-workspace-empty glass">
          <UsersRound size={34} />
          <div>
            <h1>Отдел не найден</h1>
            <p>Проверьте ссылку или вернитесь к списку компаний.</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => onNavigate("settingsCompanies")}>
            К списку компаний
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="department-workspace-layout">
      <div className="company-workspace-hero glass">
        <div className="panel-actions">
          <button className="text-button" type="button" onClick={() => onOpenCompany(company.id)}>
            Назад к компании
          </button>
          <button className="ghost-button small" type="button" onClick={() => onNavigate("settingsCompanies")}>
            Все компании
          </button>
        </div>
        <div className="company-workspace-title">
          <div>
            <h1>{department.name}</h1>
            <p>{company.name} · работники отдела и назначенные роли.</p>
          </div>
          <span className={`status-chip ${isManager ? "ok" : "warn"}`}>
            {isManager ? "Менеджер" : "Просмотр"}
          </span>
        </div>
        <div className="company-meta-grid">
          <ProfileField label="Создан" value={formatDate(department.created_at)} />
          <ProfileField label="Работников" value={members.length.toString()} />
        </div>
      </div>

      <AnalysisPersonalizationCard
        scope="department"
        ownerUuid={department.id}
        companyUuid={company.id}
        title="Персонализация отдела"
        description="Добавляется к контексту компании только при анализе звонков этого отдела."
        editable={isManager || members.some((member) => member.user_uuid === session.user.id && member.role === "department_leader")}
      />

      <section className="company-card glass">
        <div className="panel-heading">
          <div>
            <h2>Работники отдела</h2>
            <p>Имена показываются для участников с доступными профилями.</p>
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        {loading ? (
          <CallListSkeleton count={3} compact />
        ) : members.length === 0 ? (
          <div className="instruction-empty standalone">В отделе пока нет работников.</div>
        ) : (
          <div className="department-member-list">
            {members.map((member) => (
              <DepartmentMemberRow
                key={member.user_uuid}
                member={member}
                currentUser={session.user}
                manager={isManager}
                busy={busyMemberId === member.user_uuid}
                onJobTitleChange={(jobTitle) => updateMemberJobTitle(member, jobTitle)}
                onRoleChange={(role) => updateMemberRole(member, role)}
                onStatusChange={(status) => updateMemberStatus(member, status)}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export function DepartmentMemberRow({
  member,
  currentUser,
  manager,
  busy,
  onJobTitleChange,
  onRoleChange,
  onStatusChange
}: {
  member: DepartmentMemberResponse;
  currentUser: UserResponse;
  manager: boolean;
  busy: boolean;
  onJobTitleChange: (jobTitle: string) => Promise<void>;
  onRoleChange: (role: InvitationDepartmentRole) => void;
  onStatusChange: (status: MembershipStatus) => void;
}) {
  const fullName =
    member.user_uuid === currentUser.id
      ? `${currentUser.full_surname} ${currentUser.full_name}`.trim()
      : `${member.full_surname ?? ""} ${member.full_name ?? ""}`.trim() || "Пользователь";
  const username = member.user_uuid === currentUser.id ? currentUser.username : member.username ?? "username не передан";
  const [jobTitle, setJobTitle] = useState(member.job_title ?? "");

  useEffect(() => {
    setJobTitle(member.job_title ?? "");
  }, [member.job_title]);

  async function saveJobTitle() {
    const normalized = jobTitle.trim();
    if (normalized === (member.job_title ?? "")) return;
    try {
      await onJobTitleChange(normalized);
    } catch {
      setJobTitle(member.job_title ?? "");
    }
  }

  return (
    <article className="department-member-row">
      <div>
        <strong>{fullName}</strong>
        <small>{username} · добавлен: {formatDate(member.created_at)}</small>
      </div>
      {manager ? (
        <input
          className="department-member-job-title"
          aria-label={`Должность: ${fullName}`}
          maxLength={200}
          placeholder="Должность"
          value={jobTitle}
          disabled={busy}
          onChange={(event) => setJobTitle(event.target.value)}
          onBlur={() => void saveJobTitle()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setJobTitle(member.job_title ?? "");
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <span className="department-member-job-title-text">{member.job_title || "Должность не указана"}</span>
      )}
      {manager ? (
        <>
          <SelectControl
            value={member.role}
            onChange={(event) => onRoleChange(event.target.value as InvitationDepartmentRole)}
            disabled={busy}
          >
            <option value="employee">Сотрудник</option>
            <option value="department_leader">Руководитель отдела</option>
          </SelectControl>
          <SelectControl
            value={member.status}
            onChange={(event) => onStatusChange(event.target.value as MembershipStatus)}
            disabled={busy}
          >
            <option value="active">Активен</option>
            <option value="left">Покинул отдел</option>
          </SelectControl>
        </>
      ) : (
        <>
          <span className="status-chip ok">{departmentRoleText(member.role)}</span>
          <span className={`status-chip ${member.status === "active" ? "ok" : "warn"}`}>
            {membershipStatusText(member.status)}
          </span>
        </>
      )}
    </article>
  );
}

export function CreateDepartmentForm({
  companyId,
  onCreated
}: {
  companyId: string;
  onCreated: (department: DepartmentResponse) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Введите название отдела.");
      return;
    }

    setBusy(true);
    try {
      const department = await api.createDepartment(companyId, name.trim());
      onCreated(department);
      setName("");
      setSuccess("Отдел создан.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать отдел");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="create-department-form" onSubmit={submit}>
      <label>
        Название отдела
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}
      <button className="primary-button small" type="submit" disabled={busy}>
        <Plus size={16} />
        {busy ? "Создаю..." : "Создать отдел"}
      </button>
    </form>
  );
}

export function CompanySubscriptionStatus({
  company,
  isManager,
  onNavigate
}: {
  company: CompanyResponse;
  isManager: boolean;
  onNavigate: (page: AppPage) => void;
}) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(isManager);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isManager) return;

    let cancelled = false;

    async function loadSubscription() {
      try {
        setLoading(true);
        setError("");
        const response = await api.getCompanySubscription(company.id);
        if (!cancelled) setSubscription(response);
      } catch (loadError) {
        if (cancelled) return;
        if (
          loadError instanceof ApiError &&
          (loadError.status === 404 || loadError.code === "subscription_not_found")
        ) {
          setSubscription(null);
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить подписку");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSubscription();

    return () => {
      cancelled = true;
    };
  }, [company.id, isManager]);

  if (!isManager) {
    return (
      <div className="company-lock-note">
        <LockKeyhole size={18} />
        <p>Статус бизнес-подписки видит менеджер компании.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="company-lock-note">Проверяю бизнес-подписку...</div>;
  }

  if (error) {
    return <div className="form-error">{error}</div>;
  }

  const active = subscription?.status === "active";

  return (
    <div className={`company-lock-note ${active ? "active" : ""}`}>
      {active ? <ShieldCheck size={18} /> : <LockKeyhole size={18} />}
      <div>
        <strong>{active ? "Бизнес-подписка активна" : "Компания пока заблокирована"}</strong>
        <p>
          {active
            ? `${subscription?.plan.name ?? "Бизнес-тариф"} подключен к этой компании.`
            : "Для отделов, приглашений, company/department звонков и инструкций нужна активная бизнес-подписка компании."}
        </p>
      </div>
      {!active && (
        <button className="primary-button small" type="button" onClick={() => onNavigate("settingsTariffs")}>
          <ShieldCheck size={16} />
          Выбрать бизнес-тариф
        </button>
      )}
    </div>
  );
}

export function CreateCompanyForm({
  onCreated,
  compact = false
}: {
  onCreated: (company: CompanyResponse) => void | Promise<void>;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Введите название компании.");
      return;
    }

    setBusy(true);
    try {
      const company = await api.createCompany(name.trim());
      await onCreated(company);
      setName("");
      setSuccess("Компания создана.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать компанию");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`create-company-form ${compact ? "compact" : ""}`} onSubmit={submit}>
      <label>
        Название компании
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button className="primary-button" type="submit" disabled={busy}>
        <Plus size={18} />
        {busy ? "Создаю..." : "Создать компанию"}
      </button>
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}
    </form>
  );
}

export function CompanyEmptyState({
  onCompanyCreated,
  compact = false
}: {
  onCompanyCreated: (company: CompanyResponse) => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className={`company-empty ${compact ? "compact" : ""}`}>
      <Building2 size={compact ? 28 : 38} />
      <div>
        <h2>Компании пока нет</h2>
        <p>
          Создать компанию можно без бизнес-подписки. Рабочие действия компании включаются
          только после активного бизнес-тарифа.
        </p>
      </div>
      <CreateCompanyForm onCreated={onCompanyCreated} />
    </div>
  );
}

export function CompanyMiniCard({ company, manager }: { company: CompanyResponse; manager: boolean; }) {
  return (
    <div className="company-mini-card">
      <div>
        <strong>{company.name}</strong>
        <small>Создана: {formatDate(company.created_at)}</small>
      </div>
      <span className={`status-chip ${manager ? "ok" : "warn"}`}>
        {manager ? "Менеджер" : "Участник"}
      </span>
    </div>
  );
}
