import type { DemoRole } from "./bridge";

/** The portrait monitor shows the ordinary responsive page at a useful scroll position. */
const focus: Record<DemoRole, string> = {
  employee: ".selected-call-title",
  leader: ".analytics-summary",
  deputy: ".company-card h2",
  owner: ".company-limit-row"
};

export function focusPortraitMonitor(role: DemoRole, behavior: ScrollBehavior = "instant") {
  if (document.documentElement.dataset.monitor !== "portrait") return false;
  const target = document.querySelector<HTMLElement>(focus[role]);
  if (!target) return false;
  // Leave room for the real sticky app header; the page itself is unchanged.
  const top = target.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

export function setInitialMonitorView(role: DemoRole) {
  if (document.documentElement.dataset.monitor !== "portrait") return;
  let tries = 0;
  const place = () => {
    if (focusPortraitMonitor(role) || ++tries >= 20) return;
    window.setTimeout(place, 150);
  };
  window.setTimeout(place, 250);
}
