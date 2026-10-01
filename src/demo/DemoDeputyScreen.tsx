import { useEffect, useState } from "react";
import type { AppTheme } from "../app/runtime";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { InstructionsPage } from "../features/instructions/InstructionsPage";
import { AuthenticatedShell } from "../features/layout/AuthenticatedShell";
import { isDemoCommand, type DemoEvent } from "./bridge";
import { deputyScreen, type DeputyFixture, type DeputyPage } from "./fixtures/deputy";
import { createScenarioPlayer } from "./scenario";
import { deputyScenario } from "./scenarios/deputy";

const noop = () => undefined;

/**
 * The deputy's monitor: the real shell over the company they run — its
 * departments, its people and the instructions calls are graded by — on fixture
 * data. The parent page starts and stops the scenario through postMessage.
 */
export function DemoDeputyScreen({ fixture, autoplay }: { fixture: DeputyFixture; autoplay: boolean }) {
  const [page, setPage] = useState<DeputyPage>("companies");
  const theme: AppTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

  // The scenario turns the pages: a caption and the page under it change together.
  useEffect(() => {
    deputyScreen.show = setPage;
    return () => {
      deputyScreen.show = () => undefined;
    };
  }, []);

  useEffect(() => {
    const parent = window.parent !== window ? window.parent : null;
    const post = (event: DemoEvent) => parent?.postMessage(event, window.location.origin);
    const player = createScenarioPlayer(deputyScenario, post);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isDemoCommand(event.data)) return;
      if (event.data.type === "vt-demo:play") player.play();
      else player.pause();
    };
    window.addEventListener("message", onMessage);
    post({ type: "vt-demo:ready", role: "deputy" });
    if (autoplay) player.play();
    return () => {
      window.removeEventListener("message", onMessage);
      player.destroy();
    };
  }, [autoplay]);

  return (
    <AuthenticatedShell
      activePage={page === "instructions" ? "settingsInstructions" : "settingsCompanies"}
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
      onOpenCall={noop}
      onOpenCompany={noop}
      onOpenNotification={noop}
      onOpenLanding={noop}
      onToggleTheme={noop}
      onLogout={noop}
    >
      {page === "instructions" ? (
        <InstructionsPage
          session={fixture.session}
          instructions={fixture.instructions}
          companies={fixture.companies}
          departments={fixture.departments}
          departmentMembers={fixture.departmentMembers}
          loading={false}
          onBackToSettings={noop}
        />
      ) : (
        <CompaniesPage
          session={fixture.session}
          companies={fixture.companies}
          departments={fixture.departments}
          departmentMembers={fixture.departmentMembers}
          calls={fixture.calls}
          companySubscriptions={fixture.companySubscriptions}
          loading={false}
          onBackToSettings={noop}
          selectedCompanyId={fixture.companyId}
          selectedDepartmentId=""
          onCompanyCreated={noop}
          onDepartmentCreated={noop}
          onCompanyLeft={noop}
          onNavigate={noop}
          onOpenCompany={noop}
          onOpenDepartment={noop}
          onInvitationCreated={noop}
        />
      )}
    </AuthenticatedShell>
  );
}
