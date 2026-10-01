import { api } from "../../api";
import type {
  AnalysisPersonalization,
  AssistantCapabilities,
  CallResponse,
  CompanyCreditForecast,
  CompanyDataTransfer,
  CompanyLifecycle,
  CompanyMemberListItemResponse,
  CompanyResponse,
  CreditDashboardResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  NotificationsResponse,
  Plan,
  SessionState,
  Subscription,
  SubscriptionUsageResponse,
  UserPreferencesResponse,
  UserResponse
} from "../../types";

/**
 * The owner's monitor: several companies under one business plan. The owner
 * fills a free slot with a new company, parks the branch they are closing and
 * moves its calls and instruction folders into the company that stays.
 *
 * The three writes — create, freeze, transfer — really change the fixture, so
 * the interface moves for them; the scenario winds that back before each loop.
 */

export type OwnerFixture = {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  calls: CallResponse[];
  companySubscriptions: Record<string, Subscription | null>;
  subscription: Subscription;
  /** The company that stays and receives the branch's data. */
  mainCompanyId: string;
  /** The branch the owner freezes and empties. */
  branchCompanyId: string;
  /** Undoes the loop's writes: the freeze and the move are forgotten. */
  resetData: () => void;
};

/**
 * The scenario rewinds the screen between loops: the company it created is
 * dropped, the frozen one thaws and the transfer log goes back to one line.
 */
export const ownerScreen: { reset: () => void } = { reset: () => undefined };

const MAIN_ID = "demo-owner-company-nord";
const BRANCH_ID = "demo-owner-company-nord-south";
const MAIN_SALES_ID = "demo-owner-department-sales";
const MAIN_SUPPORT_ID = "demo-owner-department-support";
const BRANCH_SALES_ID = "demo-owner-department-south-sales";
const BRANCH_DELIVERY_ID = "demo-owner-department-south-delivery";

/** What the branch hands over — the panel reports these two numbers. */
const BRANCH_CALL_COUNT = 18;
const BRANCH_FOLDER_COUNT = 3;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

const sergey: UserResponse = {
  id: "demo-owner-user-sergey",
  email: "sergey@severny-veter.ru",
  full_name: "Сергей",
  full_surname: "Орлов",
  username: "s.orlov",
  role: "user",
  headline: "Владелец",
  timezone: "Europe/Moscow",
  created_at: daysAgo(430)
};

const people = {
  maria: { id: "demo-owner-user-maria", full_name: "Мария", full_surname: "Волкова", username: "maria.volkova", email: "maria@severny-veter.ru" },
  anna: { id: "demo-owner-user-anna", full_name: "Анна", full_surname: "Смирнова", username: "anna.smirnova", email: "anna@severny-veter.ru" },
  igor: { id: "demo-owner-user-igor", full_name: "Игорь", full_surname: "Кузнецов", username: "igor.kuznetsov", email: "igor@severny-veter.ru" }
};

const mainCompany: CompanyResponse = { id: MAIN_ID, name: "Северный ветер", tag: "nord", manager_user_uuid: sergey.id, member_limit: 25, created_at: daysAgo(400) };
const branchCompany: CompanyResponse = { id: BRANCH_ID, name: "Северный ветер Юг", tag: "nord-south", manager_user_uuid: sergey.id, member_limit: 25, created_at: daysAgo(240) };

const departments: DepartmentResponse[] = [
  { id: MAIN_SALES_ID, company_uuid: MAIN_ID, name: "Отдел продаж", created_at: daysAgo(380) },
  { id: MAIN_SUPPORT_ID, company_uuid: MAIN_ID, name: "Отдел поддержки", created_at: daysAgo(300) },
  { id: BRANCH_SALES_ID, company_uuid: BRANCH_ID, name: "Отдел продаж", created_at: daysAgo(230) },
  { id: BRANCH_DELIVERY_ID, company_uuid: BRANCH_ID, name: "Отдел доставки", created_at: daysAgo(210) }
];

const departmentMembers: DepartmentMemberResponse[] = [
  { department_uuid: MAIN_SALES_ID, user_uuid: people.igor.id, full_name: people.igor.full_name, full_surname: people.igor.full_surname, username: people.igor.username, job_title: "Руководитель отдела", role: "department_leader", status: "active", created_at: daysAgo(370) },
  { department_uuid: MAIN_SALES_ID, user_uuid: people.anna.id, full_name: people.anna.full_name, full_surname: people.anna.full_surname, username: people.anna.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(210) },
  { department_uuid: BRANCH_SALES_ID, user_uuid: people.maria.id, full_name: people.maria.full_name, full_surname: people.maria.full_surname, username: people.maria.username, job_title: "Руководитель отдела", role: "department_leader", status: "active", created_at: daysAgo(200) },
  { department_uuid: BRANCH_SALES_ID, user_uuid: people.anna.id, full_name: people.anna.full_name, full_surname: people.anna.full_surname, username: people.anna.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(160) }
];

