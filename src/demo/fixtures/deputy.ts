import { api } from "../../api";
import type {
  AnalysisInstruction,
  AnalysisPersonalization,
  AssistantCapabilities,
  CallResponse,
  CompanyCreditForecast,
  CompanyLifecycle,
  CompanyMemberListItemResponse,
  CompanyResponse,
  CreditDashboardResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  DepartmentTransferRequest,
  Invitation,
  NotificationsResponse,
  Plan,
  SessionState,
  Subscription,
  SubscriptionUsageResponse,
  UserPreferencesResponse,
  UserResponse
} from "../../types";

/**
 * The deputy's monitor: one company in their charge — its departments and
 * people, the requests waiting for a decision, and the instructions the AI
 * grades calls by. Everything those pages ask the server for is answered here,
 * so the screen needs no backend and no money.
 */

export type DeputyFixture = {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  calls: CallResponse[];
  instructions: AnalysisInstruction[];
  companySubscriptions: Record<string, Subscription | null>;
  /** The company the deputy runs; the screen opens straight into it. */
  companyId: string;
};

/** Which page of the deputy's screen is on the monitor. */
export type DeputyPage = "companies" | "instructions";

/**
 * The scenario turns the pages, because the captions beside the monitor and the
 * page under them have to change together. The screen registers how.
 */
export const deputyScreen: { show: (page: DeputyPage) => void } = { show: () => undefined };

const COMPANY_ID = "demo-deputy-company-nord";
const SALES_ID = "demo-deputy-department-sales";
const GROWTH_ID = "demo-deputy-department-growth";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

const olga: UserResponse = {
  id: "demo-deputy-user-olga",
  email: "olga@severny-veter.ru",
  full_name: "Ольга",
  full_surname: "Панова",
  username: "olga.panova",
  role: "user",
  headline: "Заместитель владельца",
  timezone: "Europe/Moscow",
  created_at: daysAgo(330)
};

const people = {
  owner: { id: "demo-deputy-user-sergey", full_name: "Сергей", full_surname: "Орлов", username: "s.orlov", email: "sergey@severny-veter.ru" },
  igor: { id: "demo-deputy-user-igor", full_name: "Игорь", full_surname: "Кузнецов", username: "igor.kuznetsov", email: "igor@severny-veter.ru" },
  anna: { id: "demo-deputy-user-anna", full_name: "Анна", full_surname: "Смирнова", username: "anna.smirnova", email: "anna@severny-veter.ru" },
  maria: { id: "demo-deputy-user-maria", full_name: "Мария", full_surname: "Волкова", username: "maria.volkova", email: "maria@severny-veter.ru" }
};

const company: CompanyResponse = {
  id: COMPANY_ID,
  name: "Северный ветер",
  tag: "nord",
  manager_user_uuid: people.owner.id,
  member_limit: 25,
  created_at: daysAgo(400)
};

const departments: DepartmentResponse[] = [
  { id: SALES_ID, company_uuid: COMPANY_ID, name: "Отдел продаж", created_at: daysAgo(380) },
  { id: GROWTH_ID, company_uuid: COMPANY_ID, name: "Отдел развития", created_at: daysAgo(190) }
];

/**
 * The deputy runs the company and leads one department of it. Both matter on
 * screen: the first decides the requests she answers, the second the
 * instructions she may edit.
 */
const departmentMembers: DepartmentMemberResponse[] = [
  { department_uuid: SALES_ID, user_uuid: people.igor.id, full_name: people.igor.full_name, full_surname: people.igor.full_surname, username: people.igor.username, job_title: "Руководитель отдела", role: "department_leader", status: "active", created_at: daysAgo(370) },
  { department_uuid: SALES_ID, user_uuid: people.anna.id, full_name: people.anna.full_name, full_surname: people.anna.full_surname, username: people.anna.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(210) },
  { department_uuid: SALES_ID, user_uuid: people.maria.id, full_name: people.maria.full_name, full_surname: people.maria.full_surname, username: people.maria.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(150) },
  { department_uuid: GROWTH_ID, user_uuid: olga.id, full_name: olga.full_name, full_surname: olga.full_surname, username: olga.username, job_title: "Заместитель владельца", role: "department_leader", status: "active", created_at: daysAgo(190) }
];

