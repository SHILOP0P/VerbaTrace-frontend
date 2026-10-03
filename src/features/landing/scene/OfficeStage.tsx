import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3, WebGLRenderTarget } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { KTX2Loader } from "three-stdlib";
import { batchStatics } from "./staticBatches";
import { SceneDiagnostics } from "./SceneDiagnostics";
import { CameraRig, cameraRouteAudit, prepareCameraRoutes } from "./CameraRig";
import { FigureBudget } from "./FigureBudget";
import { FrameBudget } from "./FrameBudget";
import { Figure, type FigurePlacement } from "./Figure";
import { ScreenProjector, screenFrame, type ScreenFrame } from "./MonitorScreen";
import {
  ANCHOR_FORWARD,
  fromCamera,
  placeholderShots,
  SCREEN_GLOW,
  screenView,
  setOccupants,
  wideView,
  type MonitorKey,
  type Shot,
  type ShotKey,
  type Viewport
} from "./shots";

export const OFFICE_URL = "/assets/scene/office.glb?v=18";
const DRACO_PATH = "/draco/gltf/";

// Compressed textures need the actual renderer's supported GPU formats.
// Loading begins when OfficeModel configures its local decoder below.


/**
 * The glass each monitor scene looks at, as the office file names it. The
 * employee's is the middle column of the second row, so rows of desks continue
 * behind the screen and the leader's glass office sits in the background.
 */
const SCREEN_NAMES: Record<MonitorKey, string[]> = {
  employee: ["screen_hero", "screen_8"],
  leader: ["screen_leader_0"],
  deputy: ["screen_deputy_0", "screen_deputy"],
  owner: ["screen_owner_0"]
};

const MONITOR_ROLES = Object.keys(SCREEN_NAMES) as MonitorKey[];

/**
 * The desk each monitor scene belongs to. The anchor's forward axis runs from
 * the sitter to the screen, which is what tells the scene which face of the
 * glass looks out into the room — without it the outward normal of an upright
 * screen is a coin toss and the camera ends up inside the wall.
 */
const DESK_ANCHOR_NAMES: Record<MonitorKey, string[]> = {
  employee: ["ws_hero", "ws_8"],
  leader: ["leader_desk_001", "leader_desk.001", "leader_desk"],
  deputy: ["deputy_desk_001", "deputy_desk.001", "deputy_desk"],
  owner: ["owner_desk_001", "owner_desk.001", "owner_desk"]
};
/**
 * Where the room's people sit: every workstation except the one the camera
 * comes to.
 *
 * None of the four desks the camera visits has anybody in it, and that is
 * deliberate. The camera parks a hand's width from the glass, which is exactly
 * where the sitter's head is; there is no arrangement that keeps a person in
 * that chair, keeps the screen readable and keeps the lens out of their skull.
 * So those chairs are free, and the offices are given their occupant somewhere
 * else in the room (`LOUNGE_SEATS`).
 */
const FIGURE_ANCHOR_NAMES = [
  "ws_0", "ws_1", "ws_2", "ws_4", "ws_6", "ws_7",
  "ws_10", "ws_11", "ws_13", "ws_14", "ws_17", "ws_19", "ws_21", "ws_22"
];

/**
 * The leader, the deputy and the owner, each at their own desk in their own
 * room and nobody else in it.
 *
 * Every one of those desks carries two screens and the office file puts its
 * owner at the right-hand one, with the keyboard and the mouse. The camera goes
 * to the left-hand one, which is the same person's second monitor: they stay in
 * their chair, in shot, the whole way in, and the lens never comes near them.
 */
const SEAT_ANCHOR_NAMES = ["leader_seat", "deputy_seat", "owner_seat"];
/** Desk geometry around an anchor (the anchor sits at the monitor), in metres. */
const CHAIR_BACK = 0.72;
const MOUSE_BACK = 0.3;
const MOUSE_SIDE = 0.3;
const DESK_TOP = 0.755;

export type CursorState = { x: number; y: number; down: boolean; typing: boolean };

