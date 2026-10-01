import { ownerScreen } from "../fixtures/owner";
import type { Step } from "../scenario";
import { focusPortraitMonitor } from "../monitor-viewport";

// The demo document scrolls as a whole — the shell's header is sticky and the
// workspace is not a scroller of its own — so the loop rewinds the window.
const toTop = () => { if (!focusPortraitMonitor("owner", "smooth")) window.scrollTo({ top: 0, behavior: "smooth" }); };

const transferForm = ".data-transfer-form";

/**
 * What the owner does on their monitor while the camera watches: fills the free
 * slot of the business plan with a new company, opens the branch they are
 * closing and freezes it, then moves its calls and instruction folders into the
 * company that stays. The caption ids are the ones the landing shows beside the
 * monitor; every write here really changes the screen and is wound back before
 * the next loop.
 */
export const ownerScenario: Step[] = [
  { kind: "caption", id: null },
  { kind: "run", fn: () => { ownerScreen.reset(); toTop(); } },
  { kind: "wait", ms: 900 },

  { kind: "caption", id: "companies" },
  { kind: "move", target: { selector: ".company-limit-row", text: "Северный ветер Юг" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 700 },
  { kind: "type", target: ".create-company-form.compact input", text: "Северный ветер Восток" },
  { kind: "wait", ms: 400 },
  { kind: "click", target: ".create-company-form.compact .primary-button" },
  { kind: "wait", ms: 1200 },
  { kind: "move", target: { selector: ".company-limit-row", text: "Северный ветер Восток" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 800 },

  { kind: "caption", id: "freeze" },
  { kind: "click", target: { selector: ".company-limit-row", text: "Северный ветер Юг" } },
  { kind: "wait", ms: 600 },
  { kind: "click", target: ".company-detail-panel .primary-button" },
  { kind: "wait", ms: 1300 },
  { kind: "move", target: ".company-state-row", at: [0.22, 0.4] },
  { kind: "wait", ms: 700 },
  { kind: "click", target: { selector: ".company-state-actions button", text: "Заморозить" } },
  { kind: "wait", ms: 800 },
  { kind: "click", target: ".confirm-dialog .primary-button" },
  { kind: "wait", ms: 1300 },
  { kind: "move", target: ".company-state-row", at: [0.22, 0.4] },
  { kind: "wait", ms: 900 },

  { kind: "caption", id: "transfer" },
  { kind: "move", target: { selector: ".company-list-panel h2", text: "Перенос данных" }, at: [0.3, 0.5] },
  { kind: "wait", ms: 400 },
  { kind: "click", target: `${transferForm} .select-trigger` },
  { kind: "wait", ms: 600 },
  { kind: "click", target: { selector: ".select-menu button", text: "Северный ветер", index: 0 } },
  { kind: "wait", ms: 500 },
  { kind: "type", target: `${transferForm} input[placeholder]`, text: "Закрываем филиал" },
  { kind: "wait", ms: 400 },
  { kind: "click", target: `${transferForm} .primary-button` },
  { kind: "wait", ms: 800 },
  { kind: "click", target: ".confirm-dialog .primary-button" },
  { kind: "wait", ms: 1300 },
  { kind: "move", target: `${transferForm} .form-success`, at: [0.3, 0.5] },
  { kind: "wait", ms: 1200 },

  { kind: "caption", id: null },
  { kind: "wait", ms: 800 }
];