const companyMembers: CompanyMemberListItemResponse[] = [
  { user_uuid: people.owner.id, email: people.owner.email, username: people.owner.username, full_name: people.owner.full_name, full_surname: people.owner.full_surname, job_title: "Владелец", company_role: "company_manager", status: "active", departments: [], created_at: daysAgo(400) },
  { user_uuid: olga.id, email: olga.email, username: olga.username, full_name: olga.full_name, full_surname: olga.full_surname, job_title: "Заместитель владельца", company_role: "company_deputy", status: "active", departments: [{ department_uuid: GROWTH_ID, department_name: "Отдел развития", role: "department_leader", status: "active" }], created_at: daysAgo(330) },
  { user_uuid: people.igor.id, email: people.igor.email, username: people.igor.username, full_name: people.igor.full_name, full_surname: people.igor.full_surname, job_title: "Руководитель отдела", company_role: "employee", status: "active", departments: [{ department_uuid: SALES_ID, department_name: "Отдел продаж", role: "department_leader", status: "active" }], created_at: daysAgo(370) },
  { user_uuid: people.anna.id, email: people.anna.email, username: people.anna.username, full_name: people.anna.full_name, full_surname: people.anna.full_surname, job_title: "Менеджер по продажам", company_role: "employee", status: "active", departments: [{ department_uuid: SALES_ID, department_name: "Отдел продаж", role: "employee", status: "active" }], created_at: daysAgo(210) },
  { user_uuid: people.maria.id, email: people.maria.email, username: people.maria.username, full_name: people.maria.full_name, full_surname: people.maria.full_surname, job_title: "Менеджер по продажам", company_role: "employee", status: "active", departments: [{ department_uuid: SALES_ID, department_name: "Отдел продаж", role: "employee", status: "active" }], created_at: daysAgo(150) }
];

const plan: Plan = {
  id: "demo-plan-business-plus",
  code: "business_plus",
  type: "business",
  name: "Бизнес Плюс",
  monthly_price_minor: 1490000,
  currency: "RUB",
  marketing_hours_hint: 100,
  monthly_minutes_limit: 6000,
  monthly_credit_allowance: 12000,
  pending_credit_calls_limit: 20,
  active_instruction_limit: 10,
  company_limit: 3,
  departments_per_company_limit: 5,
  members_per_company_limit: 25,
  instructions_per_department_limit: 5,
  analysis_level: "plus",
  history_retention_days: 365,
  export_enabled: true,
  team_analytics_enabled: true,
  api_access_enabled: true,
  webhooks_enabled: true
};

const subscription: Subscription = {
  id: "demo-deputy-subscription",
  plan,
  user_uuid: null,
  company_uuid: COMPANY_ID,
  status: "active",
  starts_at: daysAgo(21),
  ends_at: null,
  created_at: daysAgo(21),
  updated_at: daysAgo(21)
};

function call(id: string, title: string, minutes: number, departmentId: string, uploader: string): CallResponse {
  const occurredAt = minutesAgo(minutes * 13);
  return {
    id,
    title,
    status: "analyzed",
    original_filename: `${id}.mp3`,
    mime_type: "audio/mpeg",
    size_bytes: minutes * 60 * 16_000,
    duration_seconds: minutes * 60,
    media_kind: "audio",
    uploaded_by_user_uuid: uploader,
    company_uuid: COMPANY_ID,
    department_uuid: departmentId,
    visibility_scope: "department",
    is_favorite: false,
    occurred_at: occurredAt,
    display_time: occurredAt,
    time_source: "source",
    has_analysis: true,
    created_at: occurredAt
  };
}

const calls: CallResponse[] = [
  call("demo-deputy-call-1", "Согласование условий поставки", 7, SALES_ID, people.anna.id),
  call("demo-deputy-call-2", "Повторный звонок: расчёт по тарифам", 4, SALES_ID, people.anna.id),
  call("demo-deputy-call-3", "Возражение по цене", 6, SALES_ID, people.maria.id),
  call("demo-deputy-call-4", "Первичный контакт: розница", 5, SALES_ID, people.maria.id),
  call("demo-deputy-call-5", "Демонстрация продукта партнёру", 9, GROWTH_ID, olga.id),
  call("demo-deputy-call-6", "Интервью с клиентом о новом тарифе", 8, GROWTH_ID, olga.id)
];

function instruction(input: Pick<AnalysisInstruction, "id" | "scope" | "title" | "original_filename" | "mime_type"> & Partial<AnalysisInstruction> & { days: number }): AnalysisInstruction {
  const { days, ...rest } = input;
  return {
    company_uuid: null,
    department_uuid: null,
    user_uuid: null,
    download_url: "",
    size_bytes: 24_800,
    content_sha256: "demo",
    sort_order: 1,
    is_active: true,
    created_by_user_uuid: olga.id,
    created_at: daysAgo(days),
    updated_at: daysAgo(Math.max(1, Math.round(days / 4))),
    ...rest
  };
}