/**
 * The photograph of a screen at the position its recording starts from.
 *
 * Taken by `tools/office-scene/capture_screens.ps1` against the same documents
 * the monitors run, in both themes, and re-taken after a redesign. Loaded
 * straight rather than through drei's hook on purpose: a hook would suspend the
 * whole room every time the visitor flips the theme, and the office would blink
 * out for as long as the download.
 */
const screenImages = new Map<string, Promise<Texture | null>>();

function loadScreenImage(role: MonitorKey, theme: "light" | "dark", portrait = false) {
  const key = `${role}${portrait ? "-portrait" : ""}-${theme}`;
  const cached = screenImages.get(key);
  if (cached) return cached;
  const pending = new Promise<Texture | null>((resolve) => {
    new TextureLoader().load(
      `/assets/scene/screens/${key}.jpg?v=3`,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        // glTF hands over its UVs with the origin at the top left, which is
        // where an image's first row is too.
        texture.flipY = false;
        texture.anisotropy = 4;
        resolve(texture);
      },
      undefined,
      // A missing picture is not worth a broken office: the glass keeps the
      // flat colour of the theme.
      () => resolve(null)
    );
  });
  screenImages.set(key, pending);
  return pending;
}

type OfficeSet = {
  shots: Record<ShotKey, Shot>;
  screens: Partial<Record<MonitorKey, ScreenFrame>>;
  placements: FigurePlacement[];
};

