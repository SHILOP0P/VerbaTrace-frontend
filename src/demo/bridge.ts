/**
 * The protocol between the landing (the parent page with the 3D office) and a
 * demo screen (the iframe on a monitor). The screen owns the scenario: it moves
 * its own cursor, presses its own keys and reports every move up, so the hand
 * and the mouse in the scene follow one source of truth.
 */
export type DemoRole = "employee" | "leader" | "deputy" | "owner";

/**
 * Parent → screen. The theme is not in here: the two documents share an origin,
 * so the landing sets it on this one directly and both change in one frame.
 */
export type DemoCommand =
  | { type: "vt-demo:play" }
  | { type: "vt-demo:pause" };

/** Screen → parent. */
export type DemoEvent =
  | { type: "vt-demo:ready"; role: DemoRole }
  /** The cursor in screen fractions (0..1 across, 0..1 down) and whether a button is held. */
  | { type: "vt-demo:cursor"; x: number; y: number; down: boolean }
  | { type: "vt-demo:typing"; active: boolean }
  /** The caption the scene should show next to the monitor, or none. */
  | { type: "vt-demo:caption"; id: string | null }
  | { type: "vt-demo:loop" };

const commandTypes = new Set(["vt-demo:play", "vt-demo:pause"]);
const eventTypes = new Set(["vt-demo:ready", "vt-demo:cursor", "vt-demo:typing", "vt-demo:caption", "vt-demo:loop"]);

function messageType(value: unknown) {
  return value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string"
    ? (value as { type: string }).type
    : "";
}

export function isDemoCommand(value: unknown): value is DemoCommand {
  return commandTypes.has(messageType(value));
}

export function isDemoEvent(value: unknown): value is DemoEvent {
  return eventTypes.has(messageType(value));
}
