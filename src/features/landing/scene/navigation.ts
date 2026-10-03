import { Curve, Vector3 } from "three";
import type { Shot } from "./shots";

export type NavigationData = { radius: number; names: string[]; boxes: number[][] };
const CELL = .1;
const NX = 216;
const NZ = 171;
const EYE = 1.7;
const routeCache = new Map<string, WalkingCurve>();
let navigation: Navigator | null = null;
let currentData: NavigationData | null = null;
let occupantKey = "";

export function setNavigationData(data: NavigationData) {
  if (data === currentData) return;
  currentData = data;
  navigation = new Navigator(data);
  routeCache.clear();
  occupantKey = "";
}

export function setNavigationOccupants(points: Vector3[]) {
  if (!currentData) return;
  const key = points.map(p => p.toArray().join(',')).join(';');
  if (key === occupantKey) return;
  occupantKey = key;
  const names = [...currentData.names, ...points.map((_, i) => `seated-person-${i}`)];
  const boxes = [...currentData.boxes, ...points.map((p, i) => [p.x-.32, p.y+.15, p.z-.32, p.x+.32, p.y+1.5, p.z+.32, currentData!.names.length+i])];
  navigation = new Navigator({ ...currentData, names, boxes });
  routeCache.clear();
}

/** QA receives every segment, not just the camera positions captured per frame. */
export function navigationAudit() {
  return { radiusMetres: currentData?.radius, standingEyeHeightMetres: EYE, upperFloorWalkingEyeY: EYE + 3.4, staticComponents: currentData?.boxes.length,
    method: "continuous segment / expanded connected-component AABBs; permitted above-desk floor-one travel; upper-floor body clearance and supported floor grid; dedicated stair edge",
    routes: [...routeCache.values()].map(curve => ({ lengthMetres: curve.getLength(), points: curve.points.map(p => p.toArray()) })) };
}

/** Constant-distance polyline with verified corner fillets. No spline overshoot. */
export class WalkingCurve extends Curve<Vector3> {
  readonly distances: number[] = [0];
  readonly pacing: number[] = [0];
  constructor(readonly points: Vector3[]) {
    super();
    const directions = points.slice(1).map((p,i)=>p.clone().sub(points[i]).normalize());
    for (let i = 1; i < points.length; i++) {
      const length = points[i].distanceTo(points[i - 1]);
      const angle = i > 1 ? Math.acos(Math.max(-1,Math.min(1,directions[i-2].dot(directions[i-1])))) : 0;
      this.distances.push(this.distances[i - 1] + length);
      this.pacing.push(this.pacing[i - 1] + length + angle * 2);
    }
  }
  override getLength() { return this.distances[this.distances.length - 1]; }
  getPacedLength() { return this.pacing[this.pacing.length - 1]; }
  override getPoint(t: number, target = new Vector3()) {
    const distance = Math.max(0, Math.min(1, t)) * this.getPacedLength();
    let low = 1, high = this.distances.length - 1;
    while (low < high) { const mid = (low + high) >> 1; if (this.pacing[mid] < distance) low = mid + 1; else high = mid; }
    const span = this.pacing[low] - this.pacing[low - 1];
    return target.copy(this.points[low - 1]).lerp(this.points[low], span ? (distance - this.pacing[low - 1]) / span : 0);
  }
  override getPointAt(t: number, target?: Vector3) { return this.getPoint(t, target); }
  override getTangentAt(t: number, target?: Vector3) { return this.getTangent(t, target); }
}