/** Transmission is replaced by inexpensive sorted glass, preserving PBR maps. */
function flattenGlass(root: Group) {
  const swapped = new Map<MeshPhysicalMaterial, MeshStandardMaterial>();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = materials.map((source) => {
      const physical = source as MeshPhysicalMaterial;
      if (!physical.isMeshPhysicalMaterial) return source;
      let plain = swapped.get(physical);
      if (!plain) {
        plain = new MeshStandardMaterial().copy(physical);
        if (physical.transmission > 0) {
          plain.roughness = .12;
          plain.metalness = 0;
          plain.transparent = true;
          plain.opacity = .04;
          plain.depthWrite = false;
          // One thin pane, rather than two blended front/back passes. Stacked
          // partitions must not darken the whole floor as the camera moves.
          plain.forceSinglePass = true;
        }
        swapped.set(physical, plain);
      }
      return plain;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  return () => { for (const material of swapped.values()) material.dispose(); };
}

const heroCameraMissing = (root: Group) => !root.getObjectByName("cam_hero_wide");

function firstNamed(root: Group, names: string[]) {
  for (const name of names) {
    const object = root.getObjectByName(name);
    if (object) return object;
  }
  return undefined;
}

/** Where the sitter and their mouse are, given the monitor's place and facing. */
function placementAt(monitor: Vector3, forward: Vector3): FigurePlacement {
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  return {
    position: monitor.clone().addScaledVector(forward, -CHAIR_BACK).setY(0),
    forward: forward.clone(),
    mouseHome: monitor.clone().addScaledVector(forward, -MOUSE_BACK).addScaledVector(right, MOUSE_SIDE).setY(DESK_TOP)
  };
}

/** The monitor's place and the way its desk faces, from a workstation anchor. */
function anchorPose(anchor: Object3DLike) {
  const monitor = new Vector3();
  anchor.getWorldPosition(monitor);
  const forward = ANCHOR_FORWARD.clone()
    .applyQuaternion(anchor.getWorldQuaternion(new Quaternion()))
    .setY(0)
    .normalize();
  return { monitor, forward };
}

type Object3DLike = { getWorldPosition(target: Vector3): Vector3; getWorldQuaternion(target: Quaternion): Quaternion };

const placeholderPlacement = placementAt(new Vector3(0, 1.12, -0.32), new Vector3(0, 0, -1));

/** What the room knows about itself once, whatever the window does afterwards. */
type OfficeBuild = {
  screens: Partial<Record<MonitorKey, ScreenFrame>>;
  portraitScreens: Partial<Record<MonitorKey, ScreenFrame>>;
  responsiveMonitors: Array<{ original: Object3D[]; portrait: Group }>;
  materials: Partial<Record<MonitorKey, MeshBasicMaterial>>;
  /** The other twenty monitors in the room, all on one material. */
  room: MeshBasicMaterial;
  placements: FigurePlacement[];
  hero: Shot;
};

/** The four visited desks use a portrait display only at phone widths. */
function portraitMonitor(frame: ScreenFrame, base: Vector3, screenMaterial: MeshBasicMaterial) {
  const width = frame.height * 1.34;
  const height = frame.width * 0.96;
  // Keep the lower edge where the old glass was, above the desk and keyboard.
  const center = frame.center.clone().add(new Vector3(0, (height - frame.height) / 2, 0));
  const normal = new Vector3(0, 0, 1).applyQuaternion(frame.quaternion);
  const metal = new MeshStandardMaterial({ color: "#292827", metalness: 0.22, roughness: 0.48 });
  const stand = new MeshStandardMaterial({ color: "#383635", metalness: 0.22, roughness: 0.55 });
  const group = new Group();
  group.userData.responsiveMonitor = true;

  const bezel = new Mesh(new BoxGeometry(width + 0.052, height + 0.052, 0.038), metal);
  bezel.position.copy(center);
  bezel.quaternion.copy(frame.quaternion);
  group.add(bezel);

  const glass = new Mesh(new PlaneGeometry(width, height), screenMaterial);
  glass.position.copy(center).addScaledVector(normal, 0.021);
  glass.quaternion.copy(frame.quaternion);
  group.add(glass);

  const stemHeight = Math.max(0.055, center.y - height / 2 - base.y) + 0.05;
  const stem = new Mesh(new BoxGeometry(0.043, stemHeight, 0.042), stand);
  stem.position.set(base.x, base.y + stemHeight / 2, base.z);
  group.add(stem);
  const foot = new Mesh(new BoxGeometry(0.19, 0.014, 0.13), stand);
  foot.position.set(base.x, base.y + 0.007, base.z);
  group.add(foot);

  return { group, frame: { center: glass.position.clone(), quaternion: frame.quaternion.clone(), width, height } };
}

function OfficeModel({ viewport, theme, onReady }: {
  viewport: Viewport;
  theme: "light" | "dark";
  onReady: (set: OfficeSet) => void;
}) {
  const gl = useThree((state) => state.gl);
  const phoneScreens = viewport.width <= 720;
  const ktx = useMemo(() => new KTX2Loader().setTranscoderPath("/basis/").setWorkerLimit(2).detectSupport(gl), [gl]);
  const gltf = useGLTF(OFFICE_URL, DRACO_PATH, true, (loader) => loader.setKTX2Loader(ktx));
  // Never mutate the loader cache: remounts and StrictMode get an intact source.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const floorLightmaps = useTexture(["/assets/scene/floor1_light.jpg?v=18", "/assets/scene/floor2_light.jpg?v=18"]);
  const [build, setBuild] = useState<OfficeBuild | null>(null);
  const [picturesReady, setPicturesReady] = useState(false);

  // Everything that changes the room itself happens once. It used to share an
  // effect with the camera shots, which depend on the window, so dragging an
  // edge welded the already welded furniture all over again.
  useEffect(() => {
    scene.updateMatrixWorld(true);
    const disposeSimplified = flattenGlass(scene);
    const bakedMaterials: MeshBasicMaterial[] = [];
    const originalFloors: { mesh: Mesh; material: MeshStandardMaterial }[] = [];
    scene.getObjectByName("exterior_city_backdrop")?.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const source = mesh.material as MeshStandardMaterial;
      const material = new MeshBasicMaterial({ name: "exterior_city_unlit", map: source.emissiveMap, toneMapped: false, side: source.side });
      originalFloors.push({mesh, material: source});
      bakedMaterials.push(material);
      mesh.material = material;
    });
    for (let floor = 1; floor <= 2; floor += 1) {
      const root = scene.getObjectByName(`floor${floor}_carpet`);
      const lightMap = floorLightmaps[floor - 1];
      lightMap.colorSpace = SRGBColorSpace;
      lightMap.flipY = false;
      lightMap.channel = 1;
      // useTexture has already uploaded this external image with TextureLoader's
      // flipY=true. Changing metadata alone leaves the old orientation on GPU.
      lightMap.needsUpdate = true;
      gl.initTexture(lightMap);
      root?.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const source = mesh.material as MeshStandardMaterial;
        originalFloors.push({ mesh, material: source });
        const material = new MeshBasicMaterial({
          name: `baked_floor${floor}`, color: source.name === "carpet_b" ? "#999b9e" : "#888b8f",
          lightMap, lightMapIntensity: 4 * Math.PI, side: source.side
        });
        mesh.material = material;
        bakedMaterials.push(material);
      });
    }
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) for (const value of Object.values(material)) {
        if (value instanceof Texture) {
          value.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
          gl.initTexture(value);
        }
      }
    });

    const heroAnchor = firstNamed(scene, DESK_ANCHOR_NAMES.employee);
    const heroPose = heroAnchor ? anchorPose(heroAnchor) : null;
    const screens: Partial<Record<MonitorKey, ScreenFrame>> = {};
    const portraitScreens: Partial<Record<MonitorKey, ScreenFrame>> = {};
    const responsiveMonitors: Array<{ original: Object3D[]; portrait: Group }> = [];
    const materials: Partial<Record<MonitorKey, MeshBasicMaterial>> = {};
    const materialAssigned = new Set<Mesh>();
    const missing: string[] = [];

    (Object.keys(SCREEN_NAMES) as MonitorKey[]).forEach((key) => {
      const mesh = firstNamed(scene, SCREEN_NAMES[key]) as Mesh | undefined;
      if (!mesh) {
        missing.push(SCREEN_NAMES[key][0]);
        return;
      }
      const center = new Vector3();
      mesh.getWorldPosition(center);
      const anchor = firstNamed(scene, DESK_ANCHOR_NAMES[key]);
      // Where the person sits: the side the screen faces.
      const seat = anchor
        ? center.clone().addScaledVector(anchorPose(anchor).forward, -1.2)
        : center.clone().add(new Vector3(0, 0.4, 0));
      screens[key] = screenFrame(mesh, seat);
      // The live page is laid over this glass, but only while the camera looks
      // straight at it. The rest of the time the glass carries a photograph of
      // the same screen at the position the recording starts from, so a monitor
      // in the corner of the eye is a working one and not a blank panel. Unlit
      // on purpose: a screen gives out light, it does not take it.
      const material = new MeshBasicMaterial({ color: SCREEN_GLOW[theme], toneMapped: false });
      materials[key] = material;
      mesh.material = material;
      materialAssigned.add(mesh);
      const body = scene.getObjectByName(mesh.name.replace(/^screen/, "monitor"));
      const original = body ? [mesh, body] : [mesh];
      // The bezel is a glTF Group with two mesh primitives. Keep both pieces
      // out of the static weld so they can be replaced at phone widths.
      original.forEach((part) => part.traverse((piece) => { piece.userData.responsiveMonitor = true; }));
      if (body) {
        const base = new Vector3();
        body.getWorldPosition(base);
        const portrait = portraitMonitor(screens[key]!, base, material);
        portrait.group.visible = viewport.width <= 720;
        original.forEach((part) => { part.visible = viewport.width > 720; });
        portraitScreens[key] = portrait.frame;
        responsiveMonitors.push({ original, portrait: portrait.group });
      }
    });
    // Every other monitor in the room runs the product too, in the same theme,
    // all off one material — which is also what lets the twenty of them weld
    // into a single draw call below.
    const room = new MeshBasicMaterial({ color: SCREEN_GLOW[theme], toneMapped: false });
    room.name = "room_screens";
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.name.startsWith("screen_") || materialAssigned.has(mesh)) return;
      mesh.material = room;
    });

    // After the screens have their own materials and their frames are taken, so
    // neither is lost in the weld.
    const disposeBatches = batchStatics(scene);
    for (const pair of responsiveMonitors) scene.add(pair.portrait);
    // The office is static, including the hidden originals retained for
    // anchors/occlusion. Rebuilding thousands of world matrices on every
    // camera frame adds CPU work without changing their positions.
    scene.updateMatrixWorld(true);
    const staticTransforms: Array<{object: Object3D; local: boolean; world: boolean}> = [];
    scene.traverse(object => {
      staticTransforms.push({object, local: object.matrixAutoUpdate, world: object.matrixWorldAutoUpdate});
      object.matrixAutoUpdate = object.matrixWorldAutoUpdate = false;
    });
    if (missing.length) console.warn("office scene: no screen mesh for", missing.join(", "));
    if (heroCameraMissing(scene)) console.warn("office scene: no cam_hero_wide, falling back to a computed wide shot");

    const heroCamera = scene.getObjectByName("cam_hero_wide");
    const hero = heroCamera ? fromCamera(heroCamera) : wideView(heroPose?.monitor ?? new Vector3());

    const placements = FIGURE_ANCHOR_NAMES.flatMap((name) => {
      const anchor = scene.getObjectByName(name);
      if (!anchor) return [];
      const pose = anchorPose(anchor);
      return [placementAt(pose.monitor, pose.forward)];
    });

    for (const name of SEAT_ANCHOR_NAMES) {
      const anchor = scene.getObjectByName(name);
      if (!anchor) continue;
      const pose = anchorPose(anchor);
      const right = new Vector3().crossVectors(pose.forward, new Vector3(0, 1, 0)).normalize();
      placements.push({
        position: pose.monitor.clone(),
        forward: pose.forward,
        mouseHome: pose.monitor.clone()
          .addScaledVector(pose.forward, CHAIR_BACK - MOUSE_BACK)
          .addScaledVector(right, MOUSE_SIDE)
          .setY(pose.monitor.y + DESK_TOP)
      });
    }

    // The camera's routes are built against these: waypoints are pushed out of
    // anybody they would otherwise land in.
    setOccupants(placements.map((placement) => placement.position));

    setBuild({ screens, portraitScreens, responsiveMonitors, materials, room, placements, hero });
    return () => {
      staticTransforms.forEach(({object, local, world}) => { object.matrixAutoUpdate = local; object.matrixWorldAutoUpdate = world; });
      disposeBatches();
      originalFloors.forEach(({ mesh, material }) => { mesh.material = material; });
      disposeSimplified();
      bakedMaterials.forEach((material) => material.dispose());
      Object.values(materials).forEach((material) => material?.dispose());
      room.dispose();
      for (const pair of responsiveMonitors) {
        scene.remove(pair.portrait);
        pair.original.forEach((part) => { part.visible = true; });
        pair.portrait.traverse((object) => {
          const mesh = object as Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          // The glass shares its material with the original screen.
          if ((mesh.material as MeshStandardMaterial).isMeshStandardMaterial) mesh.material instanceof MeshStandardMaterial && mesh.material.dispose();
        });
      }
    };
    // The theme is read once here for the colour under the picture; the picture
    // itself follows it in its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, gl, floorLightmaps]);

  // The camera shots depend on the window, and only on it.
  useEffect(() => {
    if (!build || !picturesReady) return;
    const phone = viewport.width <= 720;
    for (const pair of build.responsiveMonitors ?? []) {
      pair.original.forEach((mesh) => { mesh.visible = !phone; });
      pair.portrait.visible = phone;
    }
    const screens = phone ? { ...build.screens, ...build.portraitScreens } : build.screens;
    const shots = { ...placeholderShots } as Record<ShotKey, Shot>;
    shots.hero = build.hero;
    for (const key of Object.keys(screens) as MonitorKey[]) {
      const frame = screens[key];
      if (frame) shots[key] = screenView(frame, viewport);
    }
    prepareCameraRoutes(shots);
    onReady({ shots, screens, placements: build.placements });
  }, [build, picturesReady, viewport, onReady]);

  // The pictures on the glass follow the landing's theme. Both sets are fetched
  // at the start, so flipping the switch swaps them in the same frame instead of
  // leaving four blank monitors while a download finishes.
  useEffect(() => {
    if (!build) return;
    let live = true;
    const dress = (material: MeshBasicMaterial, role: MonitorKey, portrait = false) => {
      // Only until the picture arrives: this material multiplies its colour by
      // its map, and the dark theme's near-black background multiplied a
      // perfectly good screenshot down to nothing. With a picture on it the
      // colour has to be white.
      if (!material.map) material.color.set(SCREEN_GLOW[theme]);
      loadScreenImage(role, theme, portrait).then((texture) => {
        if (!live || !texture) return;
        gl.initTexture(texture);
        material.map = texture;
        material.color.set("#ffffff");
        material.needsUpdate = true;
      });
    };
    for (const key of Object.keys(build.materials) as MonitorKey[]) {
      const material = build.materials[key];
      if (material) dress(material, key, phoneScreens);
    }
    // The floor's own monitors show the call list: it is what the room does.
    dress(build.room, "employee");

    // The other theme is fetched and handed to the card straight away, while
    // the curtain is still up. Flipping the switch then costs a pointer swap;
    // without this it cost eight downloads and eight uploads at once, in the
    // middle of an animation.
    const other = theme === "dark" ? "light" : "dark";
    for (const key of MONITOR_ROLES) {
      loadScreenImage(key, other, phoneScreens).then((texture) => {
        if (live && texture) gl.initTexture(texture);
      });
    }
    Promise.all([...MONITOR_ROLES.flatMap((key) => [loadScreenImage(key, "light", phoneScreens), loadScreenImage(key, "dark", phoneScreens)]), loadScreenImage("employee", "light"), loadScreenImage("employee", "dark")]).then((textures) => {
      if (!live) return;
      textures.forEach((texture) => { if (texture) gl.initTexture(texture); });
      setPicturesReady(true);
    });
    return () => { live = false; };
  }, [build, theme, gl, phoneScreens]);

  return <primitive object={scene} dispose={null} />;
}

