import { api } from "../../api";
import type {
  AnalysisInstruction,
  AnalysisResponse,
  AnalysisReviewContext,
  AnalysisV3Item,
  AnalysisV3Recommendation,
  AppliedInstruction,
  AssistantCapabilities,
  CallAction,
  CallFilterOptionsResponse,
  CallFolderResponse,
  CallProgress,
  CallResponse,
  CallSpeech,
  CompanyResponse,
  CreditDashboardResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  NotificationsResponse,
  Plan,
  SessionState,
  Subscription,
  SubscriptionUsageResponse,
  TranscriptionResponse,
  TranscriptionSegmentResponse,
  TranscriptionSpeakerAssignment,
  TranscriptionWordResponse,
  UserPreferencesResponse,
  UserResponse
} from "../../types";
import { buildConversationWav } from "./audio";

/**
 * The employee's monitor: one sales department, a handful of calls, and one
 * fully analysed conversation. Everything the calls page and the shell ask the
 * server for is answered here, so the screen needs no backend and no money.
 */

export type EmployeeFixture = {
  session: SessionState;
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  calls: CallResponse[];
  transcriptions: Record<string, TranscriptionResponse>;
  analyses: Record<string, AnalysisResponse>;
  companySubscriptions: Record<string, Subscription | null>;
  /** The call open when the screen appears. */
  initialCallId: string;
  /** The call the scenario opens and walks through. */
  featuredCallId: string;
};

type Line = { speaker: "A" | "B"; start: number; end: number; text: string };

const COMPANY_ID = "demo-company-nord";
const DEPARTMENT_ID = "demo-department-sales";
const FOLDER_ID = "demo-folder-key-clients";
const FEATURED_CALL_ID = "demo-call-supply-terms";
const SECOND_CALL_ID = "demo-call-tariff-recalc";
const ANALYSIS_ID = "demo-analysis-supply-terms";
const INSTRUCTION_ID = "demo-instruction-sales-standard";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const hoursAgo = (hours: number) => minutesAgo(hours * 60);
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

const anna: UserResponse = {
  id: "demo-user-anna",
  email: "anna@severny-veter.ru",
  full_name: "Анна",
  full_surname: "Смирнова",
  username: "anna.smirnova",
  role: "user",
  headline: "Менеджер по продажам",
  created_at: daysAgo(210)
};

