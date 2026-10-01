import type { Step } from "../scenario";

const overview = ".call-overview";

/**
 * What the employee does on their monitor while the camera watches: switches
 * between two calls, follows the player, the transcript and the analysis of the
 * analysed one, then searches the list. The caption ids are the ones the
 * landing shows beside the monitor.
 */
export const employeeScenario: Step[] = [
  { kind: "caption", id: null },
  // The search is emptied here, at the top of the loop, and not at the end of
  // it: a word that disappears while the list it filtered stays filtered looks
  // like a fault. It is typed, it stays, and the next run starts clean.
  { kind: "clear", target: ".calls-search input" },
  { kind: "run", fn: () => document.querySelector(overview)?.scrollTo({ top: 0, behavior: "smooth" }) },
  { kind: "wait", ms: 900 },
  { kind: "caption", id: "calls" },
  { kind: "move", target: { selector: ".call-list .call-row-main", text: "Повторный звонок" } },
  { kind: "click" },
  { kind: "wait", ms: 1100 },
  { kind: "move", target: { selector: ".call-list .call-row-main", text: "Согласование условий поставки" } },
  { kind: "click" },
  { kind: "wait", ms: 1300 },
  { kind: "caption", id: "player" },
  { kind: "move", target: { selector: `${overview} .privacy-media-shell` }, at: [0.42, 0.55], duration: 0.9 },
  { kind: "wait", ms: 700 },
  { kind: "move", target: { selector: `${overview} .privacy-media-shell` }, at: [0.72, 0.55], duration: 1.4 },
  { kind: "wait", ms: 900 },
  { kind: "caption", id: "transcript" },
  { kind: "move", target: { selector: `${overview} .detail-grid h3`, text: "Расшифровка" }, at: [0.5, 0.5] },
  { kind: "wait", ms: 500 },
  { kind: "scroll", target: overview, by: 260, duration: 1.2 },
  { kind: "wait", ms: 1400 },
  { kind: "caption", id: "analysis" },
  { kind: "move", target: { selector: `${overview} section.analysis-section`, text: "Итог разговора" }, at: [0.5, 0.3] },
  { kind: "wait", ms: 1500 },
  { kind: "move", target: { selector: `${overview} section.analysis-section`, text: "Что сделать в первую очередь" }, at: [0.5, 0.4] },
  { kind: "wait", ms: 1500 },
  { kind: "move", target: { selector: `${overview} section.criterion-detail-section`, text: "Чего не хватило" }, at: [0.4, 0.5] },
  { kind: "wait", ms: 1600 },
  { kind: "caption", id: "search" },
  { kind: "run", fn: () => document.querySelector(overview)?.scrollTo({ top: 0, behavior: "smooth" }) },
  { kind: "type", target: ".calls-search input", text: "поставк" },
  // Long enough to read the word in the field and the one call it left in the
  // list, with the word still there.
  { kind: "wait", ms: 2800 },
  { kind: "caption", id: null },
  { kind: "wait", ms: 900 }
];
