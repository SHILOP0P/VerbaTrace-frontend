import type {
Plan,
PlanCode
} from "../../types";

export const planOrder: PlanCode[] = [
  "personal_start",
  "personal_plus",
  "personal_pro",
  "business_start",
  "business_plus",
  "business_pro"
];

export const analysisLevelLabels: Record<string, string> = {
  basic: "Базовый",
  plus: "Plus",
  pro: "Pro",
  priority: "Приоритетный"
};

export const planGradients: Record<PlanCode, string> = {
  personal_start: "linear-gradient(145deg, rgba(255, 107, 53, 0.26), rgba(245, 158, 11, 0.2) 48%, transparent 78%)",
  personal_plus: "linear-gradient(145deg, rgba(255, 122, 77, 0.27), rgba(255, 206, 128, 0.18) 50%, transparent 78%)",
  personal_pro: "linear-gradient(145deg, rgba(255, 107, 53, 0.25), rgba(139, 108, 255, 0.16) 54%, transparent 80%)",
  business_start: "linear-gradient(145deg, rgba(255, 138, 92, 0.24), rgba(74, 222, 128, 0.14) 52%, transparent 80%)",
  business_plus: "linear-gradient(145deg, rgba(245, 158, 11, 0.23), rgba(255, 122, 77, 0.18) 54%, transparent 80%)",
  business_pro: "linear-gradient(145deg, rgba(255, 90, 56, 0.28), rgba(255, 206, 128, 0.17) 54%, transparent 80%)"
};

export function comparePlans(left: Plan, right: Plan) {
  const leftIndex = planOrder.indexOf(left.code);
  const rightIndex = planOrder.indexOf(right.code);
  return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
    (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
}

export function formatMinutesLimit(value: number) {
  return `${value} минут`;
}

export function formatInstructionLimit(value: number) {
  return `${value}`;
}

export function formatHistoryDays(value: number) {
  return `${value} ${pluralizeRu(value, "день", "дня", "дней")}`;
}

// An empty limit is unlimited and a zero is a ban — the two look alike in the
// data and mean opposite things, so they are spelled out rather than printed.
export function formatPendingQueueLimit(value: number | null) {
  if (value === null) return "без ограничений";
  if (value === 0) return "не ставятся в очередь";
  return `${value} ${pluralizeRu(value, "звонок", "звонка", "звонков")}`;
}

export function formatNullableLimit(value: number | null) {
  return value === null ? "Не применяется" : String(value);
}

export function availabilityLabel(value: boolean) {
  return value ? "Доступно" : "Недоступно";
}

export function analysisLevelLabel(value: string) {
  return analysisLevelLabels[value] ?? (value || "Не указано");
}

export function pluralizeRu(value: number, one: string, few: string, many: string) {
  const lastTwo = Math.abs(value) % 100;
  const last = Math.abs(value) % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
