import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from "three";
import { BUILDING, ceilingAbove, doorPoint, floorUnder, keepOffPeople, keepOffWalls, roomAt, SHOT_ORDER, STAND_HEIGHT, type Room, type Shot, type ShotKey } from "./shots";

/** A flight is paced by its length: a hop across a pod is not a trip upstairs. */
const SECONDS_BASE = 1.5;
const SECONDS_PER_METRE = 0.075;
const SECONDS_MIN = 1.7;
const SECONDS_MAX = 4.2;
/** How far the path bows over the desks, before the ceiling has its say. */
const ARC_RATIO = 0.18;
const MAX_ARC = 1.5;
/** How much wider the lens goes at the middle of a flight. */
const FLIGHT_FOV_BOOST = 8;
/** A camera this close to what it looks at is parked at a monitor. */
const CLOSE_UP = 1.5;
/** How far the camera pulls back from a monitor before it travels, and closes in at the end. */
const RETREAT = 2.2;
/** Step into the adjacent aisle while clearing a close monitor. */
const AISLE_STEP = 1.1;

/**
 * Moves a waypoint out of a room that the trip is only passing by.
 *
 * The halfway point of an open-floor hop is taken on the straight line between
 * its ends, and that line can clip the corner of an office neither end is in.
 * The point is pushed out along the shortest route around that room.
 */
/** Eye height for somebody standing on whichever floor this point is on. */
function standing(point: Vector3) {
  return Math.max(point.y, floorUnder(point.y) + STAND_HEIGHT);
}

/** Holds a waypoint inside the room it was built for, clear of that room's walls. */
function clampToRoom(point: Vector3, room: Room | null, margin = 0.45) {
  if (!room) return point;
  point.x = Math.min(Math.max(point.x, room.bounds.minX + margin), room.bounds.maxX - margin);
  point.z = Math.min(Math.max(point.z, room.bounds.minZ + margin), room.bounds.maxZ - margin);
  return point;
}