const MARKDOWN = "text/markdown";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const instructions: AnalysisInstruction[] = [
  instruction({ id: "demo-deputy-instruction-growth-demo", scope: "department", company_uuid: COMPANY_ID, department_uuid: GROWTH_ID, title: "Демонстрация продукта", original_filename: "demonstraciya-produkta.md", mime_type: MARKDOWN, days: 120, sort_order: 1 }),
  instruction({ id: "demo-deputy-instruction-growth-interview", scope: "department", company_uuid: COMPANY_ID, department_uuid: GROWTH_ID, title: "Интервью с клиентом", original_filename: "intervyu-s-klientom.docx", mime_type: DOCX, days: 86, sort_order: 2 }),
  instruction({ id: "demo-deputy-instruction-growth-partners", scope: "department", company_uuid: COMPANY_ID, department_uuid: GROWTH_ID, title: "Переговоры с партнёрами", original_filename: "peregovory-s-partnerami.md", mime_type: MARKDOWN, days: 40, sort_order: 3, is_active: false }),
  instruction({ id: "demo-deputy-instruction-personal", scope: "personal", user_uuid: olga.id, title: "Мой чек-лист контроля качества", original_filename: "chek-list-kontrolya.md", mime_type: MARKDOWN, days: 30, sort_order: 1 })
];

/**
 * What waits for the deputy's word: the sales leader wants to take a manager
 * from another department, and only the owner or the deputy may move people.
 */
const transferRequest: DepartmentTransferRequest = {
  id: "demo-deputy-transfer-maria",
  company_uuid: COMPANY_ID,
  user_uuid: people.maria.id,
  from_department_uuid: SALES_ID,
  to_department_uuid: GROWTH_ID,
  requested_by_user_uuid: people.igor.id,
  reason: "Мария ведёт партнёрские демонстрации",
  status: "pending",
  created_at: daysAgo(2),
  expires_at: daysAgo(-5)
};

