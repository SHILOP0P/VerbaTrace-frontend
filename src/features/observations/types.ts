import type { AnalyticsFilters } from "../../types";
export type ObservationInput = {
  title: string;
  kind: "criterion" | "description";
  description: string;
  criterion_key: string;
  quality: boolean;
  filters: {
    employee_uuid?: string;
    department_uuid?: string;
    folder_uuid?: string;
    folder_uuids?: string[];
    instruction_uuid?: string;
    include_internal: boolean;
    exclude_shared: boolean;
  };
  lock_version?: number;
  cost_confirmed?: boolean;
  preparation_maximum_credits?: number;
  replace_rule?: boolean;
  history_policy?: "retain" | "delete";
};
export type ObservationStats = {
  checked: number;
  matches: number;
  unclear: number;
  not_applicable: number;
  pending: number;
  skipped: number;
  errors: number;
  quality: number | null;
  average_score?: number | null;
  scored?: number;
  score_trend?: Array<{ date: string; score: number; calls: number }>;
  trend: Array<{ date: string; matches: number; checked: number }>;
};
export type Observation = ObservationInput & {
  id: string;
  owner_user_uuid: string;
  company_uuid: string | null;
  department_uuid: string | null;
  lock_version: number;
  interpretation: string;
  status: "draft" | "preparing" | "active" | "paused" | "error";
  rule_version: number;
  created_at: string;
  active_since: string | null;
  error_code: string | null;
  can_manage: boolean;
  stats: ObservationStats;
};
export type ObservationCase = {
  id: string;
  call_uuid: string;
  call_title: string;
  outcome: "match" | "no_match" | "not_applicable" | "unclear";
  explanation: string;
  evidence: string[];
  source_revision: number;
  false_positive: boolean;
  false_positive_by_user_uuid?: string | null;
  false_positive_author?: string | null;
  false_positive_at?: string | null;
  is_new?: boolean;
  trial: boolean;
  detected_at: string;
};
export type ObservationPlan = {
  id: string;
  calls: number;
  maximum_credits: number;
  expires_at: string;
  trial: boolean;
};
export type ObservationScope = AnalyticsFilters;
export type ObservationRuleVersion = {
  rule_version: number;
  title: string;
  kind: "criterion" | "description";
  description: string;
  criterion_key: string;
  quality: boolean;
  created_at: string;
};
export type ObservationReplacementSuggestion = {
  old_criterion_key: string;
  new_criterion_key: string;
  available_calls: number;
};
export type ObservationAlertPreferences = {
  mode: "off" | "inbox" | "inbox_toast";
  threshold: number | null;
  period: import("../overview/layout").WidgetPeriod | null;
  configure_rule: boolean;
  lock_version: number;
};
