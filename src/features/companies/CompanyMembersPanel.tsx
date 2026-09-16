import { ShieldCheck, UserMinus, UserRoundCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import type {
  AnalysisRerunRequest,
  CompanyMemberListItemResponse,
  DepartmentResponse,
  DepartmentTransferRequest,
  Invitation,
  SessionState,
} from "../../types";
import { formatDate } from "../../shared/lib/formatters";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { CallListSkeleton } from "../../shared/ui/loading";

type PendingAction =
  | { kind: "remove"; member: CompanyMemberListItemResponse }
  | { kind: "deputy"; member: CompanyMemberListItemResponse }
  | { kind: "revoke"; member: CompanyMemberListItemResponse }
  | { kind: "ownership"; member: CompanyMemberListItemResponse }
  | null;

/**
 * CompanyMembersPanel is where the owner and the deputy run the company:
 * who works here, who helps to manage it, and what is waiting for a decision.
 */
export function CompanyMembersPanel({
  companyId,
  departments,
  session,
  isOwner,
}: {
  companyId: string;
  departments: DepartmentResponse[];
  session: SessionState;
  isOwner: boolean;
}) {
  const [members, setMembers] = useState<CompanyMemberListItemResponse[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [transfers, setTransfers] = useState<DepartmentTransferRequest[]>([]);
  const [reruns, setReruns] = useState<AnalysisRerunRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  // Regular members simply do not get this panel, and the server is the one
  // who decides that.
  const [visible, setVisible] = useState(true);

  const reload = useCallback(async () => {
    setError("");
    try {
      const [membersResponse, invitationList, transferList, rerunList] = await Promise.all([
        api.listCompanyMembers(companyId, { status: "active", limit: 100 }),
        api.listCompanyInvitations(companyId, "pending").catch(() => [] as Invitation[]),
        api.listDepartmentTransfers(companyId, "pending").catch(() => ({ items: [] as DepartmentTransferRequest[] })),
        api.listAnalysisRerunRequests(companyId).catch(() => ({ items: [] as AnalysisRerunRequest[] })),
      ]);
      setMembers(membersResponse.members);
      setInvitations(invitationList);
      setTransfers(transferList.items);
      setReruns(rerunList.items);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404)) {
        setVisible(false);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить участников");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!visible) return null;

  async function runAction(action: Exclude<PendingAction, null>) {
    setBusyUser(action.member.user_uuid);
    setError("");
    try {
      if (action.kind === "remove") {
        await api.removeCompanyMember(companyId, action.member.user_uuid);
      }
      if (action.kind === "deputy") {
        await api.updateCompanyMemberRole(companyId, action.member.user_uuid, "company_deputy");
      }
      if (action.kind === "revoke") {
        await api.updateCompanyMemberRole(companyId, action.member.user_uuid, "employee");
      }
      if (action.kind === "ownership") {
        await api.offerCompanyOwnership(companyId, action.member.user_uuid);
      }
      setPending(null);
      await reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось выполнить действие");
      setPending(null);
    } finally {
      setBusyUser("");
    }
  }

  async function decideInvitation(invitation: Invitation, approve: boolean) {
    setBusyUser(invitation.id);
    setError("");
    try {
      await api.decideInvitationApproval(companyId, invitation.id, approve);
      await reload();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не удалось принять решение");
    } finally {
      setBusyUser("");
    }
  }

  async function decideTransfer(request: DepartmentTransferRequest, approve: boolean) {
    setBusyUser(request.id);
    setError("");
    try {
      await api.decideDepartmentTransfer(companyId, request.id, approve);
      await reload();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не удалось принять решение");
    } finally {
      setBusyUser("");
    }
  }

  async function decideRerun(request: AnalysisRerunRequest, approve: boolean) {
    setBusyUser(request.id);
    setError("");
    try {
      await api.decideAnalysisRerunRequest(request.id, approve);
      await reload();
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Не удалось принять решение");
    } finally {
      setBusyUser("");
    }
  }

  const departmentName = (id: string | null) =>
    departments.find((department) => department.id === id)?.name ?? "Без отдела";
  const memberName = (userId: string) => {
    const member = members.find((item) => item.user_uuid === userId);
    if (!member) return "Сотрудник";
    return `${member.full_surname} ${member.full_name}`.trim() || member.username;
  };

  const approvalInvitations = invitations.filter((invitation) => invitation.approval_status === "pending");

  return (
    <section className="company-card glass">
      <div className="panel-heading">
        <div>
          <h2>Участники компании</h2>
          <p>Назначайте заместителя, исключайте сотрудников и решайте спорные запросы.</p>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}

      {loading ? (
        <CallListSkeleton count={3} compact />
      ) : members.length === 0 ? (
        <div className="instruction-empty standalone">В компании пока только вы.</div>
      ) : (
        <div className="department-member-list">
          {members.map((member) => {
            const self = member.user_uuid === session.user.id;
            const isDeputy = member.company_role === "company_deputy";
            const isCompanyOwner = member.company_role === "company_manager";
            return (
              <article className="department-member-row company-member-row" key={member.user_uuid}>
                <div className="department-member-main">
                  <strong>{`${member.full_surname} ${member.full_name}`.trim() || member.username}</strong>
                  <small>
                    {member.username} ·{" "}
                    {member.departments.length > 0
                      ? member.departments.map((department) => department.department_name).join(", ")
                      : "Без отдела"}
                  </small>
                </div>
                <span className={`status-chip ${isCompanyOwner || isDeputy ? "ok" : "warn"}`}>
                  {isCompanyOwner ? "Владелец" : isDeputy ? "Заместитель" : "Сотрудник"}
                </span>
                {!self && !isCompanyOwner && (
                  <div className="panel-actions">
                    {isOwner && !isDeputy && (
                      <button
                        className="ghost-button small"
                        type="button"
                        disabled={busyUser === member.user_uuid}
                        onClick={() => setPending({ kind: "deputy", member })}
                      >
                        <ShieldCheck size={16} />
                        Сделать замом
                      </button>
                    )}
                    {isOwner && isDeputy && (
                      <button
                        className="ghost-button small"
                        type="button"
                        disabled={busyUser === member.user_uuid}
                        onClick={() => setPending({ kind: "revoke", member })}
                      >
                        <ShieldCheck size={16} />
                        Снять зама
                      </button>
                    )}
                    {isOwner && (
                      <button
                        className="ghost-button small"
                        type="button"
                        disabled={busyUser === member.user_uuid}
                        onClick={() => setPending({ kind: "ownership", member })}
                      >
                        <UserRoundCog size={16} />
                        Передать компанию
                      </button>
                    )}
                    <button
                      className="ghost-button small danger"
                      type="button"
                      disabled={busyUser === member.user_uuid}
                      onClick={() => setPending({ kind: "remove", member })}
                    >
                      <UserMinus size={16} />
                      Исключить
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {approvalInvitations.length > 0 && (
        <div className="company-mini-list">
          <h3>Приглашения на одобрение</h3>
          {approvalInvitations.map((invitation) => (
            <article className="company-mini-card" key={invitation.id}>
              <div>
                <strong>{memberName(invitation.invited_user_uuid)}</strong>
                <small>
                  {departmentName(invitation.department_uuid)} · до {formatDate(invitation.expires_at)}
                </small>
              </div>
              <div className="panel-actions">
                <button
                  className="primary-button small"
                  type="button"
                  disabled={busyUser === invitation.id}
                  onClick={() => void decideInvitation(invitation, true)}
                >
                  Одобрить
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  disabled={busyUser === invitation.id}
                  onClick={() => void decideInvitation(invitation, false)}
                >
                  Отклонить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {reruns.length > 0 && (
        <div className="company-mini-list">
          <h3>Запросы на повторный анализ</h3>
          {reruns.map((request) => (
            <article className="company-mini-card" key={request.id}>
              <div>
                <strong>{memberName(request.requested_by_user_uuid)}</strong>
                <small>{request.reason?.trim() || "Без пояснения"} · {formatDate(request.created_at)}</small>
              </div>
              <div className="panel-actions">
                <button
                  className="primary-button small"
                  type="button"
                  disabled={busyUser === request.id}
                  onClick={() => void decideRerun(request, true)}
                >
                  Перезапустить
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  disabled={busyUser === request.id}
                  onClick={() => void decideRerun(request, false)}
                >
                  Отклонить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {transfers.length > 0 && (
        <div className="company-mini-list">
          <h3>Запросы на перевод</h3>
          {transfers.map((request) => (
            <article className="company-mini-card" key={request.id}>
              <div>
                <strong>{memberName(request.user_uuid)}</strong>
                <small>
                  {departmentName(request.from_department_uuid)} в {departmentName(request.to_department_uuid)}
                </small>
              </div>
              <div className="panel-actions">
                <button
                  className="primary-button small"
                  type="button"
                  disabled={busyUser === request.id}
                  onClick={() => void decideTransfer(request, true)}
                >
                  Перевести
                </button>
                <button
                  className="ghost-button small"
                  type="button"
                  disabled={busyUser === request.id}
                  onClick={() => void decideTransfer(request, false)}
                >
                  Отклонить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={confirmTitle(pending)}
        message={confirmMessage(pending)}
        confirmLabel={pending?.kind === "remove" ? "Исключить" : "Подтвердить"}
        variant={pending?.kind === "remove" ? "danger" : "default"}
        busy={Boolean(busyUser)}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && void runAction(pending)}
      />
    </section>
  );
}

function confirmTitle(action: PendingAction) {
  if (!action) return "";
  if (action.kind === "remove") return "Исключить сотрудника?";
  if (action.kind === "deputy") return "Назначить заместителя?";
  if (action.kind === "revoke") return "Снять заместителя?";
  return "Передать компанию?";
}

function confirmMessage(action: PendingAction) {
  if (!action) return "";
  const name = `${action.member.full_surname} ${action.member.full_name}`.trim() || action.member.username;
  if (action.kind === "remove") {
    return `${name} потеряет доступ ко всем данным компании: звонкам, отделам, папкам и инструкциям. Повторное приглашение от лидера отдела будет требовать вашего одобрения.`;
  }
  if (action.kind === "deputy") {
    return `${name} получит все права управления компанией, кроме удаления компании, подписки, лимитов, назначения заместителей и передачи владения.`;
  }
  if (action.kind === "revoke") {
    return `${name} останется в компании обычным сотрудником и потеряет права управления.`;
  }
  return `${name} получит уведомление и станет владельцем компании после подтверждения. Вы останетесь в компании как заместитель.`;
}
