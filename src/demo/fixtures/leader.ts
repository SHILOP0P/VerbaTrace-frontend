import { api } from "../../api";
import { storeWorkspaceCompanyId } from "../../shared/lib/workspace-company";
import type {
  AnalyticsCapabilities,
  AnalyticsCriteriaResponse,
  AnalyticsCriterionCall,
  AnalyticsCriterionCallsResponse,
  AnalyticsCriterionRow,
  AnalyticsDelta,
  AnalyticsDistribution,
  AnalyticsEmployeeRow,
  AnalyticsEmployeesResponse,
  AnalyticsInstructionRef,
  AnalyticsMatrixResponse,
  AnalyticsPeriod,
  AnalyticsProfile,
  AnalyticsSpeech,
  AnalyticsSummary,
  AnalyticsTrendPoint,
  AnalyticsWorthListening,
  AssistantCapabilities,
  CallResponse,
  CompanyResponse,
  CreditDashboardResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  EmployeeGrowthArea,
  EmployeeProgress,
  NotificationsResponse,
  Plan,
  QualityReviewResponse,
  SessionState,
  Subscription,
  SubscriptionUsageResponse,
  UserPreferencesResponse,
  UserResponse
} from "../../types";

/**
 * The department leader's monitor: a month of the sales department's analytics
 * and the QA queue. Everything the analytics page, the quality review list and
 * the shell ask the server for is answered here, so the screen needs no backend
 * and no money.
 */

export type LeaderFixture = {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  calls: CallResponse[];
  companySubscriptions: Record<string, Subscription | null>;
  /** The employee whose profile the scenario opens. */
  featuredEmployeeId: string;
  /** The criterion whose calls the scenario opens at the end. */
  featuredCriterionKey: string;
};

const COMPANY_ID = "demo-company-nord";
const DEPARTMENT_ID = "demo-department-sales";
const INSTRUCTION_ID = "demo-instruction-sales-standard";
const PERIOD_DAYS = 30;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

/** Midday of a day `offset` days back — dates are compared by the local day. */
function dayBack(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date;
}

function bucketOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * A month of daily averages that drifts from `start` to `end`. Weekends have no
 * calls, the way a sales department really works, so the line has gaps.
 */
function dailyTrend(seed: number, start: number, end: number, amplitude = 4): AnalyticsTrendPoint[] {
  const points: AnalyticsTrendPoint[] = [];
  for (let offset = PERIOD_DAYS - 1; offset >= 0; offset -= 1) {
    const date = dayBack(offset);
    const bucket = bucketOf(date);
    if (date.getDay() === 0 || date.getDay() === 6) {
      points.push({ bucket, avg: null, n: 0 });
      continue;
    }
    const progress = (PERIOD_DAYS - 1 - offset) / (PERIOD_DAYS - 1);
    const wobble = Math.sin(seed + offset * 1.7) * amplitude;
    points.push({ bucket, avg: Math.round(start + (end - start) * progress + wobble), n: 2 + (offset % 3) });
  }
  return points;
}

/** Six marks for the sparkline of a table row. */
function shortTrend(seed: number, start: number, end: number): AnalyticsTrendPoint[] {
  return Array.from({ length: 6 }, (_, index) => ({
    bucket: bucketOf(dayBack((5 - index) * 5)),
    avg: Math.round(start + (end - start) * (index / 5) + Math.sin(seed + index) * 3),
    n: 5 + (index % 4)
  }));
}

const delta = (value: number | null, significant = true): AnalyticsDelta => ({
  value,
  significant,
  comparable: value !== null,
  criteria_changed: false
});

const speech = (
  talk: number,
  monologue: number,
  wpm: number,
  questions: number,
  pause: number,
  n: number
): AnalyticsSpeech => ({
  talk_share: talk,
  longest_monologue_seconds: monologue,
  words_per_minute: wpm,
  questions_per_hour: questions,
  response_pause_median_ms: pause,
  n
});

const igor: UserResponse = {
  id: "demo-user-igor",
  email: "igor@severny-veter.ru",
  full_name: "Игорь",
  full_surname: "Кузнецов",
  username: "igor.kuznetsov",
  role: "user",
  headline: "Руководитель отдела продаж",
  created_at: daysAgo(370)
};

