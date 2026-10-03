import { CatmullRomCurve3, Vector3 } from "three";

export type LookTrack = { yaw: number[]; pitch: number[] };
type Entrance = { door: Vector3; inward: Vector3 };
const SAMPLES = 240;
const blend = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const flightEase = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const phaseAtDistance = (u: number) => {
  let low = 0, high = 1;
  for (let i = 0; i < 32; i++) { const middle = (low + high) / 2; if (flightEase(middle) < u) low = middle; else high = middle; }
  return (low + high) / 2;
};
const nearestYaw = (yaw: number, reference: number) => {
  let delta = Math.atan2(Math.sin(yaw - reference), Math.cos(yaw - reference));
  if (Math.abs(Math.abs(delta) - Math.PI) < .001) delta = Math.PI;
  return reference + delta;
};
const heading = (a: Vector3, b: Vector3) => Math.atan2(b.x - a.x, b.z - a.z);

function entrancePhase(curve: CatmullRomCurve3, entrance: Entrance) {
  const p = new Vector3(), offset = new Vector3();
  let before = offset.subVectors(curve.points[0], entrance.door).dot(entrance.inward);
  for (let i = 1; i <= 1000; i++) {
    curve.getPointAt(i / 1000, p);
    const after = offset.subVectors(p, entrance.door).dot(entrance.inward);
    if (before < 0 && after >= 0 && Math.abs(p.y - entrance.door.y) < .8) {
      offset.addScaledVector(entrance.inward, -after);
      if (Math.hypot(offset.x, offset.z) < .8) return phaseAtDistance((i - 1 + -before / (after - before)) / 1000);
    }
    before = after;
  }
  return .55;
}

/** A few intentional composition turns, independent of small spline bends.
 * Reverse playback samples this same track backwards, including its framing.
 */
export function buildLookTrack(curve: CatmullRomCurve3, fromTarget: Vector3, toTarget: Vector3, reverse = false, entrance: Entrance | null = null): LookTrack {
  const points = curve.points, start = points[0], end = points.at(-1)!;
  let entryPhase = .55;
  if (entrance) {
    // Start the final turn inside the actual door crossing, not outside it.
    const p = new Vector3(), offset = new Vector3();
    let before = offset.subVectors(start, entrance.door).dot(entrance.inward);
    for (let i = 1; i <= 1000; i++) {
      curve.getPointAt(i / 1000, p);
      const after = offset.subVectors(p, entrance.door).dot(entrance.inward);
      if (before < 0 && after >= 0 && Math.abs(p.y - entrance.door.y) < .8) {
        offset.addScaledVector(entrance.inward, -after);
        if (Math.hypot(offset.x, offset.z) < .8) { entryPhase = phaseAtDistance((i - 1 + -before / (after - before)) / 1000); break; }
      }
      before = after;
    }
  }
  const direction = new Vector3().subVectors(fromTarget, start).normalize();
  const startYaw = Math.atan2(direction.x, direction.z), startPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
  direction.subVectors(toTarget, end).normalize();
  const finalHeading = Math.atan2(direction.x, direction.z), finalPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
  const lift = points.findIndex((p, i) => i < points.length - 1 && Math.hypot(p.x - points[i + 1].x, p.z - points[i + 1].z) < .35 && Math.abs(p.y - points[i + 1].y) > .5);
  const destination = entrance?.door ?? end;
  const corridorStart = points.length > 3 && lift !== 1 ? points[1] : start;
  const entranceHeading = entrance ? Math.atan2(entrance.inward.x, entrance.inward.z) : finalHeading;
  let cruise = heading(corridorStart, lift >= 0 ? points[lift] : destination);
  const landing = entrance ? entranceHeading : lift >= 0 ? heading(points[lift + 1], destination) : cruise;
  if (lift < 0) cruise = landing;
  if (Math.abs(nearestYaw(landing, cruise) - cruise) < Math.PI / 6) cruise = landing;
  cruise = nearestYaw(cruise, startYaw);
  const arrival = nearestYaw(landing, cruise);
  const inside = entrance ? arrival : nearestYaw(entranceHeading, arrival);
  const final = nearestYaw(finalHeading, inside);
  const turns: { from: number; to: number; begin: number; end: number }[] = [
    { from: startYaw, to: cruise, begin: 0, end: .25 }
  ];
  if (lift >= 0) turns.push({ from: cruise, to: arrival, begin: .25, end: entryPhase - .025 });
  // Prepare the monitor turn just inside the room, over the whole approach.
  turns.push({ from: arrival, to: final, begin: entrance ? entryPhase + .012 : .53, end: 1 });
  const yaw: number[] = [], pitch: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const p = i / SAMPLES;
    let value = startYaw;
    for (const turn of turns) {
      if (p < turn.begin) break;
      value = turn.from + (turn.to - turn.from) * blend((p - turn.begin) / Math.max(.04, turn.end - turn.begin));
      if (p < turn.end) break;
    }
    yaw.push(value);
    pitch.push(startPitch * (1 - blend(p / .25)) + finalPitch * blend((p - .53) / .47));
  }
  return reverse ? { yaw: yaw.reverse(), pitch: pitch.reverse() } : { yaw, pitch };
}

