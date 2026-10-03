import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { ShotKey } from "./shots";
import { cameraRouteAudit, flightState } from "./CameraRig";
import { Vector3 } from "three";

type Frame = { dt: number; calls: number; triangles: number; shot: ShotKey; flying: boolean; camera: number[]; direction: number[]; progress: number; reverse: boolean; fov: number };
type Diagnostics = {
  frames: Frame[];
  longTasks: number[];
  ready: boolean;
  renderer: string;
  buffer: { width: number; height: number };
  textures: number;
  geometries: number;
  appearances?: { indices: number[]; skin: string[]; clothing: string[]; hair: string[] };
  exterior?: { legacyObjects: string[]; city: boolean; material: string; image: { width: number; height: number } | null };
  navigation?: ReturnType<typeof cameraRouteAudit>;
};
declare global { interface Window { __officeDiagnostics?: Diagnostics } }

/** Opt-in measurement only; normal visitors do not allocate samples per frame. */
export function SceneDiagnostics({ shot }: { shot: ShotKey }) {
  const gl = useThree((state) => state.gl);
  const enabled = useMemo(() => new URLSearchParams(location.search).get("sceneQA") === "1", []);
  const last = useRef(0);
  const wasFlying = useRef(false);
  const direction = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (!enabled) return;
    const context = gl.getContext();
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    const data: Diagnostics = {
      frames: [], longTasks: [], ready: false,
      renderer: debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable",
      buffer: { width: gl.domElement.width, height: gl.domElement.height },
      textures: 0, geometries: 0
    };
    window.__officeDiagnostics = data;
    data.navigation = cameraRouteAudit();
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => data.longTasks.push(entry.duration));
    });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) observer.observe({ type: "longtask" });
    return () => { observer.disconnect(); delete window.__officeDiagnostics; };
  }, [enabled, gl]);
  useFrame(({ camera }) => {
    if (!enabled || !window.__officeDiagnostics) return;
    const data = window.__officeDiagnostics;
    const stamp = performance.now();
    const block = gl.domElement.closest(".scene-block");
    const flying = block?.classList.contains("is-flying") ?? false;
    if (last.current && data.frames.length < 120_000) data.frames.push({
      dt: stamp - last.current, calls: gl.info.render.calls, triangles: gl.info.render.triangles, shot, flying,
      camera: [camera.position.x, camera.position.y, camera.position.z],
      direction: camera.getWorldDirection(direction).toArray(), progress: flightState().progress, reverse: flightState().reverse,
      fov: "fov" in camera ? Number(camera.fov) : 0
    });
    last.current = stamp;
    data.buffer.width = gl.domElement.width;
    data.buffer.height = gl.domElement.height;
    data.textures = gl.info.memory.textures;
    data.geometries = gl.info.memory.geometries;
    if (flying && !wasFlying.current) data.navigation = cameraRouteAudit();
    wasFlying.current = flying;
  });
  return null;
}
