import { lazy, StrictMode, Suspense, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "../styles/index.css";
import { installFrameGuards } from "./frame-guards";
import { installMemoryStorage } from "./memory-storage";
import type { DemoRole } from "./bridge";
import { setInitialMonitorView } from "./monitor-viewport";

// The screen is a picture of the product for the landing: the real components
// on fixture data, with no server, no session and no writes that outlive it.
installMemoryStorage();
installFrameGuards();

const params = new URLSearchParams(window.location.search);
const autoplay = params.get("autoplay") === "1";
const role = (params.get("role") ?? "employee") as DemoRole;

function InitialMonitorView({ children }: { children: ReactNode }) {
  useEffect(() => setInitialMonitorView(role), []);
  return children;
}

// The theme is not handled here. This document and the landing share an origin,
// so the landing sets the attribute on it directly, in the same frame as its
// own — a message would arrive a frame late and the sweep would be in two
// halves. Nothing is remounted either way, so the recording carries on.

// Each iframe downloads its own role, rather than all four screens and fixtures.
// Fixtures are installed before the screen mounts and only once per document.
const DemoScreen = lazy(async () => {
  switch (role) {
    case "leader":
      {
        const [{ DemoLeaderScreen }, { installLeaderFixtures }] = await Promise.all([
          import("./DemoLeaderScreen"), import("./fixtures/leader")
        ]);
        const fixture = installLeaderFixtures();
        return { default: () => <InitialMonitorView><DemoLeaderScreen fixture={fixture} autoplay={autoplay} /></InitialMonitorView> };
      }
    case "deputy":
      {
        const [{ DemoDeputyScreen }, { installDeputyFixtures }] = await Promise.all([
          import("./DemoDeputyScreen"), import("./fixtures/deputy")
        ]);
        const fixture = installDeputyFixtures();
        return { default: () => <InitialMonitorView><DemoDeputyScreen fixture={fixture} autoplay={autoplay} /></InitialMonitorView> };
      }
    case "owner":
      {
        const [{ DemoOwnerScreen }, { installOwnerFixtures }] = await Promise.all([
          import("./DemoOwnerScreen"), import("./fixtures/owner")
        ]);
        const fixture = installOwnerFixtures();
        return { default: () => <InitialMonitorView><DemoOwnerScreen fixture={fixture} autoplay={autoplay} /></InitialMonitorView> };
      }
    default:
      {
        const [{ DemoEmployeeScreen }, { installEmployeeFixtures }] = await Promise.all([
          import("./DemoEmployeeScreen"), import("./fixtures/employee")
        ]);
        const fixture = installEmployeeFixtures();
        return { default: () => <InitialMonitorView><DemoEmployeeScreen fixture={fixture} autoplay={autoplay} /></InitialMonitorView> };
      }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<main role="status" aria-label="Загрузка рабочего места" />}>
      <DemoScreen />
    </Suspense>
  </StrictMode>
);