/** Hold one region of the next room in view, then follow its final approach.
 * No per-frame damping and no heading adjustments for small path bends.
 */
export function buildFocusedLookTrack(curve: CatmullRomCurve3, fromTarget: Vector3, toTarget: Vector3, focus: Vector3, employee = false, staging?: {exit?: Vector3; liftStart?: Vector3; liftEnd?: Vector3; entrance?: Entrance}): LookTrack {
  const points = curve.points, start = points[0], end = points.at(-1)!;
  const startDirection = fromTarget.clone().sub(start).normalize(), finalDirection = toTarget.clone().sub(end).normalize();
  const startYaw = Math.atan2(startDirection.x, startDirection.z), startPitch = Math.asin(startDirection.y);
  const finalYaw = Math.atan2(finalDirection.x, finalDirection.z), finalPitch = Math.asin(finalDirection.y);
  const lengths = curve.getLengths(), length = curve.getLength();
  const phaseAtNode = (index: number) => {
    const knot = index / (points.length - 1) * curve.arcLengthDivisions, j = Math.floor(knot);
    return phaseAtDistance((lengths[j] + (lengths[Math.min(j + 1, lengths.length - 1)] - lengths[j]) * (knot - j)) / length);
  };
  const entry = staging?.entrance ? entrancePhase(curve, staging.entrance) : undefined;
  const begin = employee ? .42 : entry !== undefined ? entry - .01 : Math.min(.7, phaseAtNode(Math.max(1, points.length - 4)));
  // All three rooms prepare their screen view by the last standing waypoint,
  // before descending to the parked pose. Finishing only at .97 left the
  // deputy looking at the wall while already rounding behind the monitor.
  const finish = employee ? .76 : Math.min(.97, Math.max(begin + .20, phaseAtNode(points.length - 2)));
  const p = new Vector3(), direction = new Vector3(), rawYaw: number[] = [], rawPitch: number[] = [];
  let previousRegion = startYaw;
  for (let i = 0; i <= SAMPLES; i++) {
    const phase = i / SAMPLES, t = flightEase(phase);
    curve.getPointAt(t, p); direction.subVectors(focus, p);
    const regionYaw = nearestYaw(Math.atan2(direction.x, direction.z), previousRegion);
    previousRegion = regionYaw;
    const regionPitch = Math.max(-.1, Math.min(.1, Math.atan2(direction.y, Math.hypot(direction.x, direction.z))));
    rawYaw.push(regionYaw);
    rawPitch.push(regionPitch);
  }
  if (staging?.exit || staging?.liftStart) {
    const exitIndex = staging.exit ? points.findIndex(v => v.distanceTo(staging.exit!) < .001) : -1;
    const lowIndex = staging.liftStart ? points.indexOf(staging.liftStart) : -1;
    const highIndex = staging.liftEnd ? points.indexOf(staging.liftEnd) : -1;
    const exitPhase = exitIndex > 0 ? phaseAtNode(exitIndex) : .2;
    const cruise = nearestYaw(heading(exitIndex > 0 ? points[exitIndex] : start, lowIndex > 0 ? points[lowIndex] : focus), startYaw);
    const exitHeading = exitIndex > 0 ? nearestYaw(heading(start, points[exitIndex]), startYaw) : cruise;
    const beginTurn = lowIndex > 0 ? Math.min(.4, phaseAtNode(lowIndex) - .2) : exitPhase;
    const landingPhase = highIndex > 0 ? Math.min(entry === undefined ? .8 : entry - .04, phaseAtNode(highIndex) + .045) : exitPhase + .15;
    const anchor = Math.round(landingPhase * SAMPLES);
    const incoming = nearestYaw(rawYaw[anchor], cruise);
    const offset = incoming - rawYaw[anchor];
    for (let i = 0; i <= SAMPLES; i++) {
      const phase = i / SAMPLES;
      const cruiseTurn = blend((phase - exitPhase + .035) / Math.max(.12, beginTurn - exitPhase));
      const outward = exitHeading + (cruise - exitHeading) * cruiseTurn;
      const liftTurn = blend((phase - beginTurn) / Math.max(.15, landingPhase - beginTurn));
      const onLanding = blend((phase - landingPhase) / .1);
      const duringLift = outward + (incoming - outward) * liftTurn;
      rawYaw[i] = duringLift + (rawYaw[i] + offset - duringLift) * onLanding;
    }
  }
  // The room is a broad focus region: smoothing its prepared view slightly
  // anticipates the interior arc without following every small spline bend.
  const sigma = employee ? 3 : 12, radius = sigma * 3;
  const preparedYaw = rawYaw.map((_, i) => {
    let sum = 0, weights = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(SAMPLES, i + radius); j++) {
      const weight = Math.exp(-.5 * ((j - i) / sigma) ** 2); sum += weight * rawYaw[j]; weights += weight;
    }
    return sum / weights;
  });
  const yaw: number[] = [], pitch: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    // Begin moving out of the seated pose before making the main look turn.
    // Translation and rotation then overlap, instead of a turn on the spot.
    const phase = i / SAMPLES, depart = blend((phase - (employee ? 0 : .055)) / (employee ? .14 : .29)), arrive = blend((phase - begin) / (finish - begin));
    // Once inside, retain the revealed composition and make one monitor turn.
    // Chasing the room centre while circling it caused another fast view turn.
    const regionIndex = entry === undefined ? i : Math.min(i, Math.round(begin * SAMPLES));
    const prepared = startYaw + (preparedYaw[regionIndex] - startYaw) * depart;
    yaw.push(prepared + (nearestYaw(finalYaw, prepared) - prepared) * arrive);
    pitch.push((startPitch + (rawPitch[regionIndex] - startPitch) * depart) * (1 - arrive) + finalPitch * arrive);
  }
  return {yaw, pitch};
}

