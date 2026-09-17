export type AppPage =
  | "overview"
  | "calls"
  | "transcriptionEdit"
  | "transcriptionCompare"
  | "instructionHistory"
  | "instructionCompare"
  | "instruction"
  | "instructionCreate"
  | "qualityReviews"
  | "qualityReview"
  | "actions"
  | "action"
  | "notifications"
  | "companyCreate"
  | "analysis"
  | "reports"
  | "contacts"
  | "monitoring"
  | "settings"
  | "settingsTariffs"
  | "settingsIntegrations"
  | "settingsCompanies"
  | "settingsInstructions"
  | "settingsPrivacy"
  | "settingsInvitations"
  | "profile"
  | "profileEdit"
  | "profileDevices"
  | "admin"
  | "upload";
export type CallStatus =
  | "new"
  | "processing"
  // The budget ran out: the call is accepted and waits its turn in the queue.
  | "awaiting_credits"
  // Processing was stopped on purpose; the recording is still there.
  | "cancelled"
  | "transcribed"
  | "analyzed"
  | "failed";
export type VisibilityScope = "personal" | "company" | "department";
export type InstructionScope = "personal" | "company" | "department";
export type AnalysisPersonalizationScope =
  "personal" | "company" | "department";
export interface AnalysisPersonalization {
  scope: AnalysisPersonalizationScope;
  owner_uuid: string;
  content: string;
  updated_at?: string;
}
export type InvitationStatus =
  "pending" | "accepted" | "declined" | "canceled" | "expired";
export type CompanyRole = "employee" | "company_deputy" | "company_manager";
export type DepartmentRole = "employee" | "department_leader";
export type MembershipStatus = "active" | "left";
export type InvitationCompanyRole = CompanyRole;
export type InvitationDepartmentRole = DepartmentRole;
export type PlanType = "personal" | "business";
export type PlanCode =
  | "personal_start"
  | "personal_plus"
  | "personal_pro"
  | "business_start"
  | "business_plus"
  | "business_pro";
export type AnalysisLevel = "basic" | "plus" | "pro" | "priority";
export type SubscriptionStatus = "active" | "canceled" | "expired";
export type ReportFormat = "pdf" | "docx" | "md" | "xlsx";
export type ReportStatus = "pending" | "ready" | "failed";
export type CriteriaStatus =
  "met" | "partially_met" | "missed" | "not_applicable" | "not_evaluable" | "unclear";

export type PrivacyEntityType =
  | "person_name" | "phone_number" | "email_address" | "address"
  | "date_of_birth" | "passport_number" | "drivers_license"
  | "account_number" | "banking_information" | "credit_card_number"
  | "credit_card_cvv" | "credit_card_expiration" | "password"
  | "ip_address" | "username" | "medical_condition" | "money_amount" | "organization";

export interface PrivacyPolicyConfig {
  schema_version: 1;
  enabled: boolean;
  enforcement: "required";
  marker_contract: "ru-v1";
  entity_types: PrivacyEntityType[];
  original_media_access: "call_acl" | "uploader_and_scope_managers" | "uploader_only";
  sanitized_media: "off" | "on_demand";
  exports: "redacted_by_default" | "redacted_only";
  analysis_input: "redacted";
}

export interface PrivacyPolicyVersion {
  id: string;
  version: number;
  config: PrivacyPolicyConfig;
  publish_reason: string;
  published_at: string;
}

export interface PrivacyPolicyView {
  scope_type: "personal" | "company" | "department";
  scope_uuid: string;
  can_manage: boolean;
  marker_contract: "ru-v1";
  catalog: Array<{ entity_type: PrivacyEntityType; label: string; marker: string; default_enabled: boolean }>;
  active_version: PrivacyPolicyVersion | null;
  draft: { config: PrivacyPolicyConfig; lock_version: number; updated_at: string } | null;
  inherited_from: {
    scope_type: "company";
    scope_uuid: string;
    active_version: PrivacyPolicyVersion;
  } | null;
}

export type PrivacyPolicyScope =
  | { type: "personal" }
  | { type: "company"; companyId: string }
  | { type: "department"; companyId: string; departmentId: string };

export interface CallPrivacy {
  status: "legacy_unprotected" | "not_requested" | "queued" | "processing" | "ready" | "failed" | string;
  protected: boolean;
  marker_contract: string;
  policy_version?: number | null;
  policy_source_label: string;
  detected_spans: number;
  recommended_media_variant: "original" | "redacted";
  sanitized_media_status: "not_requested" | "pending" | "processing" | "ready" | "failed" | string;
  capabilities: {
    can_read_original_media: boolean;
    can_request_sanitized_media: boolean;
    can_review_redactions: boolean;
  };
}

export interface RedactedMediaVariant {
  id: string;
  status: "not_requested" | "pending" | "processing" | "ready" | "failed" | string;
  variant: "redacted_audio" | "redacted_video";
  mime_type?: string;
  size_bytes?: number;
  file_name?: string;
  video_stream_copied?: boolean | null;
  last_error_code?: string | null;
  updated_at: string;
}

export interface PrivacyCorrectionRequest {
  schema_version: 1;
  operation: "add_mask";
  expected_revision: number;
  reason: string;
  word_start_index?: number;
  word_end_index?: number;
  span_uuid?: string;
  entity_type?: PrivacyEntityType;
  replacement_text?: string;
  remove_confirmed?: boolean;
}

export interface PrivacyCorrectionPreview {
  operation: PrivacyCorrectionRequest["operation"];
  current_revision: number;
  before: string;
  after: string;
  entity_label: string;
  marker: string;
  requires_confirmation: boolean;
  reanalysis_required: boolean;
}
export type BusinessOutcomeStatus =
  | "success"
  | "follow_up_needed"
  | "no_decision"
  | "lost"
  | "support_resolved"
  | "not_call"
  | "unclear";
export type LostReason =
  | "price"
  | "timing"
  | "no_need"
  | "competitor"
  | "no_next_step"
  | "unclear_value"
  | "bad_fit"
  | "not_applicable"
  | "unclear";
