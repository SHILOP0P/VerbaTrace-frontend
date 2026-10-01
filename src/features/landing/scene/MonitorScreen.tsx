import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Box3, Matrix4, Mesh, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { isDemoEvent, type DemoCommand, type DemoEvent, type DemoRole } from "../../../demo/bridge";
import { cameraAhead, flightState } from "./CameraRig";

/**
 * Desktop keeps the complete workspace in a wide document. Portrait monitors
 * use the product's ordinary phone layout, so the type remains legible after
 * the document is placed on the glass.
 */
export const SCREEN_CSS_WIDTH = 1400;
const PHONE_SCREEN_CSS_WIDTH = 390;
const phoneDocumentWidth = (viewportWidth: number) => Math.min(PHONE_SCREEN_CSS_WIDTH, Math.max(320, viewportWidth));

export type ScreenFrame = {
  center: Vector3;
  quaternion: Quaternion;
  width: number;
  height: number;
};

/**
 * The glass of a monitor in the office file is a thin flat mesh. Its two long
 * extents give the width and the height, the short one the normal; the frame
 * puts +Z on the normal that faces the viewer and +Y on the extent that stands
 * up, which is how a rectangle of page wants to be placed.
 */
export function screenFrame(mesh: Mesh, viewer: Vector3): ScreenFrame {
  mesh.updateWorldMatrix(true, false);
  const box = new Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position") as never);
  const size = new Vector3();
  box.getSize(size);
  const extents: Array<[number, "x" | "y" | "z"]> = [[size.x, "x"], [size.y, "y"], [size.z, "z"]];
  extents.sort((a, b) => b[0] - a[0]);
  const [, thin] = extents[2];
  const localAxis = (axis: "x" | "y" | "z") => new Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  const rotation = new Matrix4().extractRotation(mesh.matrixWorld);
  const scale = new Vector3().setFromMatrixScale(mesh.matrixWorld);
  const worldAxis = (axis: "x" | "y" | "z") => localAxis(axis).applyMatrix4(rotation).normalize();

  const center = new Vector3();
  box.getCenter(center).applyMatrix4(mesh.matrixWorld);
  const normal = worldAxis(thin);
  if (normal.dot(viewer.clone().sub(center)) < 0) normal.negate();

  const [first, second] = [extents[0][1], extents[1][1]];
  const firstWorld = worldAxis(first);
  const secondWorld = worldAxis(second);
  const firstStandsUp = Math.abs(firstWorld.y) >= Math.abs(secondWorld.y);
  const upAxis = firstStandsUp ? first : second;
  const sideAxis = firstStandsUp ? second : first;
  const up = worldAxis(upAxis);
  if (up.y < 0) up.negate();
  const right = new Vector3().crossVectors(up, normal).normalize();
  const trueUp = new Vector3().crossVectors(normal, right).normalize();
  const basis = new Matrix4().makeBasis(right, trueUp, normal);
  const sizeOf = (axis: "x" | "y" | "z") => (axis === "x" ? size.x * scale.x : axis === "y" ? size.y * scale.y : size.z * scale.z);

  return { center, quaternion: new Quaternion().setFromRotationMatrix(basis), width: sizeOf(sideAxis), height: sizeOf(upAxis) };
}

const corner = new Vector3();

/**
 * Keeps the page layer on the glass.
 *
 * The page is not drawn inside the 3D transform of a drei `Html`: a browser
 * rasterises an iframe in such a layer once and then leaves it, so a camera
 * parked at the monitor showed a frozen and finally a black screen. Instead
 * the four corners of the glass are projected every frame and the layer is
 * placed over the canvas with a plain 2D box and scale, which the browser
 * repaints like any other element.
 */
/**
 * How square-on the camera must be for the page to sit on the glass.
 *
 * The page is a flat rectangle laid over the canvas and placed by an ordinary
 * 2D box, which matches the monitor only while the glass is parallel to the
 * viewport — that is, while the camera looks straight down the screen's own
 * normal. (It cannot be a perspective transform instead: an element inside a 3D
 * transform is rasterised once, which is what left a frozen and then a black
 * iframe.) Off that axis the glass is a trapezium and the page would hang past
 * its bezel, so it fades out over the few degrees between these two.
 *
 * Nothing goes dark when it does: the glass under the page is painted the
 * page's own background (`SCREEN_GLOW`), so a monitor the camera is swinging
 * away from, or still flying towards, simply reads as a screen whose content is
 * too far off to make out.
 */
const SQUARE_ON = 0.9995;
const OFF_AXIS = 0.994;

const viewDirection = new Vector3();
const screenNormal = new Vector3();
const toCamera = new Vector3();

