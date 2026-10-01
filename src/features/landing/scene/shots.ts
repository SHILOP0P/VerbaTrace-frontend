import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";

/** Where the camera stands, what it looks at and how wide it sees. */
export type Shot = {
  position: Vector3;
  target: Vector3;
  fov: number;
};

export type ShotKey = "hero" | "employee" | "leader" | "deputy" | "owner";

/** The scenes in the order the scroll steps through them. */
export const SHOT_ORDER: ShotKey[] = ["hero", "employee", "leader", "deputy", "owner"];

/** The scenes that are somebody's monitor, and the screen each one belongs to. */
export type MonitorKey = Exclude<ShotKey, "hero">;

/** Which theme each monitor runs in, so the roles read differently. */
export const MONITOR_THEMES: Record<MonitorKey, "light" | "dark"> = {
  employee: "light",
  leader: "dark",
  deputy: "light",
  owner: "dark"
};

/**
 * What the glass shows before the live page is put over it: exactly the page's
 * own background, so the swap is invisible. Hiding the mesh instead left a dead
 * black rectangle in a room full of lit screens — and it was the very monitor
 * the camera was flying towards. Keep in step with `demo.html`.
 */
export const SCREEN_GLOW: Record<"light" | "dark", string> = {
  light: "#f4efea",
  dark: "#110e0b"
};

/**
 * The office file names an empty at every workstation, placed at the monitor
 * and turned the way the desk faces. This is the axis of that empty that
 * points from the sitter to the monitor.
 */
export const ANCHOR_FORWARD = new Vector3(0, 0, -1);

const worldPosition = new Vector3();
const worldQuaternion = new Quaternion();

/**
 * Camera behind the shoulder of whoever sits at an anchor. Kept for rooms
 * whose screen mesh is missing; the monitor scenes use `screenView`.
 */
export function overShoulder(anchor: Object3D, options: { back?: number; up?: number; side?: number; lookUp?: number; fov?: number } = {}): Shot {
  const { back = 1.25, up = 0.48, side = 0.24, lookUp = 0.02, fov = 38 } = options;
  anchor.getWorldPosition(worldPosition);
  anchor.getWorldQuaternion(worldQuaternion);
  const forward = ANCHOR_FORWARD.clone().applyQuaternion(worldQuaternion).setY(0).normalize();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const position = worldPosition.clone().addScaledVector(forward, -back).addScaledVector(right, side).add(new Vector3(0, up, 0));
  const target = worldPosition.clone().add(new Vector3(0, lookUp, 0));
  return { position, target, fov };
}

export type Viewport = { width: number; height: number };

/** Shared by the camera and the DOM captions, so their reserved space agrees. */
export function captionLayout(viewport: Viewport) {
  const side = viewport.width >= 1280 && viewport.width / viewport.height >= 1.4;
  return {
    mode: side ? "side" : "card",
    width: side ? Math.min(220, Math.max(176, viewport.width * 0.12)) : Math.min(480, viewport.width - 64),
    left: viewport.width >= 1600 ? 32 : 24,
    right: viewport.width >= 1600 ? 76 : 64
  } as const;
}

/**
 * The free band of the page: what is left of the viewport once the floating
 * header and the scroll hint have their room. The monitor is framed inside it,
 * so the screen never runs under the header.
 */
export function freeBand(viewport: Viewport) {
  const side = captionLayout(viewport).mode === "side";
  // On compact displays the note sits below the header, above the monitor.
  const top = side ? Math.min(viewport.height * 0.22, 118)
    : viewport.width <= 360 ? 268 : viewport.width <= 720 ? 244 : 218;
  const bottom = side ? Math.min(viewport.height * 0.08, 72)
    : Math.min(viewport.height * 0.18, 160);
  return { top, height: Math.max(80, viewport.height - top - bottom) };
}

/**
 * A shot that frames one monitor.
 *
 * The camera stands on the screen's own normal, always at the same short
 * distance, and the field of view opens as far as it must for the glass to fit
 * the free band — on a phone that is a wide angle, which keeps the camera out
 * of the desk behind it instead of backing away into the furniture. Camera and
 * target are then lifted together, which slides the screen down into the band
 * without tilting the view, so the page stays a rectangle.
 */
