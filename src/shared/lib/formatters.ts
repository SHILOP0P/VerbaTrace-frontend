import type {
CallResponse,
CompanyResponse,
DepartmentResponse,
InstructionScope,
Invitation,
InvitationDepartmentRole,
MembershipStatus,
ReportFormat,
ReportResponse,
TranscriptionSpeakerAssignment,
VisibilityScope
} from "../../types";

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";

  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = value >= 10 || unitIndex === 0 ? Math.round(value).toString() : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

export function reportFormatLabel(format: ReportFormat) {
  if (format === "pdf") return "PDF";
  if (format === "docx") return "DOCX";
  if (format === "md") return "Markdown";
  return "Excel";
}

export function reportStatusLabel(status: ReportResponse["status"]) {
  if (status === "ready") return "Готов";
  if (status === "failed") return "Ошибка";
  return "Формируется";
}

export function contextLabel(
  call: CallResponse,
  companies: CompanyResponse[],
  departments: DepartmentResponse[]
) {
  if (call.visibility_scope === "personal") return "Личный звонок";
  const company = companies.find((item) => item.id === call.company_uuid)?.name ?? "Компания";
  if (call.visibility_scope === "company") return company;
  const department = departments.find((item) => item.id === call.department_uuid)?.name ?? "Отдел";
  return `${company} · ${department}`;
}

export function instructionScopeLabel(scope: InstructionScope) {
  if (scope === "personal") return "Лично";
  if (scope === "company") return "Компания";
  return "Отдел";
}

export function callScopeLabel(scope: VisibilityScope) {
  if (scope === "personal") return "Лично мне";
  if (scope === "company") return "В компанию";
  return "В отдел";
}

export function invitationRoleLabel(invitation: Invitation) {
  if (invitation.department_role === "department_leader") return "Руководитель отдела";
  return "Сотрудник";
}

export function departmentRoleText(role: InvitationDepartmentRole) {
  return role === "department_leader" ? "Руководитель отдела" : "Сотрудник";
}

export function membershipStatusText(status: MembershipStatus) {
  if (status === "active") return "Активен";
  return "Покинул компанию";
}

export function speakerLabel(speaker: string) {
  const trimmed = speaker.trim();
  if (!trimmed) return "Спикер не указан";

  const match = /^speaker_(\d+)$/i.exec(trimmed);
  if (!match) return trimmed;

  return `Спикер ${Number(match[1]) + 1}`;
}

export function transcriptionSpeakerLabel(speaker: string, assignments: TranscriptionSpeakerAssignment[] = []) {
  const key = speaker.trim() || "unknown";
  const displayName = assignments.find((item) => item.speaker_key === key)?.display_name.trim();
  return displayName || speakerLabel(key === "unknown" ? "" : key);
}

export function formatSegmentTimeRange(start?: number | null, end?: number | null) {
  const formattedStart = formatTimestamp(start);
  const formattedEnd = formatTimestamp(end);

  if (formattedStart && formattedEnd) return `${formattedStart} - ${formattedEnd}`;
  if (formattedStart) return formattedStart;
  if (formattedEnd) return formattedEnd;
  return "Таймкод не указан";
}

export function formatTimestamp(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const rest = (safeSeconds % 60).toString().padStart(2, "0");

  if (hours > 0) return `${hours}:${minutes}:${rest}`;
  return `${minutes}:${rest}`;
}
