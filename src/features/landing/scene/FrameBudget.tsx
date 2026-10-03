import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";

/** Reduce raster cost under sustained load. Geometry and DOM stay unchanged. */
export function FrameBudget({ ready, active, onReduce }: {
  ready: boolean;
  active: boolean;
  onReduce: (factor: number) => void;
}) {
  const samples = useMemo(() => new Float32Array(30), []);
  const count = useRef(0);
  const lastChange = useRef(0);
  const measurementStart = useRef(0);
  useFrame(({ gl }, delta) => {
    if (!ready || !active || document.visibilityState === "hidden" || delta > .25) {
      count.current = 0;
      measurementStart.current = 0;
      return;
    }
    const now = performance.now();
    if (!measurementStart.current) measurementStart.current = now;
    // Shader warmup and iframe startup are CPU work, not sustained raster cost.
    // Give their final commits time to settle before lowering image quality.
    if (now - measurementStart.current < 2000) return;
    if (gl.domElement.width * gl.domElement.height <= 320_000) return;
    samples[count.current++] = delta * 1000;
    if (count.current < samples.length) return;
    count.current = 0;
    samples.sort();
    const p90 = samples[26];
    if (p90 > 24 && now - lastChange.current > 2_000) {
      lastChange.current = now;
      onReduce(Math.max(.6, Math.min(.85, 18 / p90)));
    }
  });
  return null;
}