const people = {
  igor,
  anna: { id: "demo-user-anna", full_name: "Анна", full_surname: "Смирнова", username: "anna.smirnova" },
  maria: { id: "demo-user-maria", full_name: "Мария", full_surname: "Волкова", username: "maria.volkova" },
  pavel: { id: "demo-user-pavel", full_name: "Павел", full_surname: "Ковалёв", username: "pavel.kovalev" },
  olga: { id: "demo-user-olga", full_name: "Ольга", full_surname: "Тимофеева", username: "olga.timofeeva" },
  owner: { id: "demo-user-owner", full_name: "Сергей", full_surname: "Орлов", username: "s.orlov" }
};

const company: CompanyResponse = {
  id: COMPANY_ID,
  name: "Северный ветер",
  tag: "nord",
  manager_user_uuid: people.owner.id,
  member_limit: 25,
  created_at: daysAgo(400)
};

const department: DepartmentResponse = {
  id: DEPARTMENT_ID,
  company_uuid: COMPANY_ID,
  name: "Отдел продаж",
  created_at: daysAgo(380)
};

const departmentMembers: DepartmentMemberResponse[] = [
  { department_uuid: DEPARTMENT_ID, user_uuid: igor.id, full_name: igor.full_name, full_surname: igor.full_surname, username: igor.username, job_title: "Руководитель отдела", role: "department_leader", status: "active", created_at: daysAgo(370) },
  { department_uuid: DEPARTMENT_ID, user_uuid: people.anna.id, full_name: people.anna.full_name, full_surname: people.anna.full_surname, username: people.anna.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(210) },
  { department_uuid: DEPARTMENT_ID, user_uuid: people.maria.id, full_name: people.maria.full_name, full_surname: people.maria.full_surname, username: people.maria.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(150) },
  { department_uuid: DEPARTMENT_ID, user_uuid: people.pavel.id, full_name: people.pavel.full_name, full_surname: people.pavel.full_surname, username: people.pavel.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(120) },
  { department_uuid: DEPARTMENT_ID, user_uuid: people.olga.id, full_name: people.olga.full_name, full_surname: people.olga.full_surname, username: people.olga.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(64) }
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
  id: "demo-subscription-nord",
  plan,
  user_uuid: null,
  company_uuid: COMPANY_ID,
  status: "active",
  starts_at: daysAgo(21),
  ends_at: null,
  created_at: daysAgo(21),
  updated_at: daysAgo(21)
};

const instruction: AnalyticsInstructionRef = { uuid: INSTRUCTION_ID, title: "Стандарт продаж", deleted: false };

function call(input: { id: string; title: string; uploader: keyof typeof people; daysAgo: number; duration: number; status?: CallResponse["status"] }): CallResponse {
  const person = people[input.uploader];
  const occurredAt = daysAgo(input.daysAgo);
  return {
    id: input.id,
    title: input.title,
    status: input.status ?? "analyzed",
    original_filename: `${input.id}.mp3`,
    mime_type: "audio/mpeg",
    size_bytes: input.duration * 16_000,
    duration_seconds: input.duration,
    media_kind: "audio",
    uploaded_by_user_uuid: person.id,
    company_uuid: COMPANY_ID,
    department_uuid: DEPARTMENT_ID,
    visibility_scope: "department",
    is_favorite: false,
    occurred_at: occurredAt,
    display_time: occurredAt,
    time_source: "source",
    source_provider: null,
    has_analysis: (input.status ?? "analyzed") === "analyzed",
    has_actions: false,
    is_shared: false,
    is_internal: false,
    created_at: occurredAt
  };
}

const calls: CallResponse[] = [
  call({ id: "demo-call-supply-terms", title: "Согласование условий поставки", uploader: "anna", daysAgo: 1, duration: 138 }),
  call({ id: "demo-call-price-objection", title: "Возражение по цене: сравнение с конкурентом", uploader: "maria", daysAgo: 1, duration: 391 }),
  call({ id: "demo-call-retail-first", title: "Первичный контакт: розничная сеть", uploader: "maria", daysAgo: 2, duration: 288 }),
  call({ id: "demo-call-warehouse-audit", title: "Аудит склада: подбор решения", uploader: "pavel", daysAgo: 3, duration: 612 }),
  call({ id: "demo-call-lost-deal", title: "Отказ после КП: разбор причин", uploader: "olga", daysAgo: 4, duration: 254 }),
  call({ id: "demo-call-tariff-recalc", title: "Повторный звонок: расчёт по тарифам", uploader: "anna", daysAgo: 5, duration: 243 }),
  call({ id: "demo-call-inbound-site", title: "Входящий с сайта: стартовый пакет", uploader: "pavel", daysAgo: 6, duration: 176 }),
  call({ id: "demo-call-alpha-renewal", title: "Продление договора «Альфа-Логистик»", uploader: "anna", daysAgo: 8, duration: 725 }),
  call({ id: "demo-call-late-delivery", title: "Жалоба на срок доставки", uploader: "olga", daysAgo: 9, duration: 332 }),
  call({ id: "demo-call-delivery-question", title: "Вопрос по доставке", uploader: "olga", daysAgo: 0, duration: 206, status: "processing" })
];