const member = (
  person: { id: string; full_name: string; full_surname: string; username: string; email: string },
  role: string,
  jobTitle: string,
  inDepartment: { id: string; name: string; role: string } | null,
  days: number
): CompanyMemberListItemResponse => ({
  user_uuid: person.id,
  email: person.email,
  username: person.username,
  full_name: person.full_name,
  full_surname: person.full_surname,
  job_title: jobTitle,
  company_role: role,
  status: "active",
  departments: inDepartment ? [{ department_uuid: inDepartment.id, department_name: inDepartment.name, role: inDepartment.role, status: "active" }] : [],
  created_at: daysAgo(days)
});

const membersByCompany: Record<string, CompanyMemberListItemResponse[]> = {
  [MAIN_ID]: [
    member(sergey, "company_manager", "Владелец", null, 400),
    member(people.igor, "employee", "Руководитель отдела", { id: MAIN_SALES_ID, name: "Отдел продаж", role: "department_leader" }, 370),
    member(people.anna, "employee", "Менеджер по продажам", { id: MAIN_SALES_ID, name: "Отдел продаж", role: "employee" }, 210)
  ],
  [BRANCH_ID]: [
    member(sergey, "company_manager", "Владелец", null, 240),
    member(people.maria, "employee", "Руководитель отдела", { id: BRANCH_SALES_ID, name: "Отдел продаж", role: "department_leader" }, 200),
    member(people.anna, "employee", "Менеджер по продажам", { id: BRANCH_SALES_ID, name: "Отдел продаж", role: "employee" }, 160)
  ]
};

const plan: Plan = {
  id: "demo-plan-business-pro",
  code: "business_pro",
  type: "business",
  name: "Бизнес Про",
  monthly_price_minor: 2490000,
  currency: "RUB",
  marketing_hours_hint: 200,
  monthly_minutes_limit: 12000,
  monthly_credit_allowance: 24000,
  pending_credit_calls_limit: 40,
  active_instruction_limit: 20,
  // Three slots: two companies work, the third is the free one the owner fills.
  company_limit: 3,
  departments_per_company_limit: 8,
  members_per_company_limit: 40,
  instructions_per_department_limit: 8,
  analysis_level: "pro",
  history_retention_days: 730,
  export_enabled: true,
  team_analytics_enabled: true,
  api_access_enabled: true,
  webhooks_enabled: true
};

const subscription: Subscription = {
  id: "demo-owner-subscription",
  plan,
  user_uuid: null,
  company_uuid: MAIN_ID,
  status: "active",
  starts_at: daysAgo(18),
  ends_at: null,
  created_at: daysAgo(18),
  updated_at: daysAgo(18)
};

function callsFor(companyId: string, departmentId: string, count: number, prefix: string, uploader: string): CallResponse[] {
  const titles = [
    "Согласование условий поставки",
    "Повторный звонок: расчёт по тарифам",
    "Возражение по цене",
    "Первичный контакт: розница",
    "Продление договора",
    "Вопрос по доставке",
    "Демонстрация оборудования",
    "Приёмка партии"
  ];
  return Array.from({ length: count }, (_, index) => {
    const seconds = 260 + ((index * 97) % 620);
    const occurredAt = minutesAgo(40 + index * 137);
    return {
      id: `${prefix}-${index + 1}`,
      title: titles[index % titles.length],
      status: "analyzed",
      original_filename: `${prefix}-${index + 1}.mp3`,
      mime_type: "audio/mpeg",
      size_bytes: seconds * 16_000,
      duration_seconds: seconds,
      media_kind: "audio",
      uploaded_by_user_uuid: uploader,
      company_uuid: companyId,
      department_uuid: departmentId,
      visibility_scope: "department",
      is_favorite: false,
      occurred_at: occurredAt,
      display_time: occurredAt,
      time_source: "source",
      has_analysis: true,
      created_at: occurredAt
    } satisfies CallResponse;
  });
}

const calls: CallResponse[] = [
  ...callsFor(MAIN_ID, MAIN_SALES_ID, 64, "demo-owner-call-main", people.anna.id),
  ...callsFor(BRANCH_ID, BRANCH_SALES_ID, BRANCH_CALL_COUNT, "demo-owner-call-south", people.maria.id)
];