/**
 * Stands in for the office file while it is missing: a floor, a few desks and
 * one monitor at the origin, so the camera, the scroll and the live screen can
 * be tried before the real room arrives.
 */
function PlaceholderOffice({ screenRef }: { screenRef: RefObject<Mesh | null> }) {
  const desks = useMemo(() => {
    const list: Array<[number, number]> = [];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        list.push([column * 3.2 - 3.2, -row * 2.6]);
      }
    }
    return list;
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -3]}>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#8f877c" roughness={0.95} />
      </mesh>
      {desks.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.72, -0.3]}>
            <boxGeometry args={[1.5, 0.04, 0.75]} />
            <meshStandardMaterial color="#d9cfc2" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.12, -0.34]}>
            <boxGeometry args={[0.58, 0.38, 0.03]} />
            <meshStandardMaterial color="#2a2a2e" roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.0, -0.72]}>
            <boxGeometry args={[1.6, 0.6, 0.03]} />
            <meshStandardMaterial color="#b9c2c9" />
          </mesh>
        </group>
      ))}
      <mesh ref={screenRef} name="screen_hero" position={[0, 1.12, -0.32]}>
        <planeGeometry args={[0.53, 0.33]} />
        <meshStandardMaterial color="#111114" />
      </mesh>
    </group>
  );
}