export function screenView(
  frame: { center: Vector3; quaternion: Quaternion; width: number; height: number },
  viewport: Viewport,
  options: { distance?: number; fill?: number; minFov?: number; maxFov?: number } = {}
): Shot {
  const phone = viewport.width <= 720;
  const layout = captionLayout(viewport);
  const sideCaption = layout.mode === "side";
  const roomySideCaption = sideCaption && viewport.width / viewport.height < 1.75;
  // The bezel extends past the measured glass. Reserve side space for it on a
  // phone, then let the lens open enough to show the entire physical monitor.
  const phoneFill = Math.max(0.72, 1 - 70 / viewport.width);
  const { distance = 0.86, fill = phone ? phoneFill : roomySideCaption ? 0.86 : 0.94, minFov = 22, maxFov = phone ? 108 : viewport.width < 1360 ? 82 : roomySideCaption ? 84 : 78 } = options;
  const band = freeBand(viewport);
  const aspect = viewport.width / viewport.height;
  const normal = new Vector3(0, 0, 1).applyQuaternion(frame.quaternion).normalize();
  const up = new Vector3(0, 1, 0).applyQuaternion(frame.quaternion).normalize();

  // How much of the viewport the glass may take, vertically and across.
  const heightShare = (fill * band.height) / viewport.height;
  // Keep the display large, reserving only the caption lane and a bezel gap.
  // On narrower displays the caption sits above the monitor.
  const widthShare = sideCaption ? Math.min(fill, (viewport.width - 2 * (layout.width + layout.right + 20)) / viewport.width) : fill;
  const forHeight = 2 * Math.atan(frame.height / heightShare / 2 / distance);
  const forWidth = 2 * Math.atan(frame.width / widthShare / aspect / 2 / distance);
  const fovRadians = Math.min(
    (maxFov * Math.PI) / 180,
    Math.max((minFov * Math.PI) / 180, forHeight, forWidth)
  );

  const visibleHeight = 2 * distance * Math.tan(fovRadians / 2);
  const bandCenter = band.top + band.height / 2;
  // The display takes priority over showing the whole stand.
  const lift = (visibleHeight * (bandCenter - viewport.height / 2)) / viewport.height;

  return {
    position: frame.center.clone().addScaledVector(normal, distance).addScaledVector(up, lift),
    target: frame.center.clone().addScaledVector(up, lift),
    fov: (fovRadians * 180) / Math.PI
  };
}

/**
 * A shot taken from a camera saved in the office file: the same framing the
 * build script rendered its previews with.
 */
export function fromCamera(camera: Object3D, fallbackFov = 40): Shot {
  const position = camera.getWorldPosition(new Vector3());
  const direction = new Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new Quaternion()));
  const perspective = camera as PerspectiveCamera;
  const fov = perspective.isPerspectiveCamera ? perspective.fov : fallbackFov;
  return { position, target: position.clone().addScaledVector(direction, 3), fov };
}

/** A high corner view of the whole floor, framed on a point of interest. */
export function wideView(focus: Vector3, options: { distance?: number; height?: number; angle?: number; fov?: number } = {}): Shot {
  const { distance = 13, height = 6.5, angle = Math.PI * 0.78, fov = 44 } = options;
  const position = new Vector3(focus.x + Math.cos(angle) * distance, height, focus.z + Math.sin(angle) * distance);
  return { position, target: focus.clone().setY(1.0), fov };
}

/**
 * The building, as the office script built it: floor one ends at three metres,
 * the slab is forty centimetres thick, floor two stands on it and ends at six
 * and a half. The atrium is the only hole between the two, so it is the only
 * way a camera may travel from one floor to the other.
 */
export const BUILDING = {
  floorOneCeiling: 3.0,
  floorTwoLevel: 3.4,
  floorTwoCeiling: 6.4,
  /** Anything above this is on the upper floor. */
  floorSplit: 3.2,
  /** The middle of the void, in the scene's own coordinates. */
  atrium: new Vector3(3.2, 0, -7),
  /** How far under a ceiling the camera stays. */
  clearance: 0.4,
  /** The walls, with a margin: the camera never steps outside them. */
  inside: { minX: 0.7, maxX: 20.8, minZ: -16.3, maxZ: -0.7 }
};

/** The ceiling above a given height. */
export function ceilingAbove(y: number) {
  return y < BUILDING.floorSplit ? BUILDING.floorOneCeiling : BUILDING.floorTwoCeiling;
}

/** The floor a given height stands on. */
export function floorUnder(y: number) {
  return y < BUILDING.floorSplit ? 0 : BUILDING.floorTwoLevel;
}

/**
 * Eye height for somebody on their feet. A seated camera is a metre off the
 * floor, which is the height of a chair back and a desk edge: leaving a desk at
 * that height took the camera grazing past the furniture of the whole row. It
 * stands up first.
 */
export const STAND_HEIGHT = 1.75;

/**
 * The three rooms that are shut off from the open floor, and the doorway into
 * each.
 *
 * The office script builds them with a glass front and a real door in it, and
 * the camera uses that door: a flight that cuts the corner goes through a pane
 * of glass in front of the visitor, which is the one thing that gives away that
 * none of this is a room. The numbers are the script's own, turned from its
 * Z-up metres into the scene's (x, y, z) = (x, z, -y).
 *
 * `inward` points from the doorway into the room. `walk` is how high above that
 * floor a doorway is crossed: under a two-metre-ten lintel, above the desks.
 */