const callsById = new Map(calls.map((item) => [item.id, item]));

const period: AnalyticsPeriod = {
  from: dayBack(PERIOD_DAYS - 1).toISOString(),
  to: new Date().toISOString(),
  previous_from: dayBack(PERIOD_DAYS * 2 - 1).toISOString(),
  previous_to: dayBack(PERIOD_DAYS).toISOString(),
  bucket: "day",
  timezone: "Europe/Moscow"
};

const capabilities: AnalyticsCapabilities = {
  scope: "company",
  role: "department_leader",
  team_analytics_enabled: true,
  personal_progress_enabled: true,
  can_view_company: false,
  can_view_departments: false,
  can_view_employees: true,
  department_uuids: [DEPARTMENT_ID],
  own_profile_only: false,
  min_sample: 5,
  thin_sample: 20,
  timezone: "Europe/Moscow",
  retention_days: 365
};

const departmentTrend = dailyTrend(1.2, 72, 81);

const summary: AnalyticsSummary = {
  period,
  calls_total: 52,
  calls_analyzed: 47,
  calls_without_fixed_scorecard: 3,
  calls_shared: 2,
  calls_internal_excluded: 0,
  avg_score: 78,
  avg_criteria_score: 76,
  delta: delta(3),
  sample: "ok",
  critical_missed: 5,
  trend: departmentTrend,
  markers: [{ date: bucketOf(dayBack(16)), kind: "instruction_version", label: "Новая версия «Стандарта продаж»" }],
  company_avg_score: 74
};

type CriterionSeed = {
  key: string;
  title: string;
  critical?: boolean;
  avg: number;
  pass: number;
  change: number;
  significant?: boolean;
  scored: number;
  notApplicable?: number;
  unassessed?: number;
  distribution: [number, number, number, number, number];
};

const criterionSeeds: CriterionSeed[] = [
  { key: "greeting", title: "Приветствие и представление", avg: 94, pass: 0.95, change: 1, significant: false, scored: 44, distribution: [38, 4, 2, 0, 0] },
  { key: "needs_discovery", title: "Выявление потребности", avg: 81, pass: 0.77, change: 5, scored: 44, distribution: [24, 10, 6, 3, 1] },
  { key: "solution_fit", title: "Презентация решения под задачу", avg: 76, pass: 0.70, change: 2, significant: false, scored: 42, notApplicable: 2, distribution: [20, 9, 8, 3, 2] },
  { key: "objections", title: "Работа с возражениями", avg: 58, pass: 0.45, change: -4, scored: 38, notApplicable: 6, unassessed: 1, distribution: [9, 8, 11, 6, 4] },
  { key: "price_terms", title: "Условия оплаты и цена", avg: 79, pass: 0.75, change: 3, scored: 40, notApplicable: 4, distribution: [21, 9, 6, 3, 1] },
  { key: "decision_maker", title: "Фиксация лица, принимающего решение", avg: 63, pass: 0.52, change: 6, scored: 41, notApplicable: 3, distribution: [13, 9, 10, 6, 3] },
  { key: "next_step", title: "Договорённость о следующем шаге", critical: true, avg: 54, pass: 0.41, change: -6, scored: 44, distribution: [10, 8, 12, 8, 6] },
  { key: "wrap_up", title: "Итог и резюме разговора", avg: 85, pass: 0.86, change: 2, significant: false, scored: 44, distribution: [29, 9, 4, 2, 0] }
];

function distributionOf(values: [number, number, number, number, number]): AnalyticsDistribution {
  const [met, mostly_met, partially_met, minimally_met, missed] = values;
  return { met, mostly_met, partially_met, minimally_met, missed };
}