/**
 * Draws the whole room into a sixteen-pixel buffer before the camera moves.
 *
 * Three.js compiles a material and uploads a buffer the first time each is
 * actually drawn, and the driver does that on its own thread: nothing blocked
 * the processor, yet a flight that brought new furniture into view lost a
 * second of frames. Six tiny renders, one per frame and one per direction,
 * move that cost to a moment where it cannot be seen.
 */
const WARMUP_DIRECTIONS = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1), new Vector3(0, 0, -1),
  new Vector3(0, 1, 0), new Vector3(0, -1, 0)
];

const WARMUP_POSITIONS = [
  new Vector3(11, 1.7, -6), new Vector3(12, 1.7, -13),
  new Vector3(19, 1.7, -14), new Vector3(10, 5.1, -7),
  new Vector3(3.5, 5.1, -14), new Vector3(16, 5.1, -8)
];

function SceneWarmup({ ready, onPrepared }: { ready: boolean; onPrepared: () => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const step = useRef(0);
  const compiled = useRef(false);
  const failed = useRef(false);
  const kit = useMemo(() => ({
    target: new WebGLRenderTarget(128, 128),
    camera: new PerspectiveCamera(130, 1, 0.05, 1700),
    look: new Vector3()
  }), []);
  // Both display formats must reach the GPU while the loading curtain is up.
  // The currently hidden format otherwise uploads/compiles during a resize.
  const exposeDisplayVariants = useCallback(() => {
    const hidden = new Set<Object3D>();
    const expose = (object: Object3D) => {
      for (let part: Object3D | null = object; part && part !== scene; part = part.parent) {
        if (!part.visible) { hidden.add(part); part.visible = true; }
      }
    };
    scene.traverse((object) => {
      if (object.userData.responsiveMonitor && !object.visible) {
        expose(object);
      }
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some(material => typeof material.userData.figureAppearance === "number")) expose(mesh);
      }
    });
    return () => hidden.forEach((object) => { object.visible = false; });
  }, [scene]);
  useEffect(() => () => kit.target.dispose(), [kit]);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const restore = exposeDisplayVariants();
    const pending = gl.compileAsync(scene, kit.camera);
    restore();
    pending.then(() => { if (live) compiled.current = true; })
      .catch(() => { failed.current = true; });
    return () => { live = false; };
  }, [ready, gl, scene, kit, exposeDisplayVariants]);
  useFrame(() => {
    if (failed.current) throw new Error("Office GPU preparation failed");
    if (!compiled.current || step.current >= WARMUP_POSITIONS.length * 6) return;
    const position = WARMUP_POSITIONS[Math.floor(step.current / 6)];
    const direction = WARMUP_DIRECTIONS[step.current % 6];
    kit.camera.position.copy(position);
    kit.camera.lookAt(kit.look.copy(position).add(direction));
    const previous = gl.getRenderTarget();
    const restore = exposeDisplayVariants();
    try {
      gl.setRenderTarget(kit.target);
      gl.render(scene, kit.camera);
      step.current += 1;
    } finally {
      restore();
      gl.setRenderTarget(previous);
    }
    if (step.current === WARMUP_POSITIONS.length * 6) {
      if (window.__officeDiagnostics) {
        const indices = new Set<number>(), skin = new Set<string>(), clothing = new Set<string>(), hair = new Set<string>();
        scene.traverse(object => {
          const mesh = object as Mesh;
          if (!mesh.isMesh) return;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const appearance = material.userData.figureAppearance;
            if (typeof appearance !== "number") continue;
            indices.add(appearance);
            const tint = (material as MeshStandardMaterial).color;
            if (material.name === "Skin") skin.add(tint.getHexString());
            if (material.name === "Shirt") clothing.add(tint.getHexString());
            if (material.name === "Hair") hair.add(tint.getHexString());
          }
        });
        window.__officeDiagnostics.appearances = {indices: [...indices], skin: [...skin], clothing: [...clothing], hair: [...hair]};
        const city = scene.getObjectByName("exterior_city_backdrop") as Mesh | undefined;
        const cityMaterial = city?.material as MeshBasicMaterial | undefined;
        const cityImage = cityMaterial?.map?.image as {width: number; height: number} | undefined;
        window.__officeDiagnostics.exterior = {
          legacyObjects: ["ground", "exterior_blocks", "exterior_low_borders", "exterior_park_backdrop"].filter(name => !!scene.getObjectByName(name)),
          city: !!city, material: cityMaterial?.name ?? "",
          image: cityImage ? {width: cityImage.width, height: cityImage.height} : null
        };
        window.__officeDiagnostics.navigation = cameraRouteAudit();
        window.__officeDiagnostics.ready = true;
      }
      onPrepared();
    }
  });
  return null;
}

