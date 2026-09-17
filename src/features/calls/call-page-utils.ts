import { ApiError, api } from "../../api";
import type {
  CallFolderResponse,
  CallResponse,
  CompanyResponse,
  DepartmentResponse,
  SessionState
} from "../../types";

export function folderScopeLabel(folder: CallFolderResponse) {
  if (folder.scope === "personal") return "Личная";
  if (folder.scope === "company") return "Компания";
  if (folder.scope === "department") return "Отдел";
  return folder.scope || "Область";
}

export async function loadCallFoldersForContext(
  companies: CompanyResponse[],
  departments: DepartmentResponse[]
) {
  const requests = [
    api.listCallFolders({ scope: "personal", limit: 100, offset: 0 }),
    ...companies.map((company) => api.listCallFolders({ scope: "company", company_uuid: company.id, limit: 100, offset: 0 })),
    ...departments.map((department) => api.listCallFolders({
      scope: "department",
      company_uuid: department.company_uuid,
      department_uuid: department.id,
      limit: 100,
      offset: 0
    }))
  ];
  const responses = await Promise.all(requests.map((request) => request.catch(() => ({ items: [] as CallFolderResponse[] }))));
  const folders = new Map<string, CallFolderResponse>();
  responses.forEach((response) => response.items.forEach((folder) => folders.set(folder.id, folder)));
  return Array.from(folders.values());
}

export function managerLabel(
  manager: { id: string; full_name: string; full_surname: string; username: string },
  session: SessionState
) {
  if (manager.id === session.user.id) {
    return `${session.user.full_name} ${session.user.full_surname}`.trim() || "Мои звонки";
  }
  const fullName = `${manager.full_name} ${manager.full_surname}`.trim();
  // Not even a piece of a uuid goes on screen: a person without a name and
  // without a handle is still a person, not an identifier.
  return fullName || formatUsername(manager.username) || "Пользователь";
}

export function isWithinPeriod(value: string, period: "all" | "7d" | "30d") {
  if (period === "all") return true;
  const createdAt = new Date(value).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt <= (period === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

export function periodStart(period: "all" | "7d" | "30d") {
  if (period === "all") return undefined;
  const date = new Date();
  date.setDate(date.getDate() - (period === "7d" ? 7 : 30));
  return date.toISOString();
}

export function formatUsername(username: string) {
  const trimmed = username.trim();
  return !trimmed ? "" : trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function callSearchText(call: CallResponse) {
  const maybeNamedCall = call as CallResponse & { name?: unknown };
  return [call.title, typeof maybeNamedCall.name === "string" ? maybeNamedCall.name : "", call.original_filename]
    .join(" ")
    .toLowerCase();
}

export function friendlyCallActionError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.code === "invalid_call_title") return "Введите название звонка.";
    if (error.code === "call_not_found") return "Звонок не найден.";
  }
  return error instanceof Error ? error.message : fallback;
}