const criteriaRows: AnalyticsCriterionRow[] = criterionSeeds.map((seed, index) => ({
  criterion_key: seed.key,
  title: seed.title,
  instruction,
  weight: 1,
  is_critical: Boolean(seed.critical),
  n_scored: seed.scored,
  n_not_applicable: seed.notApplicable ?? 0,
  n_unassessed: seed.unassessed ?? 0,
  avg_score: seed.avg,
  pass_rate: seed.pass,
  delta: delta(seed.change, seed.significant ?? true),
  sample: "ok",
  distribution: distributionOf(seed.distribution),
  trend: shortTrend(index * 1.3, seed.avg - seed.change - 2, seed.avg),
  sort_rank: index + 1
}));

const criteriaResponse: AnalyticsCriteriaResponse = { period, criteria: criteriaRows, total: criteriaRows.length };

type EmployeeSeed = {
  person: { id: string; full_name: string; full_surname: string };
  calls: number;
  shared: number;
  avg: number;
  criteriaAvg: number;
  change: number;
  significant?: boolean;
  critical: number;
  weakest: { key: string; title: string; score: number };
  speech: AnalyticsSpeech;
  trend: AnalyticsTrendPoint[];
};

const employeeSeeds: EmployeeSeed[] = [
  {
    person: people.anna, calls: 14, shared: 1, avg: 84, criteriaAvg: 82, change: 4, critical: 1,
    weakest: { key: "objections", title: "Работа с возражениями", score: 66 },
    speech: speech(0.54, 72, 148, 24, 620, 14),
    trend: dailyTrend(2.4, 79, 86)
  },
  {
    person: people.maria, calls: 12, shared: 1, avg: 71, criteriaAvg: 69, change: -2, significant: false, critical: 2,
    weakest: { key: "next_step", title: "Договорённость о следующем шаге", score: 44 },
    speech: speech(0.68, 134, 168, 12, 380, 12),
    trend: dailyTrend(3.6, 74, 70)
  },
  {
    person: people.pavel, calls: 11, shared: 0, avg: 79, criteriaAvg: 78, change: 6, critical: 1,
    weakest: { key: "decision_maker", title: "Фиксация лица, принимающего решение", score: 61 },
    speech: speech(0.51, 58, 139, 21, 700, 11),
    trend: dailyTrend(4.8, 71, 81)
  },
  {
    person: people.olga, calls: 10, shared: 0, avg: 66, criteriaAvg: 64, change: -5, critical: 1,
    weakest: { key: "next_step", title: "Договорённость о следующем шаге", score: 41 },
    speech: speech(0.71, 156, 176, 9, 340, 10),
    trend: dailyTrend(6.1, 70, 65)
  }
];

const employeeRows: AnalyticsEmployeeRow[] = employeeSeeds.map((seed) => ({
  user_uuid: seed.person.id,
  full_name: `${seed.person.full_name} ${seed.person.full_surname}`,
  avatar_url: null,
  department: { uuid: DEPARTMENT_ID, name: department.name },
  is_former_member: false,
  is_me: false,
  calls: seed.calls,
  calls_shared: seed.shared,
  avg_score: seed.avg,
  avg_criteria_score: seed.criteriaAvg,
  delta: delta(seed.change, seed.significant ?? true),
  sample: "ok",
  critical_missed: seed.critical,
  weakest_criterion: { criterion_key: seed.weakest.key, title: seed.weakest.title, avg_score: seed.weakest.score },
  speech: seed.speech,
  trend: seed.trend
}));

const teamSpeech = speech(0.59, 92, 152, 17, 540, 47);

const employeesResponse: AnalyticsEmployeesResponse = {
  period,
  team: { calls: 47, avg_score: 78, avg_criteria_score: 76, delta: delta(3), sample: "ok", trend: departmentTrend, speech: teamSpeech },
  employees: employeeRows,
  total: employeeRows.length
};

const matrixResponse: AnalyticsMatrixResponse = {
  period,
  instruction,
  criteria: criteriaRows.map((row) => ({ criterion_key: row.criterion_key, title: row.title, is_critical: row.is_critical })),
  rows: employeeSeeds.map((seed, employeeIndex) => ({
    user_uuid: seed.person.id,
    full_name: `${seed.person.full_name} ${seed.person.full_surname}`,
    cells: criteriaRows.map((row, criterionIndex) => {
      // Each cell is the criterion's average shifted by how the person does overall.
      const shift = seed.avg - 78 + Math.round(Math.sin(employeeIndex * 2.1 + criterionIndex) * 5);
      return {
        criterion_key: row.criterion_key,
        avg_score: Math.max(18, Math.min(100, (row.avg_score ?? 70) + shift)),
        n: Math.max(5, seed.calls - (criterionIndex % 3)),
        sample: "ok" as const
      };
    })
  }))
};

