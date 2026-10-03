import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";

type Actor = { position: Vector3; animate: boolean };
const actors = new Map<object, Actor>();
export const registerFigure = (key: object, position: Vector3) => {
  actors.set(key, { position, animate: false });
  return () => { actors.delete(key); };
};
export const figureAnimates = (key: object) => actors.get(key)?.animate ?? false;

/** Four nearest actors move; distant actors retain their already posed meshes. */
export function FigureBudget({ active }: { active: boolean }) {
  useFrame(({ camera }) => {
    for (const actor of actors.values()) actor.animate = false;
    if (!active || document.visibilityState === "hidden") return;
    for (let i = 0; i < 4; i += 1) {
      let best: Actor | undefined;
      let distance = 64;
      for (const actor of actors.values()) {
        if (actor.animate) continue;
        const next = camera.position.distanceToSquared(actor.position);
        if (next < distance) { best = actor; distance = next; }
      }
      if (best) best.animate = true;
    }
  }, -1);
  return null;
}
