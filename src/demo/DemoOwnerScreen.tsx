import { useEffect, useState } from "react";
import type { AppTheme } from "../app/runtime";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { AuthenticatedShell } from "../features/layout/AuthenticatedShell";
import type { CompanyResponse, Subscription } from "../types";
import { isDemoCommand, type DemoEvent } from "./bridge";
import { ownerScreen, type OwnerFixture } from "./fixtures/owner";
import { createScenarioPlayer } from "./scenario";
import { ownerScenario } from "./scenarios/owner";

const noop = () => undefined;

/**
 * The owner's monitor: the real companies page with the owner's powers — a free
 * slot that becomes a company, the branch they park, and the move of its calls
 * and folders into the company that stays. The parent page starts and stops the
 * scenario through postMessage.
 */
export function DemoOwnerScreen({ fixture, autoplay }: { fixture: OwnerFixture; autoplay: boolean }) {
  const [companies, setCompanies] = useState<CompanyResponse[]>(fixture.companies);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription | null>>(fixture.companySubscriptions);
  const [openCompanyId, setOpenCompanyId] = useState("");
  const theme: AppTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

  // Every loop starts from the same two companies: the created one goes, the
  // frozen one thaws and the transfer log is one line again.
  useEffect(() => {
    ownerScreen.reset = () => {
      fixture.resetData();
      setCompanies(fixture.companies);
      setSubscriptions(fixture.companySubscriptions);
      setOpenCompanyId("");
    };
    return () => {
      ownerScreen.reset = () => undefined;
    };
  }, [fixture]);

  useEffect(() => {
    const parent = window.parent !== window ? window.parent : null;
    const post = (event: DemoEvent) => parent?.postMessage(event, window.location.origin);
    const player = createScenarioPlayer(ownerScenario, post);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isDemoCommand(event.data)) return;
      if (event.data.type === "vt-demo:play") player.play();
      else player.pause();
    };
    window.addEventListener("message", onMessage);
    post({ type: "vt-demo:ready", role: "owner" });
    if (autoplay) player.play();
    return () => {
      window.removeEventListener("message", onMessage);
      player.destroy();
    };
  }, [autoplay]);

  return (
    <AuthenticatedShell
      activePage="settingsCompanies"
      session={fixture.session}
      theme={theme}
      calls={fixture.calls}
      companies={companies}
      personalSubscription={null}
      companySubscriptions={subscriptions}
      invitationCount={0}
      pendingInvitationIds={[]}
      adminCapabilities={null}
      onNavigate={noop}
      onOpenCall={noop}
      onOpenCompany={setOpenCompanyId}
      onOpenNotification={noop}
      onOpenLanding={noop}
      onToggleTheme={noop}
      onLogout={noop}
    >
      <CompaniesPage
        session={fixture.session}
        companies={companies}
        departments={fixture.departments}
        departmentMembers={fixture.departmentMembers}
        calls={fixture.calls}
        companySubscriptions={subscriptions}
        loading={false}
        onBackToSettings={noop}
        selectedCompanyId={openCompanyId}
        selectedDepartmentId=""
        // The plan covers the new company as well, which is what the list row
        // for it should say the moment it appears.
        onCompanyCreated={(company) => {
          setCompanies((current) => [...current, company]);
          setSubscriptions((current) => ({ ...current, [company.id]: fixture.subscription }));
        }}
        onDepartmentCreated={noop}
        onCompanyLeft={noop}
        onNavigate={noop}
        onOpenCompany={setOpenCompanyId}
        onOpenDepartment={noop}
        onInvitationCreated={noop}
      />
    </AuthenticatedShell>
  );
}