/** Мария's profile: the drill-down the leader opens from the team table. */
const mariaTrend = employeeSeeds[1].trend;

const mariaCriteria: AnalyticsProfile["criteria"] = [
  { criterion_key: "greeting", title: "Приветствие и представление", instruction, own_avg: 92, own_n: 12, reference_avg: 94, delta: delta(1, false), sample: "ok" },
  { criterion_key: "needs_discovery", title: "Выявление потребности", instruction, own_avg: 74, own_n: 12, reference_avg: 81, delta: delta(-3), sample: "ok" },
  { criterion_key: "solution_fit", title: "Презентация решения под задачу", instruction, own_avg: 70, own_n: 11, reference_avg: 76, delta: delta(0, false), sample: "ok" },
  { criterion_key: "objections", title: "Работа с возражениями", instruction, own_avg: 49, own_n: 10, reference_avg: 58, delta: delta(-7), sample: "ok" },
  { criterion_key: "price_terms", title: "Условия оплаты и цена", instruction, own_avg: 77, own_n: 11, reference_avg: 79, delta: delta(2, false), sample: "ok" },
  { criterion_key: "decision_maker", title: "Фиксация лица, принимающего решение", instruction, own_avg: 58, own_n: 11, reference_avg: 63, delta: delta(4), sample: "ok" },
  { criterion_key: "next_step", title: "Договорённость о следующем шаге", instruction, own_avg: 44, own_n: 12, reference_avg: 54, delta: delta(-5), sample: "ok" },
  { criterion_key: "wrap_up", title: "Итог и резюме разговора", instruction, own_avg: 83, own_n: 12, reference_avg: 85, delta: delta(1, false), sample: "ok" }
];

const worthListening: AnalyticsWorthListening[] = [
  { call_uuid: "demo-call-lost-deal", title: "Отказ после КП: разбор причин", occurred_at: daysAgo(4), overall_score: 48, critical_missed: 1, can_open: true },
  { call_uuid: "demo-call-price-objection", title: "Возражение по цене: сравнение с конкурентом", occurred_at: daysAgo(1), overall_score: 57, critical_missed: 1, can_open: true },
  { call_uuid: "demo-call-retail-first", title: "Первичный контакт: розничная сеть", occurred_at: daysAgo(2), overall_score: 63, critical_missed: 0, can_open: true }
];

const mariaProfile: AnalyticsProfile = {
  period,
  employee: { user_uuid: people.maria.id, full_name: "Мария Волкова", department: { uuid: DEPARTMENT_ID, name: department.name }, is_former_member: false },
  totals: { calls: 12, avg_score: 71, avg_criteria_score: 69, delta: delta(-2, false), sample: "ok", critical_missed: 2 },
  trend: mariaTrend,
  reference: { label: "Отдел продаж", avg_score: 78, trend: departmentTrend, hidden: false },
  criteria: mariaCriteria,
  worth_listening: worthListening,
  speech: { own: employeeSeeds[1].speech, team_median: teamSpeech }
};

const mariaProgress: EmployeeProgress = {
  open: [
    { criterion_key: "next_step", title: "Договорённость о следующем шаге", last_score: 42, repeat_streak: 4, first_failed_at: daysAgo(19), last_call_uuid: "demo-call-price-objection" },
    { criterion_key: "objections", title: "Работа с возражениями", last_score: 51, repeat_streak: 3, first_failed_at: daysAgo(12), last_call_uuid: "demo-call-retail-first" },
    { criterion_key: "solution_fit", title: "Презентация решения под задачу", last_score: 64, repeat_streak: 2, first_failed_at: daysAgo(6), last_call_uuid: "demo-call-price-objection" }
  ],
  closed_in_period: [
    { criterion_key: "greeting", title: "Приветствие и представление", closed_at: daysAgo(11) },
    { criterion_key: "wrap_up", title: "Итог и резюме разговора", closed_at: daysAgo(4) }
  ],
  growth_areas: []
};