export type SignalLevel = "high" | "medium" | "low" | "unclear";
export type AnalysisConfidence = "low" | "medium" | "high";
export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  full_surname: string;
  username: string;
  role: string;
  headline?: string | null;
  phone?: string | null;
  timezone?: string | null;
  avatar_url?: string | null;
  created_at: string;
}

export interface AuthResponse {
  user: UserResponse;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  full_surname: string;
  username?: string;
  headline?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdatePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UpdatePasswordResponse {
  updated_at: string;
}

export interface UserSessionResponse {
  id: string;
  current: boolean;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface UserSessionsResponse {
  sessions: UserSessionResponse[];
  can_manage_other_sessions?: boolean;
  available_at?: string | null;
  retry_after_seconds?: number;
}

export interface AdminCapabilitiesResponse {
  role: "helper" | "admin" | "superadmin";
  permissions: string[];
}

export interface UpdateAdminUserProfileRequest {
  full_name?: string;
  full_surname?: string;
  username?: string;
  headline?: string;
  reason: string;
}

export interface AdminUsersResponse {
  items: UserResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminCompaniesResponse {
  items: CompanyResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminSubscriptionResponse {
  id: string;
  plan_code: PlanCode;
  type: PlanType;
  status: "active" | "canceled" | "expired";
  user_uuid: string | null;
  company_uuid: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A company as the admin panel sees it. */
export interface AdminCompanyResponse {
  id: string;
  name: string;
  tag: string;
  manager_user_uuid: string;
  created_at: string;
}

/** Where a company stands after the superadmin's rescue: frozen, and rescued. */
export interface AdminCompanyLifecycleResponse {
  company_uuid: string;
  state: string;
  freeze_reason: string;
  restore_used: boolean;
}

export interface UpdateProfileRequest {
  full_name?: string;
  full_surname?: string;
  headline?: string | null;
  phone?: string | null;
  timezone?: string | null;
}

export interface AvatarResponse {
  avatar_url: string;
  updated_at: string;
}

export interface PreferencesDateRange {
  from?: string | null;
  to?: string | null;
}

export interface UserPreferencesResponse {
  active_company_uuid: string | null;
  theme: "system" | "light" | "dark";
  date_range: PreferencesDateRange;
  invitations_muted?: boolean;
}

export interface UpdatePreferencesRequest {
  active_company_uuid?: string | null;
  theme?: "system" | "light" | "dark";
  invitations_muted?: boolean;
  date_range?: PreferencesDateRange;
}

export interface CallResponse {
  transcription_only?: boolean;
  id: string;
  title: string;
  status: CallStatus;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number;
  audio_url?: string | null;
  audio_download_url?: string | null;
  file_url?: string | null;
  media_url?: string | null;
  media_kind?: "audio" | "video" | null;
  recording_url?: string | null;
  download_url?: string | null;
  uploaded_by_user_uuid?: string | null;
  company_uuid?: string | null;
  department_uuid?: string | null;
  visibility_scope: VisibilityScope;
  use_custom_instructions?: boolean;
  is_test?: boolean;
  speaker_hints?: Array<{
    user_id: string;
    name: string;
    username?: string;
    role: "self" | "manager" | "client" | "other";
    note?: string;
  }>;
  diarization_roles?: Array<{ name: string; description?: string }>;
  is_favorite?: boolean;
  occurred_at?: string | null;
  display_time?: string;
  time_source?: "source" | "upload_fallback";
  source_provider?: "generic_api" | "bitrix24" | null;
  connection_uuid?: string | null;
  external_call_id?: string | null;
  imported_at?: string | null;
  ingest_error_code?: string | null;
  has_analysis?: boolean;
  has_actions?: boolean;
  created_at: string;
  privacy?: CallPrivacy;
}

export interface CallsListResponse {
  items: CallResponse[];
  total: number;
  limit: number;
  offset: number;
  next_cursor?: string;
}

export interface DeletedCallResponse {
  call: CallResponse;
  deleted_at: string;
  purge_after: string;
  deleted_by_user_uuid?: string;
}

export interface DeletedCallsListResponse {
  items: DeletedCallResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface CallFilterOptionsResponse {
  statuses: string[];
  scopes: string[];
  managers: Array<{
    id: string;
    full_name: string;
    full_surname: string;
    username: string;
  }>;
  connections: Array<{
    id: string;
    name: string;
    provider: string;
  }>;
}

export interface CallStatusEvent {
  call_id: string;
  status: CallStatus;
  terminal: boolean;
  timestamp: string;
}

export interface TranscriptionResponse {
  id: string;
  call_uuid: string;
  status: "processing" | "transcribed" | "failed" | string;
  text?: string | null;
  segments?: TranscriptionSegmentResponse[];
  words: TranscriptionWordResponse[];
  language?: string | null;
  provider: string;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  revision?: number;
  edited?: boolean;
  editable?: boolean;
  editability_reason?: string;
  redaction?: {
    status: string;
    marker_contract: string;
    spans_count: number;
    entity_counts: Array<{ entity_type: PrivacyEntityType; label: string; marker: string; count: number }>;
  };
}

export interface TranscriptionWordEdit {
  word_index: number;
  text?: string;
  speaker?: string;
}

export type TranscriptionSpeakerRole =
  "unknown" | "client" | "manager" | "operator" | "partner" | "other";

export interface TranscriptionSpeakerAssignment {
  speaker_key: string;
  display_name: string;
  role: TranscriptionSpeakerRole;
  custom_role?: string;
  contact_user_uuid?: string;
}

export interface UpdateTranscriptionRequest {
  expected_revision: number;
  reason: string;
  edits: TranscriptionWordEdit[];
}

export interface TranscriptionUpdateResponse {
  transcription: TranscriptionResponse;
  revision: number;
  reason: string;
  changed_word_indexes: number[];
}

export interface TranscriptionRevisionSummary {
  id: string;
  call_uuid: string;
  revision: number;
  reason: string;
  changed_word_indexes: number[];
  created_at: string;
  is_current: boolean;
}

export interface TranscriptionRevisionListResponse {
  items: TranscriptionRevisionSummary[];
  total: number;
}

export interface TranscriptionRevisionContent {
  revision: number;
  is_current: boolean;
  text: string;
  segments: TranscriptionSegmentResponse[];
  words: TranscriptionWordResponse[];
}

export interface TranscriptionWordResponse {
  text: string;
  start_seconds: number;
  end_seconds: number;
  confidence?: number | null;
  speaker?: string;
  redaction?: {
    span_uuid: string;
    entity_type: PrivacyEntityType;
    label: string;
    marker: string;
  } | null;
}

export type AnalysisEvidenceMatchStatus =
  "matched" | "ambiguous" | "not_found" | "legacy";

export interface AnalysisEvidence {
  quote: string;
  start_seconds?: number;
  end_seconds?: number;
  word_start_index?: number;
  word_end_index?: number;
  speaker?: string;
  match_status: AnalysisEvidenceMatchStatus | string;
}

export interface MediaSeekTarget {
  startSeconds: number;
  endSeconds?: number;
  wordStartIndex?: number;
  wordEndIndex?: number;
}

export interface TranscriptionSegmentResponse {
  speaker: string;
  start_seconds?: number | null;
  end_seconds?: number | null;
  text: string;
}

export interface AnalysisResponse {
  id: string;
  call_uuid: string;
  status: "pending" | "processing" | "done" | "failed" | "stale" | string;
  provider: string;
  model?: string | null;
  result_json: Record<string, unknown> | unknown[] | string | null;
  result_text?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppliedInstruction {
  analysis_uuid: string;
  call_uuid: string;
  instruction_id: string;
  version_id: string;
  version: number;
  position: number;
  title: string;
  scope: InstructionScope;
  selection_source:
    "explicit" | "personal" | "company" | "department" | "folder";
  content_sha256: string;
  content?: string;
  original_filename?: string;
  instruction_deleted: boolean;
  created_at: string;
}

export interface AnalysisV2Question {
  question: string;
  manager_answer: string;
  answer_status:
    "answered" | "partially_answered" | "not_answered" | "unclear" | string;
  evidence_quotes: string[];
  evidence: AnalysisEvidence[];
}

export interface AnalysisV2CriteriaResult {
  code:
    | "greeting"
    | "needs_discovery"
    | "question_quality"
    | "answer_quality"
    | "solution_relevance"
    | "objection_handling"
    | "pricing_clarity"
    | "tone_professionalism"
    | "next_step_quality"
    | "outcome_clarity"
    | "custom_instruction_match"
    | string;
  title: string;
  topic: string;
  status: CriteriaStatus | string;
  points_awarded: number;
  points_max: number;
  score: number;
  quote: string;
  evidence_quotes: string[];
  evidence: AnalysisEvidence[];
  issue: string;
  explanation: string;
  recommendation: string;
  effective_source?: "ai" | "human_review_1" | "human_review_2" | string;
}

export interface AnalysisV2Result {
  schema_version: 2;
  summary: string;
  topics: string[];
  dialogue_tone: {
    overall: string;
    manager: string;
    client: string;
    evidence_quotes: string[];
    evidence: AnalysisEvidence[];
  };
  client_questions: AnalysisV2Question[];
  question_coverage: {
    status:
      | "answered"
      | "partially_answered"
      | "not_answered"
      | "no_questions"
      | "unclear"
      | string;
    summary: string;
    unanswered_questions: string[];
  };
  manager_quality: {
    strengths: string[];
    issues: string[];
    recommendations: string[];
  };
  call_outcome: string;
  score: number;
  score_scale: number;
  score_breakdown: {
    points_awarded: number;
    points_possible: number;
    applicable_criteria_count: number;
    total_criteria_count: number;
  };
  criteria_results: AnalysisV2CriteriaResult[];
  customer_objections: string[];
  risks: string[];
  next_steps: string[];
  next_step: string;
  next_step_quality: {
    has_next_step: boolean | null;
    specific: boolean | null;
    has_deadline: boolean | null;
    has_responsible_person: boolean | null;
  };
  business_outcome: {
    status: BusinessOutcomeStatus | string;
    summary: string;
    lost_reason: LostReason | string;
  };
  customer_signals: {
    intent: SignalLevel | string;
    urgency: SignalLevel | string;
    budget_discussed: boolean | null;
    decision_maker_present: boolean | null;
  };
  issue_codes: string[];
  evidence_quotes: string[];
  evidence: AnalysisEvidence[];
  confidence: AnalysisConfidence | string;
}

export interface CreateReportRequest {
  content?: "full" | "transcription";
  transcription_revision?: number;
  format: ReportFormat;
  privacy_variant?: "redacted";
}

export interface CreateGlobalReportRequest {
  format: ReportFormat;
  scope: "call" | "company" | "department" | "manager" | "period";
  call_uuid?: string | null;
  company_uuid?: string | null;
  department_uuid?: string | null;
  manager_user_uuid?: string | null;
  period_from?: string | null;
  period_to?: string | null;
}

export interface ReportResponse {
  content?: "full" | "transcription";
  transcription_revision?: number;
  id: string;
  call_uuid: string;
  analysis_uuid: string | null;
  requested_by_user_uuid: string;
  format: ReportFormat;
  status: ReportStatus;
  file_name: string;
  content_type: string;
  size_bytes: number;
  error_message: string | null;
  download_url: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface ReportsResponse {
  reports: ReportResponse[];
}

export interface ReportCallSummaryResponse {
  id: string;
  title: string;
  status: string;
  created_at: string;
  company_uuid: string | null;
  department_uuid: string | null;
}

export type ReportWithCallResponse = ReportResponse & {
  call: ReportCallSummaryResponse;
};

export interface GlobalReportsResponse {
  reports: ReportWithCallResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface CompanyResponse {
  id: string;
  name: string;
  tag?: string;
  manager_user_uuid: string;
  member_limit: number;
  created_at: string;
}

export interface DepartmentResponse {
  id: string;
  company_uuid: string;
  name: string;
  created_at: string;
}

export interface DepartmentMemberResponse {
  department_uuid: string;
  user_uuid: string;
  full_name?: string;
  full_surname?: string;
  username?: string;
  job_title: string | null;
  role: DepartmentRole;
  status: MembershipStatus;
  created_at: string;
}

export interface Invitation {
  id: string;
  company_uuid: string;
  department_uuid: string | null;
  invited_user_uuid: string;
  invited_by_user_uuid: string;
  company_role: CompanyRole;
  department_role: DepartmentRole | null;
  status: InvitationStatus;
  approval_status?: "not_required" | "pending" | "approved" | "rejected";
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentTransferRequest {
  id: string;
  company_uuid: string;
  user_uuid: string;
  from_department_uuid: string | null;
  to_department_uuid: string;
  requested_by_user_uuid: string;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | "canceled" | "expired";
  decided_by_user_uuid?: string | null;
  decision_comment?: string | null;
  created_at: string;
  expires_at: string;
}

export interface CompanyOwnershipTransfer {
  id: string;
  /** "company" hands over one company, "all" every company under the plan. */
  scope: "company" | "all";
  /** Set only for a single-company transfer. */
  company_uuid: string | null;
  /** What the offer actually covers. */
  company_uuids: string[];
  /** The companies the previous owner stays in as an ordinary member. */
  stay_company_uuids: string[];
  from_user_uuid: string;
  to_user_uuid: string;
  status: "pending" | "accepted" | "declined" | "canceled" | "expired";
  reason?: string | null;
  created_at: string;
  expires_at: string;
}

/** A record of calls and folders moved between two companies of one owner. */
export interface CompanyDataTransfer {
  id: string;
  source_company_uuid: string;
  target_company_uuid: string;
  calls: number;
  folders: number;
  reason?: string;
  created_at: string;
}

export interface AnalysisInstruction {
  id: string;
  scope: InstructionScope;
  user_uuid?: string | null;
  company_uuid?: string | null;
  department_uuid?: string | null;
  title: string;
  original_filename: string;
  download_url: string;
  mime_type: string;
  size_bytes: number;
  content_sha256: string;
  sort_order: number;
  is_active: boolean;
  created_by_user_uuid: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisInstructionVersion {
  id: string;
  instruction_id: string;
  version: number;
  title: string;
  scope: InstructionScope;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: "draft" | "published" | "retired" | string;
  created_by_user_uuid: string;
  created_at: string;
  published_at: string;
}

export interface SubscriptionUsageResponse {
  subscription: Subscription;
  period_start: string;
  period_end: string;
  used_minutes: number;
  limit_minutes: number;
  remaining_minutes: number;
  percent: number;
  members_limit?: number;
  members_used?: number;
  departments_limit?: number;
  departments_used?: number;
  active_instructions_limit?: number;
  active_instructions_used?: number;
}

export interface CreditActivityDay {
  date: string;
  credits: number;
  transcription: number;
  analysis: number;
  calls: number;
}

export interface CreditWalletEntry {
  transaction_uuid: string;
  type: string;
  credits: number;
  reason: string;
  created_at: string;
}

export interface CreditDashboardResponse {
	allowance_credits: number;
	allowance_remaining: number;
  allowance_remaining_percent: number;
  days_until_reset: number;
  resets_at: string;
  allowance_exhausted: boolean;
  wallet_credits: number | null;
  activity: CreditActivityDay[];
  wallet_entries: CreditWalletEntry[];
  visible_to_members?: boolean;
  can_manage_visibility?: boolean;
  // How many calls are parked because the limit ran out, and how many more the
  // plan lets wait. A null limit means the queue has no cap.
  calls_awaiting_credits?: number;
  pending_credit_calls_limit?: number | null;
}

export interface DeveloperApplication {
  application_uuid: string;
  owner_type: "user" | "company";
  owner_uuid: string;
  name: string;
  environment: "sandbox" | "production";
  status: "active" | "disabled" | "revoked";
  capabilities: string[];
  daily_credit_limit: number | null;
  monthly_credit_limit: number | null;
  max_credits_per_operation: number | null;
  lock_version: number;
  created_at: string;
  updated_at: string;
}

export interface SandboxWalletDashboard {
  application_uuid: string;
  application_name: string;
  environment: "sandbox";
  balance_credits: number;
  entries: CreditWalletEntry[];
}

export interface CreatedIntegrationKey {
  key_uuid: string;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at: string | null;
  created_at: string;
  permanent_credit_limit?: number | null;
  temporary_credit_limit?: number | null;
  temporary_limit_starts_at?: string | null;
  temporary_limit_ends_at?: string | null;
  secret: string;
  secret_visible_once: true;
}

export interface IntegrationAPIKey {
  key_uuid: string;
  service_account_uuid: string;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  permanent_credit_limit?: number | null;
  temporary_credit_limit?: number | null;
  temporary_limit_starts_at?: string | null;
  temporary_limit_ends_at?: string | null;
}

export interface IntegrationConnection {
  connection_uuid: string;
  application_uuid: string;
  company_uuid: string | null;
  department_uuid: string | null;
  folder_uuid: string | null;
  name: string;
  provider: "generic_api" | "bitrix24" | "amocrm" | "telephony";
	status: "draft" | "authorizing" | "testing" | "active" | "degraded" | "paused" | "disabled" | "reconnect_required" | "revoked";
	disable_policy: "continue" | "pause" | "cancel";
	allow_folder_override: boolean;
  settings: {
    schema_version: number;
    inherit_scope_instructions?: boolean;
    [key: string]: unknown;
  };
  settings_version: number;
  lock_version: number;
  last_event_at: string | null;
  last_success_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface BitrixConnectionHealth {
  connection_uuid: string;
  status: IntegrationConnection["status"];
  portal_domain: string;
  calls_readable: boolean;
  tasks_writable: boolean;
  users_readable: boolean;
  reconnect_required: boolean;
  oauth_configured: boolean;
  connector_verified: boolean;
  last_success_at?: string | null;
  last_error_code?: string | null;
}

export interface BitrixExternalUser {
  external_user_id: string;
  display_name: string;
  active: boolean;
  mapping_uuid?: string | null;
  internal_user_uuid?: string | null;
  department_uuid?: string | null;
  mapping_status: "unmapped" | "mapped" | "conflict" | "inactive" | "ignored";
  lock_version: number;
}

export interface BitrixMappingChange {
  external_user_id: string;
  internal_user_uuid?: string | null;
  department_uuid?: string | null;
  status: "mapped" | "ignored" | "unmapped";
  expected_lock_version: number;
}

export interface BitrixMappingDiff {
  external_user_id: string;
  display_name: string;
  before_internal_user_uuid?: string | null;
  before_department_uuid?: string | null;
  before_status: string;
  after_internal_user_uuid?: string | null;
  after_department_uuid?: string | null;
  after_status: string;
  lock_version: number;
  changed: boolean;
}

export interface BitrixMappingPreview {
  connection_uuid: string;
  preview_hash: string;
  changes_count: number;
  items: BitrixMappingDiff[];
}

export interface BitrixMappingBulkResult {
  command_uuid: string;
  connection_uuid: string;
  preview_hash: string;
  changes_count: number;
  mappings: BitrixExternalUser[];
  created: boolean;
}

export interface BitrixBackfillPreview {
  connection_uuid: string;
  range_from: string;
  range_to: string;
  estimated_calls: number;
}

export interface BitrixBackfill {
  backfill_uuid: string;
  connection_uuid: string;
  requested_by_user_uuid: string;
  range_from: string;
  range_to: string;
  status: "pending" | "running" | "paused" | "completed" | "cancelled" | "failed";
  estimated_calls?: number | null;
  discovered_calls: number;
  imported_calls: number;
  pending_calls: number;
  skipped_calls: number;
  error_calls: number;
  lock_version: number;
  created_at: string;
  updated_at: string;
  finished_at?: string | null;
}

export interface ActionExternalSync {
  sync_uuid: string;
  action_uuid: string;
  connection_uuid: string;
  provider: "bitrix24";
  requester_user_uuid: string;
  approver_user_uuid?: string | null;
  state: "pending_approval" | "rejected" | "queued" | "sending" | "reconciling" | "needs_review" | "synced" | "failed" | "cancelled" | "unlinked";
  external_task_id?: string | null;
	external_task_url?: string | null;
	last_error_code?: string | null;
	external_snapshot?: {
		id?: string;
		title?: string;
		description?: string;
		responsible_id?: string;
		deadline?: string | null;
		status?: string;
		link?: string;
		changed_at?: string | null;
	} | null;
	review_state?: "needs_review" | null;
	review_reason?: string | null;
	last_checked_at?: string | null;
	can_approve: boolean;
	can_reject: boolean;
	can_resolve: boolean;
  lock_version: number;
  created_at: string;
  updated_at: string;
}

export interface ActionExternalSyncPreview {
	action_uuid: string;
	title: string;
	due_at: string;
	assignee_user_uuid: string;
	options: Array<{
		connection_uuid: string;
		connection_name: string;
		portal_domain: string;
		external_assignee_id?: string | null;
		available: boolean;
		unavailable_reason?: "assignee_not_mapped" | string;
	}>;
}

export interface SupportAccessRequest {
	request_uuid: string;
	requested_by_user_uuid: string;
	approver_user_uuid: string;
	subject_type: "user" | "company";
	subject_user_uuid?: string | null;
	subject_company_uuid?: string | null;
	reason: string;
	requested_resources: string[];
	requested_commands: string[];
	requested_duration_minutes: number;
	status: "pending" | "approved" | "denied" | "expired" | "cancelled";
	decision_comment?: string | null;
	lock_version: number;
	created_at: string;
	expires_at: string;
	decided_at?: string | null;
}

export interface SupportAccessGrant {
	grant_uuid: string;
	request_uuid: string;
	grantee_user_uuid: string;
	granted_by_user_uuid: string;
	subject_type: "user" | "company";
	resource_allowlist: string[];
	command_allowlist: string[];
	valid_from: string;
	expires_at: string;
	revoked_at?: string | null;
}

export interface IntegrationServiceAccount {
  service_account_uuid: string;
  application_uuid: string;
  connection_uuid: string;
  created_by_user_uuid: string;
  name: string;
  status: string;
  scopes: string[];
  created_at: string;
  last_used_at?: string | null;
}

export interface IntegrationWebhook {
  webhook_endpoint_uuid: string;
  application_uuid: string;
  connection_uuid: string | null;
  name: string;
  status: string;
  event_types: string[];
  lock_version: number;
  created_at: string;
  updated_at: string;
}

export interface IntegrationWebhookDelivery {
  delivery_uuid: string;
  outbox_uuid: string;
  webhook_endpoint_uuid: string;
  attempt: number;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  response_size_bytes: number | null;
  error_code: string | null;
  created_at: string;
}

export interface IntegrationIngestItem {
  ingest_item_uuid: string;
  connection_uuid: string;
  external_call_id: string;
  source_kind: "url" | "upload";
  title: string;
  status: string;
  stage: string;
  attempts: number;
  max_attempts: number;
  call_uuid: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
	destination_scope?: "personal" | "company" | "department";
	destination_folder_uuid?: string | null;
	placement_source?: "connection_default" | "request_override" | "system_external";
}

export interface IntegrationAuditEvent {
  audit_event_uuid: string;
  event_type: string;
  entity_type: string;
  entity_uuid: string;
  actor_type: string;
  actor_uuid: string | null;
  metadata: Record<string, unknown> | null;
  request_id?: string | null;
  created_at: string;
}

export interface AnalyticsOverviewResponse {
  calls_total: number;
  calls_created_today: number;
  calls_new: number;
  calls_processing: number;
  calls_transcribed: number;
  calls_with_transcription: number;
  calls_analyzed: number;
  calls_failed: number;
  average_duration_seconds: number | null;
  average_quality_score: number | null;
  quality_score_scale: number;
  average_score?: number | null;
  score_scale?: number;
  score_distribution?: {
    critical: number;
    weak: number;
    normal: number;
    good: number;
    excellent: number;
  };
  criteria_summary?: Array<{
    code: string;
    title: string;
    average_score: number | null;
    met: number;
    partially_met: number;
    missed: number;
    unclear: number;
    not_applicable: number;
    calls_count: number;
  }>;
  top_weak_criteria?: Array<{
    code: string;
    title: string;
    average_score: number | null;
    missed_count: number;
    partially_met_count: number;
  }>;
  top_issue_codes?: Array<{ code: string; count: number }>;
  business_outcomes?: Array<{ status: string; count: number }>;
  next_step_summary?: {
    with_next_step: number;
    specific: number;
    with_deadline: number;
    with_responsible_person: number;
    missing: number;
  };
  top_topics: Array<{ title: string; count: number }>;
  risks_count: number | null;
  recommendations_count: number | null;
  charts: {
    calls_by_day: Array<{ date: string; count: number }>;
    analyzed_by_day: Array<{ date: string; count: number }>;
    quality_by_day: Array<{ date: string; average_quality_score: number }>;
    score_by_day?: Array<{ date: string; average_score: number }>;
    duration_by_day: Array<{ date: string; average_duration_seconds: number }>;
    risks_by_day: Array<{ date: string; count: number }>;
  };
}

export interface CallFolderResponse {
  id: string;
  scope: VisibilityScope | string;
  user_uuid: string | null;
  company_uuid: string | null;
  department_uuid: string | null;
  name: string;
  description: string | null;
  color: string | null;
  calls_count: number;
  created_by_user_uuid: string;
  created_at: string;
  updated_at: string;
  instructions: AnalysisInstruction[];
}

export interface CallFoldersListResponse {
  items: CallFolderResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateCallFolderRequest {
  scope: VisibilityScope;
  company_uuid?: string | null;
  department_uuid?: string | null;
  name: string;
  description?: string | null;
  color?: string | null;
  instruction_uuids?: string[];
}

export interface UpdateCallFolderRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  instruction_uuids?: string[];
}

export interface AssignCallToFolderRequest {
  call_uuid: string;
}

export type AnalysisRerunRequestStatus =
  "pending" | "approved" | "rejected" | "canceled";

export interface AnalysisRerunRequest {
  id: string;
  call_uuid: string;
  company_uuid: string;
  department_uuid?: string;
  requested_by_user_uuid: string;
  reason?: string;
  status: AnalysisRerunRequestStatus;
  decided_by_user_uuid?: string;
  decided_at?: string;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export interface CreditSpending {
  id: string;
  name: string;
  limit_credits: number | null;
  used_credits: number;
  forecast_credits: number;
  period_start: string;
  period_end: string;
}

export interface CompanyCreditForecast {
  company?: CreditSpending;
  departments: CreditSpending[];
}

export type CompanyLifecycleState = "active" | "frozen" | "soft_deleted";

export interface CompanyLifecycle {
  company_uuid: string;
  state: CompanyLifecycleState;
  // Why the company stopped: a downgrade is switched back on, a deletion has to
  // be called off first.
  freeze_reason?: "downgrade" | "deletion" | null;
  frozen_at?: string;
  soft_deleted_at?: string;
  purge_after?: string;
  restore_used: boolean;
}

export interface ProcessingMonitoringResponse {
  queue: {
    pending: number;
    running: number;
    done: number;
    failed: number;
    retry: number;
  };
  average_processing_seconds: number | null;
}

export interface CompanyMemberDepartmentResponse {
  department_uuid: string;
  department_name: string;
  role: string;
  status: string;
}

export interface CompanyMemberListItemResponse {
  user_uuid: string;
  email: string;
  username: string;
  full_name: string;
  full_surname: string;
  job_title: string | null;
  company_role: string;
  status: string;
  departments: CompanyMemberDepartmentResponse[];
  created_at: string;
}

export interface CompanyMembersResponse {
  members: CompanyMemberListItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResponse {
  calls: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
  }>;
  companies: Array<{ id: string; name: string }>;
  reports: Array<{
    id: string;
    call_uuid: string;
    file_name: string;
    status: string;
  }>;
  instructions: Array<{ id: string; title: string; scope: string }>;
}

export interface NotificationResponse {
  id: string;
  type:
    | "invitation"
    | "report_ready"
    | "subscription"
    | "processing_failed"
    | string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_uuid: string | null;
  read_at: string | null;
  created_at: string;
}

export type CallActionStatus =
  "open" | "in_progress" | "completed" | "cancelled" | "overdue";
export interface CallActionEvidence {
  id: string;
  kind: "word_range" | "legacy_text";
  position: number;
  word_start_index?: number;
  word_end_index?: number;
  quote: string;
  speaker?: string;
  start_seconds?: number;
  end_seconds?: number;
}
export interface CallActionCapabilities {
  can_start: boolean;
  can_complete: boolean;
  can_cancel: boolean;
  can_reschedule: boolean;
  can_reassign: boolean;
  can_request_transfer: boolean;
  can_resolve_transfer: boolean;
  can_edit_fields: boolean;
  can_revert_status: boolean;
}
export interface CallAction {
  id: string;
  company_uuid?: string;
  company_name?: string;
  company_tag?: string;
  scope_type?: "company" | "personal";
  scope_tag?: string;
  source_department_uuid?: string;
  source_department_name?: string;
  target_department_uuid?: string;
  target_department_name?: string;
  call_uuid: string;
  analysis_uuid: string;
  transcription_revision: number;
  title: string;
  description: string;
  status: CallActionStatus;
  assignment_state: "valid" | "invalid";
  assignee_user_uuid: string;
  assignee_username: string;
  due_at: string;
  grace_expires_at: string;
  lock_version: number;
  created_by_user_uuid: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  evidence: CallActionEvidence[];
  capabilities: CallActionCapabilities;
  // The call is in the bin: the action is readable but frozen until it returns.
  call_in_bin: boolean;
}
export interface CallActionsResponse {
  items: CallAction[];
  total: number;
  limit: number;
  offset: number;
}
export interface CallActionAssigneeDepartment {
  id: string;
  name: string;
}
export interface CallActionAssignee {
  user_uuid: string;
  username: string;
  full_name: string;
  full_surname: string;
  job_title?: string;
  departments: CallActionAssigneeDepartment[];
}
export interface CallActionAssigneesResponse {
  items: CallActionAssignee[];
}
export interface CreateCallActionRequest {
  analysis_uuid: string;
  source_department_uuid?: string;
  target_department_uuid?: string;
  assignee_user_uuid?: string;
  title: string;
  description: string;
  due_at: string;
  evidence: Array<{
    word_start_index?: number;
    word_end_index?: number;
    legacy_quote?: string;
  }>;
}

export interface NotificationsResponse {
  notifications: NotificationResponse[];
  unread_count: number;
}

export interface Plan {
  id: string;
  code: PlanCode;
  type: PlanType;
  name: string;
	monthly_price_minor: number;
	currency: string;
	marketing_hours_hint: number;
	monthly_minutes_limit: number;
	monthly_credit_allowance: number;
  // How many calls may wait for credits at once: null is no cap, 0 refuses the
  // upload the moment the budget runs out.
  pending_credit_calls_limit: number | null;
  active_instruction_limit: number;
  company_limit: number | null;
  departments_per_company_limit: number | null;
  members_per_company_limit: number | null;
  instructions_per_department_limit: number | null;
  analysis_level: AnalysisLevel;
  history_retention_days: number;
  export_enabled: boolean;
  team_analytics_enabled: boolean;
  api_access_enabled: boolean;
	webhooks_enabled: boolean;
}

export interface PlansResponse {
  plans: Plan[];
}

export interface Subscription {
  id: string;
  plan: Plan;
  user_uuid: string | null;
  company_uuid: string | null;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionState {
  user: UserResponse;
}

export type QualityReviewStatus =
  | "unassigned"
  | "assigned"
  | "in_review"
  | "published"
  | "appealed"
  | "resolved"
  | "canceled";
export type QualityReviewDecision =
  "confirmed" | "overridden" | "not_applicable" | "unscored";

export interface QualityReviewCriterion {
  criterion_uuid: string;
  criterion_key: string;
  title: string;
  ai_score?: number;
  human_score?: number;
  score_min?: number;
  score_max?: number;
  weight: number;
  decision: QualityReviewDecision;
  comment: string;
  position: number;
}

export interface QualityReviewRevision {
  revision_uuid: string;
  revision_number: number;
  author_user_uuid: string;
  status: "draft" | "published" | "superseded" | "voided";
  overall_comment: string;
  human_score?: number;
  score_max?: number;
  payload: Record<string, unknown>;
  source_hash: string;
  criteria: QualityReviewCriterion[];
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface QualityReviewCapabilities {
  can_claim: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_appeal: boolean;
  can_resolve_appeal: boolean;
  can_view_events: boolean;
  can_edit_analysis: boolean;
  can_dispute_analysis: boolean;
  can_resolve_dispute: boolean;
  can_comment_analysis: boolean;
}

export interface AnalysisComment {
  comment_uuid: string;
  call_uuid: string;
  analysis_uuid: string;
  author_user_uuid: string;
  author_name: string;
  body: string;
  criterion_key?: string;
  can_edit: boolean;
  created_at: string;
  edited_at?: string;
  lock_version: number;
}

export interface EffectiveAnalysisCriterion {
  criterion_key: string;
  title: string;
  ai_score?: number;
  human_review_1_score?: number;
  human_review_2_score?: number;
  effective_score?: number;
  effective_source: "ai" | "human_review_1" | "human_review_2" | string;
  score_min?: number;
  score_max?: number;
  weight: number;
  not_applicable: boolean;
}

export interface EffectiveAnalysis {
  total_score?: number;
  source: "ai" | "human_review_1" | "human_review_2" | string;
  criteria: EffectiveAnalysisCriterion[];
}

export interface AnalysisReviewContext {
  review_uuid?: string;
  status?: QualityReviewStatus;
  capabilities: QualityReviewCapabilities;
  human_review_count: number;
  human_review_limit: number;
  next_review_requires_different_author: boolean;
  active_score_source: "ai" | "human_review_1" | "human_review_2" | string;
  source_outdated: boolean;
  // The call is in the bin: the review is readable but frozen until it returns.
  call_in_bin: boolean;
  challenge?: QualityReviewResponse["challenge"];
  effective_analysis?: EffectiveAnalysis;
  comments: AnalysisComment[];
}

export interface QualityReviewResponse {
  review_uuid: string;
  call_uuid: string;
  analysis_uuid: string;
  analysis_attempt_uuid?: string;
  transcription_revision: number;
  company_uuid: string;
  department_uuid?: string;
  reviewed_subject_user_uuid?: string;
  assignee_user_uuid?: string;
  status: QualityReviewStatus;
  active_revision_uuid?: string;
  lock_version: number;
  due_at?: string;
  created_by_user_uuid: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
  source_outdated: boolean;
  // The call is in the bin: the review is readable but frozen until it returns.
  call_in_bin: boolean;
  capabilities: QualityReviewCapabilities;
  analysis: Record<string, unknown>;
  draft?: QualityReviewRevision;
  published_revision?: QualityReviewRevision;
  revisions: QualityReviewRevision[];
  effective_analysis?: EffectiveAnalysis;
  appeals: QualityReviewAppeal[];
  challenge?: {
    challenge_uuid: string;
    review_uuid: string;
    analysis_uuid: string;
    call_uuid: string;
    author_user_uuid: string;
    reason: string;
    created_at: string;
    updated_at: string;
  };
}

export interface QualityReviewEvent {
  event_uuid: string;
  review_uuid: string;
  revision_uuid?: string;
  appeal_uuid?: string;
  actor_user_uuid: string;
  event_type: string;
  created_at: string;
}

export interface QualityReviewsResponse {
  items: QualityReviewResponse[];
  limit: number;
  offset: number;
}

export interface QualityReviewAppeal {
  appeal_uuid: string;
  review_uuid: string;
  revision_uuid: string;
  author_user_uuid: string;
  status:
    | "open"
    | "in_review"
    | "accepted"
    | "partially_accepted"
    | "rejected"
    | "withdrawn";
  reason: string;
  resolution_comment?: string;
  resolved_by_user_uuid?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  lock_version: number;
}

export type AnalysisV3Status = "met" | "mostly_met" | "partially_met" | "minimally_met" | "missed" | "not_applicable" | "unclear" | "conflict" | "not_assessed";
export interface AnalysisV3Gap { text: string; basis: "instruction" | "explicit_question"; explanation: string; affects_score: boolean; }
export interface AnalysisProgress {
  stage: "inventory" | "answers" | "validation" | "complete";
  windows_done: number; windows_total: number;
  items_done: number; items_total: number; questions_found: number;
}
export interface AnalysisV3Item {
  processing_status?: "pending" | "ready";
  question_parts?: string[];
  id: string; kind: "question" | "episode" | "requirement"; title: string; topic: string; order: number; question_speaker?: string;
  asked: boolean | null; information_status: "complete" | "partial" | "absent" | "declined" | "conflicting" | "unclear" | null;
  fulfilled_earlier: boolean; answer_summary: string | null; status: AnalysisV3Status; weight: number; score: number | null;
  explanation: string; strengths: string[]; gaps: AnalysisV3Gap[];
  improvement_kind: "grounded_answer" | "advice" | "clarification_needed" | "not_needed";
  improvement: string | null; evidence: AnalysisEvidence[]; instruction_sources: string[];
}
export interface AnalysisV3Recommendation {
  id: string; title: string; action: string; reason: string; expected_result: string; item_ids: string[];
  affects_score: boolean; importance: number; impact: number | null; repetition: number;
  priority_score: number | null; priority: "high" | "medium" | "low" | "unresolved";
}
export interface AnalysisV3Result {
  progress?: AnalysisProgress;
  schema_version: 3; prompt_version: string; conversation_types: string[]; purpose: string | null;
  summary: string; outcome: string | null; strengths: string[]; work_on: string[];
  coverage: { status: "complete" | "partial"; actual_question_count: number; analyzed_actual_question_count: number; required_question_count: number; complete_without_separate_question: number; limitations: string[]; };
  overall_score: number | null; overall_score_label: string; items: AnalysisV3Item[];
  recommendations: AnalysisV3Recommendation[]; priority_recommendation_ids: string[];
}

export interface AssistantCapabilities { search_enabled:boolean; chat_enabled:boolean; aggregate_enabled:boolean; export_enabled:boolean; company_uuid:string; role:string; department_uuids:string[]; reason_code?:string }
export interface ContentSearchItem { chunk_uuid:string; call_uuid:string; title:string; quote:string; speaker?:string; start_seconds?:number; end_seconds?:number; created_at:string; updated_at:string; transcription_revision:number; score:number; retrieval_mode:string; source_kind:"transcription"|"analysis" }
export interface ContentSearchResponse { items:ContentSearchItem[]; retrieval_mode:string; evaluated_calls:number; index_ready_calls:number; warnings:string[] }
export interface AssistantSource { id:string; call_uuid:string; call_title:string; quote:string; start_seconds?:number; end_seconds?:number; transcription_revision:number; source_kind:"transcription"|"analysis" }
export interface AssistantBlock { type:string; text?:string; artifact_id?:string; data?:{labels?:string[]} }
export interface AssistantArtifactRow { call_uuid:string; label:string; count:number; percentage:number }
export interface AssistantArtifact { id:string; message_uuid:string; type:"chart"|"table"; title:string; schema_version:number; data:{kind:string;basis:string;total:number;evaluated_calls:number;indexed_calls:number;items:AssistantArtifactRow[]}; created_at:string }
export interface AssistantMessage { id:string; chat_uuid:string; sequence:number; role:"user"|"assistant"; status:string; text:string; blocks?:AssistantBlock[]; sources:AssistantSource[]; artifacts?:AssistantArtifact[]; created_at:string; completed_at?:string }
export interface AssistantChat { id:string; company_uuid:string; title:string; response_detail:"brief"|"auto"|"detailed"; created_at:string; updated_at:string }
export interface AssistantRun { id:string; chat_uuid:string; state:string; request_received_at:string; data_snapshot_at?:string; assistant_message?:AssistantMessage; error_code?:string }
export interface AssistantDraft { text:string; context:{items?:Array<{kind:"call"|"folder"|"chat";id:string;label:string;callIds?:string[]}>;period?:{from:string;to:string}|null}; lock_version:number; updated_at:string }

export interface SupportAccessJournalEntry {
  id: string;
  event_type: string;
  resource: string;
  command: string;
  actor_username: string;
  reason: string;
  access_expires_at?: string;
  created_at: string;
}

// The append-only records the system keeps. Every one of them was written and
// none could be read from the product until now.
export type AdminAuditTrail =
  | "admin_actions"
  | "billing_alerts"
  | "credit_reconciliation"
  | "retention"
  | "transcript_edits"
  | "comment_revisions";

export interface AdminAuditTrailEntry {
  occurred_at: string;
  // Present only where the record can be acted on, which today means a billing
  // alert waiting to be closed.
  entry_uuid?: string;
  actor_user_uuid?: string;
  action: string;
  details?: unknown;
}

export interface AdminAuditTrailResponse {
  trail: AdminAuditTrail;
  items: AdminAuditTrailEntry[];
  total: number;
  limit: number;
  offset: number;
}