import { useCallback, useEffect, useState } from "react";
import type { AppTheme } from "../app/runtime";
import { AnalyticsPage } from "../features/analytics/AnalyticsPage";
import { AuthenticatedShell } from "../features/layout/AuthenticatedShell";
import { QualityReviewsPage } from "../features/quality-reviews/QualityReviewsPage";
import type { AppPage } from "../types";
import { isDemoCommand, type DemoEvent } from "./bridge";
import type { LeaderFixture } from "./fixtures/leader";
import { createScenarioPlayer } from "./scenario";
import { leaderScenario } from "./scenarios/leader";

const noop = () => undefined;

const TEAM_PATH = "/app/analytics";
const PROFILE_PATH = /^\/app\/analytics\/employees\/([^/]+)/;

/** The employee the address points at; the analytics page opens a profile by pushing it. */
function profileFromLocation() {
  const match = PROFILE_PATH.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * The department leader's monitor: the real shell with the real team analytics
 * and quality review pages on fixture data. The parent page starts and stops
 * the scenario through postMessage.
 */
export function DemoLeaderScreen({ fixture, autoplay }: { fixture: LeaderFixture; autoplay: boolean }) {
  const [page, setPage] = useState<"teamAnalytics" | "qualityReviews">("teamAnalytics");
  const [profileUserId, setProfileUserId] = useState<string | undefined>(() => profileFromLocation());
  const theme: AppTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

  // The analytics page opens and closes a profile through the address, so the
  // screen follows the address instead of reaching into the page.
  useEffect(() => {
    const follow = () => setProfileUserId(profileFromLocation());
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);

  const navigate = useCallback((next: AppPage) => {
    if (next === "qualityReviews") {
      setPage("qualityReviews");
      return;
    }
    // Every other section of the sidebar is out of this demo; the leader's
    // monitor stays on the two pages it was built for.
    if (next !== "teamAnalytics" && next !== "teamAnalyticsEmployee") return;
    if (window.location.pathname !== TEAM_PATH) window.history.replaceState({}, "", TEAM_PATH);
    setProfileUserId(undefined);
    setPage("teamAnalytics");
  }, []);

  useEffect(() => {
    const parent = window.parent !== window ? window.parent : null;
    const post = (event: DemoEvent) => parent?.postMessage(event, window.location.origin);
    const player = createScenarioPlayer(leaderScenario, post);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !isDemoCommand(event.data)) return;
      if (event.data.type === "vt-demo:play") player.play();
      else player.pause();
    };
    window.addEventListener("message", onMessage);
    post({ type: "vt-demo:ready", role: "leader" });
    if (autoplay) player.play();
    return () => {
      window.removeEventListener("message", onMessage);
      player.destroy();
    };
  }, [autoplay]);

  return (
    <AuthenticatedShell
      activePage={page === "teamAnalytics" && profileUserId ? "teamAnalyticsEmployee" : page}
      session={fixture.session}
      theme={theme}
      calls={fixture.calls}
      companies={fixture.companies}
      personalSubscription={null}
      companySubscriptions={fixture.companySubscriptions}
      invitationCount={0}
      pendingInvitationIds={[]}
      adminCapabilities={null}
      onNavigate={navigate}
      onOpenCall={noop}
      onOpenCompany={noop}
      onOpenNotification={noop}
      onOpenLanding={noop}
      onToggleTheme={noop}
      onLogout={noop}
    >
      {page === "qualityReviews" ? (
        <QualityReviewsPage onOpen={noop} />
      ) : (
        <AnalyticsPage
          departments={fixture.departments}
          profileUserId={profileUserId}
          onNavigate={navigate}
          onOpenCall={noop}
        />
      )}
    </AuthenticatedShell>
  );
}