const mariaGrowthAreas: EmployeeGrowthArea[] = [
  {
    area_uuid: "demo-area-budget",
    title: "Не спрашивает бюджет до презентации цены",
    description: "Цена звучит раньше, чем клиент назвал ориентир по бюджету, поэтому разговор уходит в торг.",
    status: "open",
    occurrences: 5,
    clean_streak: 0,
    returned: false,
    observations: [
      { call_uuid: "demo-call-price-objection", occurred_at: daysAgo(1), verdict: "repeated", note: "Цена названа до вопроса об объёме закупки.", item_ids: ["price_terms"], can_open: true },
      { call_uuid: "demo-call-retail-first", occurred_at: daysAgo(2), verdict: "repeated", note: "Клиент сам спросил цену, бюджет остался неизвестен.", item_ids: ["needs_discovery"], can_open: true }
    ]
  },
  {
    area_uuid: "demo-area-interrupt",
    title: "Перебивает клиента на возражении",
    description: "Ответ начинается до того, как клиент договорил возражение — часть причины отказа теряется.",
    status: "open",
    occurrences: 3,
    clean_streak: 1,
    returned: true,
    observations: [
      { call_uuid: "demo-call-price-objection", occurred_at: daysAgo(1), verdict: "repeated", note: "Ответ про комплектацию начался на середине фразы клиента.", item_ids: ["objections"], can_open: true }
    ]
  }
];

