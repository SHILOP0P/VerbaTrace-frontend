import { deputyScreen } from "../fixtures/deputy";
import type { Step } from "../scenario";
import { focusPortraitMonitor } from "../monitor-viewport";

// The demo document scrolls as a whole — the shell's header is sticky and the
// workspace is not a scroller of its own — so the loop rewinds the window.
const toTop = () => { if (!focusPortraitMonitor("deputy", "smooth")) window.scrollTo({ top: 0, behavior: "smooth" }); };

/**
 * What the deputy does on their monitor while the camera watches: reads the
 * company they run — its departments and who is in them — answers what waits
 * for their word and invites a newcomer, then opens the instructions the AI
 * grades calls by and switches one on. The caption ids are the ones the landing
 * shows beside the monitor.
 */
export const deputyScenario: Step[] = [
  { kind: "caption", id: null },
  { kind: "run", fn: () => deputyScreen.show("companies") },
  { kind: "run", fn: toTop },
  { kind: "wait", ms: 900 },

  { kind: "caption", id: "structure" },
  { kind: "move", target: { selector: ".company-card h2", text: "Отделы" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 900 },
  { kind: "move", target: { selector: ".company-mini-card.department-link", text: "Отдел продаж" }, at: [0.35, 0.5] },
  { kind: "wait", ms: 900 },
  { kind: "move", target: { selector: ".company-card h2", text: "Участники компании" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 800 },
  { kind: "move", target: { selector: ".company-member-row", text: "Кузнецов" }, at: [0.28, 0.5] },
  { kind: "wait", ms: 1100 },
  { kind: "move", target: { selector: ".company-member-row", text: "Панова" }, at: [0.62, 0.5] },
  { kind: "wait", ms: 1200 },

  { kind: "caption", id: "invitations" },
  { kind: "move", target: { selector: ".company-mini-card", text: "Волкова" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 1400 },
  { kind: "move", target: { selector: ".invitation-create h2" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 600 },
  { kind: "type", target: ".invitation-create input[placeholder='@muxa']", text: "@d.sokolov" },
  { kind: "wait", ms: 600 },
  { kind: "click", target: ".invitation-create .primary-button" },
  { kind: "wait", ms: 1800 },

  { kind: "caption", id: "instructions" },
  { kind: "run", fn: () => { deputyScreen.show("instructions"); toTop(); } },
  { kind: "wait", ms: 1000 },
  { kind: "move", target: { selector: ".instructions-catalog-head h2" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 900 },
  { kind: "move", target: { selector: ".instruction-item-name", text: "Демонстрация продукта" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 1100 },
  { kind: "click", target: { selector: ".instruction-switch", text: "Отключена" } },
  { kind: "wait", ms: 1600 },
  { kind: "move", target: { selector: ".instructions-help-card strong" }, at: [0.4, 0.5] },
  { kind: "wait", ms: 1500 },
  { kind: "click", target: { selector: ".instruction-switch", index: 1 } },
  { kind: "wait", ms: 1200 },

  { kind: "caption", id: null },
  { kind: "run", fn: () => deputyScreen.show("companies") },
  { kind: "wait", ms: 900 }
];