/** One older move, so the panel's log is a history and not an empty block. */
const seedTransfer: CompanyDataTransfer = {
  id: "demo-owner-transfer-seed",
  source_company_uuid: MAIN_ID,
  target_company_uuid: BRANCH_ID,
  calls: 26,
  folders: 2,
  reason: "Передали южные сделки филиалу",
  created_at: daysAgo(96)
};

const forecastFor = (companyId: string): CompanyCreditForecast =>
  companyId === BRANCH_ID
    ? {
      company: { id: BRANCH_ID, name: branchCompany.name, limit_credits: 4000, used_credits: 1180, forecast_credits: 1640, period_start: daysAgo(18), period_end: daysAgo(-12) },
      departments: [
        { id: BRANCH_SALES_ID, name: "Отдел продаж", limit_credits: 3000, used_credits: 980, forecast_credits: 1360, period_start: daysAgo(18), period_end: daysAgo(-12) },
        { id: BRANCH_DELIVERY_ID, name: "Отдел доставки", limit_credits: 1000, used_credits: 200, forecast_credits: 280, period_start: daysAgo(18), period_end: daysAgo(-12) }
      ]
    }
    : {
      company: { id: MAIN_ID, name: mainCompany.name, limit_credits: 18000, used_credits: 9640, forecast_credits: 16100, period_start: daysAgo(18), period_end: daysAgo(-12) },
      departments: [
        { id: MAIN_SALES_ID, name: "Отдел продаж", limit_credits: 12000, used_credits: 7420, forecast_credits: 12400, period_start: daysAgo(18), period_end: daysAgo(-12) },
        { id: MAIN_SUPPORT_ID, name: "Отдел поддержки", limit_credits: 4000, used_credits: 2220, forecast_credits: 3700, period_start: daysAgo(18), period_end: daysAgo(-12) }
      ]
    };

