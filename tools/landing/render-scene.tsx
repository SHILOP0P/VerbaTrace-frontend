import React from "react";
import { createRoot } from "react-dom/client";
import Conversation from "../../src/features/landing/Conversation";
import { ScenePoster } from "../../src/features/landing/ScenePoster";

// A standalone, unlinked QA view. The viewport contains only the sculpture.
// Capture the whole viewport; never crop a screenshot of the landing page.
const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";
const variant = params.get("variant") === "layers" ? "layers" : "ribbon";
const poster = params.get("poster") === "1";
document.documentElement.dataset.theme = theme;
document.body.style.background = theme === "dark" ? "#14100c" : "#f7f3ee";
createRoot(document.getElementById("root")!).render(poster
  ? <ScenePoster theme={theme} variant={variant} />
  : <Conversation selected={variant === "ribbon" ? 1 : 0} onSelect={() => {}} reducedMotion theme={theme} variant={variant} priority />);

// Keep the GPU buffer fresh while this QA-only view is being captured.
if (!poster) setInterval(() => window.dispatchEvent(new Event("landing-theme-ready")), 32);
