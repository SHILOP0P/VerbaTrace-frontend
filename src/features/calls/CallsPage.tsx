import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CloudUpload,
  Filter,
  MoreHorizontal,
  MoreVertical,
  PanelLeftClose,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import type {
  AnalysisResponse,
  AnalysisInstruction,
  AppPage,
  CallFolderResponse,
  CallResponse,
  CallStatus,
  CallFilterOptionsResponse,
  CompanyResponse,
  CreateCallFolderRequest,
  DepartmentMemberResponse,
  DepartmentResponse,
  SessionState,
  TranscriptionResponse,
  UpdateCallFolderRequest,
  VisibilityScope
} from "../../types";

import { formatDate, formatDuration } from "../../shared/lib/formatters";
import { activeDepartmentLeaderIds, isCompanyManager } from "../../shared/lib/access";
import { StatusChip } from "../../shared/ui/call";
import { ConfirmDialog } from "../../shared/ui/confirm-dialog";
import { DateTimePicker } from "../../shared/ui/DateTimePicker";
import { useEscapeDismiss } from "../../shared/ui/dismissible-layer";
import { CallListSkeleton } from "../../shared/ui/loading";
import { SelectControl } from "../../shared/ui/primitives";
import { CustomScrollbar } from "../../shared/ui/custom-scrollbar";
import { MobileCallDrawerTrigger } from "../../shared/ui/mobile-call-drawer-trigger";
import { CallsBinPanel } from "./CallsBinPanel";
import { CallDetailPanel } from "./CallDetailPanel";
import {
  callSearchText,
  folderScopeLabel,
  formatUsername,
  friendlyCallActionError,
  isWithinPeriod,
  loadCallFoldersForContext,
  managerLabel,
  periodStart
} from "./call-page-utils";

type CallsURLFilters = {
  status: CallStatus | "all";
  scope: VisibilityScope | "all";
  manager: string;
  period: "all" | "7d" | "30d";
  query: string;
  company: string;
  department: string;
  participant: string;
  source: "all" | "manual" | "generic_api" | "bitrix24";
  connection: string;
  occurredFrom: string;
  occurredTo: string;
  durationMin: string;
  durationMax: string;
  analysis: "all" | "yes" | "no";
  actions: "all" | "yes" | "no";
  processingError: boolean;
  favorite: boolean;
  sort: "occurred_at" | "created_at" | "duration";
  order: "asc" | "desc";
};

function initialCallsURLFilters(): CallsURLFilters {
  const query = new URLSearchParams(window.location.search);
  const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = query.get(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  };
  return {
    status: oneOf("status", ["new", "processing", "transcribed", "analyzed", "failed", "all"] as const, "all"),
    scope: oneOf("scope", ["personal", "company", "department", "all"] as const, "all"),
    manager: query.get("uploaded_by_user_uuid") || "all",
    period: oneOf("period", ["all", "7d", "30d"] as const, "all"),
    query: query.get("q") || "",
    company: query.get("company_uuid") || "all",
    department: query.get("department_uuid") || "all",
    participant: query.get("participant_user_uuid") || "all",
    source: oneOf("source_provider", ["all", "manual", "generic_api", "bitrix24"] as const, "all"),
    connection: query.get("connection_uuid") || "all",
    occurredFrom: query.get("occurred_from") || "",
    occurredTo: query.get("occurred_to") || "",
    durationMin: query.get("duration_min_seconds") || "",
    durationMax: query.get("duration_max_seconds") || "",
    analysis: oneOf("has_analysis", ["all", "yes", "no"] as const, "all"),
    actions: oneOf("has_actions", ["all", "yes", "no"] as const, "all"),
    processingError: query.get("has_processing_error") === "true",
    favorite: query.get("favorite_only") === "true",
    sort: oneOf("sort", ["occurred_at", "created_at", "duration"] as const, "occurred_at"),
    order: oneOf("order", ["asc", "desc"] as const, "desc"),
  };
}