function Reflections() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, .04, .1, 50, { size: 128 });
    const previous = scene.environment;
    scene.environment = target.texture;
    scene.environmentIntensity = .28;
    room.dispose();
    generator.dispose();
    return () => { scene.environment = previous; target.dispose(); };
  }, [gl, scene]);
  return null;
}

/** Daylight through the window wall plus the ceiling panels, until the room gets baked light. */
function Lights() {
  return (
    <>
      <hemisphereLight args={["#fff4e6", "#8d847a", 1.6]} />
      <directionalLight position={[6.72, 20.4, -14.4]} intensity={2.2} color="#fff1dc" />
      <directionalLight position={[16, 9, -18]} intensity={0.7} color="#e8eefc" />
    </>
  );
}

export function OfficeStage({ shotKey, active, rasterReady, theme, officeAvailable, figureAvailable, cursor, screenLayers, onTransition, onScreens, onReduceRaster }: {
  shotKey: ShotKey;
  active: boolean;
  /** Start adaptive quality only after GPU warmup and all demo-page startup. */
  rasterReady: boolean;
  /** The landing's theme: the monitors, glass and pages alike, run in the same one. */
  theme: "light" | "dark";
  officeAvailable: boolean;
  figureAvailable: boolean;
  cursor: RefObject<CursorState>;
  /** The page layers over the canvas, one per monitor, kept on their glass. */
  screenLayers: Record<MonitorKey, RefObject<HTMLDivElement | null>>;
  onTransition: (active: boolean) => void;
  /** The glass of each monitor, once the room is known. */
  onScreens: (screens: Partial<Record<MonitorKey, ScreenFrame>>) => void;
  onReduceRaster: (factor: number) => void;
}) {
  const [office, setOffice] = useState<OfficeSet | null>(null);
  const [gpuPrepared, setGpuPrepared] = useState(false);
  const [figuresLoaded, setFiguresLoaded] = useState(false);
  const handlePrepared = useCallback(() => setGpuPrepared(true), []);
  const handleFigureLoaded = useCallback(() => setFiguresLoaded(true), []);
  // Which monitor the camera is leaving, so its page can stay lit for the first
  // moment of the flight.
  const previousShot = useRef<ShotKey>(shotKey);
  const lastShot = useRef<ShotKey>(shotKey);
  if (lastShot.current !== shotKey) {
    previousShot.current = lastShot.current;
    lastShot.current = shotKey;
  }
  const placeholderScreen = useRef<Mesh>(null);
  const [placeholderFrame, setPlaceholderFrame] = useState<ScreenFrame | null>(null);
  // Rounded, so that dragging a window edge does not send the camera flying
  // after every pixel of width.
  const size = useThree((state) => state.size);
  const viewport = useMemo<Viewport>(
    () => ({ width: Math.round(size.width / 20) * 20, height: Math.round(size.height / 20) * 20 }),
    [size.width, size.height]
  );

  useEffect(() => {
    if (officeAvailable || !placeholderScreen.current) return;
    setPlaceholderFrame(screenFrame(placeholderScreen.current, new Vector3(0, 1.2, 1)));
  }, [officeAvailable]);

  const shots = office?.shots ?? placeholderShots;
  const screens = useMemo<Partial<Record<MonitorKey, ScreenFrame>>>(
    () => (office ? office.screens : placeholderFrame ? { employee: placeholderFrame } : {}),
    [office, placeholderFrame]
  );
  const placements = office?.placements ?? [placeholderPlacement];
  const roomReady = !officeAvailable || office !== null;

  useEffect(() => {
    if (gpuPrepared) onScreens(screens);
  }, [gpuPrepared, screens, onScreens]);

  return (
    <>
      <CameraRig shot={shots[shotKey]} shots={shots} shotKey={shotKey} snapKey={office ? "office" : "placeholder"} onTransition={onTransition} />
      <Lights />
      <Reflections />
      <SceneDiagnostics shot={shotKey} />
      <FigureBudget active={active} />
      <FrameBudget ready={gpuPrepared && rasterReady} active={active} onReduce={onReduceRaster} />
      <SceneWarmup ready={roomReady && (!figureAvailable || figuresLoaded)} onPrepared={handlePrepared} />
      {officeAvailable ? (
        <Suspense fallback={null}>
          <OfficeModel viewport={viewport} theme={theme} onReady={setOffice} />
        </Suspense>
      ) : (
        <PlaceholderOffice screenRef={placeholderScreen} />
      )}
      {figureAvailable && roomReady && (
        <Suspense fallback={null}>
          {placements.map((placement, index) => (
            <Figure
              key={`${placement.position.x}:${placement.position.z}`}
              placement={placement}
              onLoaded={handleFigureLoaded}
              seed={index * 1.7}
              typing={placement.typing !== false}
            />
          ))}
        </Suspense>
      )}
      {(Object.keys(SCREEN_NAMES) as MonitorKey[]).map((key) => {
        const frame = screens[key];
        return frame ? (
          <ScreenProjector
            key={key}
            frame={frame}
            layerRef={screenLayers[key]}
            isCurrent={shotKey === key}
            isPrevious={previousShot.current === key}
          />
        ) : null;
      })}
    </>
  );
}
