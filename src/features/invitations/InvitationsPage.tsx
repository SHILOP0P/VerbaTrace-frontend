import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  Check,
  Plus,
  UsersRound,
  X
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type {
  CompanyResponse,
  DepartmentResponse,
  Invitation,
  InvitationDepartmentRole,
  SessionState
} from "../../types";

import { formatDate, invitationRoleLabel } from "../../shared/lib/formatters";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { CallListSkeleton } from "../../shared/ui/loading";
import { SelectControl } from "../../shared/ui/primitives";

export function InvitationsPage({
  invitations,
  companies,
  departments,
  session,
  loading,
  onBackToSettings,
  onInvitationCreated,
  onInvitationAccepted,
  onInvitationDeclined
}: {
  invitations: Invitation[];
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  session: SessionState;
  loading: boolean;
  onBackToSettings: () => void;
  onInvitationCreated: (invitation: Invitation) => void;
  onInvitationAccepted: (invitation: Invitation) => Promise<void>;
  onInvitationDeclined: (invitation: Invitation) => void;
}) {
  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");

  return (
    <section className="invitations-layout app-page settings-subpage-layout">
      <div className="settings-back-row">
        <button className="ghost-button small" type="button" onClick={onBackToSettings}>
          <ArrowLeft size={16} />
          Назад
        </button>
      </div>
      <div className="invitations-list glass">
        <div className="panel-heading large">
          <div className="app-page-heading settings-heading compact-heading">
            <span className="settings-heading-icon" aria-hidden="true">
              <Bell size={26} />
            </span>
            <div>
              <h1>Приглашения</h1>
              <p>Входящие заявки в компанию или отдел.</p>
            </div>
          </div>
          <span className="status-chip warn">{pendingInvitations.length}</span>
        </div>
        {loading ? (
          <CallListSkeleton count={3} compact />
        ) : pendingInvitations.length === 0 ? (
          <div className="empty-panel">
            <Bell size={34} />
            <h2>Нет входящих приглашений</h2>
          </div>
        ) : (
          <div className="invitation-card-list">
            {pendingInvitations.map((invitation) => (
              <InvitationCard
                key={invitation.id}
                invitation={invitation}
                companies={companies}
                departments={departments}
                onAccepted={onInvitationAccepted}
                onDeclined={onInvitationDeclined}
              />
            ))}
          </div>
        )}
      </div>
      <InvitationCreatePanel
        companies={companies}
        departments={departments}
        session={session}
        onInvitationCreated={onInvitationCreated}
      />
    </section>
  );
}