function angleAt(values: number[], progress: number) {
  const u = Math.max(0, Math.min(1, progress)) * SAMPLES, i = Math.min(SAMPLES - 1, Math.floor(u)), t = u - i;
  const a = values[i], b = values[i + 1];
  if (a === b) return a;
  let m0 = i === 0 ? 0 : (b - values[i - 1]) / 2;
  let m1 = i + 1 === SAMPLES ? 0 : (values[i + 2] - a) / 2;
  // Monotone Hermite slopes cannot overshoot a held composition and turn back.
  const slope = b - a;
  if (m0 * slope <= 0) m0 = 0;
  if (m1 * slope <= 0) m1 = 0;
  const magnitude = Math.hypot(m0 / slope, m1 / slope);
  if (magnitude > 3) { m0 *= 3 / magnitude; m1 *= 3 / magnitude; }
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a + (t ** 3 - 2 * t ** 2 + t) * m0 +
    (-2 * t ** 3 + 3 * t ** 2) * b + (t ** 3 - t ** 2) * m1;
}

export function sampleLookTrack(track: LookTrack, progress: number, direction: Vector3) {
  const yaw = angleAt(track.yaw, progress), pitch = angleAt(track.pitch, progress), horizontal = Math.cos(pitch);
  return direction.set(Math.sin(yaw) * horizontal, Math.sin(pitch), Math.cos(yaw) * horizontal);
}
