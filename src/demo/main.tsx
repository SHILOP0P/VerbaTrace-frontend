import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "../styles/index.css";
import { installFrameGuards } from "./frame-guards";
import { installMemoryStorage } from "./memory-storage";
import { installEmployeeFixtures } from "./fixtures/employee";
import { installLeaderFixtures } from "./fixtures/leader";
import { installDeputyFixtures } from "./fixtures/deputy";
import { installOwnerFixtures } from "./fixtures/owner";
import { DemoEmployeeScreen } from "./DemoEmployeeScreen";
import { DemoLeaderScreen } from "./DemoLeaderScreen";
import { DemoDeputyScreen } from "./DemoDeputyScreen";
import { DemoOwnerScreen } from "./DemoOwnerScreen";
import type { DemoRole } from "./bridge";
import { setInitialMonitorView } from "./monitor-viewport";

// The screen is a picture of the product for the landing: the real components
// on fixture data, with no server, no session and no writes that outlive it.
installMemoryStorage();
installFrameGuards();

const params = new URLSearchParams(window.location.search);
const autoplay = params.get("autoplay") === "1";
const role = (params.get("role") ?? "employee") as DemoRole;

// The theme is not handled here. This document and the landing share an origin,
// so the landing sets the attribute on it directly, in the same frame as its
// own — a message would arrive a frame late and the sweep would be in two
// halves. Nothing is remounted either way, so the recording carries on.

function screenFor(value: DemoRole) {
  switch (value) {
    case "leader":
      return <DemoLeaderScreen fixture={installLeaderFixtures()} autoplay={autoplay} />;
    case "deputy":
      return <DemoDeputyScreen fixture={installDeputyFixtures()} autoplay={autoplay} />;
    case "owner":
      return <DemoOwnerScreen fixture={installOwnerFixtures()} autoplay={autoplay} />;
    default:
      return <DemoEmployeeScreen fixture={installEmployeeFixtures()} autoplay={autoplay} />;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{screenFor(role)}</StrictMode>
);
setInitialMonitorView(role);
