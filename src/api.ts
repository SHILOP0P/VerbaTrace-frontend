import type {
  AdminCapabilitiesResponse,
  AdminCompanyLifecycleResponse,
  AdminCompanyResponse,
  AssistantCapabilities,
  AssistantDraft,
  AssistantChat,
  AssistantMessage,
  AssistantRun,
  ContentSearchResponse,
  AdminCompaniesResponse,
  AdminSubscriptionResponse,
  AdminUsersResponse,
  AnalysisInstruction,
  AnalysisInstructionVersion,
  AnalysisPersonalization,
  AnalysisPersonalizationScope,
  AnalysisResponse,
  AppliedInstruction,
  AnalysisReviewContext,
  AuthResponse,
  AnalyticsOverviewResponse,
  AvatarResponse,
  CallFilterOptionsResponse,
  CallFoldersListResponse,
  CallFolderResponse,
  CompanyDataTransfer,
  CompanyOwnershipTransfer,
  DepartmentTransferRequest,
  CallResponse,
  CallAction,
  CallActionsResponse,
  AnalysisRerunRequest,
  CallActionAssigneesResponse,
  CreateCallActionRequest,
  CallStatus,
  CallsListResponse,
  DeletedCallsListResponse,
  CompanyCreditForecast,
  AdminAuditTrail,
  AdminAuditTrailResponse,
  CompanyLifecycle,
  CompanyResponse,
  CreditDashboardResponse,
  CreatedIntegrationKey,
  DeveloperApplication,
  CompanyMemberListItemResponse,
  CompanyMembersResponse,
  DepartmentMemberResponse,
  CreateCallFolderRequest,
  CreateGlobalReportRequest,
  CreateReportRequest,
  DepartmentResponse,
  GlobalReportsResponse,
  Invitation,
  InvitationCompanyRole,
  InvitationDepartmentRole,
  InvitationStatus,
  InstructionScope,
  LoginRequest,
  NotificationResponse,
  NotificationsResponse,
  Plan,
  PlanCode,
  PlanType,
  PlansResponse,
  ProcessingMonitoringResponse,
  PrivacyPolicyConfig,
  PrivacyPolicyScope,
  PrivacyPolicyView,
  PrivacyCorrectionRequest,
  PrivacyCorrectionPreview,
  QualityReviewAppeal,
  QualityReviewEvent,
  QualityReviewResponse,
  QualityReviewsResponse,
  RedactedMediaVariant,
  RegisterRequest,
  ReportFormat,
  ReportResponse,
  ReportStatus,
  ReportsResponse,
  SupportAccessJournalEntry,
  SearchResponse,
  Subscription,
  SubscriptionUsageResponse,
  TranscriptionResponse,
  TranscriptionRevisionContent,
  TranscriptionRevisionListResponse,
  TranscriptionSpeakerAssignment,
  TranscriptionUpdateResponse,
  UpdateTranscriptionRequest,
  UpdateCallFolderRequest,
  UpdatePasswordRequest,
  UpdatePasswordResponse,
  UpdatePreferencesRequest,
  UpdateProfileRequest,
  UserPreferencesResponse,
  UserResponse,
  UserSessionsResponse,
  VisibilityScope,
} from "./types";
import { AuthorizedEventStream } from "./shared/lib/authorized-event-stream";
import { coordinateRefresh } from "./features/auth/refresh-coordinator";

const configuredBase =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const apiRoot = `${configuredBase}/api/v1`;
const authRefreshPath = "/auth/refresh";
const sessionExpiredEvent = "verbatrace:session-expired";