const people = {
  anna,
  igor: { id: "demo-user-igor", full_name: "Игорь", full_surname: "Кузнецов", username: "igor.kuznetsov" },
  maria: { id: "demo-user-maria", full_name: "Мария", full_surname: "Волкова", username: "maria.volkova" },
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
  { department_uuid: DEPARTMENT_ID, user_uuid: people.igor.id, full_name: people.igor.full_name, full_surname: people.igor.full_surname, username: people.igor.username, job_title: "Руководитель отдела", role: "department_leader", status: "active", created_at: daysAgo(370) },
  { department_uuid: DEPARTMENT_ID, user_uuid: anna.id, full_name: anna.full_name, full_surname: anna.full_surname, username: anna.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(210) },
  { department_uuid: DEPARTMENT_ID, user_uuid: people.maria.id, full_name: people.maria.full_name, full_surname: people.maria.full_surname, username: people.maria.username, job_title: "Менеджер по продажам", role: "employee", status: "active", created_at: daysAgo(150) }
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

const supplyCall: Line[] = [
  { speaker: "A", start: 0.4, end: 6.5, text: "Добрый день, компания «Северный ветер», меня зовут Анна. Чем могу помочь?" },
  { speaker: "B", start: 6.9, end: 15.2, text: "Здравствуйте, Анна. Это Дмитрий из «Альфа-Логистик». Мы обсуждали поставку партии оборудования, хотел уточнить условия." },
  { speaker: "A", start: 15.6, end: 24.0, text: "Да, Дмитрий, помню ваш запрос. Давайте пройдёмся по пунктам: объём, сроки и оплата. Что для вас сейчас важнее всего?" },
  { speaker: "B", start: 24.4, end: 33.0, text: "Главное — сроки. Нам нужно, чтобы первая партия была на складе до конца месяца, иначе встанет линия." },
  { speaker: "A", start: 33.5, end: 45.2, text: "Поняла. При заказе до пятницы первую партию отгружаем за три-пять рабочих дней, доставка до вашего склада ещё два дня. В конец месяца укладываемся с запасом." },
  { speaker: "B", start: 45.7, end: 52.4, text: "Хорошо. А по цене? Коллеги говорили, что у конкурентов выходит дешевле процентов на десять." },
  { speaker: "A", start: 52.8, end: 66.3, text: "Разница обычно в комплектации: у нас в цену входят монтаж и гарантия два года. Если сравнивать одинаковый набор, разница почти уходит. Могу подготовить сравнение по пунктам." },
  { speaker: "B", start: 66.7, end: 72.5, text: "Да, сравнение было бы полезно. Ещё вопрос по оплате: возможна ли отсрочка?" },
  { speaker: "A", start: 72.9, end: 84.6, text: "Для постоянных клиентов даём отсрочку четырнадцать дней после отгрузки. Для первой поставки — предоплата пятьдесят процентов, остальное по факту приёмки." },
  { speaker: "B", start: 85.0, end: 92.4, text: "Понял. А что с интеграцией: у нас учёт в 1С, нужно, чтобы документы подгружались автоматически." },
  { speaker: "A", start: 92.8, end: 100.6, text: "Интеграция есть, обмен документами настраивается за день. Подключим сразу после подписания договора." },
  { speaker: "B", start: 101.0, end: 108.2, text: "Отлично. Тогда мне нужно коммерческое предложение, чтобы согласовать с руководством." },
  { speaker: "A", start: 108.6, end: 121.4, text: "Подготовлю коммерческое предложение по двум вариантам комплектации и пришлю сегодня до 18:00. Удобно будет созвониться в четверг в 11:00, чтобы обсудить?" },
  { speaker: "B", start: 121.8, end: 127.3, text: "Да, четверг в 11 подходит. Пришлите на мою почту, она у вас есть." },
  { speaker: "A", start: 127.7, end: 134.2, text: "Договорились. Спасибо за разговор, Дмитрий, до четверга." },
  { speaker: "B", start: 134.6, end: 137.4, text: "Спасибо, до свидания." }
];

const tariffCall: Line[] = [
  { speaker: "A", start: 0.5, end: 5.8, text: "Добрый день, Анна, «Северный ветер». Вы просили пересчитать тарифы." },
  { speaker: "B", start: 6.2, end: 13.9, text: "Да, здравствуйте. Мы посчитали объёмы на квартал, получается больше, чем в прошлом расчёте." },
  { speaker: "A", start: 14.3, end: 24.5, text: "Тогда вам подходит объёмный тариф: цена за единицу ниже на восемь процентов, а условия доставки те же." },
  { speaker: "B", start: 24.9, end: 31.2, text: "Звучит хорошо. Пришлёте новый расчёт сегодня?" },
  { speaker: "A", start: 31.6, end: 38.8, text: "Пришлю до конца дня. Если всё устроит, договор обновим в понедельник." },
  { speaker: "B", start: 39.2, end: 42.0, text: "Договорились, спасибо." }
];

function wordsFrom(lines: Line[]): TranscriptionWordResponse[] {
  return lines.flatMap((line) => {
    const tokens = line.text.split(/\s+/).filter(Boolean);
    const slot = (line.end - line.start) / tokens.length;
    return tokens.map((text, index) => ({
      text,
      start_seconds: Number((line.start + slot * index).toFixed(2)),
      end_seconds: Number((line.start + slot * (index + 0.9)).toFixed(2)),
      confidence: 0.97,
      speaker: line.speaker
    }));
  });
}

function transcriptionFrom(callId: string, lines: Line[], createdAt: string): TranscriptionResponse {
  const segments: TranscriptionSegmentResponse[] = lines.map((line) => ({ speaker: line.speaker, start_seconds: line.start, end_seconds: line.end, text: line.text }));
  return {
    id: `${callId}-transcription`,
    call_uuid: callId,
    status: "transcribed",
    text: lines.map((line) => line.text).join(" "),
    segments,
    words: wordsFrom(lines),
    language: "ru",
    provider: "assemblyai",
    created_at: createdAt,
    updated_at: createdAt,
    revision: 1,
    edited: false,
    editable: true
  };
}

function speechFrom(lines: Line[], names: Record<"A" | "B", string>): CallSpeech {
  const total = lines.reduce((sum, line) => sum + (line.end - line.start), 0);
  const speakers = (["A", "B"] as const).map((key) => {
    const own = lines.filter((line) => line.speaker === key);
    const talkSeconds = own.reduce((sum, line) => sum + (line.end - line.start), 0);
    const words = own.reduce((sum, line) => sum + line.text.split(/\s+/).length, 0);
    return {
      speaker_key: key,
      display_name: names[key],
      is_subject: key === "A",
      talk_seconds: Number(talkSeconds.toFixed(1)),
      talk_share: Number((talkSeconds / total).toFixed(3)),
      words,
      words_per_minute: Math.round(words / (talkSeconds / 60)),
      longest_monologue_seconds: Number(Math.max(...own.map((line) => line.end - line.start)).toFixed(1)),
      questions: own.filter((line) => line.text.includes("?")).length,
      questions_per_hour: Math.round(own.filter((line) => line.text.includes("?")).length / (total / 3600)),
      response_pause_median_ms: 420
    };
  });
  return { speaker_switches_per_5min: Math.round((lines.length - 1) / (total / 300)), pauses_over_threshold: 0, longest_pause_seconds: 0.5, speakers };
}

function evidence(lines: Line[], index: number, from = 0, to?: number) {
  const line = lines[index];
  const words = line.text.split(/\s+/);
  const quote = words.slice(from, to ?? words.length).join(" ");
  const slot = (line.end - line.start) / words.length;
  return [{ quote, start_seconds: Number((line.start + slot * from).toFixed(2)), end_seconds: Number((line.start + slot * (to ?? words.length)).toFixed(2)), speaker: line.speaker, match_status: "matched" }];
}

function requirement(id: string, order: number, title: string, status: AnalysisV3Item["status"], score: number, explanation: string, extra: Partial<AnalysisV3Item> = {}): AnalysisV3Item {
  return {
    id, kind: "requirement", title, topic: title, order, asked: null, information_status: null, fulfilled_earlier: false, answer_summary: null,
    status, weight: 1, score, explanation, strengths: [], gaps: [], improvement_kind: "not_needed", improvement: null, evidence: [],
    instruction_sources: [INSTRUCTION_ID], instruction_titles: ["Стандарт продаж"], criterion_key: id, scorecard_uuid: "demo-scorecard-sales", is_critical: false,
    ...extra
  };
}

function question(id: string, order: number, title: string, answer: string, lines: Line[], lineIndex: number): AnalysisV3Item {
  return {
    id, kind: "question", title, topic: "Вопросы клиента", order, question_speaker: "B", asked: true, information_status: "complete", fulfilled_earlier: false,
    answer_summary: answer, status: "met", weight: 1, score: 100, explanation: "Ответ полный и по существу.", strengths: [], gaps: [],
    improvement_kind: "not_needed", improvement: null, evidence: evidence(lines, lineIndex), instruction_sources: [], instruction_titles: []
  };
}

function analysisFrom(callId: string, id: string, createdAt: string, result: Record<string, unknown>): AnalysisResponse {
  return { id, call_uuid: callId, status: "done", provider: "openrouter", model: "universal-staged-v5", result_json: result, result_text: null, error_message: null, created_at: createdAt, updated_at: createdAt };
}

function supplyAnalysis(createdAt: string) {
  const items: AnalysisV3Item[] = [
    requirement("greeting", 1, "Приветствие и представление", "met", 100, "Менеджер назвала компанию и своё имя и сразу спросила о цели звонка.", { evidence: evidence(supplyCall, 0, 0, 9), strengths: ["Представление по стандарту"] }),
    requirement("needs_discovery", 2, "Выявление потребности", "mostly_met", 80, "Уточнён главный приоритет клиента — сроки, но объём партии и бюджет не прозвучали.", {
      evidence: evidence(supplyCall, 2, 5),
      gaps: [{ text: "Не уточнён объём партии", basis: "instruction", explanation: "Стандарт требует зафиксировать объём до обсуждения цены.", affects_score: true }],
      improvement_kind: "advice", improvement: "Спросить объём и бюджет сразу после приоритета: «Сколько единиц планируете в первой партии?»"
    }),
    requirement("objection_handling", 3, "Работа с возражением по цене", "met", 92, "Возражение разобрано через комплектацию, предложено сравнение по пунктам.", { evidence: evidence(supplyCall, 6), strengths: ["Аргумент через ценность, а не скидку"] }),
    requirement("payment_terms", 4, "Условия оплаты", "met", 100, "Названы отсрочка для постоянных клиентов и предоплата для первой поставки.", { evidence: evidence(supplyCall, 8) }),
    requirement("next_step", 5, "Договорённость о следующем шаге", "mostly_met", 75, "Есть срок отправки КП и время созвона, но не назван ответственный за решение со стороны клиента.", {
      evidence: evidence(supplyCall, 12),
      gaps: [{ text: "Не зафиксировано, кто принимает решение", basis: "instruction", explanation: "Клиент упомянул согласование с руководством, менеджер не уточнила, с кем.", affects_score: true }],
      improvement_kind: "advice", improvement: "Уточнить: «С кем из руководства будете согласовывать, стоит ли пригласить их на созвон в четверг?»"
    }),
    question("q_deferral", 6, "Возможна ли отсрочка платежа?", "Отсрочка 14 дней для постоянных клиентов; на первую поставку предоплата 50%.", supplyCall, 8),
    question("q_integration", 7, "Есть ли интеграция с 1С?", "Интеграция есть, обмен документами настраивается за день после подписания договора.", supplyCall, 10)
  ];
  const recommendations: AnalysisV3Recommendation[] = [
    { id: "rec_volume", title: "Уточнять объём и бюджет в начале разговора", action: "После вопроса о приоритетах спросить объём первой партии и ориентир по бюджету.", reason: "Без объёма расчёт и сравнение с конкурентами остаются приблизительными.", expected_result: "КП сразу попадает в нужную комплектацию, меньше итераций.", item_ids: ["needs_discovery"], affects_score: true, importance: 3, impact: 0.8, repetition: 2, priority_score: 0.9, priority: "high" },
    { id: "rec_decider", title: "Фиксировать, кто принимает решение", action: "Спросить, с кем клиент согласует КП, и предложить пригласить этого человека на созвон.", reason: "Решение принимает руководство, которого не было на звонке.", expected_result: "Меньше риск затянуть согласование после отправки КП.", item_ids: ["next_step"], affects_score: true, importance: 2, impact: 0.6, repetition: 1, priority_score: 0.7, priority: "medium" },
    { id: "rec_compare", title: "Отправлять сравнение вместе с КП", action: "Приложить к КП таблицу сравнения комплектаций с конкурентами.", reason: "Клиент прямо попросил сравнение по пунктам.", expected_result: "Возражение по цене закрывается до следующего созвона.", item_ids: ["objection_handling"], affects_score: false, importance: 1, impact: 0.4, repetition: 1, priority_score: 0.4, priority: "low" }
  ];
  return analysisFrom(FEATURED_CALL_ID, ANALYSIS_ID, createdAt, {
    schema_version: 3,
    prompt_version: "universal-staged-v5",
    conversation_types: ["sales"],
    purpose: "Согласовать условия поставки и договориться о следующем шаге",
    summary: "Повторный звонок с клиентом «Альфа-Логистик» по поставке оборудования. Клиент назвал главным приоритетом сроки, поднял вопрос цены и отсрочки. Менеджер закрыла возражение по цене через комплектацию, объяснила условия оплаты и интеграцию с 1С. Договорились: КП по двум вариантам сегодня до 18:00 и созвон в четверг в 11:00.",
    outcome: "Клиент ждёт коммерческое предложение и готов обсудить его в четверг.",
    strengths: ["Чёткое представление и структура разговора", "Возражение по цене разобрано через ценность, а не скидку", "Конкретные сроки отправки КП и созвона"],
    work_on: ["Уточнять объём и бюджет до обсуждения цены", "Фиксировать, кто принимает решение у клиента"],
    coverage: { status: "complete", actual_question_count: 4, analyzed_actual_question_count: 4, required_question_count: 3, complete_without_separate_question: 1, limitations: [] },
    overall_score: 86,
    overall_score_label: "Хорошо",
    items,
    recommendations,
    priority_recommendation_ids: ["rec_volume", "rec_decider"],
    scorecard_mode: "fixed"
  });
}

function tariffAnalysis(createdAt: string) {
  const items: AnalysisV3Item[] = [
    requirement("greeting", 1, "Приветствие и представление", "met", 100, "Представление по стандарту, цель звонка названа сразу.", { evidence: evidence(tariffCall, 0) }),
    requirement("needs_discovery", 2, "Выявление потребности", "met", 90, "Клиент сам назвал новые объёмы, менеджер опёрлась на них в предложении.", { evidence: evidence(tariffCall, 1) }),
    requirement("next_step", 3, "Договорённость о следующем шаге", "mostly_met", 70, "Срок расчёта назван, дата обновления договора условная.", { evidence: evidence(tariffCall, 4) })
  ];
  return analysisFrom(SECOND_CALL_ID, `${SECOND_CALL_ID}-analysis`, createdAt, {
    schema_version: 3,
    prompt_version: "universal-staged-v5",
    conversation_types: ["sales"],
    purpose: "Пересчитать тарифы под новые объёмы",
    summary: "Короткий звонок по пересчёту тарифов: клиент увеличил квартальные объёмы, менеджер предложила объёмный тариф со скидкой 8% и пообещала расчёт до конца дня.",
    outcome: "Клиент ждёт новый расчёт сегодня.",
    strengths: ["Быстрое предложение под новые объёмы"],
    work_on: ["Назначать точную дату следующего шага"],
    coverage: { status: "complete", actual_question_count: 1, analyzed_actual_question_count: 1, required_question_count: 1, complete_without_separate_question: 0, limitations: [] },
    overall_score: 84,
    overall_score_label: "Хорошо",
    items,
    recommendations: [
      { id: "rec_date", title: "Назначать точную дату следующего шага", action: "Вместо «в понедельник» договориться о времени и способе подписания.", reason: "Условная дата растягивает сделку.", expected_result: "Договор обновляется без напоминаний.", item_ids: ["next_step"], affects_score: true, importance: 2, impact: 0.5, repetition: 1, priority_score: 0.6, priority: "medium" }
    ],
    priority_recommendation_ids: ["rec_date"],
    scorecard_mode: "fixed"
  });
}

function call(input: Pick<CallResponse, "id" | "title" | "status" | "duration_seconds"> & Partial<CallResponse> & { minutesAgo: number; uploader?: string }): CallResponse {
  const occurredAt = minutesAgo(input.minutesAgo);
  const { minutesAgo: _ignored, uploader, ...rest } = input;
  return {
    original_filename: `${rest.title.replace(/[«»:]/g, "").replace(/\s+/g, "-").toLowerCase()}.mp3`,
    mime_type: "audio/mpeg",
    size_bytes: Math.round(rest.duration_seconds * 16_000),
    media_kind: "audio",
    uploaded_by_user_uuid: uploader ?? anna.id,
    company_uuid: COMPANY_ID,
    department_uuid: DEPARTMENT_ID,
    visibility_scope: "department",
    is_favorite: false,
    occurred_at: occurredAt,
    display_time: occurredAt,
    time_source: "source",
    source_provider: null,
    has_analysis: rest.status === "analyzed",
    has_actions: false,
    access: { can_edit: true, can_manage_subjects: false, via: "uploader" },
    subjects: [{ user_uuid: uploader ?? anna.id, full_name: uploader === people.maria.id ? "Мария Волкова" : "Анна Смирнова", source: "uploader", is_primary: true, grants_access: true, speaker_key: "A", talk_share: null, match_signals: [] }],
    is_shared: false,
    is_internal: false,
    created_at: occurredAt,
    ...rest
  };
}

export function installEmployeeFixtures(): EmployeeFixture {
  const supplyDuration = 138;
  const tariffDuration = 43;
  const supplyMedia = URL.createObjectURL(buildConversationWav(supplyCall, supplyDuration));
  const tariffMedia = URL.createObjectURL(buildConversationWav(tariffCall, tariffDuration));
  const supplyNames = { A: "Анна Смирнова", B: "Дмитрий, «Альфа-Логистик»" } as const;
  const tariffNames = { A: "Анна Смирнова", B: "Клиент" } as const;

  const calls: CallResponse[] = [
    call({ id: FEATURED_CALL_ID, title: "Согласование условий поставки", status: "analyzed", duration_seconds: supplyDuration, minutesAgo: 95, media_url: supplyMedia, speech: speechFrom(supplyCall, supplyNames), has_actions: true }),
    call({ id: SECOND_CALL_ID, title: "Повторный звонок: расчёт по тарифам", status: "analyzed", duration_seconds: tariffDuration, minutesAgo: 160, media_url: tariffMedia, speech: speechFrom(tariffCall, tariffNames) }),
    call({ id: "demo-call-delivery-question", title: "Входящий: вопрос по доставке", status: "processing", duration_seconds: 206, minutesAgo: 25 }),
    call({ id: "demo-call-alpha-renewal", title: "Продление договора «Альфа-Логистик»", status: "analyzed", duration_seconds: 725, minutesAgo: 26 * 60, is_favorite: true }),
    call({ id: "demo-call-retail-first", title: "Первичный контакт: розница", status: "transcribed", duration_seconds: 288, minutesAgo: 29 * 60, uploader: people.maria.id }),
    call({ id: "demo-call-price-objection", title: "Возражение по цене", status: "analyzed", duration_seconds: 391, minutesAgo: 50 * 60, uploader: people.maria.id }),
    call({ id: "demo-call-site-lead", title: "Новый лид с сайта", status: "new", duration_seconds: 132, minutesAgo: 6 })
  ];
  const byId = new Map(calls.map((item) => [item.id, item]));
  const featured = byId.get(FEATURED_CALL_ID)!;
  const second = byId.get(SECOND_CALL_ID)!;

  const transcriptions: Record<string, TranscriptionResponse> = {
    [FEATURED_CALL_ID]: transcriptionFrom(FEATURED_CALL_ID, supplyCall, minutesAgo(90)),
    [SECOND_CALL_ID]: transcriptionFrom(SECOND_CALL_ID, tariffCall, minutesAgo(155))
  };
  const analyses: Record<string, AnalysisResponse> = {
    [FEATURED_CALL_ID]: supplyAnalysis(minutesAgo(86)),
    [SECOND_CALL_ID]: tariffAnalysis(minutesAgo(150))
  };

  const instruction: AnalysisInstruction = {
    id: INSTRUCTION_ID, scope: "department", company_uuid: COMPANY_ID, department_uuid: DEPARTMENT_ID, title: "Стандарт продаж", original_filename: "standart-prodazh.docx",
    download_url: "", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size_bytes: 48_211, content_sha256: "demo", sort_order: 1, is_active: true,
    created_by_user_uuid: people.igor.id, created_at: daysAgo(120), updated_at: daysAgo(30)
  };

  const folder: CallFolderResponse = {
    id: FOLDER_ID, scope: "department", user_uuid: null, company_uuid: COMPANY_ID, department_uuid: DEPARTMENT_ID, name: "Ключевые клиенты", description: "Сделки от 1 млн ₽",
    color: null, calls_count: 2, created_by_user_uuid: people.igor.id, created_at: daysAgo(100), updated_at: daysAgo(3), instructions: [instruction]
  };
  const folderCalls = [featured, byId.get("demo-call-alpha-renewal")!];

  const action: CallAction = {
    id: "demo-action-send-offer", company_uuid: COMPANY_ID, company_name: company.name, company_tag: company.tag, scope_type: "company", source_department_uuid: DEPARTMENT_ID, source_department_name: department.name,
    call_uuid: FEATURED_CALL_ID, analysis_uuid: ANALYSIS_ID, transcription_revision: 1, title: "Отправить КП по двум вариантам комплектации", description: "До 18:00, на почту Дмитрия. Приложить сравнение с конкурентами.",
    status: "open", assignment_state: "valid", assignee_user_uuid: anna.id, assignee_username: anna.username, due_at: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(), grace_expires_at: hoursAgo(-30),
    lock_version: 1, created_by_user_uuid: anna.id, created_at: minutesAgo(80), updated_at: minutesAgo(80), evidence: [{ id: "demo-evidence-1", kind: "word_range", position: 1, quote: "Подготовлю коммерческое предложение по двум вариантам комплектации и пришлю сегодня до 18:00", speaker: "A", start_seconds: 108.6, end_seconds: 116 }],
    capabilities: { can_start: true, can_complete: true, can_cancel: true, can_reschedule: true, can_reassign: false, can_request_transfer: false, can_resolve_transfer: false, can_edit_fields: true, can_revert_status: false },
    call_in_bin: false
  };

  const appliedInstruction: AppliedInstruction = {
    analysis_uuid: ANALYSIS_ID, call_uuid: FEATURED_CALL_ID, instruction_id: INSTRUCTION_ID, version_id: `${INSTRUCTION_ID}-v3`, version: 3, position: 1, title: "Стандарт продаж", scope: "department",
    selection_source: "department", content_sha256: "demo", original_filename: "standart-prodazh.docx", instruction_deleted: false, created_at: minutesAgo(86)
  };

  const speakerAssignments: Record<string, TranscriptionSpeakerAssignment[]> = {
    [FEATURED_CALL_ID]: [
      { speaker_key: "A", display_name: supplyNames.A, role: "manager", contact_user_uuid: anna.id },
      { speaker_key: "B", display_name: supplyNames.B, role: "client" }
    ],
    [SECOND_CALL_ID]: [
      { speaker_key: "A", display_name: tariffNames.A, role: "manager", contact_user_uuid: anna.id },
      { speaker_key: "B", display_name: tariffNames.B, role: "client" }
    ]
  };

  const reviewContext: AnalysisReviewContext = {
    capabilities: { can_claim: false, can_edit: false, can_publish: false, can_appeal: false, can_resolve_appeal: false, can_view_events: false, can_edit_analysis: false, can_dispute_analysis: true, can_resolve_dispute: false, can_comment_analysis: true },
    human_review_count: 0, human_review_limit: 2, next_review_requires_different_author: false, active_score_source: "ai", source_outdated: false, call_in_bin: false, comments: []
  };

  const usage: SubscriptionUsageResponse = {
    subscription, period_start: daysAgo(21), period_end: daysAgo(-9), used_minutes: 1840, limit_minutes: 6000, remaining_minutes: 4160, percent: 31,
    members_limit: 25, members_used: 12, departments_limit: 5, departments_used: 3, active_instructions_limit: 10, active_instructions_used: 4
  };

  const credits: CreditDashboardResponse = {
    allowance_credits: 12000, allowance_remaining: 7420, allowance_remaining_percent: 62, days_until_reset: 9, resets_at: daysAgo(-9), allowance_exhausted: false, wallet_credits: null,
    activity: Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.now() - (13 - index) * 24 * 60 * 60 * 1000);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const callsCount = weekend ? 2 : 9 + ((index * 7) % 6);
      return { date: date.toISOString().slice(0, 10), credits: callsCount * 38, transcription: callsCount * 14, analysis: callsCount * 24, calls: callsCount };
    }),
    wallet_entries: [], visible_to_members: true, can_manage_visibility: false, calls_awaiting_credits: 0, pending_credit_calls_limit: 20
  };

  const notifications: NotificationsResponse = {
    notifications: [
      { id: "demo-notification-analysis", type: "analysis_ready", title: "Анализ готов", body: "«Согласование условий поставки»: оценка 86 из 100.", entity_type: "call", entity_uuid: FEATURED_CALL_ID, read_at: null, created_at: minutesAgo(86) },
      { id: "demo-notification-action", type: "action_assigned", title: "Новое действие", body: "Отправить КП по двум вариантам комплектации — до 18:00.", entity_type: "action", entity_uuid: action.id, read_at: minutesAgo(70), created_at: minutesAgo(80) }
    ],
    unread_count: 1
  };

  const preferences: UserPreferencesResponse = { active_company_uuid: COMPANY_ID, theme: "system", date_range: {}, invitations_muted: false };

  const filterOptions: CallFilterOptionsResponse = {
    statuses: ["new", "processing", "transcribed", "analyzed"],
    scopes: ["department", "company"],
    managers: [anna, people.maria].map((person) => ({ id: person.id, full_name: person.full_name, full_surname: person.full_surname, username: person.username })),
    connections: []
  };

  const progress: CallProgress = { available: false, unavailable_reason: null, employee: null, counts: { fixed: 0, repeated: 0, new: 0, holding: 0, first_time: 0 }, criteria: [], growth_areas: [] };

  const assistant: AssistantCapabilities = { search_enabled: false, chat_enabled: false, aggregate_enabled: false, export_enabled: false, company_uuid: COMPANY_ID, role: "employee", department_uuids: [DEPARTMENT_ID], reason_code: "plan" };

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

  const listResponse = (items: CallResponse[]) => ({ items, total: items.length, limit: 50, offset: 0 });
  const stubs: Partial<typeof api> = {
    listCalls: async (filters) => listResponse(filters?.folder_uuid ? folderCalls : calls),
    getCall: async (callId) => byId.get(callId) ?? featured,
    createMediaAccessSession: async (_callId, variant) => ({ media_access_session_uuid: "demo-media-access", variant, expires_at: hoursAgo(-1) }),
    getTranscription: async (callId) => transcriptions[callId] ?? transcriptions[FEATURED_CALL_ID],
    getAnalysis: async (callId) => analyses[callId] ?? analyses[FEATURED_CALL_ID],
    listFavoriteCalls: async () => calls.filter((item) => item.is_favorite),
    getCallFilterOptions: async () => filterOptions,
    listCallFolders: async (input) => (input?.scope === "department" ? { items: [folder], total: 1, limit: 100, offset: 0 } : { items: [], total: 0, limit: 100, offset: 0 }),
    listInstructions: async () => [instruction],
    listAppliedInstructions: async (analysisId) => ({ items: analysisId === ANALYSIS_ID ? [appliedInstruction] : [] }),
    listActions: async (input) => ({ items: input?.call_uuid === FEATURED_CALL_ID ? [action] : [], total: input?.call_uuid === FEATURED_CALL_ID ? 1 : 0, limit: 50, offset: 0 }),
    getAnalysisReviewContext: async () => reviewContext,
    listTranscriptionSpeakerAssignments: async (callId) => speakerAssignments[callId] ?? [],
    listTranscriptionRevisions: async (callId) => ({ items: [{ id: `${callId}-revision-1`, call_uuid: callId, revision: 1, reason: "", changed_word_indexes: [], created_at: minutesAgo(90), is_current: true }], total: 1 }),
    listCallSubjectCandidates: async () => ({ items: [{ user_uuid: anna.id, full_name: "Анна Смирнова", username: anna.username }, { user_uuid: people.maria.id, full_name: "Мария Волкова", username: people.maria.username }] }),
    getCallProgress: async () => progress,
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
    session: { user: anna },
    companies: [company],
    departments: [department],
    departmentMembers,
    calls,
    transcriptions,
    analyses,
    companySubscriptions: { [COMPANY_ID]: subscription },
    initialCallId: second.id,
    featuredCallId: featured.id
  };
}