const criterionCalls: Record<string, AnalyticsCriterionCall[]> = {
  next_step: [
    { call_uuid: "demo-call-lost-deal", title: "Отказ после КП: разбор причин", occurred_at: daysAgo(4), employees: [{ user_uuid: people.olga.id, full_name: "Ольга Тимофеева" }], status: "missed", score: 22, score_source: "ai", item_id: "next_step", evidence_start_seconds: 214, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-price-objection", title: "Возражение по цене: сравнение с конкурентом", occurred_at: daysAgo(1), employees: [{ user_uuid: people.maria.id, full_name: "Мария Волкова" }], status: "minimally_met", score: 38, score_source: "ai", item_id: "next_step", evidence_start_seconds: 347, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-late-delivery", title: "Жалоба на срок доставки", occurred_at: daysAgo(9), employees: [{ user_uuid: people.olga.id, full_name: "Ольга Тимофеева" }], status: "minimally_met", score: 41, score_source: "human", item_id: "next_step", evidence_start_seconds: 268, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-retail-first", title: "Первичный контакт: розничная сеть", occurred_at: daysAgo(2), employees: [{ user_uuid: people.maria.id, full_name: "Мария Волкова" }], status: "partially_met", score: 55, score_source: "ai", item_id: "next_step", evidence_start_seconds: 231, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-inbound-site", title: "Входящий с сайта: стартовый пакет", occurred_at: daysAgo(6), employees: [{ user_uuid: people.pavel.id, full_name: "Павел Ковалёв" }], status: "mostly_met", score: 72, score_source: "ai", item_id: "next_step", evidence_start_seconds: 149, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-supply-terms", title: "Согласование условий поставки", occurred_at: daysAgo(1), employees: [{ user_uuid: people.anna.id, full_name: "Анна Смирнова" }], status: "met", score: 88, score_source: "ai", item_id: "next_step", evidence_start_seconds: 108, is_shared: false, subjects_changed_manually: false, can_open: true }
  ],
  objections: [
    { call_uuid: "demo-call-lost-deal", title: "Отказ после КП: разбор причин", occurred_at: daysAgo(4), employees: [{ user_uuid: people.olga.id, full_name: "Ольга Тимофеева" }], status: "missed", score: 28, score_source: "ai", item_id: "objections", evidence_start_seconds: 96, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-price-objection", title: "Возражение по цене: сравнение с конкурентом", occurred_at: daysAgo(1), employees: [{ user_uuid: people.maria.id, full_name: "Мария Волкова" }], status: "minimally_met", score: 44, score_source: "human", item_id: "objections", evidence_start_seconds: 162, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-late-delivery", title: "Жалоба на срок доставки", occurred_at: daysAgo(9), employees: [{ user_uuid: people.olga.id, full_name: "Ольга Тимофеева" }], status: "partially_met", score: 58, score_source: "ai", item_id: "objections", evidence_start_seconds: 121, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-warehouse-audit", title: "Аудит склада: подбор решения", occurred_at: daysAgo(3), employees: [{ user_uuid: people.pavel.id, full_name: "Павел Ковалёв" }], status: "mostly_met", score: 74, score_source: "ai", item_id: "objections", evidence_start_seconds: 402, is_shared: false, subjects_changed_manually: false, can_open: true },
    { call_uuid: "demo-call-supply-terms", title: "Согласование условий поставки", occurred_at: daysAgo(1), employees: [{ user_uuid: people.anna.id, full_name: "Анна Смирнова" }], status: "met", score: 92, score_source: "ai", item_id: "objections", evidence_start_seconds: 52, is_shared: false, subjects_changed_manually: false, can_open: true }
  ]
};

function fallbackCriterionCalls(criterionKey: string): AnalyticsCriterionCall[] {
  const row = criteriaRows.find((item) => item.criterion_key === criterionKey);
  return criterionCalls.next_step.map((item, index) => ({
    ...item,
    item_id: criterionKey,
    score: Math.max(20, Math.min(100, (row?.avg_score ?? 70) - 24 + index * 10))
  }));
}

const reviewCapabilities = {
  can_claim: true, can_edit: true, can_publish: true, can_appeal: false, can_resolve_appeal: true,
  can_view_events: true, can_edit_analysis: true, can_dispute_analysis: false, can_resolve_dispute: true, can_comment_analysis: true
};

function review(input: { id: string; callId: string; status: QualityReviewResponse["status"]; minutesAgo: number; subject: string }): QualityReviewResponse {
  return {
    review_uuid: input.id,
    call_uuid: input.callId,
    analysis_uuid: `${input.callId}-analysis`,
    transcription_revision: 1,
    company_uuid: COMPANY_ID,
    department_uuid: DEPARTMENT_ID,
    reviewed_subject_user_uuid: input.subject,
    assignee_user_uuid: input.status === "unassigned" ? undefined : igor.id,
    status: input.status,
    lock_version: 1,
    created_by_user_uuid: igor.id,
    created_at: minutesAgo(input.minutesAgo + 180),
    updated_at: minutesAgo(input.minutesAgo),
    published_at: input.status === "published" ? minutesAgo(input.minutesAgo) : undefined,
    source_outdated: false,
    call_in_bin: false,
    capabilities: reviewCapabilities,
    analysis: {},
    revisions: [],
    appeals: []
  };
}

const reviews: QualityReviewResponse[] = [
  review({ id: "demo-review-lost-deal", callId: "demo-call-lost-deal", status: "unassigned", minutesAgo: 45, subject: people.olga.id }),
  review({ id: "demo-review-price-objection", callId: "demo-call-price-objection", status: "in_review", minutesAgo: 130, subject: people.maria.id }),
  review({ id: "demo-review-retail-first", callId: "demo-call-retail-first", status: "appealed", minutesAgo: 620, subject: people.maria.id }),
  review({ id: "demo-review-warehouse-audit", callId: "demo-call-warehouse-audit", status: "published", minutesAgo: 1580, subject: people.pavel.id }),
  review({ id: "demo-review-late-delivery", callId: "demo-call-late-delivery", status: "resolved", minutesAgo: 2660, subject: people.olga.id })
];

const usage: SubscriptionUsageResponse = {
  subscription, period_start: daysAgo(21), period_end: daysAgo(-9), used_minutes: 2480, limit_minutes: 6000, remaining_minutes: 3520, percent: 41,
  members_limit: 25, members_used: 12, departments_limit: 5, departments_used: 3, active_instructions_limit: 10, active_instructions_used: 4
};

const credits: CreditDashboardResponse = {
  allowance_credits: 12000,
  allowance_remaining: 6840,
  allowance_remaining_percent: 57,
  days_until_reset: 9,
  resets_at: daysAgo(-9),
  allowance_exhausted: false,
  wallet_credits: null,
  activity: Array.from({ length: 14 }, (_, index) => {
    const date = dayBack(13 - index);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const callsCount = weekend ? 2 : 9 + ((index * 7) % 6);
    return { date: bucketOf(date), credits: callsCount * 38, transcription: callsCount * 14, analysis: callsCount * 24, calls: callsCount };
  }),
  wallet_entries: [],
  visible_to_members: true,
  can_manage_visibility: false,
  calls_awaiting_credits: 0,
  pending_credit_calls_limit: 20
};

const notifications: NotificationsResponse = {
  notifications: [
    { id: "demo-notification-digest", type: "weekly_digest_ready", title: "Недельный дайджест отдела", body: "Отдел продаж: средний балл 78, слабее всего — договорённость о следующем шаге.", entity_type: "analytics", entity_uuid: DEPARTMENT_ID, read_at: null, created_at: minutesAgo(52) },
    { id: "demo-notification-review", type: "quality_review_assigned", title: "Звонок ждёт проверки", body: "«Отказ после КП: разбор причин» — оценка 48 из 100.", entity_type: "quality_review", entity_uuid: "demo-review-lost-deal", read_at: minutesAgo(30), created_at: minutesAgo(45) },
    { id: "demo-notification-critical", type: "scorecard_review_needed", title: "Критичный критерий провален", body: "Ольга Тимофеева: «Договорённость о следующем шаге» — 22 из 100.", entity_type: "call", entity_uuid: "demo-call-lost-deal", read_at: null, created_at: minutesAgo(240) }
  ],
  unread_count: 2
};

const preferences: UserPreferencesResponse = { active_company_uuid: COMPANY_ID, theme: "system", date_range: {}, invitations_muted: false };

const assistant: AssistantCapabilities = {
  search_enabled: false, chat_enabled: false, aggregate_enabled: false, export_enabled: false,
  company_uuid: COMPANY_ID, role: "department_leader", department_uuids: [DEPARTMENT_ID], reason_code: "plan"
};

export function installLeaderFixtures(): LeaderFixture {
  // The analytics page reads the workspace from storage; without it the leader
  // would land in the personal scope and see no team at all.
  storeWorkspaceCompanyId(COMPANY_ID);

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
    getAnalyticsCapabilities: async () => capabilities,
    getAnalyticsSummary: async () => summary,
    getAnalyticsCriteria: async () => criteriaResponse,
    getAnalyticsEmployees: async () => employeesResponse,
    getAnalyticsDepartments: async () => ({ period, company: null, departments: [], total: 0 }),
    getAnalyticsMatrix: async () => matrixResponse,
    getAnalyticsProfile: async () => mariaProfile,
    getEmployeeProgress: async () => mariaProgress,
    getEmployeeGrowthAreas: async (_userId, filters) => ({ areas: filters?.status === "dismissed" ? [] : mariaGrowthAreas }),
    getAnalyticsCriterionCalls: async (criterionKey, filters): Promise<AnalyticsCriterionCallsResponse> => {
      const rows = criterionCalls[criterionKey] ?? fallbackCriterionCalls(criterionKey);
      const sorted = filters?.sort === "occurred_at"
        ? [...rows].sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
        : [...rows].sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
      const row = criteriaRows.find((item) => item.criterion_key === criterionKey) ?? criteriaRows[0];
      return { criterion: { criterion_key: row.criterion_key, title: row.title, instruction }, calls: sorted, total: sorted.length, limit: 20, offset: 0 };
    },
    listQualityReviews: async (input) => ({
      items: input?.status ? reviews.filter((item) => item.status === input.status) : reviews,
      limit: 50,
      offset: 0
    }),
    listCalls: async () => ({ items: calls, total: calls.length, limit: 100, offset: 0 }),
    getCall: async (callId) => callsById.get(callId) ?? calls[0],
    listFavoriteCalls: async () => [],
    listReports: async () => ({ reports: [] }),
    getSubscription: async () => subscription,
    getCompanySubscription: async () => subscription,
    getSubscriptionUsage: () => Promise.reject(new Error("no personal plan in the demo")),
    getCompanySubscriptionUsage: async () => usage,
    getCreditDashboard: () => Promise.reject(new Error("no personal credits in the demo")),
    getCompanyCreditDashboard: async () => credits,
    getPreferences: async () => preferences,
    updatePreferences: async () => preferences,
    listNotifications: async () => notifications,
    markNotificationRead: async () => undefined,
    markAllNotificationsRead: async () => undefined,
    notificationEventsUrl: () => "/api/v1/notifications/events",
    assistantCapabilities: async () => assistant,
    listCompanies: async () => [company],
    listDepartments: async () => [department],
    listDepartmentMembers: async () => departmentMembers
  };
  Object.assign(api, stubs);

  return {
    session: { user: igor },
    companies: [company],
    departments: [department],
    departmentMembers,
    calls,
    companySubscriptions: { [COMPANY_ID]: subscription },
    featuredEmployeeId: people.maria.id,
    featuredCriterionKey: "next_step"
  };
}