export function CallsPage({
  calls,
  companies,
  departments,
  departmentMembers,
  selectedCall,
  selectedCallId,
  selectedCallTimeline,
  transcription,
  analysis,
  analyses,
  session,
  loading,
  loadingDetails,
  onSelectCall,
  onNavigate,
  onAnalysisReady,
  onUpdateCallTitle,
  onDeleteCall,
  onOpenTranscriptionEditor,
  onOpenRevisionComparison
}: {
  calls: CallResponse[];
  companies: CompanyResponse[];
  departments: DepartmentResponse[];
  departmentMembers: DepartmentMemberResponse[];
  selectedCall?: CallResponse;
  selectedCallId: string;
  selectedCallTimeline?: CallStatus[];
  transcription?: TranscriptionResponse;
  analysis?: AnalysisResponse;
  analyses: Record<string, AnalysisResponse>;
  session: SessionState;
  loading: boolean;
  loadingDetails: boolean;
  onSelectCall: (callId: string) => void;
  onNavigate: (page: AppPage) => void;
  onAnalysisReady: (callId: string, analysis: AnalysisResponse) => void;
  onUpdateCallTitle?: (callId: string, title: string) => Promise<CallResponse>;
  onDeleteCall?: (callId: string) => Promise<void>;
  onOpenTranscriptionEditor?: (callId: string) => void;
  onOpenRevisionComparison?: (callId: string, revision?: number) => void;
}) {
  const [initialURLFilters] = useState(initialCallsURLFilters);
  const callsSidebarScrollRef = useRef<HTMLElement | null>(null);
  const callOverviewScrollRef = useRef<HTMLElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<CallStatus | "all">(initialURLFilters.status);
  const [scopeFilter, setScopeFilter] = useState<VisibilityScope | "all">(initialURLFilters.scope);
  const [managerFilter, setManagerFilter] = useState(initialURLFilters.manager);
  const [periodFilter, setPeriodFilter] = useState<"all" | "7d" | "30d">(initialURLFilters.period);
  const [searchQuery, setSearchQuery] = useState(initialURLFilters.query);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(initialURLFilters.favorite);
  const [companyFilter, setCompanyFilter] = useState(initialURLFilters.company);
  const [departmentFilter, setDepartmentFilter] = useState(initialURLFilters.department);
  const [participantFilter, setParticipantFilter] = useState(initialURLFilters.participant);
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "generic_api" | "bitrix24">(initialURLFilters.source);
  const [connectionFilter, setConnectionFilter] = useState(initialURLFilters.connection);
  const [occurredFrom, setOccurredFrom] = useState(initialURLFilters.occurredFrom);
  const [occurredTo, setOccurredTo] = useState(initialURLFilters.occurredTo);
  const [durationMin, setDurationMin] = useState(initialURLFilters.durationMin);
  const [durationMax, setDurationMax] = useState(initialURLFilters.durationMax);
  const [analysisFilter, setAnalysisFilter] = useState<"all" | "yes" | "no">(initialURLFilters.analysis);
  const [actionsFilter, setActionsFilter] = useState<"all" | "yes" | "no">(initialURLFilters.actions);
  const [processingErrorOnly, setProcessingErrorOnly] = useState(initialURLFilters.processingError);
  const [sortFilter, setSortFilter] = useState<"occurred_at" | "created_at" | "duration">(initialURLFilters.sort);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialURLFilters.order);
  // Bumped after a restore so the list picks the call back up.
  const [restoredCallsToken, setRestoredCallsToken] = useState(0);
  const [serverCalls, setServerCalls] = useState<CallResponse[] | null>(null);
  const [nextCallsCursor, setNextCallsCursor] = useState<string | null>(null);
  const [loadingMoreCalls, setLoadingMoreCalls] = useState(false);
  const [filterOptions, setFilterOptions] = useState<CallFilterOptionsResponse | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersError, setFiltersError] = useState("");
  const [callFolders, setCallFolders] = useState<CallFolderResponse[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [editingFolderId, setEditingFolderId] = useState("");
  const [folderEditorOpen, setFolderEditorOpen] = useState(false);
  const [folderBusyId, setFolderBusyId] = useState("");
  const [callFolderActionByCall, setCallFolderActionByCall] = useState<Record<string, string>>({});
  const [folderCallsById, setFolderCallsById] = useState<Record<string, CallResponse[]>>({});
  const [folderCallsLoading, setFolderCallsLoading] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [folderForm, setFolderForm] = useState<FolderFormState>(() => emptyFolderForm());
  const [folderInstructionOptions, setFolderInstructionOptions] = useState<AnalysisInstruction[]>([]);
  const [folderInstructionsLoading, setFolderInstructionsLoading] = useState(false);
  const [folderInstructionsError, setFolderInstructionsError] = useState("");
  const [openFolderMenuId, setOpenFolderMenuId] = useState("");
  const [openCallMenuId, setOpenCallMenuId] = useState("");
  const [editingCall, setEditingCall] = useState<CallResponse | null>(null);
  const [callTitleDraft, setCallTitleDraft] = useState("");
  const [callActionError, setCallActionError] = useState("");
  const [callBusyId, setCallBusyId] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const managedCompanyIds = new Set(
    companies.filter((company) => isCompanyManager(company, session.user.id)).map((company) => company.id)
  );
  const ledDepartmentIds = activeDepartmentLeaderIds(departmentMembers, session.user.id);
  const manageableDepartments = departments.filter(
    (department) => managedCompanyIds.has(department.company_uuid) || ledDepartmentIds.has(department.id)
  );

  function canManageFolder(folder: CallFolderResponse) {
    if (folder.scope === "personal") return folder.user_uuid === session.user.id;
    if (folder.scope === "company") return Boolean(folder.company_uuid && managedCompanyIds.has(folder.company_uuid));
    return Boolean(
      folder.department_uuid &&
      (ledDepartmentIds.has(folder.department_uuid) || (folder.company_uuid && managedCompanyIds.has(folder.company_uuid)))
    );
  }

  function selectFolderScope(scope: VisibilityScope) {
    const firstManagedCompany = companies.find((company) => managedCompanyIds.has(company.id));
    const currentDepartment = manageableDepartments.find((department) => department.id === folderForm.department_uuid);
    const firstDepartment = currentDepartment ?? manageableDepartments[0];
    const companyId = scope === "company"
      ? (managedCompanyIds.has(folderForm.company_uuid) ? folderForm.company_uuid : firstManagedCompany?.id ?? "")
      : scope === "department"
        ? firstDepartment?.company_uuid ?? ""
        : "";

    setFolderForm((current) => ({
      ...current,
      scope,
      company_uuid: companyId,
      department_uuid: scope === "department" ? firstDepartment?.id ?? "" : ""
    }));
  }
  const [favoriteCallIds, setFavoriteCallIds] = useState<string[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [callListCollapsed, setCallListCollapsed] = useState(() => window.localStorage.getItem("verbatrace:calls-list-collapsed") === "1");
  const effectiveScopeFilter =
    companies.length === 0 && (scopeFilter === "company" || scopeFilter === "department")
      ? "all"
      : scopeFilter;
  const filterValidationError = (() => {
    const minDuration = durationMin === "" ? undefined : Number(durationMin);
    const maxDuration = durationMax === "" ? undefined : Number(durationMax);
    if ((minDuration !== undefined && (!Number.isFinite(minDuration) || minDuration < 0)) ||
        (maxDuration !== undefined && (!Number.isFinite(maxDuration) || maxDuration < 0))) {
      return "Длительность не может быть отрицательной.";
    }
    if (minDuration !== undefined && maxDuration !== undefined && minDuration > maxDuration) {
      return "Минимальная длительность не может быть больше максимальной.";
    }
    if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
      return "Дата начала не может быть позже даты окончания.";
    }
    return "";
  })();
  const filterInput = {
    q: searchQuery.trim() || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    scope: effectiveScopeFilter === "all" ? undefined : effectiveScopeFilter,
    company_uuid: companyFilter === "all" ? undefined : companyFilter,
    department_uuid: departmentFilter === "all" ? undefined : departmentFilter,
    participant_user_uuid: participantFilter === "all" ? undefined : participantFilter,
    uploaded_by_user_uuid: managerFilter === "all" ? undefined : managerFilter,
    source_provider: sourceFilter === "all" ? undefined : sourceFilter,
    connection_uuid: connectionFilter === "all" ? undefined : connectionFilter,
    occurred_from: occurredFrom || periodStart(periodFilter),
    occurred_to: occurredTo || undefined,
    duration_min_seconds: durationMin === "" ? undefined : Number(durationMin),
    duration_max_seconds: durationMax === "" ? undefined : Number(durationMax),
    has_analysis: analysisFilter === "all" ? undefined : analysisFilter === "yes",
    has_actions: actionsFilter === "all" ? undefined : actionsFilter === "yes",
    has_processing_error: processingErrorOnly || undefined,
    favorite_only: favoriteOnly || undefined,
    include_upload_fallback: true,
    sort: sortFilter,
    order: sortOrder
  };
  const displayedCalls = serverCalls ?? calls;
  const callsRefreshKey = calls.map((call) => `${call.id}:${call.status}`).join("|");
  const filteredCalls = displayedCalls.filter((call) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesScope = effectiveScopeFilter === "all" || call.visibility_scope === effectiveScopeFilter;
    const matchesStatus = statusFilter === "all" || call.status === statusFilter;
    const matchesManager = managerFilter === "all" || call.uploaded_by_user_uuid === managerFilter;
    const matchesSearch = !query || callSearchText(call).includes(query);
    const matchesPeriod = isWithinPeriod(call.display_time || call.occurred_at || call.created_at, periodFilter);
    const matchesCompany = companyFilter === "all" || call.company_uuid === companyFilter;
    const matchesConnection = connectionFilter === "all" || call.connection_uuid === connectionFilter;

    return matchesScope && matchesStatus && matchesManager && matchesSearch && matchesPeriod && matchesCompany && matchesConnection;
  });

  useEffect(() => { api.listFavoriteCalls().then((items) => setFavoriteCallIds(items.map((call) => call.id))).catch(() => setFavoriteCallIds([])); }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSidebarOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileSidebarOpen]);

  function toggleCallList() {
    setCallListCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("verbatrace:calls-list-collapsed", next ? "1" : "0");
      return next;
    });
  }

  async function toggleFavoriteCall(callId: string) {
    const isFavorite = favoriteCallIds.includes(callId);
    setCallBusyId(callId);
    try {
      if (isFavorite) { await api.removeFavoriteCall(callId); setFavoriteCallIds((items) => items.filter((id) => id !== callId)); }
      else { await api.addFavoriteCall(callId); setFavoriteCallIds((items) => [...items, callId]); }
    } catch (error) { setCallActionError(friendlyCallActionError(error, "Не удалось изменить избранное.")); }
    finally { setCallBusyId(""); }
  }

  useEffect(() => {
    if (!folderEditorOpen) return;
    let cancelled = false;
    const companyUuid = folderForm.scope === "personal" ? undefined : folderForm.company_uuid || undefined;
    const departmentUuid = folderForm.scope === "department" ? folderForm.department_uuid || undefined : undefined;

    if ((folderForm.scope === "company" && !companyUuid) || (folderForm.scope === "department" && (!companyUuid || !departmentUuid))) {
      setFolderInstructionOptions([]);
      setFolderInstructionsError("");
      setFolderInstructionsLoading(false);
      return;
    }

    setFolderInstructionsLoading(true);
    setFolderInstructionsError("");
    api.listInstructions({
      scope: folderForm.scope,
      company_uuid: companyUuid,
      department_uuid: departmentUuid
    }).then((items) => {
      if (!cancelled) setFolderInstructionOptions(items.filter((item) => item.is_active));
    }).catch((error) => {
      if (!cancelled) {
        setFolderInstructionOptions([]);
        setFolderInstructionsError(error instanceof Error ? error.message : "Не удалось загрузить инструкции.");
      }
    }).finally(() => {
      if (!cancelled) setFolderInstructionsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [folderEditorOpen, folderForm.company_uuid, folderForm.department_uuid, folderForm.scope]);
  const managerOptions = filterOptions?.managers ?? [];
  const connectionOptions = filterOptions?.connections ?? [];
  const participantOptions = Array.from(
    new Map(
      departmentMembers
        .filter((member) => member.status === "active")
        .map((member) => [member.user_uuid, member])
    ).values()
  ).sort((left, right) =>
    `${left.full_surname ?? ""} ${left.full_name ?? ""} ${left.username ?? ""}`.localeCompare(
      `${right.full_surname ?? ""} ${right.full_name ?? ""} ${right.username ?? ""}`,
      "ru"
    )
  );
  const visibleFolders = callFolders.filter((folder) =>
    effectiveScopeFilter === "all" || folder.scope === effectiveScopeFilter
  );
  const formDepartmentOptions = departments.filter((department) => department.company_uuid === folderForm.company_uuid);
  const companiesFolderKey = companies.map((company) => company.id).join("|");
  const departmentsFolderKey = departments.map((department) => `${department.company_uuid}:${department.id}`).join("|");
  const visibleFolderIdsKey = visibleFolders.map((folder) => folder.id).join("|");
  const folderCallIds = new Set(Object.values(folderCallsById).flatMap((folderCalls) => folderCalls.map((call) => call.id)));
  const callsWithoutVisibleFolder = filteredCalls.filter((call) => !folderCallIds.has(call.id));
  const scopeOptions: Array<[VisibilityScope | "all", string]> = [
    ["all", "Все"],
    ["personal", "Личные"],
    ...(companies.length > 0
      ? ([
        ["company", "Компания"],
        ["department", "Отдел"]
      ] as Array<[VisibilityScope, string]>)
      : [])
  ];
  const filtersChanged =
    statusFilter !== "all" ||
    effectiveScopeFilter !== "all" ||
    managerFilter !== "all" ||
    periodFilter !== "all" ||
    companyFilter !== "all" ||
    departmentFilter !== "all" ||
    participantFilter !== "all" ||
    sourceFilter !== "all" ||
    connectionFilter !== "all" ||
    Boolean(occurredFrom || occurredTo || durationMin || durationMax) ||
    analysisFilter !== "all" ||
    actionsFilter !== "all" ||
    processingErrorOnly ||
    favoriteOnly ||
    sortFilter !== "occurred_at" ||
    sortOrder !== "desc" ||
    searchQuery.trim().length > 0;
  const activeFilterCount = [
    statusFilter !== "all",
    effectiveScopeFilter !== "all",
    managerFilter !== "all",
    periodFilter !== "all",
    companyFilter !== "all",
    departmentFilter !== "all",
    participantFilter !== "all",
    sourceFilter !== "all",
    connectionFilter !== "all",
    Boolean(occurredFrom || occurredTo),
    Boolean(durationMin || durationMax),
    analysisFilter !== "all",
    actionsFilter !== "all",
    processingErrorOnly,
    favoriteOnly,
    sortFilter !== "occurred_at" || sortOrder !== "desc"
  ].filter(Boolean).length;
  const activeFilterChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (statusFilter !== "all") activeFilterChips.push({ key: "status", label: `Статус: ${{ new: "новые", processing: "в обработке", transcribed: "расшифрованы", analyzed: "анализ готов", failed: "ошибки" }[statusFilter]}`, clear: () => setStatusFilter("all") });
  if (effectiveScopeFilter !== "all") activeFilterChips.push({ key: "scope", label: `Область: ${{ personal: "личные", company: "компания", department: "отдел" }[effectiveScopeFilter]}`, clear: () => setScopeFilter("all") });
  if (managerFilter !== "all") activeFilterChips.push({ key: "manager", label: `Загрузил: ${managerOptions.find((item) => item.id === managerFilter) ? managerLabel(managerOptions.find((item) => item.id === managerFilter)!, session) : "пользователь"}`, clear: () => setManagerFilter("all") });
  if (companyFilter !== "all") activeFilterChips.push({ key: "company", label: `Компания: ${companies.find((item) => item.id === companyFilter)?.name || "выбрана"}`, clear: () => { setCompanyFilter("all"); setDepartmentFilter("all"); setConnectionFilter("all"); } });
  if (participantFilter !== "all") activeFilterChips.push({ key: "participant", label: `Сотрудник: ${participantOptions.find((item) => item.user_uuid === participantFilter)?.username || "выбран"}`, clear: () => setParticipantFilter("all") });
  if (departmentFilter !== "all") activeFilterChips.push({ key: "department", label: `Отдел: ${departments.find((item) => item.id === departmentFilter)?.name || "выбран"}`, clear: () => setDepartmentFilter("all") });
  if (sourceFilter !== "all") activeFilterChips.push({ key: "source", label: `Источник: ${{ manual: "ручная загрузка", generic_api: "API", bitrix24: "Bitrix24" }[sourceFilter]}`, clear: () => setSourceFilter("all") });
  if (connectionFilter !== "all") activeFilterChips.push({ key: "connection", label: `Подключение: ${connectionOptions.find((item) => item.id === connectionFilter)?.name || "выбрано"}`, clear: () => setConnectionFilter("all") });
  if (periodFilter !== "all") activeFilterChips.push({ key: "period", label: periodFilter === "7d" ? "Последние 7 дней" : "Последние 30 дней", clear: () => setPeriodFilter("all") });
  if (occurredFrom || occurredTo) activeFilterChips.push({ key: "occurred", label: `Разговор: ${occurredFrom || "…"} — ${occurredTo || "…"}`, clear: () => { setOccurredFrom(""); setOccurredTo(""); } });
  if (durationMin || durationMax) activeFilterChips.push({ key: "duration", label: `Длительность: ${durationMin || "0"}–${durationMax || "∞"} сек.`, clear: () => { setDurationMin(""); setDurationMax(""); } });
  if (analysisFilter !== "all") activeFilterChips.push({ key: "analysis", label: analysisFilter === "yes" ? "С анализом" : "Без анализа", clear: () => setAnalysisFilter("all") });
  if (actionsFilter !== "all") activeFilterChips.push({ key: "actions", label: actionsFilter === "yes" ? "С действиями" : "Без действий", clear: () => setActionsFilter("all") });
  if (processingErrorOnly) activeFilterChips.push({ key: "errors", label: "Только ошибки", clear: () => setProcessingErrorOnly(false) });
  if (favoriteOnly) activeFilterChips.push({ key: "favorite", label: "Только избранные", clear: () => setFavoriteOnly(false) });
  if (sortFilter !== "occurred_at" || sortOrder !== "desc") activeFilterChips.push({ key: "sort", label: `Сортировка: ${{ occurred_at: "время разговора", created_at: "время импорта", duration: "длительность" }[sortFilter]}, ${sortOrder === "desc" ? "по убыванию" : "по возрастанию"}`, clear: () => { setSortFilter("occurred_at"); setSortOrder("desc"); } });
  const selectedCallActionFolderId = selectedCall ? callFolderActionByCall[selectedCall.id] || "" : "";
  const selectedCallActionFolder = selectedCallActionFolderId
    ? callFolders.find((folder) => folder.id === selectedCallActionFolderId)
    : undefined;

  function resetFilters() {
    setStatusFilter("all");
    setScopeFilter("all");
    setManagerFilter("all");
    setPeriodFilter("all");
    setCompanyFilter("all");
    setDepartmentFilter("all");
    setParticipantFilter("all");
    setSourceFilter("all");
    setConnectionFilter("all");
    setOccurredFrom("");
    setOccurredTo("");
    setDurationMin("");
    setDurationMax("");
    setAnalysisFilter("all");
    setActionsFilter("all");
    setProcessingErrorOnly(false);
    setFavoriteOnly(false);
    setSortFilter("occurred_at");
    setSortOrder("desc");
    setSearchQuery("");
    setServerCalls(null);
    setNextCallsCursor(null);
    setFiltersError("");
  }

  async function loadMoreCalls() {
    if (!nextCallsCursor || loadingMoreCalls || filterValidationError) return;
    setLoadingMoreCalls(true);
    setFiltersError("");
    try {
      const response = await api.listCalls({ ...filterInput, cursor: nextCallsCursor, limit: 50 });
      const page = Array.isArray(response) ? response : response.items;
      setServerCalls((current) => {
        const merged = [...(current ?? []), ...page];
        return [...new Map(merged.map((call) => [call.id, call])).values()];
      });
      setNextCallsCursor(Array.isArray(response) ? null : response.next_cursor ?? null);
    } catch {
      setFiltersError("Не удалось загрузить следующую страницу. Повторите попытку.");
    } finally {
      setLoadingMoreCalls(false);
    }
  }

  async function refreshFolders() {
    setFoldersLoading(true);
    setFolderError("");
    try {
      const loadedFolders = await loadCallFoldersForContext(companies, departments);
      setCallFolders(loadedFolders);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Не удалось загрузить папки");
      setCallFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }

  function startFolderCreate() {
    setEditingFolderId("");
    setFolderError("");
    setFolderForm(emptyFolderForm());
    setFolderEditorOpen(true);
  }

  function startFolderEdit(folder: CallFolderResponse) {
    setEditingFolderId(folder.id);
    setFolderError("");
    setFolderForm({
      scope: folder.scope === "company" || folder.scope === "department" ? folder.scope : "personal",
      company_uuid: folder.company_uuid ?? "",
      department_uuid: folder.department_uuid ?? "",
      name: folder.name,
      description: folder.description ?? "",
      color: folder.color ?? folderPalette[0]
      ,instruction_uuids: folder.instructions?.map((instruction) => instruction.id) ?? []
    });
    setFolderEditorOpen(true);
  }

  function cancelFolderEdit() {
    setEditingFolderId("");
    setFolderError("");
    setFolderForm(emptyFolderForm());
    setFolderEditorOpen(false);
  }

  async function submitFolderForm() {
    const payload = buildFolderPayload(folderForm, editingFolderId ? "update" : "create");
    if (!payload.ok) {
      setFolderError(payload.error);
      return;
    }

    setFolderError("");
    setFolderBusyId(editingFolderId || "create");

    try {
      if (editingFolderId) {
        await api.updateCallFolder(editingFolderId, payload.value as UpdateCallFolderRequest);
        await api.replaceCallFolderInstructions(editingFolderId, folderForm.instruction_uuids);
      } else {
        await api.createCallFolder(payload.value as CreateCallFolderRequest);
      }
      cancelFolderEdit();
      await refreshFolders();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Не удалось сохранить папку");
    } finally {
      setFolderBusyId("");
    }
  }

  async function deleteFolder(folder: CallFolderResponse) {
    setFolderError("");
    setFolderBusyId(folder.id);
    try {
      await api.deleteCallFolder(folder.id);
      if (editingFolderId === folder.id) cancelFolderEdit();
      await refreshFolders();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Не удалось удалить папку");
    } finally {
      setFolderBusyId("");
    }
  }

  function requestFolderDelete(folder: CallFolderResponse) {
    setOpenFolderMenuId("");
    setFolderError("");
    setPendingDelete({ type: "folder", folder });
  }

  async function assignCallToFolder(folderId: string, callId: string) {
    setFolderError("");
    setFolderBusyId(folderId);
    try {
      await api.assignCallToFolder(folderId, callId);
      setCallFolderActionByCall((current) => ({ ...current, [callId]: folderId }));
      const assignedCall = calls.find((call) => call.id === callId);
      if (assignedCall) {
        setFolderCallsById((current) => ({
          ...current,
          [folderId]: [
            assignedCall,
            ...(current[folderId] ?? []).filter((call) => call.id !== callId)
          ]
        }));
      }
      setExpandedFolderIds((current) => ({ ...current, [folderId]: true }));
      await refreshFolders();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Не удалось добавить звонок в папку");
    } finally {
      setFolderBusyId("");
    }
  }

  async function removeCallFromFolder(folderId: string, callId: string) {
    setFolderError("");
    setFolderBusyId(folderId);
    try {
      await api.removeCallFromFolder(folderId, callId);
      setCallFolderActionByCall((current) => {
        if (current[callId] !== folderId) return current;
        const next = { ...current };
        delete next[callId];
        return next;
      });
      setFolderCallsById((current) => ({
        ...current,
        [folderId]: (current[folderId] ?? []).filter((call) => call.id !== callId)
      }));
      await refreshFolders();
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Не удалось убрать звонок из папки");
    } finally {
      setFolderBusyId("");
    }
  }

  function toggleCallMenu(callId: string) {
    setCallActionError("");
    setOpenFolderMenuId("");
    setOpenCallMenuId((current) => (current === callId ? "" : callId));
  }

  function toggleFolderMenu(folderId: string) {
    setFolderError("");
    setOpenCallMenuId("");
    setOpenFolderMenuId((current) => (current === folderId ? "" : folderId));
  }

  function startCallRename(call: CallResponse) {
    setOpenCallMenuId("");
    setCallActionError("");
    setEditingCall(call);
    setCallTitleDraft(call.title);
  }

  function cancelCallRename() {
    setEditingCall(null);
    setCallTitleDraft("");
    setCallActionError("");
  }

  function patchCallInLocalLists(updatedCall: CallResponse) {
    setServerCalls((current) =>
      current ? current.map((call) => (call.id === updatedCall.id ? updatedCall : call)) : current
    );
    setFolderCallsById((current) =>
      Object.fromEntries(
        Object.entries(current).map(([folderId, folderCalls]) => [
          folderId,
          folderCalls.map((call) => (call.id === updatedCall.id ? updatedCall : call))
        ])
      )
    );
  }

  async function deleteCallAndSync(callId: string) {
    if (!onDeleteCall) return;
    const affectedFolderIds = new Set(
      Object.entries(folderCallsById)
        .filter(([, folderCalls]) => folderCalls.some((item) => item.id === callId))
        .map(([folderId]) => folderId)
    );
    const actionFolderId = callFolderActionByCall[callId];
    if (actionFolderId) affectedFolderIds.add(actionFolderId);
    await onDeleteCall(callId);
    if (affectedFolderIds.size > 0) {
      setCallFolders((current) => current.map((folder) =>
        affectedFolderIds.has(folder.id)
          ? { ...folder, calls_count: Math.max(0, folder.calls_count - 1) }
          : folder
      ));
    }
    setServerCalls((current) => (current ? current.filter((item) => item.id !== callId) : current));
    setFolderCallsById((current) =>
      Object.fromEntries(
        Object.entries(current).map(([folderId, folderCalls]) => [
          folderId,
          folderCalls.filter((item) => item.id !== callId)
        ])
      )
    );
    setCallFolderActionByCall((current) => {
      if (!current[callId]) return current;
      const next = { ...current };
      delete next[callId];
      return next;
    });
    await refreshFolders();
  }

  async function submitCallRename() {
    if (!editingCall || !onUpdateCallTitle) return;

    const title = callTitleDraft.trim();
    if (!title) {
      setCallActionError("Введите название звонка.");
      return;
    }

    setCallActionError("");
    setCallBusyId(editingCall.id);
    try {
      const updatedCall = await onUpdateCallTitle(editingCall.id, title);
      patchCallInLocalLists(updatedCall);
      cancelCallRename();
    } catch (error) {
      setCallActionError(friendlyCallActionError(error, "Не удалось переименовать звонок."));
    } finally {
      setCallBusyId("");
    }
  }

  async function deleteCallFromMenu(call: CallResponse) {
    if (!onDeleteCall) return;

    setOpenCallMenuId("");
    setCallActionError("");
    setCallBusyId(call.id);
    try {
      await deleteCallAndSync(call.id);
    } catch (error) {
      setCallActionError(friendlyCallActionError(error, "Не удалось удалить звонок."));
    } finally {
      setCallBusyId("");
    }
  }

  function requestCallDelete(call: CallResponse) {
    setOpenCallMenuId("");
    setCallActionError("");
    setPendingDelete({ type: "call", call });
  }

  async function confirmPendingDelete() {
    if (!pendingDelete) return;

    if (pendingDelete.type === "folder") {
      await deleteFolder(pendingDelete.folder);
    } else {
      await deleteCallFromMenu(pendingDelete.call);
    }
    setPendingDelete(null);
  }

  useEscapeDismiss(folderEditorOpen && !folderBusyId, cancelFolderEdit);
  useEscapeDismiss(Boolean(editingCall) && !callBusyId, cancelCallRename);

  useEffect(() => {
    if (!openCallMenuId && !openFolderMenuId) return;

    const closeMenu = () => {
      setOpenCallMenuId("");
      setOpenFolderMenuId("");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openCallMenuId, openFolderMenuId]);

  useEffect(() => {
    let cancelled = false;
    api
      .getCallFilterOptions({
        company_uuid: companyFilter === "all" ? undefined : companyFilter,
        department_uuid: departmentFilter === "all" ? undefined : departmentFilter
      })
      .then((response) => {
        if (!cancelled) setFilterOptions(response);
      })
      .catch(() => {
        if (!cancelled) setFilterOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyFilter, departmentFilter]);

  useEffect(() => {
    void refreshFolders();
  }, [companiesFolderKey, departmentsFolderKey]);

  useEffect(() => {
    const callsById = new Map(calls.map((call) => [call.id, call]));
    setFolderCallsById((current) =>
      Object.fromEntries(
        Object.entries(current).map(([folderId, folderCalls]) => [
          folderId,
          folderCalls.map((call) => callsById.get(call.id) ?? call)
        ])
      )
    );
  }, [callsRefreshKey]);

  useEffect(() => {
    if (visibleFolders.length === 0) {
      setFolderCallsById({});
      setFolderCallsLoading(false);
      return;
    }

    let cancelled = false;
    setFolderCallsLoading(true);
    Promise
      .all(
        visibleFolders.map((folder) =>
          api
            .listCallFolderCalls(folder.id, { limit: 100, offset: 0 })
            .then((response) => [
              folder.id,
              Array.isArray(response) ? response : response.items
            ] as const)
            .catch(() => [folder.id, [] as CallResponse[]] as const)
        )
      )
      .then((entries) => {
        if (cancelled) return;
        setFolderCallsById(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setFolderCallsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visibleFolderIdsKey]);

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => ({ ...current, [folderId]: !current[folderId] }));
  }

  function selectFolderCall(callId: string, folderId: string) {
    setCallFolderActionByCall((current) => ({ ...current, [callId]: folderId }));
    onSelectCall(callId);
  }

  function selectUnfiledCall(callId: string) {
    setCallFolderActionByCall((current) => {
      if (!current[callId]) return current;
      const next = { ...current };
      delete next[callId];
      return next;
    });
    onSelectCall(callId);
  }

  function matchesSidebarFilters(call: CallResponse) {
    const query = searchQuery.trim().toLowerCase();
    const matchesScope = effectiveScopeFilter === "all" || call.visibility_scope === effectiveScopeFilter;
    const matchesStatus = statusFilter === "all" || call.status === statusFilter;
    const matchesManager = managerFilter === "all" || call.uploaded_by_user_uuid === managerFilter;
    const matchesSearch = !query || callSearchText(call).includes(query);
    const callTime = call.display_time || call.occurred_at || call.created_at;
    const matchesPeriod = isWithinPeriod(callTime, periodFilter);
    const matchesCompany = companyFilter === "all" || call.company_uuid === companyFilter;
    const matchesDepartment = departmentFilter === "all" || call.department_uuid === departmentFilter;
    const matchesSource = sourceFilter === "all" || (sourceFilter === "manual" ? !call.source_provider : call.source_provider === sourceFilter);
    const matchesConnection = connectionFilter === "all" || call.connection_uuid === connectionFilter;
    const matchesDurationMin = durationMin === "" || call.duration_seconds >= Number(durationMin);
    const matchesDurationMax = durationMax === "" || call.duration_seconds <= Number(durationMax);
    const matchesAnalysis = analysisFilter === "all" || Boolean(call.has_analysis ?? analyses[call.id]) === (analysisFilter === "yes");
    const matchesActions = actionsFilter === "all" || Boolean(call.has_actions) === (actionsFilter === "yes");
    const matchesError = !processingErrorOnly || call.status === "failed" || Boolean(call.ingest_error_code);

    return matchesScope && matchesStatus && matchesManager && matchesSearch && matchesPeriod && matchesCompany && matchesDepartment && matchesSource && matchesConnection && matchesDurationMin && matchesDurationMax && matchesAnalysis && matchesActions && matchesError;
  }

  useEffect(() => {
    if (companies.length > 0 || folderForm.scope === "personal") return;
    setFolderForm((current) => ({ ...current, scope: "personal", company_uuid: "", department_uuid: "" }));
  }, [companies.length, folderForm.scope]);

  useEffect(() => {
    if (companies.length === 0) {
      setParticipantFilter("all");
      setManagerFilter("all");
    }
    if (companyFilter !== "all" && !companies.some((company) => company.id === companyFilter)) {
      setCompanyFilter("all");
      setDepartmentFilter("all");
      setConnectionFilter("all");
      return;
    }
    if (departmentFilter !== "all" && !departments.some((department) =>
      department.id === departmentFilter && (companyFilter === "all" || department.company_uuid === companyFilter)
    )) {
      setDepartmentFilter("all");
    }
  }, [companies, departments, companyFilter, departmentFilter]);

  useEffect(() => {
    if (connectionFilter !== "all" && filterOptions && !filterOptions.connections.some((connection) => connection.id === connectionFilter)) {
      setConnectionFilter("all");
    }
  }, [connectionFilter, filterOptions]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const values: Record<string, string | undefined> = {
      q: searchQuery.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      scope: effectiveScopeFilter === "all" ? undefined : effectiveScopeFilter,
      uploaded_by_user_uuid: managerFilter === "all" ? undefined : managerFilter,
      period: periodFilter === "all" ? undefined : periodFilter,
      company_uuid: companyFilter === "all" ? undefined : companyFilter,
      department_uuid: departmentFilter === "all" ? undefined : departmentFilter,
      participant_user_uuid: participantFilter === "all" ? undefined : participantFilter,
      source_provider: sourceFilter === "all" ? undefined : sourceFilter,
      connection_uuid: connectionFilter === "all" ? undefined : connectionFilter,
      occurred_from: occurredFrom || undefined,
      occurred_to: occurredTo || undefined,
      duration_min_seconds: durationMin || undefined,
      duration_max_seconds: durationMax || undefined,
      has_analysis: analysisFilter === "all" ? undefined : analysisFilter,
      has_actions: actionsFilter === "all" ? undefined : actionsFilter,
      has_processing_error: processingErrorOnly ? "true" : undefined,
      favorite_only: favoriteOnly ? "true" : undefined,
      sort: sortFilter === "occurred_at" ? undefined : sortFilter,
      order: sortOrder === "desc" ? undefined : sortOrder,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [searchQuery, statusFilter, effectiveScopeFilter, managerFilter, periodFilter, companyFilter, departmentFilter, participantFilter, sourceFilter, connectionFilter, occurredFrom, occurredTo, durationMin, durationMax, analysisFilter, actionsFilter, processingErrorOnly, favoriteOnly, sortFilter, sortOrder]);

  useEffect(() => {
    if (filterValidationError) {
      setFiltersError(filterValidationError);
      setServerCalls(null);
      setNextCallsCursor(null);
      setFiltersLoading(false);
      return;
    }

    let cancelled = false;
	const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setFiltersLoading(true);
      setFiltersError("");
      setNextCallsCursor(null);
      api
        .listCalls({ ...filterInput, limit: 50 }, controller.signal)
        .then((response) => {
          if (!cancelled) {
            setServerCalls(Array.isArray(response) ? response : response.items);
            setNextCallsCursor(Array.isArray(response) ? null : response.next_cursor ?? null);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setServerCalls([]);
          setFiltersError("Не удалось применить фильтры. Проверьте значения и повторите.");
        })
        .finally(() => {
          if (!cancelled) setFiltersLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
	  controller.abort();
      window.clearTimeout(timer);
    };
  }, [filterValidationError, searchQuery, statusFilter, effectiveScopeFilter, managerFilter, periodFilter, companyFilter, departmentFilter, participantFilter, sourceFilter, connectionFilter, occurredFrom, occurredTo, durationMin, durationMax, analysisFilter, actionsFilter, processingErrorOnly, favoriteOnly, sortFilter, sortOrder, callsRefreshKey, restoredCallsToken]);

  function renderSidebarCallRow(call: CallResponse, folderId?: string) {
    const selected = selectedCallId === call.id;
    const open = openCallMenuId === call.id;
    const isFavorite = favoriteCallIds.includes(call.id);
    const selectCallFromRow = () => {
      if (folderId) {
        selectFolderCall(call.id, folderId);
      } else {
        selectUnfiledCall(call.id);
      }
      setMobileSidebarOpen(false);
    };

    return (
      <div
        key={folderId ? `${folderId}-${call.id}` : call.id}
        className={`call-row ${selected ? "selected" : ""} ${open ? "menu-open" : ""}`}
        role="button"
        tabIndex={0}
        onClick={selectCallFromRow}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectCallFromRow();
        }}
      >
        <span className="play-dot">
          <Play size={14} fill="currentColor" />
        </span>
        <span className="call-row-main">
          <StatusChip transcriptionOnly={call.transcription_only} status={call.status} analysisStatus={call.is_test ? undefined : analyses[call.id]?.status} label={call.is_test ? "Тестовый" : undefined} />
          <strong>{call.title}</strong>
          <small>
            {formatDate(call.display_time || call.occurred_at || call.created_at)} · {formatDuration(call.duration_seconds)}
            {call.time_source === "upload_fallback" ? " · время загрузки" : ""}
          </small>
          {call.source_provider && <small className="call-source-line">{call.source_provider === "bitrix24" ? "Bitrix24" : "API"}{call.external_call_id ? ` · #${call.external_call_id}` : ""}</small>}
        </span>
        <span
          className="call-row-actions"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {!call.is_test && <button className={`icon-button call-favorite-button ${isFavorite ? "active" : ""}`} type="button" aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"} disabled={callBusyId === call.id} onClick={() => void toggleFavoriteCall(call.id)}><Star size={15} fill={isFavorite ? "currentColor" : "none"} /></button>}
          <button
            className="icon-button call-row-menu-trigger"
            type="button"
            aria-label="Действия со звонком"
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={callBusyId === call.id}
            onClick={() => toggleCallMenu(call.id)}
          >
            <MoreVertical size={16} />
          </button>
          {open && (
            <span className="call-row-menu" role="menu">
              {!call.is_test && <button type="button" role="menuitem" onClick={() => startCallRename(call)}>
                <Pencil size={15} />
                Переименовать
              </button>}
              <button
                className="danger"
                type="button"
                role="menuitem"
                disabled={!onDeleteCall || callBusyId === call.id}
                onClick={() => requestCallDelete(call)}
              >
                <Trash2 size={15} />
                Удалить
              </button>
            </span>
          )}
        </span>
      </div>
    );
  }

  const pendingDeleteCopy = pendingDelete
    ? pendingDelete.type === "folder"
      ? {
        title: "Удалить папку?",
        message: `Папка «${pendingDelete.folder.name}» будет удалена. Звонки останутся в системе и не будут удалены.`
      }
      : {
        title: "Удалить звонок?",
        message: `Звонок «${pendingDelete.call.title}» попадёт в корзину на 30 дней. После этого запись и файлы удаляются безвозвратно.`
      }
    : null;
  const pendingDeleteBusy = pendingDelete
    ? pendingDelete.type === "folder"
      ? folderBusyId === pendingDelete.folder.id
      : callBusyId === pendingDelete.call.id
    : false;

  return (
    <section className={`calls-layout atmospheric-page ${callListCollapsed ? "call-list-collapsed" : ""}`}>
      <aside
        id="mobile-call-drawer"
        className={`calls-sidebar mobile-call-drawer glass custom-scroll-target ${mobileSidebarOpen ? "open" : ""}`}
        ref={callsSidebarScrollRef}
        aria-label="Звонки, фильтры и папки"
        aria-hidden={callListCollapsed ? true : undefined}
        inert={callListCollapsed}
      >
        <button
          className="icon-button calls-list-collapse"
          type="button"
          aria-label="Свернуть список звонков"
          aria-expanded={!callListCollapsed}
          onClick={toggleCallList}
        >
          <PanelLeftClose size={19} />
        </button>
        <div className="panel-heading">
          <div>
            <h2>Звонки</h2>
            <p>Фильтры и детали выбранного звонка.</p>
          </div>
          <div className="mobile-call-drawer-heading-actions">
            <button className="primary-button small" onClick={() => onNavigate("upload")}>
              <CloudUpload size={16} />
              Загрузить звонок
            </button>
            <button
              className="icon-button mobile-call-drawer-close"
              type="button"
              aria-label="Закрыть звонки и фильтры"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <X size={19} />
            </button>
          </div>
        </div>
        <div className="calls-filter-bar">
          <input
            aria-label="Поиск звонка"
            placeholder="Поиск по названию"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            className={`ghost-button call-filter-toggle ${filtersExpanded ? "active" : ""}`}
            type="button"
            aria-expanded={filtersExpanded}
            aria-controls="call-advanced-filters"
            onClick={() => setFiltersExpanded((value) => !value)}
          >
            <Filter size={16} />
            Фильтры{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        </div>
        {activeFilterChips.length > 0 && <div className="call-filter-chips" aria-label="Активные фильтры">
          {activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} aria-label={`Убрать фильтр: ${chip.label}`}>
            <span>{chip.label}</span>
            <X size={13} aria-hidden="true" />
          </button>)}
        </div>}
        <div className={`call-filters-reveal ${filtersExpanded ? "expanded" : ""}`} aria-hidden={!filtersExpanded} inert={!filtersExpanded}>
          <div className="call-filters-reveal-inner">
        <section className="call-advanced-filters" id="call-advanced-filters" aria-label="Расширенные фильтры звонков">
          <div className="call-filter-section-heading">
            <div><strong>Найти нужные звонки</strong><small>Все параметры применяются только к доступным вам звонкам.</small></div>
            {filtersChanged && <button className="text-button" type="button" onClick={resetFilters}>Сбросить всё</button>}
          </div>
          <div className="call-filter-grid">
            <label><span>Статус</span><SelectControl aria-label="Статус" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CallStatus | "all")}><option value="all">Все статусы</option><option value="new">Новые</option><option value="processing">В обработке</option><option value="transcribed">Расшифрованы</option><option value="analyzed">Анализ готов</option><option value="failed">Ошибки</option></SelectControl></label>
            {companies.length > 0 && <label><span>Сотрудник</span><SelectControl aria-label="Сотрудник" value={participantFilter} onChange={(event) => setParticipantFilter(event.target.value)}><option value="all">Все сотрудники</option>{participantOptions.map((member) => <option key={member.user_uuid} value={member.user_uuid}>{[member.full_surname, member.full_name].filter(Boolean).join(" ") || member.username || "Пользователь"}</option>)}</SelectControl></label>}
            {companies.length > 0 && <label><span>Компания</span><SelectControl aria-label="Компания" value={companyFilter} onChange={(event) => { const companyId = event.target.value; setCompanyFilter(companyId); setDepartmentFilter("all"); setConnectionFilter("all"); }}><option value="all">Все компании</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectControl></label>}
            {companies.length > 0 && <label><span>Отдел</span><SelectControl aria-label="Отдел" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">Все отделы</option>{departments.filter((department) => companyFilter === "all" || department.company_uuid === companyFilter).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectControl></label>}
            {companies.length > 0 && <label><span>Загрузил</span><SelectControl aria-label="Загрузил" value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}><option value="all">Любой пользователь</option>{managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{managerLabel(manager, session)}</option>)}</SelectControl></label>}
            <label><span>Источник</span><SelectControl aria-label="Источник" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}><option value="all">Все источники</option><option value="manual">Ручная загрузка</option><option value="generic_api">API</option><option value="bitrix24">Bitrix24</option></SelectControl></label>
            <label><span>Подключение</span><SelectControl aria-label="Подключение" value={connectionFilter} onChange={(event) => setConnectionFilter(event.target.value)}><option value="all">Все подключения</option>{connectionOptions.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}{connection.provider === "bitrix24" ? " · Bitrix24" : ""}</option>)}</SelectControl></label>
            <label><span>Быстрый период</span><SelectControl aria-label="Период" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as "all" | "7d" | "30d")}><option value="all">Все даты</option><option value="7d">Последние 7 дней</option><option value="30d">Последние 30 дней</option></SelectControl></label>
            <label><span>Разговор с</span><DateTimePicker mode="date" placement="right-center" ariaLabel="Дата начала периода" value={occurredFrom} onChange={(value) => { setOccurredFrom(value); setPeriodFilter("all"); }} /></label>
            <label><span>Разговор до</span><DateTimePicker mode="date" placement="right-center" ariaLabel="Дата окончания периода" value={occurredTo} onChange={(value) => { setOccurredTo(value); setPeriodFilter("all"); }} /></label>
            <label><span>Длительность от, сек.</span><DurationFilterInput label="Длительность от, сек." value={durationMin} onChange={setDurationMin} /></label>
            <label><span>Длительность до, сек.</span><DurationFilterInput label="Длительность до, сек." value={durationMax} onChange={setDurationMax} /></label>
            <label><span>Анализ</span><SelectControl aria-label="Наличие анализа" value={analysisFilter} onChange={(event) => setAnalysisFilter(event.target.value as typeof analysisFilter)}><option value="all">Не важно</option><option value="yes">Есть анализ</option><option value="no">Без анализа</option></SelectControl></label>
            <label><span>Действия</span><SelectControl aria-label="Наличие действий" value={actionsFilter} onChange={(event) => setActionsFilter(event.target.value as typeof actionsFilter)}><option value="all">Не важно</option><option value="yes">Есть действия</option><option value="no">Без действий</option></SelectControl></label>
            <label><span>Сортировка</span><SelectControl aria-label="Сортировка" value={sortFilter} onChange={(event) => setSortFilter(event.target.value as typeof sortFilter)}><option value="occurred_at">Время разговора</option><option value="created_at">Время импорта</option><option value="duration">Длительность</option></SelectControl></label>
            <label><span>Порядок</span><SelectControl aria-label="Порядок сортировки" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}><option value="desc">Сначала новые / длинные</option><option value="asc">Сначала старые / короткие</option></SelectControl></label>
          </div>
          <label className="call-filter-check"><input type="checkbox" checked={processingErrorOnly} onChange={(event) => setProcessingErrorOnly(event.target.checked)} /><span>Только звонки с ошибкой обработки</span></label>
          {filtersError && <p className="call-filter-error" role="alert">{filtersError}</p>}
        </section>
          </div>
        </div>
        <label className={`call-favorite-filter ${favoriteOnly ? "checked" : ""}`}>
          <input
            className="call-favorite-filter-input"
            type="checkbox"
            checked={favoriteOnly}
            onChange={(event) => setFavoriteOnly(event.target.checked)}
          />
          <span className="call-favorite-filter-box" aria-hidden="true">
            {favoriteOnly && <Check size={12} strokeWidth={3} />}
          </span>
          <span>Только избранные</span>
        </label>
        <div className="call-scope-tabs segmented scope">
          {scopeOptions.map(([value, label]) => (
            <button
              key={value}
              className={effectiveScopeFilter === value ? "active" : ""}
              onClick={() => setScopeFilter(value as VisibilityScope | "all")}
            >
              {label}
            </button>
          ))}
        </div>
        <section className="call-folder-panel">
          <div className="call-folder-heading">
            <div>
              <strong>Папки</strong>
              <small>{foldersLoading ? "Загружаю..." : `${visibleFolders.length} доступно`}</small>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Создать папку"
              onClick={startFolderCreate}
            >
              <Plus size={16} />
            </button>
          </div>
          {folderError && <div className="form-error compact">{folderError}</div>}
          {callActionError && !editingCall && <div className="form-error compact">{callActionError}</div>}
          <div className="call-folder-tree">
            {visibleFolders.map((folder) => {
              const expanded = Boolean(expandedFolderIds[folder.id]);
              const folderCalls = (folderCallsById[folder.id] ?? []).filter(matchesSidebarFilters).filter((call) => !favoriteOnly || favoriteCallIds.includes(call.id));
              const folderLoading = folderCallsLoading && !folderCallsById[folder.id];

              return (
                <div className={`call-folder-project ${expanded ? "expanded" : ""}`} key={folder.id}>
                  <div className="call-folder-project-head">
                    <button
                      className="call-folder-project-button"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggleFolder(folder.id)}
                    >
                      {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <span
                        className="folder-color-dot"
                        style={{ "--folder-color": folder.color || "#ff7a43" } as React.CSSProperties}
                      />
                      <span>
                        <strong title={folder.name}>{folder.name}</strong>
                        <small>
                          {folderScopeLabel(folder)} · {folder.calls_count} звонков · {folder.instructions?.length ?? 0} инструкций
                        </small>
                      </span>
                    </button>
                    {canManageFolder(folder) && <div
                      className="call-folder-actions"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <button
                        className="icon-button call-folder-menu-trigger"
                        type="button"
                        aria-label="Действия с папкой"
                        aria-haspopup="menu"
                        aria-expanded={openFolderMenuId === folder.id}
                        disabled={folderBusyId === folder.id}
                        onClick={() => toggleFolderMenu(folder.id)}
                      >
                        <MoreHorizontal size={17} />
                      </button>
                      {openFolderMenuId === folder.id && (
                        <span className="call-row-menu call-folder-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => startFolderEdit(folder)}>
                            <Pencil size={15} />
                            Переименовать
                          </button>
                          <button
                            className="danger"
                            type="button"
                            role="menuitem"
                            disabled={folderBusyId === folder.id}
                            onClick={() => requestFolderDelete(folder)}
                          >
                            <Trash2 size={15} />
                            Удалить
                          </button>
                        </span>
                      )}
                    </div>}
                  </div>
                  {expanded && (
                    <div className="call-folder-child-list">
                      {(folder.instructions?.length ?? 0) > 0 && (
                        <div className="folder-instruction-chips call-folder-tree-instructions" aria-label="Инструкции папки">
                          {folder.instructions.map((instruction) => (
                            <span key={instruction.id}>{instruction.title}</span>
                          ))}
                        </div>
                      )}
                      {folderLoading ? (
                        <div className="call-folder-child-empty">Загружаю звонки...</div>
                      ) : folderCalls.length === 0 ? (
                        <div className="call-folder-child-empty">Нет звонков по текущим фильтрам.</div>
                      ) : (
                        folderCalls.map((call) => renderSidebarCallRow(call, folder.id))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!foldersLoading && visibleFolders.length === 0 && (
              <div className="empty-state compact">Папок для выбранной области пока нет.</div>
            )}
          </div>
        </section>
        <CallsBinPanel
          onRestored={() => {
            setRestoredCallsToken((value) => value + 1);
            void refreshFolders();
          }}
        />
        <p className="muted-title">Без папки</p>
        <div className="call-list">
          {(loading || filtersLoading || folderCallsLoading) && <CallListSkeleton count={4} />}
          {!loading && !filtersLoading && !folderCallsLoading &&
            callsWithoutVisibleFolder.filter((call) => !favoriteOnly || favoriteCallIds.includes(call.id)).map((call) => renderSidebarCallRow(call))}
          {!loading && !filtersLoading && !folderCallsLoading && callsWithoutVisibleFolder.length === 0 && (
            <div className="empty-state">{calls.length === 0 ? "Звонков пока нет." : "Звонков без папки по фильтрам нет."}</div>
          )}
        </div>
        {nextCallsCursor && !filtersLoading && (
          <button className="ghost-button wide calls-load-more" type="button" disabled={loadingMoreCalls} onClick={() => void loadMoreCalls()}>
            {loadingMoreCalls ? "Загружаю…" : "Показать ещё звонки"}
            <ChevronDown size={16} />
          </button>
        )}
        <button className="ghost-button wide calls-show-all" type="button" onClick={resetFilters} disabled={!filtersChanged}>
          {filtersChanged ? "Показать все звонки" : "Все звонки показаны"}
          <ChevronRight size={16} />
        </button>
      </aside>
      <button
        className="icon-button calls-list-collapse calls-list-emblem"
        type="button"
        aria-label="Открыть список звонков"
        aria-controls="mobile-call-drawer"
        aria-expanded={!callListCollapsed}
        title="Открыть список звонков"
        onClick={toggleCallList}
      >
        <span aria-hidden="true"><ChevronRight size={21} /></span>
      </button>
      <button
        className={`mobile-call-drawer-backdrop ${mobileSidebarOpen ? "open" : ""}`}
        type="button"
        aria-label="Закрыть звонки и фильтры"
        tabIndex={mobileSidebarOpen ? 0 : -1}
        onClick={() => setMobileSidebarOpen(false)}
      />
      {!callListCollapsed && <CustomScrollbar targetRef={callsSidebarScrollRef} className="mobile-call-drawer-scroll-thumb" />}

      <section className="call-overview glass custom-scroll-target" ref={callOverviewScrollRef}>
        <CallDetailPanel
          call={selectedCall}
          currentUserId={session.user.id}
          companies={companies}
          departments={departments}
          transcription={transcription}
          analysis={analysis}
          timelineStatuses={selectedCallTimeline}
          loading={loading}
          loadingDetails={loadingDetails}
          onNavigate={onNavigate}
          onAnalysisReady={onAnalysisReady}
          onDeleteCall={onDeleteCall ? deleteCallAndSync : undefined}
          onOpenTranscriptionEditor={onOpenTranscriptionEditor}
          onOpenRevisionComparison={onOpenRevisionComparison}
          folders={callFolders}
          activeFolder={selectedCallActionFolder}
          folderActionBusy={Boolean(folderBusyId)}
          onAssignToFolder={assignCallToFolder}
          onRemoveFromFolder={removeCallFromFolder}
          drawerTrigger={<MobileCallDrawerTrigger open={mobileSidebarOpen} onToggle={() => setMobileSidebarOpen((current) => !current)} />}
          showReports
        />
      </section>
      <CustomScrollbar targetRef={callOverviewScrollRef} />
      {folderEditorOpen && createPortal(
        <div
          className="call-folder-modal-layer"
          role="presentation"
          onPointerDown={(event) => {
            if (!folderBusyId && event.target === event.currentTarget) cancelFolderEdit();
          }}
        >
          <form
            className="call-folder-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingFolderId ? "Редактировать папку" : "Новая папка"}
            onSubmit={(event) => {
              event.preventDefault();
              void submitFolderForm();
            }}
          >
            <div className="call-folder-modal-head">
              <div>
                <strong>{editingFolderId ? "Редактировать папку" : "Новая папка"}</strong>
                <small>Папка группирует звонки и используется как фильтр.</small>
              </div>
              <button className="icon-button" type="button" aria-label="Закрыть окно папки" onClick={cancelFolderEdit}>
                <X size={17} />
              </button>
            </div>
            {folderError && <div className="form-error compact">{folderError}</div>}
            <div className="call-folder-form modal-form">
              {!editingFolderId && (
                <fieldset className="call-folder-scope-picker">
                  <legend>Куда добавить папку?</legend>
                  <div className="call-folder-scope-options">
                    {([
                      { scope: "personal", title: "Личная", hint: "Только ваши звонки", icon: UserRound },
                      ...(managedCompanyIds.size > 0
                        ? [
                            { scope: "company", title: "Компания", hint: "Для всей компании", icon: Building2 },
                          ]
                        : [])
                      ,...(manageableDepartments.length > 0
                        ? [{ scope: "department", title: "Отдел", hint: "Для выбранного отдела", icon: UsersRound }]
                        : [])
                    ] as Array<{ scope: VisibilityScope; title: string; hint: string; icon: typeof UserRound }>).map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          className={folderForm.scope === option.scope ? "active" : ""}
                          type="button"
                          key={option.scope}
                          aria-pressed={folderForm.scope === option.scope}
                          onClick={() => selectFolderScope(option.scope)}
                        >
                          <Icon size={18} />
                          <span><strong>{option.title}</strong><small>{option.hint}</small></span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              {!editingFolderId && folderForm.scope !== "personal" && (
                <label className="call-folder-scope-field">
                  <span>Компания</span>
                  <SelectControl
                    aria-label="Компания папки"
                  value={folderForm.company_uuid}
                  onChange={(event) => {
                    const companyId = event.target.value;
                    const departmentId = departments.find((department) => department.company_uuid === companyId)?.id ?? "";
                    setFolderForm((current) => ({
                      ...current,
                      company_uuid: companyId,
                      department_uuid: current.scope === "department" ? departmentId : ""
                    }));
                  }}
                  >
                    <option value="">Выберите компанию</option>
                    {companies.filter((company) => folderForm.scope === "company"
                      ? managedCompanyIds.has(company.id)
                      : manageableDepartments.some((department) => department.company_uuid === company.id)).map((company) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </SelectControl>
                </label>
              )}
              {!editingFolderId && folderForm.scope === "department" && (
                <label className="call-folder-scope-field">
                  <span>Отдел</span>
                  <SelectControl
                    aria-label="Отдел папки"
                  value={folderForm.department_uuid}
                  onChange={(event) => setFolderForm((current) => ({ ...current, department_uuid: event.target.value }))}
                  >
                    <option value="">Выберите отдел</option>
                    {formDepartmentOptions.filter((department) => manageableDepartments.some((item) => item.id === department.id)).map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </SelectControl>
                </label>
              )}
              <input
                aria-label="Название папки"
                placeholder="Название папки"
                value={folderForm.name}
                maxLength={120}
                onChange={(event) => setFolderForm((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                aria-label="Описание папки"
                placeholder="Описание"
                value={folderForm.description}
                maxLength={1000}
                onChange={(event) => setFolderForm((current) => ({ ...current, description: event.target.value }))}
              />
              <div className="call-folder-color-picker" aria-label="Цвет папки">
                <div className="call-folder-color-picker-head">
                  <span>Цвет папки</span>
                  <span
                    className="folder-color-dot preview"
                    style={{ "--folder-color": folderForm.color || folderPalette[0] } as React.CSSProperties}
                  />
                </div>
                <div className="call-folder-palette" role="radiogroup" aria-label="Выбор цвета папки">
                  {folderPalette.map((color) => (
                    <button
                      className={folderForm.color === color ? "active" : ""}
                      key={color}
                      type="button"
                      role="radio"
                      aria-label={`Цвет ${color}`}
                      aria-checked={folderForm.color === color}
                      onClick={() => setFolderForm((current) => ({ ...current, color }))}
                      style={{ "--folder-color": color } as React.CSSProperties}
                    >
                      <span />
                    </button>
                  ))}
                </div>
              </div>
              <fieldset className="call-folder-instructions">
                <legend>Инструкции папки</legend>
                <small>Они автоматически применятся к каждому новому звонку в этой папке.</small>
                {folderInstructionsLoading ? (
                  <div className="instruction-empty compact" role="status">Загружаю инструкции...</div>
                ) : folderInstructionsError ? (
                  <div className="form-error compact" role="alert">{folderInstructionsError}</div>
                ) : folderInstructionOptions.length === 0 ? (
                  <div className="instruction-empty compact">Для выбранной области нет активных инструкций.</div>
                ) : (
                  <div className="call-folder-instruction-options" aria-label={`Доступные инструкции: ${folderInstructionOptions.length}`}>
                    {folderInstructionOptions.map((instruction) => (
                      <label key={instruction.id}>
                        <input
                          type="checkbox"
                          checked={folderForm.instruction_uuids.includes(instruction.id)}
                          onChange={() => setFolderForm((current) => ({
                            ...current,
                            instruction_uuids: current.instruction_uuids.includes(instruction.id)
                              ? current.instruction_uuids.filter((id) => id !== instruction.id)
                              : [...current.instruction_uuids, instruction.id]
                          }))}
                        />
                        <span title={instruction.original_filename}>{instruction.original_filename}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <div className="call-folder-form-actions">
                <button
                  className="primary-button small"
                  type="submit"
                  disabled={folderBusyId === "create" || (Boolean(editingFolderId) && folderBusyId === editingFolderId)}
                >
                  <Check size={15} />
                  {editingFolderId ? "Сохранить" : "Создать"}
                </button>
                <button className="ghost-button small" type="button" onClick={cancelFolderEdit}>
                  Отмена
                </button>
              </div>
            </div>
          </form>
        </div>,
        document.querySelector<HTMLElement>(".app-shell") ?? document.body
      )}
      {editingCall && (
        <div
          className="call-folder-modal-layer"
          role="presentation"
          onPointerDown={(event) => {
            if (!callBusyId && event.target === event.currentTarget) cancelCallRename();
          }}
        >
          <form
            className="call-folder-modal call-title-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Переименовать звонок"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCallRename();
            }}
          >
            <div className="call-folder-modal-head">
              <div>
                <strong>Переименовать звонок</strong>
                <small>{editingCall.original_filename}</small>
              </div>
              <button className="icon-button" type="button" aria-label="Закрыть окно переименования" onClick={cancelCallRename}>
                <X size={17} />
              </button>
            </div>
            {callActionError && <div className="form-error compact">{callActionError}</div>}
            <label className="call-title-field">
              Название звонка
              <div className="input-with-counter">
                <input
                  value={callTitleDraft}
                  maxLength={255}
                  autoFocus
                  onChange={(event) => setCallTitleDraft(event.target.value)}
                />
                <span>{callTitleDraft.length} / 255</span>
              </div>
            </label>
            <div className="call-title-modal-actions">
              <button
                className="primary-button small"
                type="submit"
                disabled={callBusyId === editingCall.id || !callTitleDraft.trim()}
              >
                <Check size={15} />
                Сохранить
              </button>
              <button className="ghost-button small" type="button" onClick={cancelCallRename}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingDeleteCopy && (
        <ConfirmDialog
          open
          variant="danger"
          title={pendingDeleteCopy.title}
          message={pendingDeleteCopy.message}
          confirmLabel="Удалить"
          busy={pendingDeleteBusy}
          onCancel={() => {
            if (!pendingDeleteBusy) setPendingDelete(null);
          }}
          onConfirm={() => void confirmPendingDelete()}
        />
      )}
    </section>
  );
}

type PendingDelete =
  | { type: "call"; call: CallResponse }
  | { type: "folder"; folder: CallFolderResponse }
  | null;

type FolderFormState = {
  scope: VisibilityScope;
  company_uuid: string;
  department_uuid: string;
  name: string;
  description: string;
  color: string;
  instruction_uuids: string[];
};

const folderPalette = [
  "#FF7A43",
  "#F45B69",
  "#B45CFF",
  "#5B7CFA",
  "#2F9BFF",
  "#21A6A1",
  "#5EBC6E",
  "#F0B84A",
  "#A88768",
  "#8B98A8"
];

type FolderPayloadResult =
  | { ok: true; value: CreateCallFolderRequest | UpdateCallFolderRequest }
  | { ok: false; error: string };

function emptyFolderForm(): FolderFormState {
  return {
    scope: "personal",
    company_uuid: "",
    department_uuid: "",
    name: "",
    description: "",
    color: folderPalette[0]
    ,instruction_uuids: []
  };
}

function buildFolderPayload(
  form: FolderFormState,
  mode: "create" | "update"
): FolderPayloadResult {
  const name = form.name.trim();
  const description = form.description.trim();
  const color = form.color.trim();

  if (!name) return { ok: false, error: "Введите название папки." };
  if (name.length > 120) return { ok: false, error: "Название папки должно быть до 120 символов." };
  if (description.length > 1000) return { ok: false, error: "Описание папки должно быть до 1000 символов." };
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { ok: false, error: "Цвет должен быть в формате #RRGGBB." };
  }

  if (mode === "update") {
    return {
      ok: true,
      value: {
        name,
        description: description || null,
        color: color || null
        ,instruction_uuids: form.instruction_uuids
      }
    };
  }

  if (form.scope === "company" && !form.company_uuid) {
    return { ok: false, error: "Для папки компании выберите компанию." };
  }

  if (form.scope === "department" && (!form.company_uuid || !form.department_uuid)) {
    return { ok: false, error: "Для папки отдела выберите компанию и отдел." };
  }

  return {
    ok: true,
    value: {
      scope: form.scope,
      company_uuid: form.scope === "personal" ? null : form.company_uuid,
      department_uuid: form.scope === "department" ? form.department_uuid : null,
      name,
      description: description || null,
      color: color || null
      ,instruction_uuids: form.instruction_uuids
    }
  };
}

function DurationFilterInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  function step(direction: number) {
    if (!input.current) return;
    if (direction > 0) input.current.stepUp(); else input.current.stepDown();
    onChange(input.current.value);
  }
  return <div className="call-duration-control">
    <input ref={input} aria-label={label} inputMode="numeric" min="0" step="1" type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    <div className="call-duration-arrows">
      <button className="icon-button" type="button" aria-label={`Увеличить: ${label}`} onClick={() => step(1)}><ChevronUp size={14} /></button>
      <button className="icon-button" type="button" aria-label={`Уменьшить: ${label}`} disabled={value !== "" && Number(value) <= 0} onClick={() => step(-1)}><ChevronDown size={14} /></button>
    </div>
  </div>;
}