export function InvitationCard({
  invitation,
  companies,
  departments,
  onAccepted,
  onDeclined
}: {
  invitation: Invitation;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  onAccepted: (invitation: Invitation) => Promise<void>;
  onDeclined: (invitation: Invitation) => void;
}) {
  const [busyAction, setBusyAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");
  const [transferPrompt, setTransferPrompt] = useState("");

  const companyName = companies.find((company) => company.id === invitation.company_uuid)?.name;
  const departmentName = departments.find((department) => department.id === invitation.department_uuid)?.name;
  const isDepartmentInvitation = Boolean(invitation.department_uuid);

  async function acceptInvitation(confirmTransfer = false) {
    setError("");
    setBusyAction("accept");
    try {
      const accepted = await api.acceptInvitation(invitation.id, confirmTransfer);
      setTransferPrompt("");
      await onAccepted(accepted);
    } catch (acceptError) {
      // Joining a new company means leaving the current one, so the move is
      // confirmed explicitly instead of happening behind the user's back.
      if (acceptError instanceof ApiError && acceptError.code === "company_membership_conflict") {
        const current = (acceptError.details?.current_company_name as string) || "текущей компании";
        setTransferPrompt(current);
        return;
      }
      setError(acceptError instanceof Error ? acceptError.message : "Не удалось принять приглашение");
    } finally {
      setBusyAction(null);
    }
  }

  async function declineInvitation() {
    setError("");
    setBusyAction("decline");
    try {
      const declined = await api.declineInvitation(invitation.id);
      onDeclined(declined);
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Не удалось отклонить приглашение");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article className="invitation-card">
      <div className="invitation-icon">
        {isDepartmentInvitation ? <UsersRound size={20} /> : <BriefcaseBusiness size={20} />}
      </div>
      <div className="invitation-main">
        <div className="invitation-title-row">
          <span className="status-chip warn">{isDepartmentInvitation ? "Отдел" : "Компания"}</span>
          <span className="status-chip ok">{invitationRoleLabel(invitation)}</span>
        </div>
        <h2>{isDepartmentInvitation ? departmentName ?? "Отдел" : companyName ?? "Компания"}</h2>
        <p>
          {companyName ?? "Компания недоступна"}
          {isDepartmentInvitation && ` · ${departmentName ?? "Отдел недоступен"}`}
        </p>
        <small>Срок действия: {formatDate(invitation.expires_at)}</small>
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="invitation-actions">
        <button className="primary-button small" onClick={() => void acceptInvitation()} disabled={Boolean(busyAction)}>
          <Check size={16} />
          {busyAction === "accept" ? "Принимаю..." : "Принять"}
        </button>
        <button className="ghost-button small" onClick={declineInvitation} disabled={Boolean(busyAction)}>
          <X size={16} />
          {busyAction === "decline" ? "Отклоняю..." : "Отклонить"}
        </button>
      </div>
      <ConfirmDialog
        open={Boolean(transferPrompt)}
        title="Перейти в другую компанию?"
        message={`Вы сейчас работаете в компании «${transferPrompt}». Если продолжить, вы покинете её и потеряете доступ к её звонкам, отделам и инструкциям.`}
        confirmLabel="Перейти"
        cancelLabel="Остаться"
        variant="danger"
        busy={busyAction === "accept"}
        onCancel={() => setTransferPrompt("")}
        onConfirm={() => void acceptInvitation(true)}
      />
    </article>
  );
}

export function InvitationCreatePanel({
  companies,
  departments,
  session,
  allowCompanyInvitations = true,
  allowedDepartmentIds,
  onInvitationCreated
}: {
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  session: SessionState;
  allowCompanyInvitations?: boolean;
  allowedDepartmentIds?: string[];
  onInvitationCreated: (invitation: Invitation) => void;
}) {
  const [mode, setMode] = useState<"company" | "department">(allowCompanyInvitations ? "company" : "department");
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [username, setUsername] = useState("");
  const [departmentRole, setDepartmentRole] = useState<InvitationDepartmentRole>("employee");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [engagedPrompt, setEngagedPrompt] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const availableDepartments = departments.filter((department) => department.company_uuid === companyId && (!allowedDepartmentIds || allowedDepartmentIds.includes(department.id)));
  const selectedCompany = companies.find((company) => company.id === companyId);
  const canInviteDepartmentLeader = selectedCompany?.manager_user_uuid === session.user.id;

  useEffect(() => {
    if (!allowCompanyInvitations && mode !== "department") setMode("department");
  }, [allowCompanyInvitations, mode]);

  useEffect(() => {
    if (!companyId && companies[0]) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  useEffect(() => {
    if (availableDepartments[0] && !availableDepartments.some((department) => department.id === departmentId)) {
      setDepartmentId(availableDepartments[0].id);
    }
  }, [availableDepartments, departmentId]);

  useEffect(() => {
    if (!canInviteDepartmentLeader && departmentRole !== "employee") {
      setDepartmentRole("employee");
    }
  }, [canInviteDepartmentLeader, departmentRole]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendInvitation();
  }

  async function requestTransfer() {
    if (!transferTarget || !companyId || !departmentId) return;
    setBusy(true);
    setError("");
    try {
      await api.requestDepartmentTransfer(companyId, departmentId, transferTarget);
      setTransferTarget("");
      setSuccess("Запрос на перевод отправлен заместителю.");
      setUsername("");
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : "Не удалось отправить запрос на перевод");
      setTransferTarget("");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvitation(acknowledge = false) {
    setError("");
    setSuccess("");

    if (!companyId) {
      setError("Выберите компанию.");
      return;
    }

    if (mode === "department" && !departmentId) {
      setError("Выберите отдел.");
      return;
    }

    if (!username.trim()) {
      setError("Введите тэг пользователя.");
      return;
    }

    setBusy(true);
    try {
      const created =
        mode === "company"
          ? await api.createCompanyInvitation(companyId, username.trim(), acknowledge)
          : await api.createDepartmentInvitation(companyId, departmentId, username.trim(), departmentRole, acknowledge);
      onInvitationCreated(created);
      setEngagedPrompt(false);
      setSuccess(
        created.approval_status === "pending"
          ? "Приглашение отправлено на одобрение заместителю."
          : "Приглашение отправлено."
      );
      setUsername("");
    } catch (createError) {
      // The person already works somewhere, so inviting them is a move and the
      // sender confirms it first.
      if (createError instanceof ApiError && createError.code === "target_already_engaged") {
        setEngagedPrompt(true);
        return;
      }
      // A leader cannot take a colleague from another department: that move is
      // a request addressed to the deputy.
      if (createError instanceof ApiError && createError.code === "department_transfer_required") {
        const userId = createError.details?.user_uuid;
        setTransferTarget(typeof userId === "string" ? userId : "");
        return;
      }
      setError(createError instanceof Error ? createError.message : "Не удалось отправить приглашение");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="invitation-create glass" onSubmit={submit}>
      <h2>Отправить приглашение</h2>
      {allowCompanyInvitations && <div className="segmented scope">
        <button
          type="button"
          className={mode === "company" ? "active" : ""}
          onClick={() => setMode("company")}
        >
          Компания
        </button>
        <button
          type="button"
          className={mode === "department" ? "active" : ""}
          onClick={() => setMode("department")}
        >
          Отдел
        </button>
      </div>}
      <label>
        Компания
        <SelectControl value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </SelectControl>
      </label>
      {mode === "department" && (
        <>
          <label>
            Отдел
            <SelectControl value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              {availableDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </SelectControl>
          </label>
          <label>
            Роль
            <SelectControl
              value={departmentRole}
              onChange={(event) => setDepartmentRole(event.target.value as InvitationDepartmentRole)}
            >
              <option value="employee">Сотрудник</option>
              {canInviteDepartmentLeader && <option value="department_leader">Руководитель отдела</option>}
            </SelectControl>
          </label>
        </>
      )}
      <label>
        Тэг
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="@muxa"
        />
      </label>
      {companies.length === 0 && <div className="instruction-empty standalone">Компаний пока нет.</div>}
      {error && <div className="form-error">{error}</div>}
      {success && <div className="form-success">{success}</div>}
      <button className="primary-button" type="submit" disabled={busy || companies.length === 0}>
        <Plus size={18} />
        {busy ? "Отправляю..." : "Отправить приглашение"}
      </button>
      <ConfirmDialog
        open={engagedPrompt}
        title="Пользователь уже состоит в компании"
        message="Этот человек уже работает в компании или отделе. Если он примет приглашение, он покинет прежнее место. Точно отправить приглашение?"
        confirmLabel="Отправить"
        cancelLabel="Отмена"
        busy={busy}
        onCancel={() => setEngagedPrompt(false)}
        onConfirm={() => void sendInvitation(true)}
      />
      <ConfirmDialog
        open={Boolean(transferTarget)}
        title="Сотрудник уже в другом отделе"
        message="Забрать сотрудника из другого отдела может только владелец компании или его заместитель. Отправить им запрос на перевод?"
        confirmLabel="Отправить запрос"
        cancelLabel="Отмена"
        busy={busy}
        onCancel={() => setTransferTarget("")}
        onConfirm={() => void requestTransfer()}
      />
    </form>
  );
}