export type Room = {
  name: "leader" | "deputy" | "owner";
  floorLevel: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  door: Vector3;
  inward: Vector3;
};

export const WALK_HEIGHT = 1.7;
/** How far outside and inside a door the camera lines itself up with it. */
const DOOR_OUT = 1.25;
const DOOR_IN = 1.0;

export const ROOMS: Room[] = [
  {
    name: "leader",
    floorLevel: 0,
    bounds: { minX: 16.0, maxX: 21.5, minZ: -17.0, maxZ: -10.5 },
    door: new Vector3(16.0, WALK_HEIGHT, -11.475),
    inward: new Vector3(1, 0, 0)
  },
  {
    name: "deputy",
    floorLevel: BUILDING.floorTwoLevel,
    bounds: { minX: 7.6, maxX: 12.6, minZ: -10.0, maxZ: -4.0 },
    door: new Vector3(7.6, BUILDING.floorTwoLevel + WALK_HEIGHT, -4.775),
    inward: new Vector3(1, 0, 0)
  },
  {
    name: "owner",
    floorLevel: BUILDING.floorTwoLevel,
    bounds: { minX: 0.0, maxX: 7.0, minZ: -17.0, maxZ: -11.0 },
    door: new Vector3(6.025, BUILDING.floorTwoLevel + WALK_HEIGHT, -11.0),
    inward: new Vector3(0, 0, -1)
  }
];

/** Which of those rooms a point is in, if any. */
export function roomAt(point: Vector3): Room | null {
  for (const room of ROOMS) {
    if (point.y < room.floorLevel - 0.2 || point.y > room.floorLevel + BUILDING.floorOneCeiling) continue;
    const { bounds } = room;
    if (point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ) return room;
  }
  return null;
}

/** The point the camera lines up on to go through a door, on one side or the other. */
export function doorPoint(room: Room, side: "in" | "out") {
  return room.door.clone().addScaledVector(room.inward, side === "in" ? DOOR_IN : -DOOR_OUT);
}

/**
 * Where the room's people are, so that the camera can be kept out of them.
 *
 * The scene fills this in once the office is loaded. Nobody sits at a desk the
 * camera parks at, but a route still runs down aisles between people, and a
 * waypoint that lands in somebody's shoulder is a frame of the inside of a
 * jumper.
 */
const occupants: Vector3[] = [];

/** How wide a berth a seated person gets, and how high they reach. */
const PERSON_RADIUS = 0.62;
const PERSON_TOP = 1.5;

export function setOccupants(points: Vector3[]) {
  occupants.length = 0;
  for (const point of points) occupants.push(point.clone());
}

/** Pushes a waypoint out of anybody it would land in. Over their heads it does nothing. */
export function keepOffPeople(point: Vector3) {
  for (const person of occupants) {
    if (point.y > person.y + PERSON_TOP || point.y < person.y - 0.5) continue;
    const dx = point.x - person.x;
    const dz = point.z - person.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance >= PERSON_RADIUS) continue;
    if (distance < 0.001) {
      point.x += PERSON_RADIUS;
      continue;
    }
    point.x = person.x + (dx / distance) * PERSON_RADIUS;
    point.z = person.z + (dz / distance) * PERSON_RADIUS;
  }
  return point;
}

/** Keeps a point inside whichever room it belongs to, clear of that room's own walls. */
export function keepOffWalls(point: Vector3, margin = 0.45) {
  const room = roomAt(point);
  if (!room) return point;
  point.x = Math.min(Math.max(point.x, room.bounds.minX + margin), room.bounds.maxX - margin);
  point.z = Math.min(Math.max(point.z, room.bounds.minZ + margin), room.bounds.maxZ - margin);
  return point;
}

/** Shots for the placeholder office that stands in while the real file is missing. */
export const placeholderShots: Record<ShotKey, Shot> = {
  hero: { position: new Vector3(-9, 6.5, 11), target: new Vector3(2, 1, -3), fov: 46 },
  employee: { position: new Vector3(0, 1.14, 0.55), target: new Vector3(0, 1.14, -0.32), fov: 34 },
  leader: { position: new Vector3(0, 1.14, 0.55), target: new Vector3(0, 1.14, -0.32), fov: 34 },
  deputy: { position: new Vector3(0, 1.14, 0.55), target: new Vector3(0, 1.14, -0.32), fov: 34 },
  owner: { position: new Vector3(0, 1.14, 0.55), target: new Vector3(0, 1.14, -0.32), fov: 34 }
};
