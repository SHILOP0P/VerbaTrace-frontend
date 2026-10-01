import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Bone, Group, Material, Mesh, Object3D, Quaternion, Vector3 } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CursorState } from "./OfficeStage";

export const FIGURE_URL = "/assets/scene/figure.glb";
const DRACO_PATH = "/draco/gltf/";

useGLTF.preload(FIGURE_URL, DRACO_PATH);


/**
 * Bone names the figure file uses, as agreed with the build script. The glTF
 * loader sanitises node names and turns the dot of a Blender side suffix into
 * an underscore, so both spellings are looked for.
 */
const BONES = {
  upperArmR: ["upper_arm.R", "upper_arm_R"],
  forearmR: ["forearm.R", "forearm_R"],
  handR: ["hand.R", "hand_R"]
};

/**
 * Beyond this, in metres, a figure is not drawn, and over the metre and a half
 * before it they thin out.
 *
 * Far enough to cover the whole floor: a shorter range emptied the desks at the
 * back of the wide shot, and a room whose far half has nobody in it is the
 * first thing the eye picks up.
 */
const VISIBLE_RANGE = 26;
const FAR_FADE = 1.5;

/**
 * A safety net, nothing more. No desk the camera parks at has anybody in it any
 * more, so this should never come into play; if some future shot does put the
 * lens inside somebody's head, they thin out rather than turn the view into the
 * inside of a skull.
 */
const FADE_GONE = 0.55;
const FADE_FULL = 0.95;
const headOffset = new Vector3(0, 1.15, 0);

/** How far the mouse travels on the desk for a full sweep of the screen, in metres. */
const MOUSE_SPAN_X = 0.07;
const MOUSE_SPAN_Z = 0.05;

export type FigurePlacement = {
  /** Where the figure's origin (between the feet, on the floor) goes. */
  position: Vector3;
  /** The direction the figure faces, along the floor. */
  forward: Vector3;
  /** Where the mouse rests on the desk when the cursor is in the middle of the screen. */
  mouseHome: Vector3;
  /** Whether this one is at a keyboard. Somebody on a sofa is not. */
  typing?: boolean;
};

const scratch = {
  shoulder: new Vector3(),
  elbow: new Vector3(),
  wrist: new Vector3(),
  target: new Vector3(),
  pole: new Vector3(),
  normal: new Vector3(),
  inPlane: new Vector3(),
  desired: new Vector3(),
  current: new Vector3(),
  along: new Vector3(),
  worldQuaternion: new Quaternion(),
  parentQuaternion: new Quaternion(),
  swing: new Quaternion()
};

/**
 * Turns a bone so the direction to its child points at `direction` in world
 * space. Only the swing is changed: the bone keeps whatever twist the rest pose
 * gave it, which is enough for a mannequin's arm.
 */
function aimBone(bone: Bone, child: Object3D, direction: Vector3) {
  const { along, current, worldQuaternion, parentQuaternion, swing } = scratch;
  along.copy(child.position).normalize();
  bone.getWorldQuaternion(worldQuaternion);
  current.copy(along).applyQuaternion(worldQuaternion).normalize();
  swing.setFromUnitVectors(current, direction);
  worldQuaternion.premultiply(swing);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(parentQuaternion);
    bone.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));
  } else {
    bone.quaternion.copy(worldQuaternion);
  }
  bone.updateWorldMatrix(false, true);
}

/**
 * Two-bone IK for an arm: the elbow lands in the plane through the shoulder,
 * the target and a pole point below and outside the arm, so it bends the way a
 * real elbow does.
 */
function solveArm(upper: Bone, fore: Bone, hand: Bone, targetWorld: Vector3, poleWorld: Vector3) {
  const { shoulder, elbow, wrist, target, pole, normal, inPlane, desired } = scratch;
  upper.getWorldPosition(shoulder);
  fore.getWorldPosition(elbow);
  hand.getWorldPosition(wrist);
  const upperLength = shoulder.distanceTo(elbow);
  const foreLength = elbow.distanceTo(wrist);
  target.copy(targetWorld).sub(shoulder);
  const reach = upperLength + foreLength - 0.005;
  const distance = Math.min(Math.max(target.length(), 0.02), reach);
  target.normalize();
  pole.copy(poleWorld).sub(shoulder);
  normal.crossVectors(target, pole).normalize();
  inPlane.crossVectors(normal, target).normalize();
  const alongShoulder = (upperLength * upperLength - foreLength * foreLength + distance * distance) / (2 * distance);
  const lift = Math.sqrt(Math.max(0, upperLength * upperLength - alongShoulder * alongShoulder));
  desired.copy(target).multiplyScalar(alongShoulder).addScaledVector(inPlane, lift).normalize();
  aimBone(upper, fore, desired);
  fore.getWorldPosition(elbow);
  desired.copy(shoulder).addScaledVector(target, distance).sub(elbow).normalize();
  aimBone(fore, hand, desired);
}