class Navigator {
  private bins = new Map<string, number[]>();
  private freeCache = [new Int8Array(NX * NZ), new Int8Array(NX * NZ)];
  private departures = new Map<string, Vector3[]>();
  constructor(private data: NavigationData) {
    for (let i = 0; i < data.boxes.length; i++) {
      const b = data.boxes[i], r = data.radius;
      for (let x = Math.floor(b[0] - r); x <= Math.floor(b[3] + r); x++)
        for (let z = Math.floor(b[2] - r); z <= Math.floor(b[5] + r); z++) {
          const key = `${x}:${z}`;
          const bin = this.bins.get(key) ?? [];
          bin.push(i); this.bins.set(key, bin);
        }
    }
  }
  /** Segment vs expanded component AABBs, including both endpoints. */
  clear(a: Vector3, b: Vector3, walkingFloor?: number, radius = this.data.radius) {
    const ids = new Set<number>(), r = radius;
    for (let x = Math.floor(Math.min(a.x, b.x)); x <= Math.floor(Math.max(a.x, b.x)); x++)
      for (let z = Math.floor(Math.min(a.z, b.z)); z <= Math.floor(Math.max(a.z, b.z)); z++)
        for (const id of this.bins.get(`${x}:${z}`) ?? []) ids.add(id);
    for (const id of ids) {
      const original = this.data.boxes[id];
      // Floor one may pass above desktops (user-directed). Upstairs movement
      // uses the solid floor and an unobstructed standing corridor.
      const walkingBody = walkingFloor === 1;
      if (walkingBody && (original[4] < 3.4 + .15 || original[1] > 3.4 + EYE + r)) continue;
      const box = !walkingBody ? original : [original[0], 3.4, original[2], original[3], 3.4 + EYE + .2, original[5]];
      let lo = 0, hi = 1;
      for (let axis = 0; axis < 3; axis++) {
        const av = a.getComponent(axis), delta = b.getComponent(axis) - av;
        if (Math.abs(delta) < 1e-9) {
          if (av < box[axis] - r || av > box[axis + 3] + r) { lo = 2; break; }
        } else {
          const u = (box[axis] - r - av) / delta, v = (box[axis + 3] + r - av) / delta;
          lo = Math.max(lo, Math.min(u, v)); hi = Math.min(hi, Math.max(u, v));
          if (lo > hi) break;
        }
      }
      if (lo <= hi) return false;
    }
    return true;
  }
  /** Expand the seated monitor envelope continuously to travel clearance. */
  clearFlight(a: Vector3, b: Vector3, start: Vector3, end: Vector3) {
    const count = Math.max(1, Math.ceil(a.distanceTo(b) / .025));
    let prev = a;
    for (let i = 1; i <= count; i++) {
      const next = a.clone().lerp(b, i / count);
      const separation = Math.max(Math.min(prev.distanceTo(start), prev.distanceTo(end)), Math.min(next.distanceTo(start), next.distanceTo(end)));
      const r = .10 + (this.data.radius - .10) * Math.min(1, separation / .9);
      if (!this.clear(prev, next, undefined, r)) return false;
      prev = next;
    }
    return true;
  }
  private point(id: number, floor: number) { return new Vector3((id % NX) * CELL, EYE + floor * 3.4, -Math.floor(id / NX) * CELL); }
  private supported(p: Vector3, floor: number) {
    const r = this.data.radius;
    if (p.x < .25 || p.x > 21.25 || p.z > -.25 || p.z < -16.75) return false;
    if (floor && p.x < 6 + r && p.z < -4 + r && p.z > -10 - r) return false;
    // The staircase is a dedicated edge, never a flat shortcut under its treads.
    if (!floor && p.x < 1.42 && p.z < -4.25 && p.z > -10.15) return false;
    return true;
  }
  private free(id: number, floor: number) {
    if (!this.freeCache[floor][id]) {
      const p = this.point(id, floor);
      this.freeCache[floor][id] = this.supported(p, floor) && this.clear(p, p, floor) ? 1 : -1;
    }
    return this.freeCache[floor][id] === 1;
  }
  private attach(p: Vector3, floor: number) {
    const candidates: { id: number; d: number }[] = [];
    const cx = Math.round(p.x / CELL), cz = Math.round(-p.z / CELL);
    for (let z = Math.max(0, cz - 20); z <= Math.min(NZ - 1, cz + 20); z++)
      for (let x = Math.max(0, cx - 20); x <= Math.min(NX - 1, cx + 20); x++) {
        const id = z * NX + x;
        candidates.push({ id, d: this.point(id, floor).distanceToSquared(p) });
      }
    candidates.sort((a, b) => a.d - b.d);
    for (const { id } of candidates) if (this.free(id, floor) && this.clear(p, this.point(id, floor), floor)) return id;
    throw new Error(`No walkable attachment at ${p.toArray()}`);
  }
  walk(a: Vector3, b: Vector3, floor: number) {
    const start = this.attach(a, floor), end = this.attach(b, floor);
    const scores = new Float64Array(NX * NZ).fill(Infinity), parent = new Int32Array(NX * NZ).fill(-1);
    const closed = new Uint8Array(NX * NZ);
    const heap: { id: number; f: number }[] = [];
    const goal = this.point(end, floor);
    const push = (id: number, f: number) => {
      let at = heap.length; heap.push({ id, f });
      while (at) { const up = (at - 1) >> 1; if (heap[up].f <= f) break; heap[at] = heap[up]; at = up; }
      heap[at] = { id, f };
    };
    const pop = () => {
      const first = heap[0], tail = heap.pop()!;
      if (heap.length) {
        let at = 0;
        while (at * 2 + 1 < heap.length) {
          let child = at * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
          if (heap[child].f >= tail.f) break;
          heap[at] = heap[child]; at = child;
        }
        heap[at] = tail;
      }
      return first.id;
    };
    scores[start] = 0; push(start, this.point(start, floor).distanceTo(goal));
    while (heap.length) {
      const id = pop(); if (closed[id]) continue; closed[id] = 1;
      if (id === end) break;
      const x = id % NX, z = Math.floor(id / NX), p = this.point(id, floor);
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) continue;
        const next = nz * NX + nx;
        if (closed[next] || !this.free(next, floor)) continue;
        const q = this.point(next, floor);
        if (!this.clear(p, q, floor)) continue;
        const score = scores[id] + p.distanceTo(q);
        if (score >= scores[next]) continue;
        scores[next] = score; parent[next] = id; push(next, score + q.distanceTo(goal));
      }
    }
    if (!closed[end]) throw new Error(`No walking route: ${a.toArray()} -> ${b.toArray()}`);
    const ids = [end]; while (ids[ids.length - 1] !== start) ids.push(parent[ids[ids.length - 1]]);
    const raw = [a, ...ids.reverse().map(id => this.point(id, floor)), b];
    const result = [a];
    for (let i = 0; i < raw.length - 1;) {
      let j = raw.length - 1;
      for (; j > i + 1; j--) {
        // Visibility is not enough: the upper atrium must have floor under it.
        const length = raw[i].distanceTo(raw[j]); let valid = this.clear(raw[i], raw[j], floor);
        for (let k = 1; valid && k < Math.ceil(length / .05); k++) valid = this.supported(raw[i].clone().lerp(raw[j], k / Math.ceil(length / .05)), floor);
        if (valid) break;
      }
      result.push(raw[j]); i = j;
    }
    return result;
  }
  departure(position: Vector3, target: Vector3) {
    const key = [...position.toArray(), ...target.toArray()].map(v => v.toFixed(4)).join(':');
    const cached = this.departures.get(key);
    if (cached) return cached.map(p => p.clone());
    const floor = position.y > 3.4 ? 1 : 0, height = EYE + floor * 3.4;
    const back = position.clone().sub(target).setY(0).normalize();
    const right = new Vector3(-back.z, 0, back.x);
    const candidates = position.distanceTo(target) < 1.5
      ? [position.clone().addScaledVector(back, .6).setY(height),
         position.clone().addScaledVector(back, .45).addScaledVector(right, -.45).setY(height),
         position.clone().addScaledVector(back, .45).addScaledVector(right, .45).setY(height),
         position.clone().setY(height)]
      : [position.clone().setY(height)];
    const reasons: string[] = [];
    for (const p of candidates) {
      if (!this.clearFlight(position, p, position, position) || !this.supported(p, floor)) { reasons.push("departure segment blocked"); continue; }
      try {
        this.walk(p, new Vector3(floor ? .7 : .6, height, floor ? -10.65 : -.6), floor);
        const result = [position.clone(), p];
        this.departures.set(key, result);
        return result.map(v => v.clone());
      } catch (error) { reasons.push(String(error)); }
    }
    const blockers = this.data.boxes.filter(b => [position.x,position.y,position.z].every((v,i)=>v>=b[i]-.10&&v<=b[i+3]+.10)).map(b=>this.data.names[b[6]]);
    throw new Error(`No safe monitor departure at ${position.toArray()}: ${reasons.join('; ')}; seated blockers ${[...new Set(blockers)].join(', ')}`);
  }
  smooth(points: Vector3[]) {
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], prev = points[i - 1], next = points[i + 1];
      const flat = Math.abs(prev.y - p.y) < .001 && Math.abs(next.y - p.y) < .001;
      const distance = Math.min(.55, p.distanceTo(prev) * .30, p.distanceTo(next) * .30);
      const a = p.clone().lerp(prev, distance / p.distanceTo(prev));
      const b = p.clone().lerp(next, distance / p.distanceTo(next));
      const floor = p.y > 3.4 ? 1 : 0;
      const start = points[0], end = points[points.length-1];
      const validSample = (samples: Vector3[]) => samples.every((v, j) => {
        const onStairs = v.x >= .4 && v.x <= 1 && v.z < -4.25 && v.z > -10.25 && Math.abs(v.y - (EYE + Math.max(0, Math.min(20, (-v.z-4.4)/.28+.5))*.17)) < .25;
        if (!this.supported(v, floor) && !onStairs) return false;
        const from = j ? samples[j-1] : result[result.length-1];
        if (!this.clearFlight(from, v, start, end)) return false;
        return !flat || Math.min(v.distanceTo(start),v.distanceTo(end)) < .9 || this.clear(from, v, floor);
      });
      const incoming = p.clone().sub(prev).normalize(), outgoing = next.clone().sub(p).normalize();
      let rounded = false;
      // C1 cubic corners keep the entry/exit directions. Larger control arms
      // bow outside an obstacle corner instead of cutting into its envelope.
      for (const arm of [.55, 1, 1.5, 2]) {
        const c1 = a.clone().addScaledVector(incoming, distance * arm);
        const c2 = b.clone().addScaledVector(outgoing, -distance * arm);
        const count = Math.max(20, Math.ceil((a.distanceTo(c1)+c1.distanceTo(c2)+c2.distanceTo(b))/.025));
        const samples = [a];
        for (let j = 1; j <= count; j++) { const t = j/count, s = 1-t; samples.push(a.clone().multiplyScalar(s*s*s).addScaledVector(c1,3*s*s*t).addScaledVector(c2,3*s*t*t).addScaledVector(b,t*t*t)); }
        if (validSample(samples)) { result.push(...samples); rounded = true; break; }
      }
      if (!rounded) result.push(p);
    }
    result.push(points[points.length - 1]);
    return result.filter((p, i) => !i || p.distanceTo(result[i - 1]) > .0001);
  }
}

