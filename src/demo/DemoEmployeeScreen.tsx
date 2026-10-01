import { useEffect, useState } from "react";
import type { AppTheme } from "../app/runtime";
import { CallsPage } from "../features/calls/CallsPage";
import { AuthenticatedShell } from "../features/layout/AuthenticatedShell";
import { timelineFromStatus } from "../shared/lib/call-status";
import { isDemoCommand, type DemoEvent } from "./bridge";
import type { EmployeeFixture } from "./fixtures/employee";
import { createScenarioPlayer } from "./scenario";
import { employeeScenario } from "./scenarios/employee";

const noop = () => undefined;

/**
 * The employee's monitor: the real shell and the real calls page on fixture
 * data. The parent page starts and stops the scenario through postMessage.
 */
export function DemoEmployeeScreen({ fixture, autoplay }: { fixture: EmployeeFixture; autoplay: boolean }) {
  const [selectedCallId, setSelectedCallId] = useState(fixture.initialCallId);
  const selectedCall = fixture.calls.find((call) => call.id === selectedCallId);
  const theme: AppTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

  useEffect(() => {
    const parent = window.parent !== window ? window.parent : null;
    const post = (event: DemoEvent) => parent?.postMessage(event, window.location.origin);
    const player = createScenarioPlayer(employeeScenario, post);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isDemoCommand(event.data)) return;
      if (event.data.type === "vt-demo:play") player.play();
      else player.pause();
    };
    window.addEventListener("message", onMessage);
    post({ type: "vt-demo:ready", role: "employee" });
    if (autoplay) player.play();
    return () => {
      window.removeEventListener("message", onMessage);
      player.destroy();
    };
  }, [autoplay]);

  return (
    <AuthenticatedShell
      activePage="calls"
      session={fixture.session}
      theme={theme}
      calls={fixture.calls}
      companies={fixture.companies}
      personalSubscription={null}
      companySubscriptions={fixture.companySubscriptions}
      invitationCount={0}
      pendingInvitationIds={[]}
      adminCapabilities={null}
      onNavigate={noop}
      onOpenCall={setSelectedCallId}
      onOpenCompany={noop}
      onOpenNotification={noop}
      onOpenLanding={noop}
      onToggleTheme={noop}
      onLogout={noop}
    >
      <CallsPage
        calls={fixture.calls}
        companies={fixture.companies}
        departments={fixture.departments}
        departmentMembers={fixture.departmentMembers}
        selectedCall={selectedCall}
        selectedCallId={selectedCallId}
        selectedCallTimeline={selectedCall ? timelineFromStatus(selectedCall.status) : undefined}
        transcription={fixture.transcriptions[selectedCallId]}
        analysis={fixture.analyses[selectedCallId]}
        analyses={fixture.analyses}
        session={fixture.session}
        loading={false}
        loadingDetails={false}
        onSelectCall={setSelectedCallId}
        onNavigate={noop}
        onAnalysisReady={noop}
      />
    </AuthenticatedShell>
  );
}