export function installOwnerFixtures(): OwnerFixture {
  // What the writes change. The scenario calls the reset before every loop, so
  // the monitor always starts from the same two companies.
  let lifecycles: Record<string, CompanyLifecycle> = {};
  let transfers: CompanyDataTransfer[] = [seedTransfer];

  const lifecycleOf = (companyId: string): CompanyLifecycle =>
    lifecycles[companyId] ?? { company_uuid: companyId, state: "active", freeze_reason: null, restore_used: false };

  const usage: SubscriptionUsageResponse = {
    subscription,
    period_start: daysAgo(18),
    period_end: daysAgo(-12),
    used_minutes: 4820,
    limit_minutes: 12000,
    remaining_minutes: 7180,
    percent: 40,
    members_limit: 40,
    members_used: 14,
    departments_limit: 8,
    departments_used: 4,
    active_instructions_limit: 20,
    active_instructions_used: 9
  };

  const credits: CreditDashboardResponse = {
    allowance_credits: 24000,
    allowance_remaining: 13180,
    allowance_remaining_percent: 55,
    days_until_reset: 12,
    resets_at: daysAgo(-12),
    allowance_exhausted: false,
    wallet_credits: null,
    activity: Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.now() - (13 - index) * 24 * 60 * 60 * 1000);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const callsCount = weekend ? 4 : 16 + ((index * 3) % 9);
      return { date: date.toISOString().slice(0, 10), credits: callsCount * 38, transcription: callsCount * 14, analysis: callsCount * 24, calls: callsCount };
    }),
    wallet_entries: [],
    visible_to_members: true,
    can_manage_visibility: true,
    calls_awaiting_credits: 0,
    pending_credit_calls_limit: 40
  };

  const notifications: NotificationsResponse = {
    notifications: [
      { id: "demo-owner-notification-limit", type: "subscription", title: "Лимит отдела на исходе", body: "«Отдел продаж»: по текущему темпу кредиты закончатся за 4 дня до сброса.", entity_type: "company", entity_uuid: MAIN_ID, read_at: null, created_at: minutesAgo(140) },
      { id: "demo-owner-notification-digest", type: "weekly_digest_ready", title: "Недельная сводка готова", body: "Средняя оценка по компании — 84 из 100, разобрано 126 звонков.", entity_type: "report", entity_uuid: "demo-owner-report", read_at: minutesAgo(600), created_at: minutesAgo(720) }
    ],
    unread_count: 1
  };

  const preferences: UserPreferencesResponse = { active_company_uuid: MAIN_ID, theme: "system", date_range: {}, invitations_muted: false };

  const personalizations: Record<string, string> = {
    [MAIN_ID]: "Поставляем и обслуживаем промышленное оборудование по всей стране. Клиенты — производственные компании, решение принимают закупки и технический директор.",
    [BRANCH_ID]: "Южный филиал: поставка и доставка оборудования по югу страны, короткие сделки и много вопросов по срокам."
  };

  const assistant: AssistantCapabilities = { search_enabled: false, chat_enabled: false, aggregate_enabled: false, export_enabled: false, company_uuid: MAIN_ID, role: "company_manager", department_uuids: departments.map((department) => department.id), reason_code: "plan" };

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

  const stubs: Partial<typeof api> = {
    listCompanies: async () => [mainCompany, branchCompany],
    listDepartments: async () => departments,
    listDepartmentMembers: async (_companyId, departmentId) => departmentMembers.filter((item) => item.department_uuid === departmentId),
    listCompanyMembers: async (companyId) => {
      const members = membersByCompany[companyId] ?? [];
      return { members, total: members.length, limit: 100, offset: 0 };
    },
    createCompany: async (name) => ({ id: `demo-owner-company-${Date.now()}`, name, tag: "nord-new", manager_user_uuid: sergey.id, member_limit: 40, created_at: new Date().toISOString() }),
    createDepartment: async (companyId, name) => ({ id: `demo-owner-department-${Date.now()}`, company_uuid: companyId, name, created_at: new Date().toISOString() }),
    getCompanyLifecycle: async (companyId) => lifecycleOf(companyId),
    freezeCompany: async (companyId) => {
      // A parked company keeps its data readable and starts the 30-day clock.
      lifecycles = { ...lifecycles, [companyId]: { company_uuid: companyId, state: "frozen", freeze_reason: "downgrade", frozen_at: new Date().toISOString(), purge_after: daysAgo(-30), restore_used: false } };
    },
    activateCompany: async (companyId) => {
      lifecycles = { ...lifecycles, [companyId]: { company_uuid: companyId, state: "active", freeze_reason: null, restore_used: true } };
    },
    cancelCompanyDeletion: async (companyId) => {
      lifecycles = { ...lifecycles, [companyId]: { company_uuid: companyId, state: "frozen", freeze_reason: "downgrade", purge_after: daysAgo(-30), restore_used: false } };
    },
    listCompanyDataTransfers: async () => ({ items: transfers }),
    transferCompanyData: async (input) => {
      const record: CompanyDataTransfer = {
        id: `demo-owner-transfer-${Date.now()}`,
        source_company_uuid: input.sourceCompanyId,
        target_company_uuid: input.targetCompanyId,
        calls: input.includeCalls === false ? 0 : BRANCH_CALL_COUNT,
        folders: input.includeFolders === false ? 0 : BRANCH_FOLDER_COUNT,
        reason: input.reason,
        created_at: new Date().toISOString()
      };
      transfers = [record, ...transfers];
      return record;
    },
    getCompanyCreditForecast: async (companyId) => forecastFor(companyId),
    setCompanyCreditLimit: async () => undefined,
    setDepartmentCreditLimit: async () => undefined,
    listCompanyInvitations: async () => [],
    listDepartmentTransfers: async () => ({ items: [] }),
    listAnalysisRerunRequests: async () => ({ items: [] }),
    listIncomingOwnershipTransfers: async () => ({ items: [] }),
    listCompanySupportJournal: async () => ({ items: [] }),
    getAnalysisPersonalization: async (scope, ownerUuid) => ({ scope, owner_uuid: ownerUuid, content: personalizations[ownerUuid] ?? "", updated_at: daysAgo(12) } satisfies AnalysisPersonalization),
    saveAnalysisPersonalization: async (scope, ownerUuid, content) => ({ scope, owner_uuid: ownerUuid, content, updated_at: new Date().toISOString() }),
    getSubscription: async () => subscription,
    getCompanySubscription: async () => subscription,
    getSubscriptionUsage: () => Promise.reject(new Error("no personal plan in the demo")),
    getCompanySubscriptionUsage: async () => usage,
    getCreditDashboard: () => Promise.reject(new Error("no personal credits in the demo")),
    getCompanyCreditDashboard: async () => credits,
    updateCompanyCreditVisibility: async (_companyId, visible) => ({ visible_to_members: visible, can_manage_visibility: true }),
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
    session: { user: sergey },
    companies: [mainCompany, branchCompany],
    departments,
    departmentMembers,
    calls,
    companySubscriptions: { [MAIN_ID]: subscription, [BRANCH_ID]: subscription },
    subscription,
    mainCompanyId: MAIN_ID,
    branchCompanyId: BRANCH_ID,
    resetData: () => {
      lifecycles = {};
      transfers = [seedTransfer];
    }
  };
}