/**
 * Somebody at a desk. Each one is a clone of the same file with its own
 * skeleton and its own mixer, offset in time so a room full of them does not
 * breathe in unison. Given a cursor, the right arm follows the mouse of the
 * screen that cursor belongs to.
 */
export function Figure({ placement, cursor, seed = 0, typing = true }: {
  placement: FigurePlacement;
  cursor?: RefObject<CursorState>;
  seed?: number;
  /** Whether this one taps at the keyboard now and then. */
  typing?: boolean;
}) {
  const group = useRef<Group>(null);
  const gltf = useGLTF(FIGURE_URL, DRACO_PATH);
  // Skinned meshes cannot share a scene between instances: the clone brings its
  // own skeleton, so every figure poses on its own.
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);
  // The clone shares its materials with every other figure, and one of them has
  // to fade on its own. Each gets its own copy; there are a dozen people in the
  // room, so the extra state costs nothing.
  const skins = useMemo(() => {
    const list: Material[] = [];
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone();
      material.depthWrite = true;
      mesh.material = material;
      list.push(material);
    });
    return list;
  }, [scene]);
  const faded = useRef(-1);
  const { actions } = useAnimations(gltf.animations, group);
  const bones = useMemo(() => {
    const find = (names: string[]) => {
      for (const name of names) {
        const bone = scene.getObjectByName(name) as Bone | undefined;
        if (bone) return bone;
      }
      return undefined;
    };
    const upper = find(BONES.upperArmR);
    const fore = find(BONES.forearmR);
    const hand = find(BONES.handR);
    return upper && fore && hand ? { upper, fore, hand } : null;
  }, [scene]);
  const rotationY = Math.atan2(placement.forward.x, placement.forward.z);
  const right = useMemo(() => new Vector3().crossVectors(placement.forward, new Vector3(0, 1, 0)).normalize(), [placement.forward]);
  const wasTyping = useRef(false);
  const mouseTarget = useMemo(() => placement.mouseHome.clone(), [placement.mouseHome]);
  const smoothed = useMemo(() => placement.mouseHome.clone(), [placement.mouseHome]);
  const pole = useMemo(() => placement.mouseHome.clone().addScaledVector(right, 0.45).add(new Vector3(0, -0.35, 0)), [placement.mouseHome, right]);

  useEffect(() => {
    const idle = actions.idle;
    if (!idle) return;
    idle.reset().fadeIn(0.4).play();
    // A shared clip started at the same instant everywhere reads as a chorus.
    idle.time = (seed * 0.37) % Math.max(0.1, idle.getClip().duration);
    return () => {
      idle.fadeOut(0.2);
    };
  }, [actions, seed]);

  useFrame((state, delta) => {
    // Somebody four desks away is a handful of thousand triangles of skinned
    // mesh that nobody can make out. Out of sight, out of the frame.
    const group3d = group.current;
    if (group3d) {
      const distance = state.camera.position.distanceTo(scratch.target.copy(placement.position).add(headOffset));
      const near = Math.min(1, Math.max(0, (distance - FADE_GONE) / (FADE_FULL - FADE_GONE)));
      const far = Math.min(1, Math.max(0, (VISIBLE_RANGE - distance) / FAR_FADE));
      const fade = Math.min(near, far);
      const drawn = fade > 0;
      if (group3d.visible !== drawn) group3d.visible = drawn;
      if (!drawn) return;
      if (Math.abs(fade - faded.current) > 0.004) {
        faded.current = fade;
        for (const material of skins) {
          material.transparent = fade < 1;
          material.opacity = fade;
          material.depthWrite = fade > 0.85;
        }
      }
    }

    const type = actions.type;
    if (type) {
      // Without a cursor the figure types in bursts of its own.
      const wants = cursor
        ? Boolean(cursor.current?.typing)
        : typing && Math.sin(state.clock.elapsedTime * 0.5 + seed) > 0.25;
      if (wants !== wasTyping.current) {
        wasTyping.current = wants;
        if (wants) type.reset().fadeIn(0.25).play();
        else type.fadeOut(0.35);
      }
    }

    if (!bones || !cursor?.current) return;
    const state2 = cursor.current;
    mouseTarget.copy(placement.mouseHome)
      .addScaledVector(right, (state2.x - 0.5) * MOUSE_SPAN_X)
      .addScaledVector(placement.forward, (0.5 - state2.y) * MOUSE_SPAN_Z);
    if (state2.down) mouseTarget.y -= 0.004;
    smoothed.lerp(mouseTarget, Math.min(1, delta * 9));
    solveArm(bones.upper, bones.fore, bones.hand, smoothed, pole);
    // No priority on this frame callback on purpose: a priority above zero
    // hands the render loop over and react-three-fiber stops drawing by itself.
  });

  return (
    <group ref={group} position={placement.position} rotation={[0, rotationY, 0]}>
      <primitive object={scene} />
    </group>
  );
}
