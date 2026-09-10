import { useEffect, useMemo, useState } from "react";
import { api, ApiError, openAuthorizedEventStream } from "./api";
import type {
  AnalysisInstruction,
  AnalysisResponse,
  AppPage,
  CallResponse,
  CallStatus,
  CompanyResponse,
  DepartmentMemberResponse,
  DepartmentResponse,
  Invitation,
  NotificationResponse,
  SessionState,
  Subscription,
  TranscriptionResponse,
  UserResponse,
  AdminCapabilitiesResponse
} from "./types";

import {
  companyIdFromPath,
  departmentIdFromPath,
  pageFromPath,
} from "./app/runtime";
import { callIdFromLocation, pageUrl } from "./app/location";
import { useTheme } from "./app/use-theme";
import { loadOrganizationContext, loadWorkspaceContext } from "./app/workspace-loader";
import { AnalysisPage } from "./features/analysis/AnalysisPage";
import { CallsPage } from "./features/calls/CallsPage";
import { TranscriptionEditPage } from "./features/calls/TranscriptionEditPage";
import { TranscriptionComparePage } from "./features/calls/TranscriptionComparePage";
import { CompaniesPage } from "./features/companies/CompaniesPage";
import { CreateCompanyPage } from "./features/companies/CreateCompanyPage";
import { ActionDetailPage, ActionsPage } from "./features/actions/ActionsPage";
import { ContactsPage } from "./features/contacts/ContactsPage";
import { InstructionsPage } from "./features/instructions/InstructionsPage";
import { InstructionHistoryPage } from "./features/instructions/InstructionHistoryPage";
import { InstructionComparePage } from "./features/instructions/InstructionComparePage";
import { NewInstructionPage } from "./features/instructions/NewInstructionPage";
import { InvitationsPage } from "./features/invitations/InvitationsPage";
import { Landing } from "./features/landing/Landing";
import { AuthenticatedShell } from "./features/layout/AuthenticatedShell";
import { MonitoringPage } from "./features/monitoring/MonitoringPage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
import { OverviewPage } from "./features/overview/OverviewPage";
import { DevicesPage, ProfileEditPage, ProfilePage } from "./features/profile/ProfilePage";
import { AiReportsPage } from "./features/reports/AiReportsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { PrivacySettingsPage } from "./features/settings/PrivacySettingsPage";
import { TariffsPage } from "./features/tariffs/TariffsPage";
import { IntegrationsPage } from "./features/integrations/IntegrationsPage";
import { UploadPage } from "./features/upload/UploadPage";
import { AdminPage } from "./features/admin/AdminPage";
import { QualityReviewsPage } from "./features/quality-reviews/QualityReviewsPage";
import { QualityReviewPage } from "./features/quality-reviews/QualityReviewPage";
import { SupportAccessDecisionDialog } from "./features/support-access/SupportAccessDecisionDialog";
import {
  nextTimelineStatuses,
  parseCallStatusEvent,
  timelineFromStatus
} from "./shared/lib/call-status";
import { useAuth } from "./features/auth/AuthProvider";

const callsRefreshIntervalMs = 5_000;

