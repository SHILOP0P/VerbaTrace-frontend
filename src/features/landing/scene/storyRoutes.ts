import { CatmullRomCurve3, Vector3 } from "three";
import { doorPoint, ROOMS, type Shot, type ShotKey } from "./shots";

const p = (x: number, y: number, z: number) => new Vector3(x, y, z);
const room = (key?: ShotKey) => ROOMS.find(r => r.name === key);
const out = (key: ShotKey) => key === "owner" ? p(6.025, 5.15, -10.35) : doorPoint(room(key)!, "out").setY(key === "leader" ? 1.85 : 5.15);

/** Shared exits and interior approaches also serve non-neighbouring scenes.
 * A direct flight never visits an intermediate monitor or restarts its motion.
 */
export function storyRoute(from: Vector3, to: Shot, fromKey?: ShotKey, toKey?: ShotKey) {
  if (!fromKey || !toKey || fromKey === toKey || toKey === "hero" || toKey === "employee") return null;
  const upstairs = toKey !== "leader", points = [from.clone()];
  const approachSide = to.target.clone().sub(to.position).normalize().cross(p(0, 1, 0)).negate();
  const landing = (height: number) => to.position.clone().addScaledVector(to.position.clone().sub(to.target).normalize(), .18).addScaledVector(approachSide, .25).setY(height);
  if (fromKey === "hero") { points.push(p(3.8, 2.35, -2.8)); if (!upstairs) points.push(p(7.8, 2.35, -3.4)); }
  else if (fromKey === "employee") points.push(from.clone().add(p(.25, 0, .45)).setY(2.15));
  else if (fromKey === "leader") {
    points.push(from.clone().add(p(.12, 0, .30)).setY(1.95), p(20.575, 1.95, -12.15),
      doorPoint(room("leader")!, "in").setY(1.85), out("leader"));
  } else if (fromKey === "deputy") {
    points.push(from.clone().add(p(.12, 0, .30)).setY(5.15), p(11.2, 5.15, -5.6),
      doorPoint(room("deputy")!, "in").setY(5.15), out("deputy"));
  }

  if (!upstairs) {
    points.push(p(13.65, 2.2, -8.2), p(19, 2.05, -8.6), out("leader"),
      doorPoint(room("leader")!, "in").setY(1.85), p(20.65, 1.9, -12.8),
      p(20.65, 1.85, -14.0), landing(1.75));
  } else {
    if (fromKey !== "deputy") {
      // The rise stays inside the real opening, farther from the owner-side
      // wall than the previous arc. The turn is staged over this lift.
      points.push(p(4.95, 2.35, -7.1), p(4.5, 3.5, -6.75), p(4.55, 5.15, -5.6));
    }
    if (toKey === "deputy") {
      points.push(out("deputy"), doorPoint(room("deputy")!, "in").setY(5.15),
        p(10.6, 5.15, -5.25), p(11.35, 5.15, -6.25),
        p(11.15, 5.15, -6.65), landing(5.15));
    } else {
      if (fromKey !== "deputy") points.push(p(6.7, 5.15, -5.4));
      points.push(p(6.65, 5.15, -7.9), p(6.65, 5.15, -9.65), out("owner"),
        doorPoint(room("owner")!, "in").setY(5.15), p(5.65, 5.15, -14.8),
        p(4.25, 5.15, -15.25), landing(5.15));
    }
  }
  points.push(to.position.clone());
  const curve = new CatmullRomCurve3(points, false, "centripetal");
  curve.arcLengthDivisions = 800; curve.updateArcLengths(); return curve;
}

export function storyFocus(to: Shot, toKey?: ShotKey) {
  if (toKey === "employee") return to.target.clone().setY(1.75);
  const r = room(toKey);
  return r ? p((r.bounds.minX + r.bounds.maxX) / 2, r.floorLevel + 1.7, (r.bounds.minZ + r.bounds.maxZ) / 2) : null;
}

export function storyStaging(curve: CatmullRomCurve3, fromKey?: ShotKey, toKey?: ShotKey) {
  const exit = fromKey && room(fromKey) ? out(fromKey) : undefined;
  const lift = curve.points.findIndex((v, i) => i < curve.points.length - 1 && v.y < 3 && curve.points[i + 1].y > 3);
  return { exit, entrance: room(toKey), liftStart: lift >= 0 ? curve.points[lift] : undefined, liftEnd: lift >= 0 ? curve.points[lift + 2] : undefined };
}