function pushOutOfRooms(point: Vector3, from: Vector3, to: Vector3) {
  const room = roomAt(point);
  if (!room || room === roomAt(from) || room === roomAt(to)) return point;
  const { bounds } = room;
  // The nearest wall can be the wrong way round the room. Pick the smallest
  // actual detour from this route's ends instead of a locally short push.
  const candidates = [
    point.clone().setX(bounds.minX - 0.8),
    point.clone().setX(bounds.maxX + 0.8),
    point.clone().setZ(bounds.minZ - 0.8),
    point.clone().setZ(bounds.maxZ + 0.8)
  ];
  candidates.sort((a, b) => from.distanceTo(a) + a.distanceTo(to) - from.distanceTo(b) - b.distanceTo(to));
  return point.copy(candidates[0]);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Keeps a point of the route inside the building, and inside whatever room it
 * is in.
 *
 * The camera pulls back from a monitor before it travels, and at the leader's
 * desk that took it straight through the wall the desk faces: the office ends
 * a metre and a half behind the chair, and the room itself ends sooner.
 */
function keepInside(point: Vector3) {
  const upstairs = point.y >= BUILDING.floorSplit;
  point.x = Math.min(Math.max(point.x, BUILDING.inside.minX), BUILDING.inside.maxX);
  point.z = Math.min(Math.max(point.z, BUILDING.inside.minZ), BUILDING.inside.maxZ);
  point.y = Math.min(
    Math.max(point.y, upstairs ? BUILDING.floorTwoLevel + 0.6 : 0.6),
    ceilingAbove(point.y) - BUILDING.clearance
  );
  return keepOffPeople(keepOffWalls(point));
}

/**
 * The route between two shots.
 *
 * It leaves a monitor the way a person would: straight back from the screen,
 * because a desk and its monitor sit between the camera and everything else.
 * Within one floor the path then bows upward to clear the partitions, but
 * never above that floor's ceiling. Between floors the only opening is the
 * atrium, so the camera goes there, rises inside the void and comes out on the
 * other level. The last leg is a straight approach from in front of the new
 * screen, which is also what lets the page on it be shown before arrival.
 */
function buildPath(fromPosition: Vector3, fromTarget: Vector3, to: Shot) {
  // Which room each end of the trip is in, taken from the camera's own places
  // and not from the waypoints built off them: a desk two metres from the back
  // wall puts its stand-off point on the far side of that wall, and the room —
  // with its door — went unnoticed.
  const fromRoom = roomAt(fromPosition);
  const toRoom = roomAt(to.position);
  const leavingRoom = fromRoom && fromRoom !== toRoom ? fromRoom : null;
  const enteringRoom = toRoom && toRoom !== fromRoom ? toRoom : null;

  // The arrival in two: the camera is still on its feet at `settle`, sits down
  // between there and `approach`, and covers the last couple of metres level
  // with the screen. Dropping into the seat over the desk itself put a chair
  // and a keyboard in the middle of the picture on the way in.
  const arriving = to.position.clone().sub(to.target);
  const closeUp = arriving.length() < CLOSE_UP;
  const facing = closeUp ? arriving.normalize() : null;
  const settle = facing
    ? keepInside(clampToRoom(to.position.clone().addScaledVector(facing, RETREAT + 1.3).setY(standing(to.position)), toRoom))
    : null;
  const approach = facing
    ? keepInside(clampToRoom(to.position.clone().addScaledVector(facing, RETREAT).setY(to.position.y + 0.3), toRoom))
    : null;

  // Where the open-floor part of the trip begins and ends: the doorstep, if
  // there is a door in the way.
  const travelFrom = leavingRoom ? doorPoint(leavingRoom, "out") : null;
  const travelTo = enteringRoom ? doorPoint(enteringRoom, "out") : (settle ?? to.position);

  const points: Vector3[] = [fromPosition.clone()];

  const leaving = fromPosition.clone().sub(fromTarget);
  if (leaving.length() < CLOSE_UP) {
    // Clear the screen and move into the aisle in one step. A second retreat
    // behind the chair made the route double back before it reached the door.
    const back = leaving.normalize();
    const stand = standing(fromPosition);
    // Up out of the chair before anything else. A seated camera is level with
    // the desks and the chair backs of the whole row, and it used to travel a
    // metre and a half at that height: the first thing the visitor saw of the
    // trip was the inside of the neighbour's chair.
    const towardsExit = (travelFrom ?? travelTo).clone().sub(fromPosition).setY(0);
    const sideways = towardsExit.addScaledVector(back, -towardsExit.dot(back));
    const firstStep = fromPosition.clone().addScaledVector(back, 0.75).setY(stand);
    if (sideways.lengthSq() > 0.01) firstStep.addScaledVector(sideways.normalize(), AISLE_STEP);
    keepInside(clampToRoom(firstStep, fromRoom));
    points.push(firstStep);
  }

  if (leavingRoom) {
    points.push(keepInside(doorPoint(leavingRoom, "in")));
    points.push(travelFrom!.clone());
  }

  const open = points[points.length - 1];
  const sameFloor = open.y < BUILDING.floorSplit === travelTo.y < BUILDING.floorSplit;

  if (sameFloor) {
    if (open.distanceTo(travelTo) > 4.5) {
      const ceiling = ceilingAbove(open.y) - BUILDING.clearance;
      // Only longer hops need a high midpoint to clear the desks.
      const ratio = leavingRoom || enteringRoom ? ARC_RATIO * 0.3 : ARC_RATIO;
      const wanted = Math.max(open.y, travelTo.y) + Math.min(MAX_ARC, open.distanceTo(travelTo) * ratio);
      const peak = Math.max(Math.min(open.y, travelTo.y), Math.min(wanted, ceiling));
      const middle = open.clone().lerp(travelTo, 0.5).setY(peak);
      points.push(keepInside(pushOutOfRooms(middle, open, travelTo)));
    }
  } else {
    const underSlab = BUILDING.floorOneCeiling - BUILDING.clearance;
    const upstairs = BUILDING.floorTwoLevel + 1.1;
    const goingUp = travelTo.y > open.y;
    const low = new Vector3(BUILDING.atrium.x, Math.min(Math.max(open.y, 1.6), underSlab), BUILDING.atrium.z);
    const high = new Vector3(BUILDING.atrium.x, upstairs, BUILDING.atrium.z);
    points.push(goingUp ? low : high, goingUp ? high : low);
  }

  if (enteringRoom) {
    points.push(travelTo.clone());
    points.push(keepInside(doorPoint(enteringRoom, "in")));
  }

  // A small room can squeeze the two arrival points onto each other; a segment
  // of no length is a tangent of no direction.
  if (settle) points.push(settle);
  if (approach && (!settle || settle.distanceTo(approach) > 0.5)) points.push(approach);
  points.push(to.position.clone());
  const route = [points[0]];
  for (const point of points.slice(1)) {
    if (route[route.length - 1].distanceTo(point) > 0.25) route.push(point);
  }
  // Unevenly spaced waypoints (a desk, a door, then a long aisle) made the
  // uniform spline overshoot corners and turn back on itself. Centripetal
  // spacing follows the same necessary passages without those loops.
  return new CatmullRomCurve3(route, false, "centripetal");
}

/**
 * The flight lives in the module, not in the component.
 *
 * React mounts the canvas tree more than once in development and the frame
 * callback of a discarded copy stays subscribed, so several rigs can be writing
 * to the one camera. Sharing a single state makes every one of them say the
 * same thing; a frame stamp keeps the extra callbacks from advancing the same
 * flight twice in a frame.
 */
const rig = {
  goal: null as Shot | null,
  shotKey: "hero" as ShotKey,
  snapKey: "",
  fromTarget: new Vector3(),
  fromFov: 45,
  routeTo: null as Shot | null,
  routeFromKey: "" as ShotKey | "",
  routeToKey: "" as ShotKey | "",
  reverse: false,
  curve: null as CatmullRomCurve3 | null,
  seconds: SECONDS_MIN,
  progress: 1,
  position: new Vector3(),
  target: new Vector3(),
  fov: 45,
  /** Where the camera will be on the next frame, for anything that must keep step with it. */
  nextPosition: new Vector3(),
  nextTarget: new Vector3(),
  nextFov: 45,
  frameStamp: -1
};

type ForwardRoute = {
  curve: CatmullRomCurve3;
  from: Shot;
  to: Shot;
  fromTarget: Vector3;
  fromFov: number;
};

/** A return trip reuses the exact curve and look-at data of the outward trip. */
const forwardRoutes = new Map<string, ForwardRoute>();
const routeKey = (from: ShotKey, to: ShotKey) => `${from}:${to}`;

const POSE_KEY = "verbatrace.landing.camera-pose";
type StoredPose = {
  shotKey: string;
  at: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  active: boolean;
  route?: { fromKey: ShotKey; toKey: ShotKey; reverse: boolean; progress: number };
};

function readPose(shotKey: string): StoredPose | null {
  try {
    const raw = window.sessionStorage.getItem(POSE_KEY);
    if (!raw) return null;
    const pose = JSON.parse(raw) as StoredPose;
    if (pose.shotKey !== shotKey || Date.now() - pose.at > 5 * 60_000 ||
        ![...pose.position, ...pose.target, pose.fov].every(Number.isFinite)) return null;
    return pose;
  } catch { return null; }
}

const look = new Vector3();
const toGoal = new Vector3();
const turnAxis = new Vector3();
const predicted = new PerspectiveCamera();

/** How far in front of the camera the look-at point is put once it is a direction. */
const LOOK_DISTANCE = 2.5;

/** The unit direction from one point to another; false if there is none. */
function aim(from: Vector3, to: Vector3, out: Vector3) {
  out.copy(to).sub(from);
  const length = out.length();
  if (length < 0.0001) return false;
  out.divideScalar(length);
  return true;
}

/** Turns through an angle rather than lerping vectors, which accelerates near a sharp bend. */
function turn(direction: Vector3, towards: Vector3, amount: number, preferred: Vector3) {
  if (amount <= 0) return;
  if (amount >= 1) { direction.copy(towards); return; }
  const dot = Math.min(1, Math.max(-1, direction.dot(towards)));
  if (dot > 0.9995) { direction.lerp(towards, amount).normalize(); return; }
  if (dot < -0.999999) {
    // An almost opposite pair has no unique shortest arc. Keep one stable axis
    // instead of letting a tiny change in direction flip the camera turn.
    turnAxis.crossVectors(direction, preferred);
    if (turnAxis.lengthSq() < 0.000001) turnAxis.set(0, 1, 0).cross(direction);
    if (turnAxis.lengthSq() < 0.000001) turnAxis.set(1, 0, 0).cross(direction);
    direction.applyAxisAngle(turnAxis.normalize(), Math.PI * amount).normalize();
    return;
  }
  const angle = Math.acos(dot);
  const sin = Math.sin(angle);
  direction.multiplyScalar(Math.sin((1 - amount) * angle) / sin)
    .addScaledVector(towards, Math.sin(amount * angle) / sin)
    .normalize();
}

/** Samples the flight at a point in time into the given vectors; returns the lens. */
function sample(progress: number, position: Vector3, target: Vector3) {
  const to = rig.routeTo;
  if (!rig.curve || !to) return rig.fov;
  // The easing, route direction, camera turn and FOV are all sampled at the
  // same instant as the outward flight. Only time runs backwards on the return.
  const clamped = Math.min(1, Math.max(0, rig.reverse ? 1 - progress : progress));
  const t = easeInOut(clamped);
  rig.curve.getPointAt(t, position);
  // A single shortest-arc turn joins the two fixed shot directions. Following
  // the moving path tangent and then reacquiring the destination made the
  // camera turn back and forth at every aisle and doorway bend.
  if (!aim(to.position, to.target, toGoal)) {
    target.copy(to.target);
    return rig.fov;
  }
  if (!aim(rig.curve.points[0], rig.fromTarget, look)) look.copy(toGoal);
  turn(look, toGoal, smoothstep(0.04, 0.96, clamped), toGoal);
  target.copy(position).addScaledVector(look, LOOK_DISTANCE);
  if (clamped > 0.999) target.copy(to.target);
  if (progress > 0.999 && rig.goal) target.copy(rig.goal.target);
  return rig.fromFov + (to.fov - rig.fromFov) * t + FLIGHT_FOV_BOOST * Math.sin(Math.PI * clamped);
}

/** How far along a flight the camera is, for anything that has to keep step with it. */
export function flightState() {
  return { active: rig.progress < 1, progress: rig.progress };
}

/**
 * The camera as it will be one frame from now.
 *
 * The page on a monitor is ordinary DOM over the canvas, and the browser
 * applies a transform a frame later than the canvas is painted: on a moving
 * camera the two drifted apart visibly. Projecting from where the camera is
 * about to be cancels that out.
 */
export function cameraAhead(base: PerspectiveCamera) {
  if (rig.progress >= 1 || !rig.curve) return base;
  predicted.copy(base, false);
  predicted.position.copy(rig.nextPosition);
  predicted.fov = rig.nextFov;
  predicted.lookAt(rig.nextTarget);
  predicted.updateMatrixWorld(true);
  predicted.updateProjectionMatrix();
  return predicted;
}

export function CameraRig({ shot, shots, shotKey, snapKey, onTransition }: {
  shot: Shot;
  shots: Record<ShotKey, Shot>;
  shotKey: ShotKey;
  snapKey: string;
  onTransition: (active: boolean) => void;
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    if (snapKey !== "office") return;
    const savePose = () => {
      try {
        window.sessionStorage.setItem(POSE_KEY, JSON.stringify({
          shotKey: rig.shotKey, at: Date.now(), position: rig.position.toArray(), target: rig.target.toArray(),
          fov: rig.fov, active: rig.progress < 1,
          route: rig.progress < 1 && rig.routeFromKey && rig.routeToKey ? {
            fromKey: rig.routeFromKey, toKey: rig.routeToKey,
            reverse: rig.reverse, progress: rig.progress
          } : undefined
        }));
      } catch { /* storage may be unavailable */ }
    };
    window.addEventListener("pagehide", savePose);
    return () => window.removeEventListener("pagehide", savePose);
  }, [shotKey, snapKey]);

  // The goal follows the props during render, so it stays in step however many
  // times React renders this component. A new room (`snapKey`) puts the camera
  // in place at once: its shots are somewhere else entirely.
  if (rig.goal === null || rig.snapKey !== snapKey) {
    forwardRoutes.clear();
    rig.snapKey = snapKey;
    rig.goal = shot;
    rig.shotKey = shotKey;
    rig.routeTo = shot;
    rig.reverse = false;
    rig.routeFromKey = shotKey;
    rig.routeToKey = shotKey;
    rig.position.copy(shot.position);
    rig.target.copy(shot.target);
    rig.nextPosition.copy(shot.position);
    rig.nextTarget.copy(shot.target);
    rig.fov = shot.fov;
    rig.nextFov = shot.fov;
    rig.progress = 1;
    rig.curve = null;
    if (snapKey === "office") {
      const pose = readPose(shotKey);
      if (pose) {
        rig.position.fromArray(pose.position);
        rig.target.fromArray(pose.target);
        rig.fov = pose.fov;
        rig.nextPosition.copy(rig.position);
        rig.nextTarget.copy(rig.target);
        rig.nextFov = rig.fov;
        if (pose.active) {
          const route = pose.route;
          const validRoute = route && route.fromKey !== route.toKey &&
            SHOT_ORDER.includes(route.fromKey) && SHOT_ORDER.includes(route.toKey) &&
            Number.isFinite(route.progress) && route.progress >= 0 && route.progress < 1 &&
            (route.reverse ? route.fromKey : route.toKey) === shotKey;
          if (validRoute) {
            const from = shots[route.fromKey];
            const to = shots[route.toKey];
            const curve = buildPath(from.position, from.target, to);
            const time = route.reverse ? 1 - route.progress : route.progress;
            // A resize can move a shot. Use the saved instant only if its old
            // position still belongs to the reconstructed route.
            if (curve.getPointAt(easeInOut(time)).distanceTo(rig.position) < 0.75) {
              rig.curve = curve;
              rig.fromTarget.copy(from.target);
              rig.fromFov = from.fov;
              rig.routeTo = to;
              rig.routeFromKey = route.fromKey;
              rig.routeToKey = route.toKey;
              rig.reverse = route.reverse;
              rig.progress = route.progress;
              forwardRoutes.set(routeKey(route.fromKey, route.toKey), {
                curve, from, to, fromTarget: from.target.clone(), fromFov: from.fov
              });
            }
          }
          if (!rig.curve) {
            // Older saved poses have no route; retain their original recovery.
            rig.fromTarget.copy(rig.target);
            rig.fromFov = rig.fov;
            rig.curve = buildPath(rig.position, rig.target, shot);
            rig.progress = 0;
          }
          rig.seconds = Math.min(SECONDS_MAX, Math.max(SECONDS_MIN, SECONDS_BASE + rig.curve.getLength() * SECONDS_PER_METRE));
        }
        try { window.sessionStorage.removeItem(POSE_KEY); } catch { /* storage may be unavailable */ }
      }
    }
  } else if (rig.goal !== null && rig.goal !== shot) {
    const previousShot = rig.goal;
    const previousKey = rig.shotKey;
    const reverse = SHOT_ORDER.indexOf(shotKey) < SHOT_ORDER.indexOf(previousKey);
    if (reverse) {
      const key = routeKey(shotKey, previousKey);
      const cached = forwardRoutes.get(key);
      const route = cached?.from === shot && cached.to === previousShot ? cached : {
        curve: buildPath(shot.position, shot.target, previousShot),
        from: shot, to: previousShot, fromTarget: shot.target.clone(), fromFov: shot.fov
      };
      forwardRoutes.set(key, route);
      rig.curve = route.curve;
      rig.fromTarget.copy(route.fromTarget);
      rig.fromFov = route.fromFov;
      rig.routeTo = route.to;
      rig.routeFromKey = shotKey;
      rig.routeToKey = previousKey;
      rig.reverse = true;
    } else {
      // Outward flights keep their existing path and timing. Saving that route
      // means the next backwards step can play the very same flight in reverse.
      rig.fromTarget.copy(rig.target);
      rig.fromFov = rig.fov;
      rig.curve = buildPath(rig.position, rig.target, shot);
      rig.routeTo = shot;
      rig.routeFromKey = previousKey;
      rig.routeToKey = shotKey;
      rig.reverse = false;
      if (previousKey !== shotKey) forwardRoutes.set(routeKey(previousKey, shotKey), {
        curve: rig.curve, from: previousShot, to: shot,
        fromTarget: rig.fromTarget.clone(), fromFov: rig.fromFov
      });
    }
    rig.seconds = Math.min(
      SECONDS_MAX,
      Math.max(SECONDS_MIN, SECONDS_BASE + rig.curve.getLength() * SECONDS_PER_METRE)
    );
    rig.progress = 0;
    rig.goal = shot;
    rig.shotKey = shotKey;
  }

  useFrame((state, delta) => {
    const stamp = state.clock.elapsedTime;
    const first = rig.frameStamp !== stamp;
    rig.frameStamp = stamp;

    if (first && rig.goal && rig.progress < 1 && rig.curve) {
      const step = delta / (reduced ? 0.01 : rig.seconds);
      rig.progress = Math.min(1, rig.progress + step);
      rig.fov = sample(rig.progress, rig.position, rig.target);
      rig.nextFov = sample(rig.progress + step, rig.nextPosition, rig.nextTarget);
    }

    // Reported every frame rather than on the edges: a signal missed by a
    // component that was replaced mid-flight used to leave the page convinced
    // the camera was still moving, which locked the scroll and kept the screen
    // dark. React ignores a repeat of the same value.
    if (first) onTransition(rig.progress < 1);

    camera.position.copy(rig.position);
    camera.lookAt(rig.target);
    if (Math.abs(camera.fov - rig.fov) > 0.01) {
      camera.fov = rig.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