export function ScreenProjector({ frame, layerRef, isCurrent, isPrevious }: {
  frame: ScreenFrame;
  layerRef: RefObject<HTMLDivElement | null>;
  /** The monitor this scene belongs to. */
  isCurrent: boolean;
  /** The one the camera has just left. */
  isPrevious: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const corners = useMemo(() => {
    const right = new Vector3(1, 0, 0).applyQuaternion(frame.quaternion).multiplyScalar(frame.width / 2);
    const up = new Vector3(0, 1, 0).applyQuaternion(frame.quaternion).multiplyScalar(frame.height / 2);
    return [
      frame.center.clone().sub(right).add(up),
      frame.center.clone().add(right).add(up),
      frame.center.clone().add(right).sub(up),
      frame.center.clone().sub(right).sub(up)
    ];
  }, [frame]);

  // A screen fills in once on the way to it and empties once on the way out.
  // The raw measure crosses the band back and forth as the camera settles, and
  // every crossing would be a blink of the page.
  const fade = useRef(0);
  const role = useRef<"current" | "previous" | "idle">("idle");

  useFrame(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const park = () => {
      // Parked off screen rather than hidden: a page of this size left in view
      // keeps the compositor rastering what nobody can see, while taking it out
      // of the layer tree and putting it back costs a hitch of its own. Off to
      // the side it keeps its state, its layer and its place in the compositor,
      // and nothing is drawn.
      layer.style.opacity = "0";
      layer.style.transform = "translate3d(-20000px, 0, 0)";
    };

    // Only two monitors are ever worth placing: the one the camera is at and
    // the one it has just left.
    const flight = flightState();
    const now = isCurrent ? "current" : isPrevious && flight.active ? "previous" : "idle";
    if (now !== role.current) {
      // Arriving at a monitor starts from nothing and fills in; leaving one
      // carries on from whatever it was showing.
      if (now === "current") fade.current = 0;
      role.current = now;
    }
    if (now === "idle") return park();

    // Projected from where the camera will be on the next frame: the browser
    // applies a transform a frame after the canvas is painted, and without
    // this the page visibly lagged behind its own monitor in flight.
    const lens = cameraAhead(camera as PerspectiveCamera);
    lens.getWorldDirection(viewDirection);
    screenNormal.set(0, 0, 1).applyQuaternion(frame.quaternion);
    // A camera that has flown past the glass and looks the same way as it does
    // is square-on to its back, where projecting the corners means projecting
    // points behind the lens. It has to be in front of the monitor.
    toCamera.copy(lens.position).sub(frame.center);
    if (toCamera.dot(screenNormal) <= 0.05) return park();
    const squareness = -viewDirection.dot(screenNormal);
    const measured = Math.min(1, Math.max(0, (squareness - OFF_AXIS) / (SQUARE_ON - OFF_AXIS)));
    fade.current = now === "current" ? Math.max(fade.current, measured) : Math.min(fade.current, measured);
    if (fade.current <= 0) return park();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of corners) {
      corner.copy(point).project(lens);
      const x = (corner.x * 0.5 + 0.5) * size.width;
      const y = (-corner.y * 0.5 + 0.5) * size.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const width = Math.max(1, maxX - minX);
    layer.style.opacity = fade.current.toFixed(3);
    const documentWidth = size.width <= 720 ? phoneDocumentWidth(size.width) : SCREEN_CSS_WIDTH;
    layer.style.transform = `translate3d(${minX.toFixed(1)}px, ${minY.toFixed(1)}px, 0) scale(${(width / documentWidth).toFixed(5)})`;
  });

  return null;
}

/**
 * The page itself: a document of the workspace on fixture data, living beside
 * the canvas rather than inside the scene. The scenario in it reports the
 * cursor and the captions back through `postMessage`.
 */
export function DemoScreenLayer({ layerRef, role, theme, aspect, playing, live, onEvent, onBooted }: {
  layerRef: RefObject<HTMLDivElement | null>;
  role: DemoRole;
  theme: "light" | "dark";
  /** The glass's proportions, so the page is laid out in the same shape. */
  aspect: number;
  playing: boolean;
  /** Whether this is the monitor the camera is at. */
  live: boolean;
  /** Only the monitor the camera is at reports back. */
  onEvent?: (event: DemoEvent) => void;
  /** Fires once this page has started up and is ready to be shown. */
  onBooted?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const phone = viewportWidth <= 720;
  const readyRef = useRef(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const bootedRef = useRef(onBooted);
  bootedRef.current = onBooted;
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const documentWidth = phone ? phoneDocumentWidth(viewportWidth) : SCREEN_CSS_WIDTH;
  const height = Math.round(documentWidth / aspect);
  // The theme is in the address only for the first paint, and deliberately not
  // a dependency: changing it there would reload the document and start the
  // recording over. Afterwards it travels as a message.
  const src = useMemo(() => `/demo.html?role=${role}&theme=${themeRef.current}${phone ? "&monitor=portrait" : ""}`, [role, phone]);

  useEffect(() => {
    const send = (command: DemoCommand) => iframeRef.current?.contentWindow?.postMessage(command, window.location.origin);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow || !isDemoEvent(event.data)) return;
      if (event.data.type === "vt-demo:ready") {
        readyRef.current = true;
        // The address only carried the theme this document was born in. If the
        // visitor changed it while this one was still starting up, it catches
        // up here rather than opening in last year's colours.
        const root = iframeRef.current?.contentDocument?.documentElement;
        if (root) {
          root.dataset.theme = themeRef.current;
          root.style.colorScheme = themeRef.current;
        }
        send(playingRef.current ? { type: "vt-demo:play" } : { type: "vt-demo:pause" });
        bootedRef.current?.();
      }
      eventRef.current?.(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!readyRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      playing ? { type: "vt-demo:play" } : { type: "vt-demo:pause" },
      window.location.origin
    );
  }, [playing]);


  return (
    <div
      ref={layerRef}
      className="scene-screen-layer"
      // Which monitor the camera is at, for the theme sweep: that one changes in
      // the same frame as the landing, the other three when there is time.
      data-live={live ? "1" : undefined}
      style={{ width: documentWidth, height }}
      aria-hidden="true"
    >
      <iframe
        ref={iframeRef}
        className="scene-screen-frame"
        title="Экран сотрудника"
        src={src}
        width={documentWidth}
        height={height}
        style={{ width: documentWidth, height, background: theme === "dark" ? "#110e0b" : "#f4efea" }}
        tabIndex={-1}
      />
    </div>
  );
}