export function installDeputyFixtures(): DeputyFixture {
  const usage: SubscriptionUsageResponse = {
    subscription,
    period_start: daysAgo(21),
    period_end: daysAgo(-9),
    used_minutes: 2140,
    limit_minutes: 6000,
    remaining_minutes: 3860,
    percent: 36,
    members_limit: 25,
    members_used: 5,
    departments_limit: 5,
    departments_used: 2,
    active_instructions_limit: 10,
    active_instructions_used: 3
  };

  const credits: CreditDashboardResponse = {
    allowance_credits: 12000,
    allowance_remaining: 6760,
    allowance_remaining_percent: 56,
    days_until_reset: 9,
    resets_at: daysAgo(-9),
    allowance_exhausted: false,
    wallet_credits: null,
    activity: Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.now() - (13 - index) * 24 * 60 * 60 * 1000);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const callsCount = weekend ? 3 : 11 + ((index * 5) % 7);
      return { date: date.toISOString().slice(0, 10), credits: callsCount * 38, transcription: callsCount * 14, analysis: callsCount * 24, calls: callsCount };
    }),
    wallet_entries: [],
    visible_to_members: true,
    can_manage_visibility: false,
    calls_awaiting_credits: 0,
    pending_credit_calls_limit: 20
  };

  const forecast: CompanyCreditForecast = {
    company: { id: COMPANY_ID, name: company.name, limit_credits: 9000, used_credits: 5240, forecast_credits: 8100, period_start: daysAgo(21), period_end: daysAgo(-9) },
    departments: [
      { id: SALES_ID, name: "Отдел продаж", limit_credits: 6000, used_credits: 4380, forecast_credits: 6600, period_start: daysAgo(21), period_end: daysAgo(-9) },
      { id: GROWTH_ID, name: "Отдел развития", limit_credits: 2000, used_credits: 860, forecast_credits: 1380, period_start: daysAgo(21), period_end: daysAgo(-9) }
    ]
  };

  const lifecycle: CompanyLifecycle = { company_uuid: COMPANY_ID, state: "active", freeze_reason: null, restore_used: false };

  const notifications: NotificationsResponse = {
    notifications: [
      { id: "demo-deputy-notification-transfer", type: "department_transfer_requested", title: "Запрос на перевод", body: "Игорь Кузнецов просит перевести Марию Волкову в отдел развития.", entity_type: "department_transfer", entity_uuid: transferRequest.id, read_at: null, created_at: daysAgo(2) },
      { id: "demo-deputy-notification-scorecard", type: "scorecard_review_needed", title: "Критерии обновлены", body: "«Демонстрация продукта»: собрано 7 критериев оценки.", entity_type: "instruction", entity_uuid: instructions[0].id, read_at: minutesAgo(200), created_at: minutesAgo(260) }
    ],
    unread_count: 1
  };

  const preferences: UserPreferencesResponse = { active_company_uuid: COMPANY_ID, theme: "system", date_range: {}, invitations_muted: false };

  const personalization: AnalysisPersonalization = {
    scope: "company",
    owner_uuid: COMPANY_ID,
    content: "Поставляем и обслуживаем промышленное оборудование по всей стране. Клиенты — производственные компании, решение принимают закупки и технический директор.",
    updated_at: daysAgo(14)
  };

  const assistant: AssistantCapabilities = { search_enabled: false, chat_enabled: false, aggregate_enabled: false, export_enabled: false, company_uuid: COMPANY_ID, role: "company_deputy", department_uuids: [SALES_ID, GROWTH_ID], reason_code: "plan" };

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/notifications/events")) {
      // The shell keeps a notification stream open; a stream that never says
      // anything keeps it from reconnecting every two seconds.
      return Promise.resolve(new Response(new ReadableStream({ start() { /* silent */ } }), { status: 200, headers: { "Content-Type": "text/event-stream" } }));
    }
    if (url.includes("/api/v1/") || url.startsWith("/api/")) {
      return Promise.resolve(new Response(JSON.stringify({ error: { code: "demo_screen", message: "Экран демонстрации работает без сервера" } }), { status: 404, headers: { "Content-Type": "application/json" } }));
    }
    return realFetch(input, init);
  };

  // The invitation the deputy sends is never listed anywhere on this screen —
  // the form only needs a created one to report success.
  const invitationFor = (departmentId: string | null): Invitation => ({
    id: `demo-deputy-invitation-${Date.now()}`,
    company_uuid: COMPANY_ID,
    department_uuid: departmentId,
    invited_user_uuid: "demo-deputy-user-invited",
    invited_by_user_uuid: olga.id,
    company_role: "employee",
    department_role: departmentId ? "employee" : null,
    status: "pending",
    approval_status: "not_required",
    expires_at: daysAgo(-7),
    responded_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const stubs: Partial<typeof api> = {
    listCompanies: async () => [company],
    listDepartments: async () => departments,
    listDepartmentMembers: async (_companyId, departmentId) => departmentMembers.filter((member) => member.department_uuid === departmentId),
    listCompanyMembers: async () => ({ members: companyMembers, total: companyMembers.length, limit: 100, offset: 0 }),
    // The deputy answers what is waiting, and a move between departments is the
    // one request the leaders cannot decide themselves.
    listDepartmentTransfers: async () => ({ items: [transferRequest] }),
    listCompanyInvitations: async () => [],
    listAnalysisRerunRequests: async () => ({ items: [] }),
    listIncomingOwnershipTransfers: async () => ({ items: [] }),
    listCompanyDataTransfers: async () => ({ items: [] }),
    listCompanySupportJournal: async () => ({ items: [] }),
    getCompanyLifecycle: async () => lifecycle,
    getCompanyCreditForecast: async () => forecast,
    getAnalysisPersonalization: async () => personalization,
    saveAnalysisPersonalization: async (_scope, _ownerUuid, content) => ({ ...personalization, content }),
    createDepartmentInvitation: async (_companyId, departmentId) => invitationFor(departmentId),
    createCompanyInvitation: async () => invitationFor(null),
    listInstructions: async (inputOrScope) => {
      const input = typeof inputOrScope === "string" ? { scope: inputOrScope, department_uuid: undefined } : inputOrScope;
      return instructions.filter((item) => item.scope === input.scope && (!input.department_uuid || item.department_uuid === input.department_uuid));
    },
    updateInstruction: async (id, input) => {
      const current = instructions.find((item) => item.id === id)!;
      // The demo forgets its own switches: every loop starts from the fixture.
      return { ...current, ...input };
    },
    getSubscription: async () => subscription,
    getCompanySubscription: async () => subscription,
    getSubscriptionUsage: () => Promise.reject(new Error("no personal plan in the demo")),
    getCompanySubscriptionUsage: async () => usage,
    getCreditDashboard: () => Promise.reject(new Error("no personal credits in the demo")),
    getCompanyCreditDashboard: async () => credits,
    listDeveloperApplications: () => Promise.reject(new Error("no integrations in the demo")),
    getPreferences: async () => preferences,
    updatePreferences: async () => preferences,
    listNotifications: async () => notifications,
    markNotificationRead: async () => undefined,
    markNotificationUnread: async () => undefined,
    markAllNotificationsRead: async () => undefined,
    notificationEventsUrl: () => "/api/v1/notifications/events",
    assistantCapabilities: async () => assistant,
    search: async () => ({ calls: [], companies: [], reports: [], instructions: [] })
  };
  Object.assign(api, stubs);

  return {
    session: { user: olga },
    companies: [company],
    departments,
    departmentMembers,
    calls,
    instructions,
    companySubscriptions: { [COMPANY_ID]: subscription },
    companyId: COMPANY_ID
  };
}