function notifySessionExpired() {
  window.dispatchEvent(new Event(sessionExpiredEvent));
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const apiErrorMessages: Record<string, string> = {
  subscription_required: "Требуется активная подписка",
  subscription_not_found: "Подписка не найдена",
  invalid_billing_input: "Некорректные данные подписки",
  failed_to_cancel_subscription: "Не удалось отменить подписку",
  // Running out of budget is not a failure: the call is accepted and waits.
  company_credit_limit_exceeded:
    "Лимит кредитов компании исчерпан. Звонок подождёт в очереди и начнёт обрабатываться, когда лимит обновится",
  department_credit_limit_exceeded:
    "Лимит кредитов отдела исчерпан. Звонок подождёт в очереди и начнёт обрабатываться, когда лимит обновится",
  pending_credit_queue_full:
    "Слишком много звонков уже ждут кредитов. Дождитесь их обработки или увеличьте лимит",
  company_frozen:
    "Компания заморожена: данные можно читать, но не изменять",
  company_deletion_in_progress: "Компания удаляется. Сначала отмените удаление",
  call_processing_in_progress:
    "Звонок ещё обрабатывается. Сначала отмените обработку",
  call_in_bin:
    "Звонок помещён в корзину. Восстановите его, чтобы вносить изменения",
  failed_to_convert_subscription: "Не удалось обработать данные подписки",
  failed_to_list_plans: "Не удалось загрузить тарифы",
  failed_to_convert_plan: "Не удалось обработать тарифы",
  plan_limit_exceeded: "Лимит тарифа исчерпан",
  monthly_minutes_limit_exceeded: "Месячный лимит минут исчерпан",
  instruction_limit_exceeded: "Лимит активных инструкций исчерпан",
  company_limit_exceeded:
    "Тариф не покрывает ещё одну компанию. Повысьте тариф или освободите слот",
  department_limit_exceeded: "Лимит отделов исчерпан",
  member_limit_exceeded: "Лимит сотрудников исчерпан",
  // A business plan belongs to the owner and covers several companies, so
  // neither end of a handover can be halfway.
  ownership_recipient_busy:
    "У этого человека уже есть своя компания или бизнес-подписка. Принять передачу он не может",
  ownership_scope_mismatch:
    "Одну компанию из нескольких отделить от подписки нельзя: передавайте все сразу",
  company_selection_required:
    "Новый тариф покрывает меньше компаний. Сначала выберите, какие останутся активными",
  company_ownership_transfer_pending:
    "Предложение о передаче уже отправлено и ждёт ответа",
  company_ownership_transfer_not_found: "Предложение о передаче не найдено",
  company_deputy_already_assigned: "В компании уже есть заместитель",
  admin_reason_required: "Укажите причину: она обязательна для аудита",
  department_transfer_required:
    "Сотрудник уже в другом отделе этой компании. Нужен перевод, а не приглашение",
  forbidden: "Недостаточно прав",
  unauthorized: "Необходимо войти в аккаунт",
  invalid_request_body: "Некорректное тело запроса",
  invalid_user_input: "Некорректный username",
  user_already_exists: "Этот username уже занят",
  company_not_found: "Компания не найдена",
  department_not_found: "Отдел не найден",
  user_not_found: "Пользователь не найден",
  invalid_department_input: "Некорректные данные отдела",
  failed_to_create_department: "Не удалось создать отдел",
  failed_to_list_department_members: "Не удалось загрузить работников отдела",
  failed_to_update_department_member: "Не удалось обновить работника отдела",
  failed_to_convert_department: "Не удалось обработать данные отдела",
  invitation_not_found: "Приглашение не найдено",
  invalid_invitation_input: "Некорректные данные приглашения",
  invitation_already_exists: "Такое приглашение уже ожидает ответа",
  invitation_not_pending: "Это приглашение уже обработано",
  invitation_expired: "Срок действия приглашения истек",
  failed_to_create_invitation: "Не удалось создать приглашение",
  failed_to_list_invitations: "Не удалось загрузить приглашения",
  failed_to_accept_invitation: "Не удалось принять приглашение",
  failed_to_decline_invitation: "Не удалось отклонить приглашение",
  failed_to_cancel_invitation: "Не удалось отменить приглашение",
  failed_to_convert_invitation: "Не удалось обработать данные приглашения",
  call_not_found: "Звонок не найден",
  analysis_not_found: "Для этого звонка еще нет анализа.",
  invalid_analysis_status:
    "Анализ еще не готов. Экспорт станет доступен после завершения анализа.",
  export_access_denied: "Экспорт отчетов недоступен на текущем тарифе.",
  unsupported_report_format: "Этот формат экспорта не поддерживается.",
  report_not_found: "Отчет не найден.",
  report_already_exists:
    "Отчет этого формата уже создан или формируется. Используйте запись в списке ниже.",
  report_file_not_found: "Файл отчета недоступен",
  report_not_ready: "Отчет еще формируется.",
  report_expired: "Срок хранения отчета истек",
  failed_to_create_report: "Не удалось создать отчет",
  failed_to_list_reports: "Не удалось загрузить отчеты",
  failed_to_download_report: "Не удалось скачать отчет",
  failed_to_delete_report: "Не удалось удалить отчет",
  team_analytics_access_denied:
    "Командная аналитика недоступна на текущем тарифе",
  api_access_denied: "API-доступ недоступен на текущем тарифе",
  invalid_search_input: "Введите минимум 2 символа для поиска",
  notification_not_found: "Уведомление не найдено",
  failed_to_list_notifications: "Не удалось загрузить уведомления",
  failed_to_mark_notification_read: "Не удалось отметить уведомление",
  failed_to_mark_all_notifications_read: "Не удалось отметить уведомления",
  failed_to_get_subscription_usage: "Не удалось загрузить лимиты подписки",
  failed_to_list_call_filters: "Не удалось загрузить фильтры звонков",
  failed_to_get_analytics_overview: "Не удалось загрузить аналитику",
  failed_to_get_processing_monitoring: "Не удалось загрузить мониторинг",
  not_implemented: "Эта возможность пока не реализована на backend",
  audio_file_not_found: "Аудиофайл недоступен",
  instruction_file_not_found: "Файл инструкции недоступен",
  invalid_call_folder_input: "Некорректные данные папки звонков",
  call_folder_not_found: "Папка звонков не найдена",
  call_folder_scope_mismatch:
    "Звонок не подходит для выбранной папки по области доступа.",
  failed_to_create_call_folder: "Не удалось создать папку звонков",
  failed_to_list_call_folders: "Не удалось загрузить папки звонков",
  failed_to_update_call_folder: "Не удалось обновить папку звонков",
  failed_to_delete_call_folder: "Не удалось удалить папку звонков",
  failed_to_assign_call_folder: "Не удалось добавить звонок в папку",
  failed_to_remove_call_folder: "Не удалось убрать звонок из папки",
  quality_review_invalid_input: "Проверьте заполненные поля анализа",
  quality_review_forbidden:
    "Оспорить можно только анализ собственного корпоративного звонка",
  quality_review_not_found: "Анализ или заявка на проверку не найдены",
  quality_review_publication_blocked:
    "Для публикации завершите выбранные изменения",
  quality_review_version_conflict:
    "Черновик изменился в другом окне. Страница будет обновлена",
  quality_review_source_outdated:
    "Исходный анализ изменился — начните проверку заново",
  quality_review_conflict_of_interest:
    "Нельзя переоценивать собственный корпоративный звонок или собственную опубликованную версию",
  quality_review_limit_reached:
    "Две независимые человеческие оценки уже опубликованы. Дальнейшая переоценка недоступна",
  analysis_rerun_forbidden:
    "Перезапустить анализ может лидер отдела, заместитель или владелец",
  analysis_rerun_request_not_found: "Запрос на повторный анализ не найден",
  analysis_rerun_request_pending:
    "Запрос на повторный анализ уже отправлен",
  transcription_locked_by_review:
    "Транскрипцию нельзя менять, пока идёт проверка качества",
  quality_review_appeal_ceiling_reached:
    "Оценку заместителя и владельца обжаловать нельзя",
  quality_review_reviewer_must_differ:
    "Повторную оценку должен выполнить другой проверяющий",
  quality_review_active_appeal_exists:
    "Этот анализ уже находится на пересмотре",
  quality_review_failed: "Не удалось сохранить изменения анализа",
};

type ApiPayload = Record<string, unknown>;
type RawPlan = Partial<Plan> & {
  active_instructions_limit?: number;
  companies_limit?: number | null;
  departments_limit?: number | null;
  members_limit?: number | null;
  call_history_days?: number;
  export_reports_enabled?: boolean;
};

type RawSubscription = Omit<Partial<Subscription>, "plan"> & {
  plan?: RawPlan;
};

type RawSubscriptionUsageResponse = Omit<
  Partial<SubscriptionUsageResponse>,
  "subscription"
> & {
  subscription?: RawSubscription;
};

function isRecord(value: unknown): value is ApiPayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiErrorCode(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  return typeof payload.error.code === "string"
    ? payload.error.code
    : undefined;
}

function getApiErrorDetails(payload: unknown) {
  if (
    !isRecord(payload) ||
    !isRecord(payload.error) ||
    !isRecord(payload.error.details)
  )
    return undefined;
  return payload.error.details;
}

function getApiErrorMessage(
  payload: unknown,
  status: number,
  path: string,
  init: RequestInit,
) {
  const code = getApiErrorCode(payload);

  if (code && apiErrorMessages[code]) return apiErrorMessages[code];

  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return `HTTP ${status}`;
}

function numberOrFallback(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function booleanOrFallback(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function analysisLevelOrFallback(value: unknown) {
  return value === "basic" ||
    value === "plus" ||
    value === "pro" ||
    value === "priority"
    ? value
    : "basic";
}

function normalizePlan(plan: RawPlan): Plan {
  return {
    id: typeof plan.id === "string" ? plan.id : "",
    code: (typeof plan.code === "string"
      ? plan.code
      : "personal_start") as PlanCode,
    type: (plan.type === "business" ? "business" : "personal") as PlanType,
    name: typeof plan.name === "string" ? plan.name : "Тариф",
		monthly_price_minor: numberOrFallback(plan.monthly_price_minor),
		currency: typeof plan.currency === "string" ? plan.currency : "RUB",
		marketing_hours_hint: numberOrFallback(plan.marketing_hours_hint),
		monthly_minutes_limit: numberOrFallback(plan.monthly_minutes_limit),
		monthly_credit_allowance: numberOrFallback(
			plan.monthly_credit_allowance,
			numberOrFallback(plan.monthly_minutes_limit) * 875,
		),
    pending_credit_calls_limit: nullableNumber(plan.pending_credit_calls_limit),
    active_instruction_limit: numberOrFallback(
      plan.active_instruction_limit ?? plan.active_instructions_limit,
    ),
    company_limit: nullableNumber(plan.company_limit ?? plan.companies_limit),
    departments_per_company_limit: nullableNumber(
      plan.departments_per_company_limit ?? plan.departments_limit,
    ),
    members_per_company_limit: nullableNumber(
      plan.members_per_company_limit ?? plan.members_limit,
    ),
    instructions_per_department_limit: nullableNumber(
      plan.instructions_per_department_limit,
    ),
    analysis_level: analysisLevelOrFallback(plan.analysis_level),
    history_retention_days: numberOrFallback(
      plan.history_retention_days ?? plan.call_history_days,
    ),
    export_enabled: booleanOrFallback(
      plan.export_enabled ?? plan.export_reports_enabled,
    ),
    team_analytics_enabled: booleanOrFallback(plan.team_analytics_enabled),
    api_access_enabled: booleanOrFallback(plan.api_access_enabled),
		webhooks_enabled: booleanOrFallback(plan.webhooks_enabled),
  };
}

function normalizeSubscription(subscription: RawSubscription): Subscription {
  return {
    id: typeof subscription.id === "string" ? subscription.id : "",
    plan: normalizePlan(subscription.plan ?? {}),
    user_uuid:
      typeof subscription.user_uuid === "string"
        ? subscription.user_uuid
        : null,
    company_uuid:
      typeof subscription.company_uuid === "string"
        ? subscription.company_uuid
        : null,
    status:
      subscription.status === "canceled"
        ? "canceled"
        : subscription.status === "active"
          ? "active"
          : "expired",
    starts_at:
      typeof subscription.starts_at === "string" ? subscription.starts_at : "",
    ends_at:
      typeof subscription.ends_at === "string" ? subscription.ends_at : null,
    created_at:
      typeof subscription.created_at === "string"
        ? subscription.created_at
        : "",
    updated_at:
      typeof subscription.updated_at === "string"
        ? subscription.updated_at
        : "",
  };
}

function normalizeSubscriptionUsage(
  usage: RawSubscriptionUsageResponse,
): SubscriptionUsageResponse {
  return {
    subscription: normalizeSubscription(usage.subscription ?? {}),
    period_start:
      typeof usage.period_start === "string" ? usage.period_start : "",
    period_end: typeof usage.period_end === "string" ? usage.period_end : "",
    used_minutes: numberOrFallback(usage.used_minutes),
    limit_minutes: numberOrFallback(usage.limit_minutes),
    remaining_minutes: numberOrFallback(usage.remaining_minutes),
    percent: numberOrFallback(usage.percent),
    members_limit:
      typeof usage.members_limit === "number" ? usage.members_limit : undefined,
    members_used:
      typeof usage.members_used === "number" ? usage.members_used : undefined,
    departments_limit:
      typeof usage.departments_limit === "number"
        ? usage.departments_limit
        : undefined,
    departments_used:
      typeof usage.departments_used === "number"
        ? usage.departments_used
        : undefined,
    active_instructions_limit:
      typeof usage.active_instructions_limit === "number"
        ? usage.active_instructions_limit
        : undefined,
    active_instructions_used:
      typeof usage.active_instructions_used === "number"
        ? usage.active_instructions_used
        : undefined,
  };
}

function refreshSessionRequest() {
  return coordinateRefresh({
    refresh: () =>
      request<AuthResponse>(
        authRefreshPath,
        { method: "POST" },
        { retryOnUnauthorized: false },
      ),
    probe: async () => {
      try {
        return await request<UserResponse>(
          "/auth/me",
          {},
          { retryOnUnauthorized: false },
        );
      } catch {
        return null;
      }
    },
    isConflict: (error) =>
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === "refresh_rotation_conflict",
  });
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { retryOnUnauthorized?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (
      response.status === 401 &&
      options.retryOnUnauthorized !== false &&
      !path.startsWith("/auth/")
    ) {
      try {
        await refreshSessionRequest();
        return request<T>(path, init, { retryOnUnauthorized: false });
      } catch {
        // Keep the original unauthorized error for the caller.
      }
    }

    if (response.status === 401 && !path.startsWith("/auth/"))
      notifySessionExpired();

    const code = getApiErrorCode(payload);
    const message = getApiErrorMessage(payload, response.status, path, init);

    throw new ApiError(
      response.status,
      message,
      code,
      getApiErrorDetails(payload),
    );
  }

  return payload as T;
}

async function requestBlob(
  path: string,
  options: { retryOnUnauthorized?: boolean } = {},
): Promise<Blob> {
  const response = await fetch(`${apiRoot}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const contentType = response.headers.get("Content-Type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const code = getApiErrorCode(payload);
    const message = getApiErrorMessage(payload, response.status, path, {});

    if (response.status === 401 && options.retryOnUnauthorized !== false) {
      try {
        await refreshSessionRequest();
        return requestBlob(path, { retryOnUnauthorized: false });
      } catch {
        // Keep the original unauthorized error for the caller.
      }
    }

    if (response.status === 401) notifySessionExpired();

    throw new ApiError(
      response.status,
      message,
      code,
      getApiErrorDetails(payload),
    );
  }

  return response.blob();
}

async function requestAssetBlob(
  url: string,
  options: { retryOnUnauthorized?: boolean } = {},
): Promise<Blob> {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    const contentType = response.headers.get("Content-Type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const code = getApiErrorCode(payload);
    const message = getApiErrorMessage(payload, response.status, url, {});

    if (response.status === 401 && options.retryOnUnauthorized !== false) {
      try {
        await refreshSessionRequest();
        return requestAssetBlob(url, { retryOnUnauthorized: false });
      } catch {
        // Keep the original unauthorized error for the caller.
      }
    }

    if (response.status === 401) notifySessionExpired();

    throw new ApiError(
      response.status,
      message,
      code,
      getApiErrorDetails(payload),
    );
  }

  return response.blob();
}

function absoluteApiAssetUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${configuredBase}${value}`;
  return value;
}

function queryString(input: object = {}) {
  const params = new URLSearchParams();

  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
      return;
    }
    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

function apiPathFromUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith("/api/v1/"))
    return pathOrUrl.slice("/api/v1".length);
  if (!pathOrUrl.startsWith("/")) return `/${pathOrUrl}`;
  return pathOrUrl;
}

export function getCallMediaUrl(call: CallResponse, variant?: "original" | "redacted", accessSession?: string) {
  const callWithAudioLinks = call as CallResponse & {
    audio_url?: string | null;
    audio_download_url?: string | null;
    file_url?: string | null;
    media_url?: string | null;
    recording_url?: string | null;
    download_url?: string | null;
  };
  const directUrl = variant ? undefined : [
    callWithAudioLinks.media_url,
    callWithAudioLinks.audio_url,
    callWithAudioLinks.audio_download_url,
    callWithAudioLinks.file_url,
    callWithAudioLinks.recording_url,
    callWithAudioLinks.download_url,
  ].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  if (directUrl) return absoluteApiAssetUrl(directUrl);

  const params = new URLSearchParams();
  if (variant) params.set("variant", variant);
  if (accessSession) params.set("access_session", accessSession);
  const query = params.toString();
  return `${apiRoot}/calls/${encodeURIComponent(call.id)}/media${query ? `?${query}` : ""}`;
}

export function getCallMediaBlob(call: CallResponse, variant?: "original" | "redacted", accessSession?: string) {
  return requestAssetBlob(getCallMediaUrl(call, variant, accessSession));
}

export const getCallAudioUrl = getCallMediaUrl;
export const getCallAudioBlob = getCallMediaBlob;

export function getAdminCallAudioBlob(callId: string) {
  return requestBlob(`/admin/calls/${encodeURIComponent(callId)}/audio`);
}

export function openAuthorizedEventStream(url: string) {
  return new AuthorizedEventStream(url, refreshSessionRequest);
}

function privacyPolicyPath(scope: PrivacyPolicyScope) {
  if (scope.type === "personal") return "/privacy-policies/personal";
  const companyPath = `/companies/${encodeURIComponent(scope.companyId)}`;
  if (scope.type === "company") return `${companyPath}/privacy-policy`;
  return `${companyPath}/departments/${encodeURIComponent(scope.departmentId)}/privacy-policy`;
}

export const api = {
  assistantCapabilities(companyId: string) { return request<AssistantCapabilities>(`/assistant/capabilities?company_uuid=${encodeURIComponent(companyId)}`); },
  contentSearch(companyId: string, query: string, filters: {call_uuids?:string[];folder_uuids?:string[];from?:string;to?:string} = {}) { return request<ContentSearchResponse>(`/calls/content-search${queryString({company_uuid:companyId||undefined,q:query,limit:20,...filters,call_uuids:filters.call_uuids?.join(","),folder_uuids:filters.folder_uuids?.join(",")})}`); },
  listAssistantChats(companyId: string) { return request<{items:AssistantChat[]}>(`/assistant/chats?company_uuid=${encodeURIComponent(companyId)}`); },
  createAssistantChat(companyId: string, responseDetail: "brief"|"auto"|"detailed" = "auto") { return request<AssistantChat>("/assistant/chats", {method:"POST", body:JSON.stringify({company_uuid:companyId,response_detail:responseDetail})}); },
  deleteAssistantChat(chatId:string) { return request<void>(`/assistant/chats/${encodeURIComponent(chatId)}`,{method:"DELETE"}); },
  exportAssistantChat(chatId:string) { return requestBlob(`/assistant/chats/${encodeURIComponent(chatId)}/export`); },
  getAssistantDraft(companyId:string,chatId?:string) { return request<AssistantDraft>(`/assistant/draft${queryString({company_uuid:companyId||undefined,chat_uuid:chatId})}`); },
  saveAssistantDraft(input:{company_uuid:string;chat_uuid?:string;text:string;context:AssistantDraft["context"];lock_version:number}) { return request<AssistantDraft>("/assistant/draft",{method:"PATCH",body:JSON.stringify(input)}); },
  deleteAssistantDraft(companyId:string,chatId?:string) { return request<void>(`/assistant/draft${queryString({company_uuid:companyId||undefined,chat_uuid:chatId})}`,{method:"DELETE"}); },
  listAssistantMessages(chatId: string) { return request<{items:AssistantMessage[]}>(`/assistant/chats/${encodeURIComponent(chatId)}/messages`); },
  createAssistantMessage(chatId:string,input:{company_uuid:string;text:string;response_detail:string;idempotency_key:string;client_message_id:string;call_uuids?:string[];folder_uuids?:string[];context_labels?:string[];from?:string;to?:string}) { return request<AssistantRun>(`/assistant/chats/${encodeURIComponent(chatId)}/messages`,{method:"POST",body:JSON.stringify(input)}); },
  getAssistantRun(runId:string) { return request<AssistantRun>(`/assistant/runs/${encodeURIComponent(runId)}`); },
  getCall(callId: string) {
    return request<CallResponse>(`/calls/${encodeURIComponent(callId)}`);
  },
  requestRedactedMedia(callId: string) {
    return request<RedactedMediaVariant>(`/calls/${encodeURIComponent(callId)}/media-variants/redacted`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } });
  },
  getRedactedMedia(callId: string) {
    return request<RedactedMediaVariant>(`/calls/${encodeURIComponent(callId)}/media-variants/redacted`);
  },
  createMediaAccessSession(callId: string, variant: "original" | "redacted") {
    return request<{ media_access_session_uuid: string; variant: "original" | "redacted"; expires_at: string }>(`/calls/${encodeURIComponent(callId)}/media-access-sessions`, { method: "POST", body: JSON.stringify({ schema_version: 1, variant }) });
  },
  previewPrivacyCorrection(callId: string, input: PrivacyCorrectionRequest) {
    return request<PrivacyCorrectionPreview>(`/calls/${encodeURIComponent(callId)}/privacy-corrections/preview`, { method: "POST", body: JSON.stringify(input) });
  },
  applyPrivacyCorrection(callId: string, input: PrivacyCorrectionRequest) {
    return request<{ revision: number; reanalysis_required: boolean }>(`/calls/${encodeURIComponent(callId)}/privacy-corrections`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) });
  },
  getPrivacyPolicy(scope: PrivacyPolicyScope = { type: "personal" }) {
    const path = privacyPolicyPath(scope);
    return request<PrivacyPolicyView>(path);
  },

  savePrivacyDraft(config: PrivacyPolicyConfig, lockVersion?: number, scope: PrivacyPolicyScope = { type: "personal" }) {
    const path = `${privacyPolicyPath(scope)}/draft`;
    return request<{ draft: PrivacyPolicyView["draft"] }>(path, {
      method: "PUT",
      headers: lockVersion ? { "If-Match": `"${lockVersion}"` } : { "If-None-Match": "*" },
      body: JSON.stringify({ schema_version: 1, config, preview_hash: "", reason: "" }),
    });
  },

  previewPrivacyPolicy(config: PrivacyPolicyConfig, scope: PrivacyPolicyScope = { type: "personal" }) {
    const path = `${privacyPolicyPath(scope)}/preview`;
    return request<{ preview_hash: string; effective_config: PrivacyPolicyConfig; warnings: Array<{ code: string; title: string; message: string }>; sample: { before: string; after: string } }>(path, {
      method: "POST",
      body: JSON.stringify({ schema_version: 1, config, preview_hash: "", reason: "" }),
    });
  },

  publishPrivacyPolicy(config: PrivacyPolicyConfig, previewHash: string, reason: string, highImpactAcknowledged: boolean, scope: PrivacyPolicyScope = { type: "personal" }) {
    const path = `${privacyPolicyPath(scope)}/publish`;
    return request<{ active_version: PrivacyPolicyView["active_version"] }>(path, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ schema_version: 1, config, preview_hash: previewHash, reason, high_impact_acknowledged: highImpactAcknowledged }),
    });
  },
  listQualityReviews(
    input: {
      company_uuid?: string;
      department_uuid?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    return request<QualityReviewsResponse>(
      `/quality-reviews${queryString(input)}`,
    );
  },

  getQualityReview(reviewId: string) {
    return request<QualityReviewResponse>(
      `/quality-reviews/${encodeURIComponent(reviewId)}`,
    );
  },

  listQualityReviewEvents(reviewId: string) {
    return request<{ events: QualityReviewEvent[] }>(
      `/quality-reviews/${encodeURIComponent(reviewId)}/events`,
    );
  },

  createQualityReview(
    callId: string,
    input: {
      analysis_uuid: string;
      reviewed_subject_user_uuid?: string;
      assignee_user_uuid?: string;
      due_at?: string;
    },
  ) {
    return request<QualityReviewResponse>(
      `/calls/${encodeURIComponent(callId)}/quality-reviews`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  getAnalysisReviewContext(callId: string, analysisId: string) {
    return request<AnalysisReviewContext>(
      `/calls/${encodeURIComponent(callId)}/quality-review-context${queryString({ analysis_uuid: analysisId })}`,
    );
  },

  createAnalysisComment(
    callId: string,
    analysisId: string,
    body: string,
    criterionKey?: string,
  ) {
    return request<import("./types").AnalysisComment>(
      `/calls/${encodeURIComponent(callId)}/analysis-comments${queryString({ analysis_uuid: analysisId })}`,
      {
        method: "POST",
        body: JSON.stringify({ body, criterion_key: criterionKey }),
      },
    );
  },

  updateAnalysisComment(commentId: string, lockVersion: number, body: string) {
    return request<import("./types").AnalysisComment>(
      `/analysis-comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        headers: { "If-Match": String(lockVersion) },
        body: JSON.stringify({ body }),
      },
    );
  },

  challengeCallAnalysis(callId: string, analysisId: string, reason: string) {
    return request<QualityReviewResponse>(
      `/calls/${encodeURIComponent(callId)}/quality-review-challenge`,
      {
        method: "POST",
        body: JSON.stringify({ analysis_uuid: analysisId, reason }),
      },
    );
  },

  claimQualityReview(reviewId: string, expectedVersion: number) {
    return request<QualityReviewResponse>(
      `/quality-reviews/${encodeURIComponent(reviewId)}/claim`,
      {
        method: "POST",
        body: JSON.stringify({ expected_version: expectedVersion }),
      },
    );
  },

  saveQualityReviewDraft(
    reviewId: string,
    lockVersion: number,
    input: {
      overall_comment: string;
      payload: Record<string, unknown>;
      criteria: Array<{
        criterion_key: string;
        title?: string;
        custom?: boolean;
        human_score?: number;
        not_applicable?: boolean;
        comment: string;
      }>;
    },
  ) {
    return request<QualityReviewResponse>(
      `/quality-reviews/${encodeURIComponent(reviewId)}/draft`,
      {
        method: "PUT",
        headers: { "If-Match": String(lockVersion) },
        body: JSON.stringify(input),
      },
    );
  },

  discardQualityReviewDraft(reviewId: string, lockVersion: number) {
    return request<QualityReviewResponse>(
      `/quality-reviews/${encodeURIComponent(reviewId)}/draft`,
      { method: "DELETE", headers: { "If-Match": String(lockVersion) } },
    );
  },

  publishQualityReview(
    reviewId: string,
    lockVersion: number,
    draftRevisionId: string,
  ) {
    return request<QualityReviewResponse>(
      `/quality-reviews/${encodeURIComponent(reviewId)}/publish`,
      {
        method: "POST",
        headers: { "If-Match": String(lockVersion) },
        body: JSON.stringify({ draft_revision_uuid: draftRevisionId }),
      },
    );
  },

  createQualityReviewAppeal(reviewId: string, reason: string) {
    return request<QualityReviewAppeal>(
      `/quality-reviews/${encodeURIComponent(reviewId)}/appeals`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  resolveQualityReviewAppeal(
    appealId: string,
    input: {
      status: "accepted" | "partially_accepted" | "rejected";
      comment: string;
      replacement_revision_uuid?: string;
    },
  ) {
    return request<QualityReviewAppeal>(
      `/quality-review-appeals/${encodeURIComponent(appealId)}/resolve`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },
  // The append-only trails: admin actions, billing alerts, credit
  // reconciliation, retention, transcript edits and comment revisions.
  getAdminAuditTrail(
    trail: AdminAuditTrail,
    range: { from?: string; to?: string } = {},
  ) {
    return request<AdminAuditTrailResponse>(
      `/admin/audit-trails/${encodeURIComponent(trail)}${queryString({ from: range.from, to: range.to, limit: 100 })}`,
    );
  },

  // Alerts are the only trail with a state: closing one is itself an admin
  // action, so it carries a reason into the audit log.
  resolveBillingAlert(alertId: string, reason: string) {
    return request<{ status: string }>(
      `/admin/billing-alerts/${encodeURIComponent(alertId)}/resolve`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  getAdminCapabilities() {
    return request<AdminCapabilitiesResponse>("/admin/capabilities");
  },

  listAdminUsers(
    input: { q?: string; role?: string; limit?: number; offset?: number } = {},
  ) {
    return request<AdminUsersResponse>(`/admin/users${queryString(input)}`);
  },

  getAdminUser(userId: string) {
    return request<UserResponse>(`/admin/users/${encodeURIComponent(userId)}`);
  },

  updateAdminUserProfile(
    userId: string,
    input: import("./types").UpdateAdminUserProfileRequest,
  ) {
    return request<UserResponse>(
      `/admin/users/${encodeURIComponent(userId)}/profile`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  changeAdminUserRole(
    userId: string,
    input: { role: string; expected_role: string; reason: string },
  ) {
    return request<UserResponse>(
      `/admin/users/${encodeURIComponent(userId)}/role`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  listAdminUserSessions(userId: string) {
    return request<UserSessionsResponse>(
      `/admin/users/${encodeURIComponent(userId)}/sessions`,
    );
  },

  revokeAllAdminUserSessions(userId: string, reason: string) {
    return request<void>(
      `/admin/users/${encodeURIComponent(userId)}/sessions`,
      {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      },
    );
  },

  revokeAdminUserSession(userId: string, sessionId: string, reason: string) {
    return request<void>(
      `/admin/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      },
    );
  },

  listAdminCompanies(
    input: { q?: string; limit?: number; offset?: number } = {},
  ) {
    return request<AdminCompaniesResponse>(
      `/admin/companies${queryString(input)}`,
    );
  },

  getAdminCompany(companyId: string) {
    return request<CompanyResponse>(
      `/admin/companies/${encodeURIComponent(companyId)}`,
    );
  },

  updateCompanyTag(companyId: string, tag: string) {
    return request<CompanyResponse>(
      `/companies/${encodeURIComponent(companyId)}/tag`,
      {
        method: "PATCH",
        body: JSON.stringify({ tag }),
      },
    );
  },
  // Changing a customer's tag is a change to their data: it needs their
  // approval through support access, a reason and an audit record. Only a
  // superadmin is exempt from the approval.
  updateAdminCompanyTag(companyId: string, tag: string, reason: string) {
    return request<AdminCompanyResponse>(
      `/admin/companies/${encodeURIComponent(companyId)}/tag`,
      {
        method: "PATCH",
        body: JSON.stringify({ tag, reason }),
      },
    );
  },

  // The superadmin's one-time rescue of a company that is being deleted: it
  // comes back frozen, with nobody gaining access to its content.
  restoreAdminCompany(companyId: string, reason: string) {
    return request<AdminCompanyLifecycleResponse>(
      `/admin/companies/${encodeURIComponent(companyId)}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  },

  getAdminSubscription(kind: "users" | "companies", id: string) {
    return request<AdminSubscriptionResponse>(
      `/admin/${kind}/${encodeURIComponent(id)}/subscription`,
    );
  },

  // A business plan that covers fewer companies than the owner has is refused
  // with company_selection_required and the list to choose from; the chosen ones
  // come back in `active_company_uuids` and the rest are frozen.
  grantAdminSubscription(
    kind: "users" | "companies",
    id: string,
    input: {
      plan_code: PlanCode;
      starts_at?: string;
      ends_at: string;
      reason: string;
      active_company_uuids?: string[];
    },
  ) {
    return request<AdminSubscriptionResponse>(
      `/admin/${kind}/${encodeURIComponent(id)}/subscription/grant`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },

  cancelAdminSubscription(
    kind: "users" | "companies",
    id: string,
    reason: string,
  ) {
    return request<AdminSubscriptionResponse>(
      `/admin/${kind}/${encodeURIComponent(id)}/subscription/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  },
  resetAdminUsage(kind: "users" | "companies", id: string, reason: string) {
    return request<void>(
      `/admin/${kind}/${encodeURIComponent(id)}/usage/reset`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  },

  getAdminCall(callId: string) {
    return request<CallResponse>(`/admin/calls/${encodeURIComponent(callId)}`);
  },

  listAdminUserCalls(
    userId: string,
    input: { limit?: number; offset?: number } = {},
  ) {
    return request<CallsListResponse>(
      `/admin/users/${encodeURIComponent(userId)}/calls${queryString(input)}`,
    );
  },
  login(input: LoginRequest) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async register(input: RegisterRequest) {
    await request<{ user: UserResponse }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });

    return api.login({
      email: input.email,
      password: input.password,
    });
  },

  async logout() {
    await request<void>("/auth/logout", { method: "POST" });
  },

  async logoutAll() {
    await request<void>("/auth/logout-all", { method: "POST" });
  },

  refreshSession() {
    return refreshSessionRequest();
  },

  updateUsername(username: string) {
    return request<UserResponse>("/auth/me/username", {
      method: "PATCH",
      body: JSON.stringify({ username }),
    });
  },

  updateProfile(input: UpdateProfileRequest) {
    return request<UserResponse>("/auth/me/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  uploadAvatar(file: File) {
    const body = new FormData();
    body.append("avatar", file);
    return request<AvatarResponse>("/auth/me/avatar", { method: "POST", body });
  },

  deleteAvatar() {
    return request<void>("/auth/me/avatar", { method: "DELETE" });
  },

  getPreferences() {
    return request<UserPreferencesResponse>("/auth/me/preferences");
  },

  updatePreferences(input: UpdatePreferencesRequest) {
    return request<UserPreferencesResponse>("/auth/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  updatePassword(input: UpdatePasswordRequest) {
    return request<UpdatePasswordResponse>("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  listSessions() {
    return request<UserSessionsResponse>("/auth/me/sessions");
  },

  deleteSession(sessionId: string) {
    return request<void>(`/auth/me/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  },

  lookupUserByUsername(username: string) {
    const query = new URLSearchParams({ username }).toString();
    return request<UserResponse>(`/users/lookup?${query}`);
  },

  listContacts() {
    return request<UserResponse[]>("/contacts");
  },
  searchContacts(query: string) {
    return request<UserResponse[]>(
      `/contacts/search?${new URLSearchParams({ q: query })}`,
    );
  },
  addContact(userId: string) {
    return request<void>(`/contacts/${encodeURIComponent(userId)}`, {
      method: "PUT",
    });
  },
  removeContact(userId: string) {
    return request<void>(`/contacts/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },
  listFavoriteCalls() {
    return request<CallResponse[]>("/favorite-calls");
  },
  addFavoriteCall(callId: string) {
    return request<void>(`/favorite-calls/${encodeURIComponent(callId)}`, {
      method: "PUT",
    });
  },
  removeFavoriteCall(callId: string) {
    return request<void>(`/favorite-calls/${encodeURIComponent(callId)}`, {
      method: "DELETE",
    });
  },

  listCalls(filters?: {
    q?: string;
    status?: CallStatus | CallStatus[];
    scope?: VisibilityScope | VisibilityScope[];
    company_uuid?: string;
    department_uuid?: string | string[];
    participant_user_uuid?: string | string[];
    uploaded_by_user_uuid?: string;
    folder_uuid?: string | string[];
    source_provider?: "manual" | "generic_api" | "bitrix24";
    connection_uuid?: string | string[];
    from?: string;
    to?: string;
    occurred_from?: string;
    occurred_to?: string;
    imported_from?: string;
    imported_to?: string;
    duration_min_seconds?: number;
    duration_max_seconds?: number;
    has_analysis?: boolean;
    has_actions?: boolean;
    has_processing_error?: boolean;
    favorite_only?: boolean;
    include_upload_fallback?: boolean;
    sort?: "occurred_at" | "created_at" | "duration";
    order?: "asc" | "desc";
    cursor?: string;
    limit?: number;
    offset?: number;
  }, signal?: AbortSignal) {
    return request<CallResponse[] | CallsListResponse>(
      `/calls${queryString(filters)}`,
      { signal },
    );
  },

  getCallFilterOptions(input?: {
    company_uuid?: string;
    department_uuid?: string;
  }) {
    return request<CallFilterOptionsResponse>(
      `/calls/filters${queryString(input)}`,
    );
  },

  createCall(input: {
    title?: string;
    media: File;
    companyUuid?: string;
    departmentUuid?: string;
    processingMode?: "transcribe" | "analyze";
    useCustomInstructions?: boolean;
    folderUuid?: string;
    speakerHints?: Array<{
      userId: string;
      name: string;
      username?: string;
      role: "self" | "other";
      note?: string;
    }>;
    diarizationRoles?: Array<{ name: string; description?: string }>;
  }) {
    const body = new FormData();
    if (input.title?.trim()) body.append("title", input.title.trim());
    body.append("media", input.media);
    body.append("processing_mode", input.processingMode ?? "analyze");
    if (input.companyUuid) body.append("company_uuid", input.companyUuid);
    if (input.departmentUuid)
      body.append("department_uuid", input.departmentUuid);
    if (input.folderUuid) body.append("folder_uuid", input.folderUuid);
    if (typeof input.useCustomInstructions === "boolean") {
      body.append(
        "use_custom_instructions",
        String(input.useCustomInstructions),
      );
    }
    if (input.speakerHints?.length)
      body.append("speaker_hints", JSON.stringify(input.speakerHints));
    if (input.diarizationRoles?.length)
      body.append("diarization_roles", JSON.stringify(input.diarizationRoles));

    return request<CallResponse>("/calls", { method: "POST", body });
  },

  getAnalysisPersonalization(
    scope: AnalysisPersonalizationScope,
    ownerUuid: string,
    companyUuid?: string,
  ) {
    return request<AnalysisPersonalization>(
      `/analysis-personalization${queryString({
        scope,
        owner_uuid: ownerUuid,
        company_uuid: companyUuid,
      })}`,
    );
  },

  saveAnalysisPersonalization(
    scope: AnalysisPersonalizationScope,
    ownerUuid: string,
    content: string,
    companyUuid?: string,
  ) {
    return request<AnalysisPersonalization>(
      `/analysis-personalization${queryString({
        scope,
        owner_uuid: ownerUuid,
        company_uuid: companyUuid,
      })}`,
      { method: "PUT", body: JSON.stringify({ content }) },
    );
  },

  updateCallTitle(callId: string, title: string) {
    return request<CallResponse>(`/calls/${encodeURIComponent(callId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  deleteCall(callId: string) {
    return request<void>(`/calls/${encodeURIComponent(callId)}`, {
      method: "DELETE",
    });
  },

  listDeletedCalls(input?: { limit?: number; offset?: number }) {
    return request<DeletedCallsListResponse>(
      `/calls-bin${queryString({ limit: input?.limit, offset: input?.offset })}`,
    );
  },

  restoreCall(callId: string) {
    return request<CallResponse>(
      `/calls/${encodeURIComponent(callId)}/restore`,
      { method: "POST" },
    );
  },

  // Stops the queue working on a call and keeps the call. Deleting one
  // mid-flight is refused, so this is the way out of a wrong upload.
  cancelCallProcessing(callId: string) {
    return request<CallResponse>(
      `/calls/${encodeURIComponent(callId)}/cancel-processing`,
      { method: "POST" },
    );
  },

  // Starts a cancelled call again, with or without the analysis. Switching a
  // call that is already transcribed costs nothing and finishes it on the spot.
  restartCallProcessing(callId: string, mode: "analyze" | "transcribe") {
    return request<CallResponse>(
      `/calls/${encodeURIComponent(callId)}/restart-processing`,
      { method: "POST", body: JSON.stringify({ processing_mode: mode }) },
    );
  },

  listAppliedInstructions(analysisId: string) {
    return request<{ items: AppliedInstruction[] }>(
      `/analyses/${encodeURIComponent(analysisId)}/instructions`,
    );
  },

  getAppliedInstruction(analysisId: string, versionId: string) {
    return request<AppliedInstruction>(
      `/analyses/${encodeURIComponent(analysisId)}/instructions/${encodeURIComponent(versionId)}`,
    );
  },

  listCallFolders(input?: {
    scope?: VisibilityScope;
    company_uuid?: string;
    department_uuid?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    return request<CallFoldersListResponse>(
      `/call-folders${queryString(input)}`,
    );
  },

  createCallFolder(input: CreateCallFolderRequest) {
    return request<CallFolderResponse>("/call-folders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getCallFolder(folderId: string) {
    return request<CallFolderResponse>(
      `/call-folders/${encodeURIComponent(folderId)}`,
    );
  },

  updateCallFolder(folderId: string, input: UpdateCallFolderRequest) {
    return request<CallFolderResponse>(
      `/call-folders/${encodeURIComponent(folderId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  replaceCallFolderInstructions(folderId: string, instructionUuids: string[]) {
    return request<CallFolderResponse>(
      `/call-folders/${encodeURIComponent(folderId)}/instructions`,
      {
        method: "PUT",
        body: JSON.stringify({ instruction_uuids: instructionUuids }),
      },
    );
  },

  deleteCallFolder(folderId: string) {
    return request<void>(`/call-folders/${encodeURIComponent(folderId)}`, {
      method: "DELETE",
    });
  },

  listCallFolderCalls(
    folderId: string,
    input?: { limit?: number; offset?: number },
  ) {
    return request<CallsListResponse>(
      `/call-folders/${encodeURIComponent(folderId)}/calls${queryString(input)}`,
    );
  },

  assignCallToFolder(folderId: string, callId: string) {
    return request<void>(
      `/call-folders/${encodeURIComponent(folderId)}/calls`,
      {
        method: "POST",
        body: JSON.stringify({ call_uuid: callId }),
      },
    );
  },

  removeCallFromFolder(folderId: string, callId: string) {
    return request<void>(
      `/call-folders/${encodeURIComponent(folderId)}/calls/${encodeURIComponent(callId)}`,
      { method: "DELETE" },
    );
  },

  listCompanies() {
    return request<CompanyResponse[]>("/companies");
  },

  createCompany(name: string) {
    return request<CompanyResponse>("/companies", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  listActions(
    input: {
      company_uuid?: string;
      call_uuid?: string;
      department_uuid?: string;
      assignee_uuid?: string;
      status?: string;
      q?: string;
      mine?: boolean;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    return request<CallActionsResponse>(`/actions${queryString(input)}`);
  },

  getAction(actionId: string) {
    return request<CallAction>(`/actions/${encodeURIComponent(actionId)}`);
  },

  listAdminActions(
    input: {
      status?: string;
      q?: string;
      company_tag?: string;
      department?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    return request<CallActionsResponse>(`/admin/actions${queryString(input)}`);
  },

  getAdminAction(actionId: string) {
    return request<CallAction>(
      `/admin/actions/${encodeURIComponent(actionId)}`,
    );
  },

  listAdminActionAssignees(companyId: string) {
    return request<CallActionAssigneesResponse>(
      `/admin/companies/${encodeURIComponent(companyId)}/action-assignees`,
    );
  },

  mutateAdminAction(
    actionId: string,
    operation: "complete" | "cancel" | "reschedule" | "reassign",
    input: Record<string, unknown>,
  ) {
    return request<CallAction>(
      `/admin/actions/${encodeURIComponent(actionId)}/${operation}`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  createAction(callId: string, input: CreateCallActionRequest) {
    return request<CallAction>(`/calls/${encodeURIComponent(callId)}/actions`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
  },

  setNoActionRequired(callId: string, analysisId: string, reason = "") {
    return request<void>(
      `/calls/${encodeURIComponent(callId)}/analyses/${encodeURIComponent(analysisId)}/action-disposition`,
      {
        method: "PUT",
        body: JSON.stringify({ kind: "no_action_required", reason }),
      },
    );
  },

  listActionAssignees(
    companyId: string,
    input: { q?: string; department_uuid?: string } = {},
  ) {
    return request<CallActionAssigneesResponse>(
      `/companies/${encodeURIComponent(companyId)}/action-assignees${queryString(input)}`,
    );
  },

  mutateAction(
    actionId: string,
    operation:
      | "start"
      | "complete"
      | "cancel"
      | "reschedule"
      | "reassign"
      | "revert-status",
    input: Record<string, unknown>,
  ) {
    return request<CallAction>(
      `/actions/${encodeURIComponent(actionId)}/${operation}`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  editAction(
    actionId: string,
    input: {
      expected_lock_version: number;
      title: string;
      description: string;
      reason?: string;
    },
  ) {
    return request<CallAction>(`/actions/${encodeURIComponent(actionId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  requestAnalysisRerun(callId: string, reason = "") {
    return request<AnalysisRerunRequest>(
      `/calls/${encodeURIComponent(callId)}/analysis-rerun-requests`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },

  listAnalysisRerunRequests(companyId: string, status = "pending") {
    return request<{ items: AnalysisRerunRequest[] }>(
      `/companies/${encodeURIComponent(companyId)}/analysis-rerun-requests${queryString({ status })}`,
    );
  },

  decideAnalysisRerunRequest(
    requestId: string,
    approve: boolean,
    comment = "",
  ) {
    return request<AnalysisRerunRequest>(
      `/analysis-rerun-requests/${encodeURIComponent(requestId)}/${approve ? "approve" : "reject"}`,
      { method: "POST", body: JSON.stringify({ comment }) },
    );
  },

  createActionTransfer(
    actionId: string,
    input: {
      reason: string;
      proposed_assignee_user_uuid?: string;
      proposed_department_uuid?: string;
    },
  ) {
    return request(
      `/actions/${encodeURIComponent(actionId)}/transfer-requests`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  getCompany(companyId: string) {
    return request<CompanyResponse>(
      `/companies/${encodeURIComponent(companyId)}`,
    );
  },

  updateCompany(companyId: string, name: string) {
    return request<CompanyResponse>(
      `/companies/${encodeURIComponent(companyId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    );
  },

  deleteCompany(companyId: string) {
    return request<void>(`/companies/${encodeURIComponent(companyId)}`, {
      method: "DELETE",
    });
  },

  async getCompanySubscription(companyId: string) {
    const subscription = await request<RawSubscription>(
      `/companies/${encodeURIComponent(companyId)}/subscription`,
    );
    return normalizeSubscription(subscription);
  },

  async getSubscription() {
    const subscription = await request<RawSubscription>("/subscription");
    return normalizeSubscription(subscription);
  },

  async getSubscriptionUsage(period?: string) {
    const usage = await request<RawSubscriptionUsageResponse>(
      `/subscription/usage${queryString({ period })}`,
    );
    return normalizeSubscriptionUsage(usage);
  },

  async getCompanySubscriptionUsage(companyId: string, period?: string) {
    const usage = await request<RawSubscriptionUsageResponse>(
      `/companies/${encodeURIComponent(companyId)}/subscription/usage${queryString({ period })}`,
    );
    return normalizeSubscriptionUsage(usage);
  },

  getCreditDashboard(from?: string, to?: string) {
    return request<CreditDashboardResponse>(
      `/credits/dashboard${queryString({ from, to })}`,
    );
  },

  getCompanyCreditDashboard(companyId: string, from?: string, to?: string) {
    return request<CreditDashboardResponse>(
      `/companies/${encodeURIComponent(companyId)}/credits/dashboard${queryString({ from, to })}`,
    );
  },

  updateCompanyCreditVisibility(companyId: string, visible: boolean) {
    return request<{ visible_to_members: boolean; can_manage_visibility: boolean }>(
      `/companies/${encodeURIComponent(companyId)}/credits/visibility`,
      { method: "PATCH", body: JSON.stringify({ visible }) },
    );
  },

  listDeveloperApplications(
    ownerType: "user" | "company" = "user",
    ownerId?: string,
  ) {
    return request<{ applications: DeveloperApplication[] }>(
      `/developer/applications${queryString({ owner_type: ownerType, owner_uuid: ownerId })}`,
    );
  },

  createDeveloperApplication(input: {
    owner_type: "user" | "company";
    owner_uuid?: string;
    name: string;
    environment: "sandbox" | "production";
    capabilities: string[];
    daily_credit_limit?: number;
    monthly_credit_limit?: number;
    max_credits_per_operation?: number;
  }) {
    return request<DeveloperApplication>("/developer/applications", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  createIntegrationKey(
    applicationId: string,
    input: {
      name: string;
      scopes: string[];
      expires_at?: string;
      permanent_credit_limit?: number;
      temporary_credit_limit?: number;
      temporary_limit_starts_at?: string;
      temporary_limit_ends_at?: string;
    },
  ) {
    return request<CreatedIntegrationKey>(
      `/developer/applications/${encodeURIComponent(applicationId)}/keys`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  listIntegrationConnections(applicationId: string) {
    return request<{ connections: import("./types").IntegrationConnection[] }>(
      `/developer/applications/${encodeURIComponent(applicationId)}/connections`,
    );
  },

  createIntegrationConnection(
    applicationId: string,
    input: {
      name: string;
      provider: "generic_api" | "bitrix24";
      company_uuid?: string;
			department_uuid?: string;
			folder_uuid?: string;
			allow_folder_override?: boolean;
      disable_policy: "continue" | "pause" | "cancel";
      settings: { schema_version: number; inherit_scope_instructions?: boolean; provider_contract_version?: number };
    },
  ) {
    return request<import("./types").IntegrationConnection>(
      `/developer/applications/${encodeURIComponent(applicationId)}/connections`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(input),
      },
    );
  },

  startBitrixOAuth(connectionId: string, portalDomain: string, lockVersion: number) {
    return request<{ authorization_url: string; expires_at: string }>("/integrations/bitrix24/oauth/start", {
      method: "POST",
      headers: { "If-Match": String(lockVersion) },
      body: JSON.stringify({ connection_uuid: connectionId, portal_domain: portalDomain }),
    });
  },

  testBitrixConnection(connectionId: string) {
    return request<import("./types").BitrixConnectionHealth>(`/integrations/${encodeURIComponent(connectionId)}/test`, { method: "POST" });
  },

  getBitrixHealth(connectionId: string) {
    return request<import("./types").BitrixConnectionHealth>(`/integrations/${encodeURIComponent(connectionId)}/health`);
  },

  pauseBitrixConnection(connectionId: string, lockVersion: number) {
    return request<import("./types").BitrixConnectionHealth>(`/integrations/${encodeURIComponent(connectionId)}/pause`, { method: "POST", headers: { "If-Match": String(lockVersion) } });
  },

  resumeBitrixConnection(connectionId: string, lockVersion: number) {
    return request<import("./types").BitrixConnectionHealth>(`/integrations/${encodeURIComponent(connectionId)}/resume`, { method: "POST", headers: { "If-Match": String(lockVersion) } });
  },

  listBitrixExternalUsers(connectionId: string) {
    return request<{ users: import("./types").BitrixExternalUser[] }>(`/integrations/${encodeURIComponent(connectionId)}/external-users`);
  },

  updateBitrixExternalUserMapping(connectionId: string, externalUserId: string, input: { internal_user_uuid?: string | null; department_uuid?: string | null; status: string }, lockVersion: number) {
    return request<import("./types").BitrixExternalUser>(`/integrations/${encodeURIComponent(connectionId)}/external-user-mappings/${encodeURIComponent(externalUserId)}`, {
      method: "PATCH", headers: { "If-Match": String(lockVersion) }, body: JSON.stringify(input),
    });
  },

  previewBitrixExternalUserMappings(connectionId: string, changes: import("./types").BitrixMappingChange[]) {
    return request<import("./types").BitrixMappingPreview>(`/integrations/${encodeURIComponent(connectionId)}/mapping-preview`, {
      method: "POST", body: JSON.stringify({ changes }),
    });
  },

  bulkUpdateBitrixExternalUserMappings(connectionId: string, previewHash: string, changes: import("./types").BitrixMappingChange[], requestKey: string) {
    return request<import("./types").BitrixMappingBulkResult>(`/integrations/${encodeURIComponent(connectionId)}/external-user-mappings/bulk`, {
      method: "POST",
      headers: { "Idempotency-Key": requestKey },
      body: JSON.stringify({ preview_hash: previewHash, changes }),
    });
  },

  previewBitrixBackfill(connectionId: string, rangeFrom: string, rangeTo: string) {
    return request<import("./types").BitrixBackfillPreview>(`/integrations/${encodeURIComponent(connectionId)}/backfills/preview`, {
      method: "POST", body: JSON.stringify({ range_from: rangeFrom, range_to: rangeTo }),
    });
  },

  createBitrixBackfill(connectionId: string, rangeFrom: string, rangeTo: string) {
    return request<import("./types").BitrixBackfill>(`/integrations/${encodeURIComponent(connectionId)}/backfills`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ range_from: rangeFrom, range_to: rangeTo }),
    });
  },

  getBitrixBackfill(connectionId: string, backfillId: string) {
    return request<import("./types").BitrixBackfill>(`/integrations/${encodeURIComponent(connectionId)}/backfills/${encodeURIComponent(backfillId)}`);
  },

  listBitrixBackfills(connectionId: string) {
    return request<{ backfills: import("./types").BitrixBackfill[] }>(`/integrations/${encodeURIComponent(connectionId)}/backfills`);
  },

  createActionExternalSync(actionId: string, connectionId: string) {
    return request<import("./types").ActionExternalSync>(`/actions/${encodeURIComponent(actionId)}/external-sync-requests`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ connection_uuid: connectionId }),
    });
  },

  previewActionExternalSync(actionId: string) {
    return request<import("./types").ActionExternalSyncPreview>(`/actions/${encodeURIComponent(actionId)}/external-sync-preview`);
  },

  getActionExternalSync(actionId: string) {
    return request<import("./types").ActionExternalSync>(`/actions/${encodeURIComponent(actionId)}/external-sync`);
  },

  getActionExternalSyncRequest(syncId: string) {
    return request<import("./types").ActionExternalSync>(`/action-external-sync-requests/${encodeURIComponent(syncId)}`);
  },

  approveActionExternalSync(syncId: string, lockVersion: number) {
    return request<import("./types").ActionExternalSync>(`/action-external-sync-requests/${encodeURIComponent(syncId)}/approve`, { method: "POST", headers: { "If-Match": String(lockVersion) } });
  },

  rejectActionExternalSync(syncId: string, lockVersion: number, comment: string) {
    return request<void>(`/action-external-sync-requests/${encodeURIComponent(syncId)}/reject`, { method: "POST", headers: { "If-Match": String(lockVersion) }, body: JSON.stringify({ comment }) });
  },

  resolveActionExternalSync(syncId: string, lockVersion: number, resolution: "retry_create" | "cancel" | "confirm_task" | "accept_external" | "unlink" | "restore_verbatrace", reason: string, externalTaskId?: string) {
    return request<import("./types").ActionExternalSync>(`/action-external-sync-requests/${encodeURIComponent(syncId)}/resolve`, {
      method: "POST",
      headers: { "If-Match": String(lockVersion) },
      body: JSON.stringify({ resolution, reason, ...(externalTaskId ? { external_task_id: externalTaskId } : {}) }),
    });
  },

  getSupportAccessRequest(requestId: string) {
    return request<import("./types").SupportAccessRequest>(`/support-access-requests/${encodeURIComponent(requestId)}`);
  },

  listCompanySupportJournal(companyId: string, limit = 100) {
    return request<{ items: SupportAccessJournalEntry[] }>(
      `/companies/${encodeURIComponent(companyId)}/support-journal${queryString({ limit })}`,
    );
  },

  approveSupportAccessRequest(requestId: string, lockVersion: number, comment: string) {
    return request<import("./types").SupportAccessGrant>(`/support-access-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST", headers: { "If-Match": String(lockVersion) }, body: JSON.stringify({ comment }) });
  },

  denySupportAccessRequest(requestId: string, lockVersion: number, comment: string) {
    return request<void>(`/support-access-requests/${encodeURIComponent(requestId)}/deny`, { method: "POST", headers: { "If-Match": String(lockVersion) }, body: JSON.stringify({ comment }) });
  },

  updateIntegrationConnection(
    connectionId: string,
    input: {
      name: string;
      disable_policy: "continue" | "pause" | "cancel";
      settings: { schema_version: number; inherit_scope_instructions?: boolean; [key: string]: unknown };
    },
    lockVersion: number,
  ) {
    return request<import("./types").IntegrationConnection>(
      `/integrations/${encodeURIComponent(connectionId)}`,
      {
        method: "PATCH",
        headers: { "If-Match": String(lockVersion) },
        body: JSON.stringify(input),
      },
    );
  },

  changeIntegrationConnectionStatus(
    connectionId: string,
    status: "active" | "disabled" | "revoked",
    lockVersion: number,
  ) {
    const path =
      status === "active" ? "enable" : status === "disabled" ? "disable" : "";
    return request<import("./types").IntegrationConnection>(
      `/integrations/${encodeURIComponent(connectionId)}${path ? `/${path}` : ""}`,
      {
        method: status === "revoked" ? "DELETE" : "POST",
        headers: { "If-Match": String(lockVersion) },
      },
    );
  },

  listIntegrationWebhooks(connectionId: string) {
    return request<{ webhooks: import("./types").IntegrationWebhook[] }>(
      `/integrations/${encodeURIComponent(connectionId)}/webhooks`,
    );
  },

  createIntegrationWebhook(
    connectionId: string,
    input: {
      application_uuid: string;
      name: string;
      url: string;
      event_types: string[];
    },
  ) {
    return request<{
      webhook: import("./types").IntegrationWebhook;
      signing_secret: string;
      secret_visible_once: true;
    }>(`/integrations/${encodeURIComponent(connectionId)}/webhooks`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listIntegrationWebhookDeliveries(connectionId: string) {
    return request<{
      deliveries: import("./types").IntegrationWebhookDelivery[];
    }>(`/integrations/${encodeURIComponent(connectionId)}/webhook-deliveries`);
  },

  testIntegrationWebhook(connectionId: string) {
    return request<{ event_uuid: string; status: "queued" }>(
      `/integrations/${encodeURIComponent(connectionId)}/webhook/test`,
      { method: "POST" },
    );
  },

  listIntegrationIngestItems(connectionId: string, input: { limit?: number; offset?: number } = {}) {
    return request<{ ingest_items: import("./types").IntegrationIngestItem[]; total: number; limit: number; offset: number }>(
      `/integrations/${encodeURIComponent(connectionId)}/ingest-items${queryString(input)}`,
    );
  },

  listIntegrationServiceAccounts(connectionId: string) {
    return request<{
      service_accounts: import("./types").IntegrationServiceAccount[];
    }>(`/integrations/${encodeURIComponent(connectionId)}/service-accounts`);
  },

  createIntegrationServiceAccount(
    connectionId: string,
    input: { name: string; scopes: string[] },
  ) {
    return request<import("./types").IntegrationServiceAccount>(
      `/integrations/${encodeURIComponent(connectionId)}/service-accounts`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  createServiceAccountKey(
    serviceAccountId: string,
    input: {
      name: string;
      scopes: string[];
      expires_at?: string;
      permanent_credit_limit?: number;
      temporary_credit_limit?: number;
      temporary_limit_starts_at?: string;
      temporary_limit_ends_at?: string;
    },
  ) {
    return request<CreatedIntegrationKey>(
      `/service-accounts/${encodeURIComponent(serviceAccountId)}/keys`,
      { method: "POST", body: JSON.stringify(input) },
    );
  },

  listServiceAccountKeys(serviceAccountId: string) {
    return request<{ keys: import("./types").IntegrationAPIKey[] }>(
      `/service-accounts/${encodeURIComponent(serviceAccountId)}/keys`,
    );
  },

  revokeIntegrationKey(keyId: string) {
    return request<void>(`/developer/keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    });
  },

  revokeIntegrationServiceAccount(serviceAccountId: string) {
    return request<void>(
      `/service-accounts/${encodeURIComponent(serviceAccountId)}`,
      { method: "DELETE" },
    );
  },

  rotateIntegrationKey(keyId: string, overlapSeconds = 300) {
    return request<CreatedIntegrationKey>(
      `/developer/keys/${encodeURIComponent(keyId)}/rotate`,
      {
        method: "POST",
        body: JSON.stringify({ overlap_seconds: overlapSeconds }),
      },
    );
  },

  revokeIntegrationWebhook(webhookId: string) {
    return request<void>(
      `/integration-webhooks/${encodeURIComponent(webhookId)}`,
      { method: "DELETE" },
    );
  },

  changeDeveloperApplicationStatus(
    applicationId: string,
    status: "active" | "disabled" | "revoked",
  ) {
    return request<DeveloperApplication>(
      `/developer/applications/${encodeURIComponent(applicationId)}/${status === "active" ? "enable" : status}`,
      { method: "POST" },
    );
  },

  adjustSandboxWallet(
    applicationId: string,
    mode: "add" | "set" | "reset",
    credits = 0,
  ) {
    return request<{
      application_uuid: string;
      environment: "sandbox";
      balance_credits: number;
    }>(
      `/developer/applications/${encodeURIComponent(applicationId)}/sandbox-wallet`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ mode, credits }),
      },
    );
  },

  getSandboxWallet(applicationId: string) {
    return request<import("./types").SandboxWalletDashboard>(
      `/developer/applications/${encodeURIComponent(applicationId)}/sandbox-wallet`,
    );
  },

  retryIntegrationIngestItem(itemId: string) {
    return request<import("./types").IntegrationIngestItem>(
      `/ingest-items/${encodeURIComponent(itemId)}/retry`,
      { method: "POST" },
    );
  },

  cancelIntegrationIngestItem(itemId: string) {
    return request<import("./types").IntegrationIngestItem>(
      `/ingest-items/${encodeURIComponent(itemId)}/cancel`,
      { method: "POST" },
    );
  },

  listIntegrationAuditEvents(connectionId: string, input: { limit?: number; offset?: number } = {}) {
    return request<{ audit_events: import("./types").IntegrationAuditEvent[]; total: number; limit: number; offset: number }>(
      `/integrations/${encodeURIComponent(connectionId)}/audit-events${queryString(input)}`,
    );
  },

  listDepartments(companyId: string) {
    return request<DepartmentResponse[]>(
      `/companies/${encodeURIComponent(companyId)}/departments`,
    );
  },

  createDepartment(companyId: string, name: string) {
    return request<DepartmentResponse>(
      `/companies/${encodeURIComponent(companyId)}/departments`,
      {
        method: "POST",
        body: JSON.stringify({ name }),
      },
    );
  },

  updateDepartment(companyId: string, departmentId: string, name: string) {
    return request<DepartmentResponse>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      },
    );
  },

  deleteDepartment(companyId: string, departmentId: string) {
    return request<void>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}`,
      { method: "DELETE" },
    );
  },

  listCompanyMembers(
    companyId: string,
    filters?: {
      status?: "active" | "left";
      role?: "employee" | "company_manager" | "company_deputy" | "department_leader";
      department_uuid?: string;
      q?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    return request<CompanyMembersResponse>(
      `/companies/${encodeURIComponent(companyId)}/members${queryString(filters)}`,
    );
  },

  removeCompanyMember(companyId: string, userId: string, reason?: string) {
    return request<CompanyMemberListItemResponse>(
      `/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ reason: reason ?? "" }),
      },
    );
  },

  updateCompanyMemberRole(
    companyId: string,
    userId: string,
    role: "employee" | "company_deputy",
  ) {
    return request<CompanyMemberListItemResponse>(
      `/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  },

  // A business plan belongs to the owner and covers several companies, so a
  // single company may be handed over only when it is the only one under that
  // plan. `stayCompanyIds` are the companies the previous owner wants to remain
  // in as an ordinary member; anything not listed there they leave.
  offerCompanyOwnership(
    companyId: string,
    userId: string,
    reason?: string,
    stayCompanyIds: string[] = [],
  ) {
    return request<CompanyOwnershipTransfer>(
      `/companies/${encodeURIComponent(companyId)}/ownership-transfers`,
      {
        method: "POST",
        body: JSON.stringify({
          user_uuid: userId,
          reason: reason ?? "",
          scope: "company",
          stay_company_uuids: stayCompanyIds,
        }),
      },
    );
  },

  // Handing over every company at once, which is the only way when the plan
  // covers more than one of them.
  offerAllCompanyOwnership(
    userId: string,
    reason?: string,
    stayCompanyIds: string[] = [],
  ) {
    return request<CompanyOwnershipTransfer>("/ownership-transfers", {
      method: "POST",
      body: JSON.stringify({
        user_uuid: userId,
        reason: reason ?? "",
        scope: "all",
        stay_company_uuids: stayCompanyIds,
      }),
    });
  },

  listIncomingOwnershipTransfers() {
    return request<{ items: CompanyOwnershipTransfer[] }>(
      "/ownership-transfers/incoming",
    );
  },

  // Moving calls and instruction folders between two of the owner's companies,
  // which is what emptying a company before it is deleted needs.
  transferCompanyData(input: {
    sourceCompanyId: string;
    targetCompanyId: string;
    callIds?: string[];
    includeCalls?: boolean;
    includeFolders?: boolean;
    reason?: string;
  }) {
    return request<CompanyDataTransfer>("/company-data-transfers", {
      method: "POST",
      body: JSON.stringify({
        source_company_uuid: input.sourceCompanyId,
        target_company_uuid: input.targetCompanyId,
        call_uuids: input.callIds ?? [],
        include_calls: input.includeCalls ?? true,
        include_folders: input.includeFolders ?? true,
        reason: input.reason ?? "",
      }),
    });
  },

  listCompanyDataTransfers(limit = 20) {
    return request<{ items: CompanyDataTransfer[] }>(
      `/company-data-transfers?${new URLSearchParams({ limit: String(limit) }).toString()}`,
    );
  },

  decideCompanyOwnership(transferId: string, accept: boolean) {
    return request<CompanyOwnershipTransfer>(
      `/ownership-transfers/${encodeURIComponent(transferId)}/${accept ? "accept" : "decline"}`,
      { method: "POST" },
    );
  },

  cancelCompanyOwnershipOffer(transferId: string) {
    return request<CompanyOwnershipTransfer>(
      `/ownership-transfers/${encodeURIComponent(transferId)}/cancel`,
      { method: "POST" },
    );
  },

  listCompanyInvitations(companyId: string, status?: InvitationStatus) {
    const query = status ? `?${new URLSearchParams({ status }).toString()}` : "";
    return request<Invitation[]>(
      `/companies/${encodeURIComponent(companyId)}/invitations${query}`,
    );
  },

  decideInvitationApproval(
    companyId: string,
    invitationId: string,
    approve: boolean,
  ) {
    return request<Invitation>(
      `/companies/${encodeURIComponent(companyId)}/invitations/${encodeURIComponent(invitationId)}/${approve ? "approve" : "reject"}`,
      { method: "POST" },
    );
  },

  requestDepartmentTransfer(
    companyId: string,
    departmentId: string,
    userId: string,
    reason?: string,
  ) {
    return request<DepartmentTransferRequest>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/transfer-requests`,
      {
        method: "POST",
        body: JSON.stringify({ user_uuid: userId, reason: reason ?? "" }),
      },
    );
  },

  listDepartmentTransfers(companyId: string, status?: string) {
    const query = status ? `?${new URLSearchParams({ status }).toString()}` : "";
    return request<{ items: DepartmentTransferRequest[] }>(
      `/companies/${encodeURIComponent(companyId)}/department-transfers${query}`,
    );
  },

  decideDepartmentTransfer(
    companyId: string,
    requestId: string,
    approve: boolean,
    comment?: string,
  ) {
    return request<DepartmentTransferRequest>(
      `/companies/${encodeURIComponent(companyId)}/department-transfers/${encodeURIComponent(requestId)}/${approve ? "approve" : "reject"}`,
      {
        method: "POST",
        body: JSON.stringify({ comment: comment ?? "" }),
      },
    );
  },
  updateCompanyMemberJobTitle(
    companyId: string,
    userId: string,
    jobTitle: string | null,
  ) {
    return request<CompanyMemberListItemResponse>(
      `/companies/${encodeURIComponent(companyId)}/members/${encodeURIComponent(userId)}/job-title`,
      {
        method: "PATCH",
        body: JSON.stringify({ job_title: jobTitle }),
      },
    );
  },
  leaveCompany(companyId: string) {
    return request<CompanyMemberListItemResponse>(
      `/companies/${encodeURIComponent(companyId)}/leave`,
      { method: "POST" },
    );
  },

  listDepartmentMembers(companyId: string, departmentId: string) {
    return request<DepartmentMemberResponse[]>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/members`,
    );
  },

  updateDepartmentMemberRole(
    companyId: string,
    departmentId: string,
    userId: string,
    role: InvitationDepartmentRole,
  ) {
    return request<DepartmentMemberResponse>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/members/${encodeURIComponent(userId)}/role`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  },

  updateDepartmentMemberStatus(
    companyId: string,
    departmentId: string,
    userId: string,
    status: "active" | "left",
  ) {
    return request<DepartmentMemberResponse>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/members/${encodeURIComponent(userId)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );
  },

  // Working somewhere else is no longer a conflict, so an invitation carries no
  // acknowledgement. The role is the seat offered: an ordinary member, or the
  // deputy seat directly, which only the owner may offer.
  createCompanyInvitation(
    companyId: string,
    username: string,
    role: InvitationCompanyRole = "employee",
  ) {
    return request<Invitation>(
      `/companies/${encodeURIComponent(companyId)}/invitations`,
      {
        method: "POST",
        body: JSON.stringify({ username, role }),
      },
    );
  },

  createDepartmentInvitation(
    companyId: string,
    departmentId: string,
    username: string,
    role: InvitationDepartmentRole,
  ) {
    return request<Invitation>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/invitations`,
      {
        method: "POST",
        body: JSON.stringify({ username, role }),
      },
    );
  },

  listMyInvitations(status?: InvitationStatus) {
    const query = status
      ? `?${new URLSearchParams({ status }).toString()}`
      : "";
    return request<Invitation[]>(`/invitations${query}`);
  },

  // Accepting adds a membership and leaves every other one alone, so there is
  // nothing left to confirm.
  acceptInvitation(invitationId: string) {
    return request<Invitation>(
      `/invitations/${encodeURIComponent(invitationId)}/accept`,
      { method: "POST" },
    );
  },

  declineInvitation(invitationId: string) {
    return request<Invitation>(
      `/invitations/${encodeURIComponent(invitationId)}/decline`,
      {
        method: "POST",
      },
    );
  },

  cancelCompanyInvitation(companyId: string, invitationId: string) {
    return request<Invitation>(
      `/companies/${encodeURIComponent(companyId)}/invitations/${encodeURIComponent(invitationId)}/cancel`,
      { method: "POST" },
    );
  },

  cancelDepartmentInvitation(
    companyId: string,
    departmentId: string,
    invitationId: string,
  ) {
    return request<Invitation>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/invitations/${encodeURIComponent(invitationId)}/cancel`,
      { method: "POST" },
    );
  },

  getTranscription(callId: string) {
    return request<TranscriptionResponse>(`/calls/${callId}/transcription`);
  },

  updateTranscription(callId: string, input: UpdateTranscriptionRequest) {
    return request<TranscriptionUpdateResponse>(
      `/calls/${encodeURIComponent(callId)}/transcription`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  listTranscriptionSpeakerAssignments(callId: string) {
    return request<TranscriptionSpeakerAssignment[]>(
      `/calls/${encodeURIComponent(callId)}/transcription/speakers`,
    );
  },

  replaceTranscriptionSpeakerAssignments(
    callId: string,
    assignments: TranscriptionSpeakerAssignment[],
  ) {
    return request<TranscriptionSpeakerAssignment[]>(
      `/calls/${encodeURIComponent(callId)}/transcription/speakers`,
      {
        method: "PUT",
        body: JSON.stringify(assignments),
      },
    );
  },

  listTranscriptionRevisions(callId: string, limit = 20, offset = 0) {
    return request<TranscriptionRevisionListResponse>(
      `/calls/${encodeURIComponent(callId)}/transcription/revisions?limit=${limit}&offset=${offset}`,
    );
  },

  getTranscriptionRevision(callId: string, revision: number) {
    return request<TranscriptionRevisionContent>(
      `/calls/${encodeURIComponent(callId)}/transcription/revisions/${revision}`,
    );
  },

  restoreTranscriptionRevision(
    callId: string,
    revision: number,
    expectedRevision: number,
  ) {
    return request<TranscriptionUpdateResponse>(
      `/calls/${encodeURIComponent(callId)}/transcription/revisions/${revision}/restore`,
      {
        method: "POST",
        body: JSON.stringify({ expected_revision: expectedRevision }),
      },
    );
  },

  getAnalysis(callId: string) {
    return request<AnalysisResponse>(`/calls/${callId}/analysis`);
  },

  analyzeCall(callId: string) {
    return request<AnalysisResponse>(`/calls/${callId}/analysis`, {
      method: "POST",
    });
  },

  createReport(callId: string, input: CreateReportRequest) {
    return request<ReportResponse>(
      `/calls/${encodeURIComponent(callId)}/reports`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },

  listGlobalReports(filters?: {
    format?: ReportFormat;
    status?: ReportStatus;
    company_uuid?: string;
    department_uuid?: string;
    call_uuid?: string;
    from?: string;
    to?: string;
    sort?: "created_at" | "updated_at";
    order?: "desc" | "asc";
    limit?: number;
    offset?: number;
  }) {
    return request<GlobalReportsResponse>(`/reports${queryString(filters)}`);
  },

  createGlobalReport(input: CreateGlobalReportRequest) {
    return request<ReportResponse>("/reports", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  listReports(callId: string) {
    return request<ReportsResponse>(
      `/calls/${encodeURIComponent(callId)}/reports`,
    );
  },

  downloadReport(report: ReportResponse) {
    const path =
      report.download_url ??
      `/reports/${encodeURIComponent(report.id)}/download`;
    return requestBlob(
      path.startsWith("/api/v1/") ? path.slice("/api/v1".length) : path,
    );
  },

  deleteReport(reportId: string) {
    return request<void>(`/reports/${encodeURIComponent(reportId)}`, {
      method: "DELETE",
    });
  },

  getAnalyticsOverview(filters?: {
    from?: string;
    to?: string;
    scope?: VisibilityScope;
    company_uuid?: string;
    department_uuid?: string;
    folder_uuid?: string;
  }) {
    return request<AnalyticsOverviewResponse>(
      `/analytics/overview${queryString(filters)}`,
    );
  },

  setCompanyCreditLimit(companyId: string, limitCredits: number | null) {
    return request<void>(
      `/companies/${encodeURIComponent(companyId)}/credit-limit`,
      { method: "PUT", body: JSON.stringify({ limit_credits: limitCredits }) },
    );
  },

  setDepartmentCreditLimit(
    companyId: string,
    departmentId: string,
    limitCredits: number | null,
  ) {
    return request<void>(
      `/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}/credit-limit`,
      { method: "PUT", body: JSON.stringify({ limit_credits: limitCredits }) },
    );
  },

  getCompanyCreditForecast(companyId: string) {
    return request<CompanyCreditForecast>(
      `/companies/${encodeURIComponent(companyId)}/credit-forecast`,
    );
  },

  getCompanyLifecycle(companyId: string) {
    return request<CompanyLifecycle>(
      `/companies/${encodeURIComponent(companyId)}/lifecycle`,
    );
  },

  freezeCompany(companyId: string) {
    return request<void>(`/companies/${encodeURIComponent(companyId)}/freeze`, {
      method: "POST",
    });
  },

  // Calling off a deletion is separate from switching a company back on: a
  // deleted company must not come back with the same click.
  cancelCompanyDeletion(companyId: string) {
    return request<void>(
      `/companies/${encodeURIComponent(companyId)}/cancel-deletion`,
      { method: "POST" },
    );
  },

  activateCompany(companyId: string) {
    return request<void>(
      `/companies/${encodeURIComponent(companyId)}/activate`,
      { method: "POST" },
    );
  },

  getProcessingMonitoring(filters?: {
    company_uuid?: string;
    from?: string;
    to?: string;
  }) {
    return request<ProcessingMonitoringResponse>(
      `/monitoring/processing${queryString(filters)}`,
    );
  },

  search(input: {
    q: string;
    types?: ("calls" | "companies" | "reports" | "instructions")[];
    limit?: number;
  }) {
    return request<SearchResponse>(`/search${queryString(input)}`);
  },

  listNotifications(input?: {
    unread_only?: boolean;
    limit?: number;
    offset?: number;
  }) {
    return request<NotificationsResponse>(
      `/notifications${queryString(input)}`,
    );
  },

  notificationEventsUrl() {
    return `${apiRoot}/notifications/events`;
  },

  markNotificationRead(notificationId: string) {
    return request<void>(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "POST" },
    );
  },

  markNotificationUnread(notificationId: string) {
    return request<void>(
      `/notifications/${encodeURIComponent(notificationId)}/unread`,
      { method: "POST" },
    );
  },

  markAllNotificationsRead() {
    return request<void>("/notifications/read-all", { method: "POST" });
  },

  callEventsUrl(callId: string) {
    return `${apiRoot}/calls/${encodeURIComponent(callId)}/events`;
  },

  listInstructions(
    inputOrScope:
      | InstructionScope
      | {
          scope: InstructionScope;
          company_uuid?: string;
          department_uuid?: string;
          include_inactive?: boolean;
          q?: string;
          limit?: number;
          offset?: number;
        },
    companyUuid?: string,
    departmentUuid?: string,
  ) {
    const input =
      typeof inputOrScope === "string"
        ? {
            scope: inputOrScope,
            company_uuid: companyUuid,
            department_uuid: departmentUuid,
          }
        : inputOrScope;
    return request<AnalysisInstruction[]>(`/instructions${queryString(input)}`);
  },

  getInstruction(id: string) {
    return request<AnalysisInstruction>(
      `/instructions/${encodeURIComponent(id)}`,
    );
  },

  updateInstruction(
    id: string,
    input: {
      title?: string;
      is_active?: boolean;
      sort_order?: number;
    },
  ) {
    return request<AnalysisInstruction>(
      `/instructions/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
  },

  replaceInstructionFile(id: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    return request<AnalysisInstruction>(
      `/instructions/${encodeURIComponent(id)}/file`,
      {
        method: "PUT",
        body,
      },
    );
  },

  downloadInstruction(idOrDownloadUrl: string) {
    const path =
      idOrDownloadUrl.startsWith("/") || idOrDownloadUrl.startsWith("/api/v1/")
        ? apiPathFromUrl(idOrDownloadUrl)
        : `/instructions/${encodeURIComponent(idOrDownloadUrl)}/download`;
    return requestBlob(path);
  },

  listInstructionVersions(id: string) {
    return request<{ items: AnalysisInstructionVersion[] }>(
      `/instructions/${encodeURIComponent(id)}/versions`,
    );
  },

  getInstructionVersionFile(id: string, versionId: string) {
    return requestBlob(
      `/instructions/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/file`,
    );
  },

  reorderInstructions(input: {
    scope: InstructionScope;
    company_uuid?: string;
    department_uuid?: string;
    items: { id: string; sort_order: number }[];
  }) {
    return request<AnalysisInstruction[] | void>("/instructions/reorder", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteInstruction(id: string) {
    return request<void>(`/instructions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async listPlans() {
    const response = await request<{ plans?: RawPlan[] }>("/plans");
    return {
      plans: Array.isArray(response.plans)
        ? response.plans.map(normalizePlan)
        : [],
    } satisfies PlansResponse;
  },

  // There is no self-service activation: a plan is issued by an administrator.
  // The two methods that used to be here called routes that did not exist.
  cancelCompanySubscription(companyId: string) {
    return request<Subscription>(
      `/companies/${encodeURIComponent(companyId)}/subscription/cancel`,
      {
        method: "POST",
      },
    );
  },

  createInstruction(input: {
    title: string;
    file: File;
    scope: InstructionScope;
    companyUuid?: string;
    departmentUuid?: string;
  }) {
    const body = new FormData();
    body.append("title", input.title);
    body.append("file", input.file);
    body.append("scope", input.scope);
    if (input.companyUuid) body.append("company_uuid", input.companyUuid);
    if (input.departmentUuid)
      body.append("department_uuid", input.departmentUuid);
    return request<AnalysisInstruction>("/instructions", {
      method: "POST",
      body,
    });
  },
};