export function walkingPath(from: Vector3, target: Vector3, to: Shot): WalkingCurve | null {
  if (!navigation) return null;
  const key = [...from.toArray(), ...target.toArray(), ...to.position.toArray(), ...to.target.toArray()].map(v => v.toFixed(4)).join(':');
  const cached = routeCache.get(key);
  if (cached) return cached;
  const depart = navigation.departure(from, target), arrive = navigation.departure(to.position, to.target).reverse();
  const a = depart[depart.length - 1], b = arrive[0];
  const floorA = a.y > 3.4 ? 1 : 0, floorB = b.y > 3.4 ? 1 : 0;
  let middle: Vector3[];
  if (floorA === floorB) middle = navigation.walk(a, b, floorA);
  else {
    const stairs = [new Vector3(.7, EYE, -4.12)];
    // Continuous eye-height ramp over the twenty tread centres, with no bob.
    for (let step = 0; step < 20; step++) stairs.push(new Vector3(.7, EYE + (step + 1) * .17, -(4.4 + (step + .5) * .28)));
    stairs.push(new Vector3(.7, EYE + 3.4, -10.65));
    if (floorA) stairs.reverse();
    middle = [...navigation.walk(a, stairs[0], floorA), ...stairs.slice(1), ...navigation.walk(stairs[stairs.length - 1], b, floorB).slice(1)];
  }
  const points = [...depart.slice(0, -1), ...middle, ...arrive.slice(1)].filter((p, i, array) => !i || p.distanceTo(array[i-1]) > .0001);
  const smoothed = navigation.smooth(points);
  for (let i = 1; i < smoothed.length; i++) if (!navigation.clearFlight(smoothed[i-1], smoothed[i], from, to.position)) throw new Error(`Camera route intersects geometry at ${smoothed[i].toArray()}`);
  const curve = new WalkingCurve(smoothed);
  routeCache.set(key, curve);
  return curve;
}