function App() {
  const { session, ready: authReady, setAuthenticatedUser, clearSession } = useAuth();
  const [adminCapabilities, setAdminCapabilities] = useState<AdminCapabilitiesResponse | null>(null);
  const [showPublicLanding, setShowPublicLanding] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [page, setPage] = useState<AppPage>(() => pageFromPath(window.location.pathname));
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => companyIdFromPath(window.location.pathname));
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(() => departmentIdFromPath(window.location.pathname));
  const [calls, setCalls] = useState<CallResponse[]>([]);
  const [companies, setCompanies] = useState<CompanyResponse[]>([]);
  const [departments, setDepartments] = useState<DepartmentResponse[]>([]);
  const [departmentMembers, setDepartmentMembers] = useState<DepartmentMemberResponse[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [instructions, setInstructions] = useState<AnalysisInstruction[]>([]);
  const [personalSubscription, setPersonalSubscription] = useState<Subscription | null>(null);
  const [companySubscriptions, setCompanySubscriptions] = useState<Record<string, Subscription | null>>({});
  const [transcriptions, setTranscriptions] = useState<Record<string, TranscriptionResponse>>({});
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResponse>>({});
  const [callTimelines, setCallTimelines] = useState<Record<string, CallStatus[]>>({});
  const [selectedCallId, setSelectedCallId] = useState<string>(() => callIdFromLocation());
  const [loadingWorkspace, setLoadingWorkspace] = useState(() => Boolean(session));
  const [loadingCallDetails, setLoadingCallDetails] = useState<Record<string, boolean>>({});
	const [supportAccessRequestId,setSupportAccessRequestId]=useState("");
  const { theme: activeTheme, toggleTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setAdminCapabilities(null);
      return;
    }
    api.getAdminCapabilities()
      .then((value) => {
        if (!cancelled) setAdminCapabilities(value.permissions.includes("admin.panel.access") ? value : null);
      })
      .catch(() => {
        if (!cancelled) setAdminCapabilities(null);
      });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (!authReady) return;
    const requestedAppPage = window.location.pathname.startsWith("/app");
    setWorkspaceReady(true);
    if (session) {
      setShowPublicLanding(!requestedAppPage);
      setLoadingWorkspace(true);
      return;
    }
    setShowPublicLanding(true);
    if (requestedAppPage) {
      window.history.replaceState({}, "", "/");
      setPage(pageFromPath("/"));
      setSelectedCompanyId("");
      setSelectedDepartmentId("");
    }
  }, [authReady, session]);

  useEffect(() => {
    const legacyProfileRoutes: Record<string, string> = {
      "/app/settings/profile": "/app/profile",
      "/app/settings/profile/edit": "/app/profile/edit",
      "/app/profile/devices": "/app/settings/devices",
      "/app/devices": "/app/settings/devices"
    };
    const replacement = legacyProfileRoutes[window.location.pathname];
    if (replacement) {
      window.history.replaceState({}, "", replacement);
      setPage(pageFromPath(replacement));
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPage(pageFromPath(window.location.pathname));
      setSelectedCompanyId(companyIdFromPath(window.location.pathname));
      setSelectedDepartmentId(departmentIdFromPath(window.location.pathname));
      setSelectedCallId(callIdFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      if (!authReady) return;

      if (!session) {
        clearWorkspaceState();
        setWorkspaceReady(true);
        setLoadingWorkspace(false);
        return;
      }

      setWorkspaceReady(true);
      setLoadingWorkspace(true);

      try {
        const loaded = await loadWorkspaceContext();

        if (cancelled) return;

        setCalls(loaded.calls);
        setCallTimelines(
          loaded.calls.reduce<Record<string, CallStatus[]>>((timelines, call) => {
            timelines[call.id] = timelineFromStatus(call.status);
            return timelines;
          }, {})
        );
        setCompanies(loaded.companies);
        setDepartments(loaded.departments);
        setDepartmentMembers(loaded.departmentMembers);
        setInvitations(loaded.invitations);
        setInstructions(loaded.instructions);
        setPersonalSubscription(loaded.personalSubscription);
        setCompanySubscriptions(loaded.companySubscriptions);
        setSelectedCallId((current) =>
          current && loaded.calls.some((call) => call.id === current)
            ? current
            : loaded.calls[0]?.id ?? ""
        );
        setWorkspaceReady(true);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          returnToLanding();
        } else {
          setWorkspaceReady(true);
        }
      } finally {
        if (!cancelled) setLoadingWorkspace(false);
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, [authReady, session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    let refreshing = false;

    async function refreshCalls() {
      if (refreshing) return;
      refreshing = true;

      try {
        const response = await api.listCalls();
        if (cancelled) return;

        const refreshedCalls = Array.isArray(response) ? response : response.items;
        setCalls((current) => {
          const previousById = new Map(current.map((call) => [call.id, call]));
          return refreshedCalls.map((call) => {
            const previous = previousById.get(call.id);
            if (!previous) return call;
            return {
              ...previous,
              ...call,
              privacy: call.privacy ?? previous.privacy
            };
          });
        });
        setCallTimelines((current) =>
          refreshedCalls.reduce<Record<string, CallStatus[]>>((timelines, call) => {
            timelines[call.id] = nextTimelineStatuses(
              current[call.id] ?? timelineFromStatus(call.status),
              call.status
            );
            return timelines;
          }, {})
        );
        setSelectedCallId((current) =>
          current && refreshedCalls.some((call) => call.id === current)
            ? current
            : refreshedCalls[0]?.id ?? ""
        );
      } catch {
        // Keep the last known list when a background refresh is temporarily unavailable.
      } finally {
        refreshing = false;
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshCalls();
    }

    void refreshCalls();
    const refreshTimer = window.setInterval(() => void refreshCalls(), callsRefreshIntervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [session]);

  const selectedCall = useMemo(
    () => calls.find((call) => call.id === selectedCallId) ?? calls[0],
    [calls, selectedCallId]
  );
  const selectedCallDetailsLoading = selectedCall ? Boolean(loadingCallDetails[selectedCall.id]) : false;
  const selectedCallTimeline = selectedCall ? callTimelines[selectedCall.id] : undefined;

  useEffect(() => {
    if (!session || !selectedCall) return;

    let cancelled = false;
    const callId = selectedCall.id;

    setLoadingCallDetails((current) => ({
      ...current,
      [callId]: true
    }));

    Promise.allSettled([
      api.getCall(callId),
      api.getTranscription(callId),
      api.getAnalysis(callId)
    ])
      .then(([callResult, transcriptionResult, analysisResult]) => {
        if (cancelled) return;

        if (callResult.status === "fulfilled") {
          setCalls((current) => current.map((item) => item.id === callId ? callResult.value : item));
        }

        if (transcriptionResult.status === "fulfilled") {
          setTranscriptions((current) => ({
            ...current,
            [callId]: transcriptionResult.value
          }));
        }

        if (analysisResult.status === "fulfilled") {
          setAnalyses((current) => ({
            ...current,
            [callId]: analysisResult.value
          }));
        }
      })
      .finally(() => {
        if (cancelled) return;

        setLoadingCallDetails((current) => ({
          ...current,
          [callId]: false
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCall?.id, selectedCall?.status, session]);

  useEffect(() => {
    if (!session || !selectedCall) return;

    const callId = selectedCall.id;
    const source = openAuthorizedEventStream(api.callEventsUrl(callId));
    let closed = false;

    function closeStream() {
      if (closed) return;
      closed = true;
      source.close();
    }

    source.addEventListener("status", (event) => {
      const statusEvent = parseCallStatusEvent(event);
      if (!statusEvent || statusEvent.call_id !== callId) return;

      setCalls((current) =>
        current.map((call) =>
          call.id === callId && call.status !== statusEvent.status
            ? { ...call, status: statusEvent.status }
            : call
        )
      );
      setCallTimelines((current) => ({
        ...current,
        [callId]: nextTimelineStatuses(
          current[callId] ?? timelineFromStatus(statusEvent.status),
          statusEvent.status
        )
      }));

      if (statusEvent.terminal) closeStream();
    });

    source.addEventListener("error", (event) => {
      if (event instanceof MessageEvent && typeof event.data === "string") {
        closeStream();
      }
    });

    return closeStream;
  }, [session, selectedCall?.id]);

  useEffect(() => {
    const callId = selectedCall?.id;
    if (!callId || !session || !["pending", "processing"].includes(analyses[callId]?.status ?? "")) return;
    let cancelled = false;
    let refreshing = false;
    const timer = window.setInterval(async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [analysis, call] = await Promise.all([api.getAnalysis(callId), api.getCall(callId)]);
        if (!cancelled) {
          setAnalyses((current) => ({ ...current, [callId]: analysis }));
          setCalls((current) => current.map((item) => item.id === callId ? call : item));
        }
      } catch { /* Keep the last result; a transient request failure can be retried. */ }
      finally { refreshing = false; }
    }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session, selectedCall?.id, analyses[selectedCall?.id ?? ""]?.status]);

  function navigate(nextPage: AppPage) {
    setShowPublicLanding(false);
    setPage(nextPage);
    setSelectedCompanyId("");
    setSelectedDepartmentId("");
    window.history.pushState({}, "", pageUrl(nextPage, selectedCallId));
  }

  function openQualityReview(reviewId: string) {
    setShowPublicLanding(false);
    setPage("qualityReview");
    window.history.pushState({}, "", `/app/quality-reviews/${encodeURIComponent(reviewId)}`);
  }

  function selectCall(callId: string) {
    setSelectedCallId(callId);
    if (page === "calls" || page === "analysis") {
      window.history.replaceState({}, "", pageUrl(page, callId));
    }
  }

  function openCallPage(callId: string, nextPage: AppPage = "calls") {
    setShowPublicLanding(false);
    setPage(nextPage);
    setSelectedCompanyId("");
    setSelectedDepartmentId("");
    setSelectedCallId(callId);
    window.history.pushState({}, "", pageUrl(nextPage, callId));
  }

  function openTranscriptionComparison(callId: string, revision?: number) {
    setShowPublicLanding(false);
    setSelectedCallId(callId);
    setPage("transcriptionCompare");
    const query = new URLSearchParams({ call: callId });
    if (revision) query.set("version", String(revision));
    window.history.pushState({}, "", `/app/calls/transcription-compare?${query}`);
  }

  function openTranscriptionEditor(callId: string) {
    setShowPublicLanding(false);
    setSelectedCallId(callId);
    setPage("transcriptionEdit");
    window.history.pushState({}, "", `/app/calls/transcription-edit?call=${encodeURIComponent(callId)}`);
  }

  function openInstructionComparison(instructionId: string, versionIds: string[]) {
    setShowPublicLanding(false);
    setPage("instructionCompare");
    const query = new URLSearchParams({ versions: versionIds.join(",") });
    window.history.pushState({}, "", `/app/instructions/${encodeURIComponent(instructionId)}/compare?${query}`);
  }

  function openCompany(companyId: string) {
    setShowPublicLanding(false);
    setPage("settingsCompanies");
    setSelectedCompanyId(companyId);
    setSelectedDepartmentId("");
    window.history.pushState({}, "", `/app/settings/companies/${encodeURIComponent(companyId)}`);
  }

  function openNotificationTarget(notification: NotificationResponse) {
	if(notification.entity_type==="support_access_request"&&notification.entity_uuid){setSupportAccessRequestId(notification.entity_uuid);return}
	if(notification.entity_type==="action_external_sync"&&notification.entity_uuid){api.getActionExternalSyncRequest(notification.entity_uuid).then((sync)=>{window.history.pushState({},"",`/app/actions/${encodeURIComponent(sync.action_uuid)}`);window.dispatchEvent(new PopStateEvent("popstate"))}).catch(()=>navigate("actions"));return}
    if (notification.entity_type === "call" && notification.entity_uuid) {
      openCallPage(notification.entity_uuid);
      return;
    }
    if (notification.entity_type === "company" && notification.entity_uuid) {
      openCompany(notification.entity_uuid);
      return;
    }
    if (notification.entity_type === "call_action" && notification.entity_uuid) {
      window.history.pushState({}, "", `/app/actions/${encodeURIComponent(notification.entity_uuid)}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    if (notification.type === "invitation") navigate("settingsInvitations");
    else if (notification.entity_type === "report") navigate("reports");
    else if (notification.entity_type === "instruction") navigate("settingsInstructions");
  }

  function openDepartment(companyId: string, departmentId: string) {
    setShowPublicLanding(false);
    setPage("settingsCompanies");
    setSelectedCompanyId(companyId);
    setSelectedDepartmentId(departmentId);
    window.history.pushState(
      {},
      "",
      `/app/settings/companies/${encodeURIComponent(companyId)}/departments/${encodeURIComponent(departmentId)}`
    );
  }

  function applySession(nextSession: SessionState) {
    setAuthenticatedUser(nextSession.user);
    setWorkspaceReady(true);
    setLoadingWorkspace(true);
    navigate("overview");
  }

  function updateSessionUser(user: UserResponse) {
    setAuthenticatedUser(user);
  }

  async function logout() {
    if (session) {
      await api.logout().catch(() => undefined);
    }
    clearSession();
    clearWorkspaceState();
    setWorkspaceReady(true);
    setShowPublicLanding(true);
    window.history.pushState({}, "", "/");
    setPage("calls");
  }

  async function logoutAllSessions() {
    if (session) {
      await api.logoutAll();
    }
    clearSession();
    clearWorkspaceState();
    setWorkspaceReady(true);
    setShowPublicLanding(true);
    window.history.pushState({}, "", "/");
    setPage("calls");
  }

  function openLanding() {
    setShowPublicLanding(true);
    window.history.pushState({}, "", "/");
  }

  function getStarted() {
    if (session) {
      navigate("overview");
      return;
    }

    setShowPublicLanding(true);
  }

  function clearWorkspaceState() {
    setCalls([]);
    setCompanies([]);
    setDepartments([]);
    setDepartmentMembers([]);
    setInvitations([]);
    setInstructions([]);
    setPersonalSubscription(null);
    setCompanySubscriptions({});
    setTranscriptions({});
    setAnalyses({});
    setCallTimelines({});
    setLoadingCallDetails({});
    setSelectedCallId("");
  }

  function returnToLanding() {
    clearSession();
    clearWorkspaceState();
    setWorkspaceReady(true);
    setShowPublicLanding(true);
    window.history.replaceState({}, "", "/");
    setPage("calls");
  }

  async function refreshOrganizationContext() {
    const loaded = await loadOrganizationContext();
    setCompanies(loaded.companies);
    setDepartments(loaded.departments);
    setDepartmentMembers(loaded.departmentMembers);
    setInstructions(loaded.instructions);
    setCompanySubscriptions(loaded.companySubscriptions);
  }

  async function deleteCall(callId: string) {
    await api.deleteCall(callId);

    setCalls((current) => {
      const nextCalls = current.filter((call) => call.id !== callId);
      setSelectedCallId((selectedId) => {
        if (selectedId !== callId) return selectedId;
        const nextCallId = nextCalls[0]?.id ?? "";
        if (page === "calls" || page === "analysis") {
          window.history.replaceState({}, "", pageUrl(page, nextCallId));
        }
        return nextCallId;
      });
      return nextCalls;
    });
    setTranscriptions((current) => {
      const { [callId]: _removed, ...rest } = current;
      return rest;
    });
    setAnalyses((current) => {
      const { [callId]: _removed, ...rest } = current;
      return rest;
    });
    setCallTimelines((current) => {
      const { [callId]: _removed, ...rest } = current;
      return rest;
    });
    setLoadingCallDetails((current) => {
      const { [callId]: _removed, ...rest } = current;
      return rest;
    });
  }

  async function updateCallTitle(callId: string, title: string) {
    const updatedCall = await api.updateCallTitle(callId, title);
    setCalls((current) => current.map((call) => (call.id === callId ? updatedCall : call)));
    return updatedCall;
  }

  if (!authReady) {
    return (
      <main className="landing preflight-screen" aria-label="Проверка сессии">
        <div className="landing-bg" />
      </main>
    );
  }

  if (!session || showPublicLanding) {
    return (
      <Landing
        session={session}
        theme={activeTheme}
        onAuth={applySession}
        onGetStarted={getStarted}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (!workspaceReady) {
    return (
      <main className="landing preflight-screen" aria-label="Проверка сессии">
        <div className="landing-bg" />
      </main>
    );
  }

  return (
    <AuthenticatedShell
      activePage={page}
      session={session}
      theme={activeTheme}
      calls={calls}
      companies={companies}
      personalSubscription={personalSubscription}
      companySubscriptions={companySubscriptions}
      invitationCount={invitations.filter((invitation) => invitation.status === "pending").length}
      pendingInvitationIds={invitations.filter((invitation) => invitation.status === "pending").map((invitation) => invitation.id)}
      adminCapabilities={adminCapabilities}
      onNavigate={navigate}
      onOpenCall={(callId) => {
        openCallPage(callId);
      }}
      onOpenCompany={openCompany}
	  onOpenNotification={openNotificationTarget}
      onOpenLanding={openLanding}
      onToggleTheme={toggleTheme}
      onLogout={logout}
    >
      {page === "overview" && (
          <OverviewPage
            calls={calls}
            callsVersion={calls.map((call) => `${call.id}:${call.status}:${call.created_at}`).join("|")}
          />
      )}

      {page === "calls" && (
        <CallsPage
          calls={calls}
          companies={companies}
          departments={departments}
          departmentMembers={departmentMembers}
          selectedCall={selectedCall}
          selectedCallId={selectedCallId}
          selectedCallTimeline={selectedCallTimeline}
          transcription={selectedCall ? transcriptions[selectedCall.id] : undefined}
          analysis={selectedCall ? analyses[selectedCall.id] : undefined}
          analyses={analyses}
          session={session}
          onSelectCall={selectCall}
          onNavigate={navigate}
          onAnalysisReady={(callId, analysis) =>
            setAnalyses((current) => ({ ...current, [callId]: analysis }))
          }
          onUpdateCallTitle={updateCallTitle}
          onDeleteCall={deleteCall}
          onOpenTranscriptionEditor={openTranscriptionEditor}
          onOpenRevisionComparison={openTranscriptionComparison}
          loading={loadingWorkspace}
          loadingDetails={selectedCallDetailsLoading}
        />
      )}

      {page === "transcriptionCompare" && (
        <TranscriptionComparePage
          call={selectedCall}
          initialRevision={Number(new URLSearchParams(window.location.search).get("version")) || undefined}
          onBack={() => selectedCall ? openCallPage(selectedCall.id) : navigate("calls")}
        />
      )}

      {page === "transcriptionEdit" && (
        <TranscriptionEditPage
          call={selectedCall}
          transcription={selectedCall ? transcriptions[selectedCall.id] : undefined}
          loading={selectedCallDetailsLoading}
          onBack={() => selectedCall ? openCallPage(selectedCall.id) : navigate("calls")}
          onSaved={(transcription, reanalysisRequired) => {
            setTranscriptions((current) => ({ ...current, [transcription.call_uuid]: transcription }));
            if (reanalysisRequired) {
              setAnalyses((current) => { const next = { ...current }; delete next[transcription.call_uuid]; return next; });
              void api.getCall(transcription.call_uuid).then((updatedCall) => setCalls((current) => current.map((item) => item.id === updatedCall.id ? updatedCall : item))).catch(() => undefined);
            }
            openCallPage(transcription.call_uuid);
          }}
        />
      )}

      {page === "upload" && (
        <UploadPage
          session={session}
          companies={companies}
          departments={departments}
          departmentMembers={departmentMembers}
          instructions={instructions}
          loading={loadingWorkspace}
          onNavigate={navigate}
          onUploaded={(call, open) => {
            setCalls((current) => current.some((item) => item.id === call.id) ? current : [call, ...current]);
            setCallTimelines((current) => ({
              ...current,
              [call.id]: timelineFromStatus(call.status)
            }));
            if (open) openCallPage(call.id);
          }}
        />
      )}

      {page === "analysis" && (
        <AnalysisPage
          session={session}
          calls={calls}
          selectedCall={selectedCall}
          selectedCallId={selectedCallId}
          selectedCallTimeline={selectedCallTimeline}
          analyses={analyses}
          instructions={instructions}
          companies={companies}
          departments={departments}
          loading={loadingWorkspace}
          loadingDetails={selectedCallDetailsLoading}
          onSelectCall={selectCall}
          onAnalysisReady={(callId, analysis) =>
            setAnalyses((current) => ({
              ...current,
              [callId]: analysis
            }))
          }
          onDeleteCall={deleteCall}
          onNavigate={navigate}
        />
      )}

      {page === "reports" && (
        <AiReportsPage
          calls={calls}
          analyses={analyses}
          companies={companies}
          departments={departments}
        />
      )}

      {page === "contacts" && <ContactsPage />}

      {page === "actions" && <ActionsPage onOpen={(id) => { window.history.pushState({}, "", `/app/actions/${encodeURIComponent(id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }} />}

      {page === "notifications" && <NotificationsPage onOpen={openNotificationTarget} />}

      {page === "action" && <ActionDetailPage actionId={decodeURIComponent(window.location.pathname.split("/").at(-1) ?? "")} onBack={() => navigate("actions")} onOpenEvidence={(action,evidence)=>{setShowPublicLanding(false);setPage("calls");setSelectedCompanyId("");setSelectedDepartmentId("");setSelectedCallId(action.call_uuid);const query=new URLSearchParams({call:action.call_uuid});if(typeof evidence.word_start_index==="number")query.set("evidence_start",String(evidence.word_start_index));if(typeof evidence.word_end_index==="number")query.set("evidence_end",String(evidence.word_end_index));if(typeof evidence.start_seconds==="number")query.set("evidence_time",String(evidence.start_seconds));if(typeof evidence.end_seconds==="number")query.set("evidence_end_time",String(evidence.end_seconds));window.history.pushState({},"",`/app/calls?${query}`)}} />}

      {page === "qualityReviews" && <QualityReviewsPage onOpen={openQualityReview} />}

      {page === "qualityReview" && <QualityReviewPage reviewId={decodeURIComponent(window.location.pathname.split("/").at(-1) ?? "")} onBack={() => navigate("qualityReviews")} />}

      {page === "instructionHistory" && (() => { const parts = window.location.pathname.split("/"); const callId = decodeURIComponent(parts[3] ?? ""); const analysisId = decodeURIComponent(parts[5] ?? ""); const versionId = decodeURIComponent(parts[7] ?? ""); return <InstructionHistoryPage analysisId={analysisId} versionId={versionId} session={session} companies={companies} departmentMembers={departmentMembers} onCompare={openInstructionComparison} onBack={() => { window.history.pushState({}, "", `/app/calls?call=${encodeURIComponent(callId)}`); window.dispatchEvent(new PopStateEvent("popstate")); }} />; })()}

      {page === "instruction" && <InstructionHistoryPage instructionId={decodeURIComponent(window.location.pathname.split("/").at(-1) ?? "")} session={session} companies={companies} departmentMembers={departmentMembers} onCompare={openInstructionComparison} onBack={() => navigate("settingsInstructions")} />}

      {page === "instructionCompare" && (() => { const id = decodeURIComponent(window.location.pathname.split("/")[3] ?? ""); return <InstructionComparePage instructionId={id} onBack={() => { window.history.pushState({}, "", `/app/instructions/${encodeURIComponent(id)}`); window.dispatchEvent(new PopStateEvent("popstate")); }} />; })()}

      {page === "instructionCreate" && <NewInstructionPage session={session} companies={companies} departments={departments} departmentMembers={departmentMembers} onCancel={() => navigate("settingsInstructions")} onCreated={(instruction) => setInstructions((current) => [instruction, ...current])} />}

      {page === "monitoring" && !adminCapabilities && <AccessDeniedPage />}
      {page === "monitoring" && adminCapabilities && <MonitoringPage calls={calls} onBack={() => {
        const from = new URLSearchParams(window.location.search).get("from");
        const section = from === "companies" || from === "actions" || from === "users" ? from : "users";
        navigate("admin");
        window.history.replaceState({}, "", `/app/admin/${section}`);
      }} />}

      {page === "admin" && !adminCapabilities && <AccessDeniedPage />}
      {page === "admin" && adminCapabilities && <AdminPage capabilities={adminCapabilities} onNavigate={navigate} />}

      {page === "settings" && <SettingsPage onNavigate={navigate} />}
      {page === "settingsPrivacy" && <PrivacySettingsPage companies={companies} departments={departments} onBack={() => navigate("settings")} />}

      {page === "settingsInstructions" && (
        <InstructionsPage
          session={session}
          instructions={instructions}
          companies={companies}
          departments={departments}
          departmentMembers={departmentMembers}
          loading={loadingWorkspace}
          onBackToSettings={() => navigate("settings")}
        />
      )}

      {page === "settingsInvitations" && (
        <InvitationsPage
          invitations={invitations}
          companies={companies}
          departments={departments}
          session={session}
          loading={loadingWorkspace}
          onBackToSettings={() => navigate("settings")}
          onInvitationCreated={(invitation) =>
            setInvitations((current) =>
              invitation.invited_user_uuid === session.user.id ? [invitation, ...current] : current
            )
          }
          onInvitationAccepted={async (invitation) => {
            setInvitations((current) => current.filter((item) => item.id !== invitation.id));
            await refreshOrganizationContext().catch(() => undefined);
          }}
          onInvitationDeclined={(invitation) =>
            setInvitations((current) => current.filter((item) => item.id !== invitation.id))
          }
        />
      )}

      {page === "settingsCompanies" && (
        <CompaniesPage
          session={session}
          companies={companies}
          departments={departments}
          departmentMembers={departmentMembers}
          calls={calls}
          companySubscriptions={companySubscriptions}
          loading={loadingWorkspace}
          onBackToSettings={() => navigate("settings")}
          selectedCompanyId={selectedCompanyId}
          selectedDepartmentId={selectedDepartmentId}
          onCompanyCreated={async (company) => {
            setCompanies((current) => [company, ...current]);
            await refreshOrganizationContext().catch(() => undefined);
          }}
          onDepartmentCreated={(department) => setDepartments((current) => [department, ...current])}
          onCompanyLeft={(companyId) => {
            setCompanies((current) => current.filter((company) => company.id !== companyId));
            setDepartments((current) => current.filter((department) => department.company_uuid !== companyId));
            setSelectedCompanyId("");
            setSelectedDepartmentId("");
          }}
          onNavigate={navigate}
          onOpenCompany={openCompany}
          onOpenDepartment={openDepartment}
          onInvitationCreated={(invitation) =>
            setInvitations((current) =>
              invitation.invited_user_uuid === session.user.id ? [invitation, ...current] : current
            )
          }
          onCreateCompany={() => navigate("companyCreate")}
        />
      )}

      {page === "companyCreate" && <CreateCompanyPage onBack={() => navigate("settingsCompanies")} onCreated={async (company) => { setCompanies((current) => [company, ...current]); await refreshOrganizationContext().catch(() => undefined); openCompany(company.id); }} />}

      {page === "profile" && (
        <ProfilePage
          session={session}
          companies={companies}
          personalSubscription={personalSubscription}
          onUserUpdated={updateSessionUser}
          onCompanyCreated={async (company) => {
            setCompanies((current) => [company, ...current]);
            await refreshOrganizationContext().catch(() => undefined);
          }}
          onNavigate={navigate}
        />
      )}

      {page === "profileEdit" && (
        <ProfileEditPage
          session={session}
          onUserUpdated={updateSessionUser}
          onNavigate={navigate}
        />
      )}

      {page === "profileDevices" && (
        <DevicesPage
          onBackToProfile={() => navigate("settings")}
          onLogoutAll={logoutAllSessions}
        />
      )}

      {page === "settingsTariffs" && (
        <TariffsPage
          session={session}
          companies={companies}
          personalSubscription={personalSubscription}
          companySubscriptions={companySubscriptions}
          onPersonalSubscriptionChanged={setPersonalSubscription}
          onCompanySubscriptionChanged={(subscription) => {
            if (!subscription.company_uuid) return;
            setCompanySubscriptions((current) => ({
              ...current,
              [subscription.company_uuid as string]: subscription
            }));
          }}
          onBackToSettings={() => navigate("settings")}
        />
      )}
      {page === "settingsIntegrations" && <IntegrationsPage session={session} companies={companies} departments={departments} onBack={() => navigate("settings")} />}
	  {supportAccessRequestId?<SupportAccessDecisionDialog requestId={supportAccessRequestId} currentUserId={session.user.id} onClose={()=>setSupportAccessRequestId("")}/>:null}
    </AuthenticatedShell>
  );
}

function AccessDeniedPage() {
  return <section className="access-denied-page glass" role="alert"><span aria-hidden="true">403</span><h1>Доступ запрещён</h1><p>У вашей учётной записи нет прав для просмотра этой страницы.</p><button className="primary-button" type="button" onClick={() => { window.history.pushState({}, "", "/app"); window.dispatchEvent(new PopStateEvent("popstate")); }}>Вернуться в обзор</button></section>;
}

export default App;
