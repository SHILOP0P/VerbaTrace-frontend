import { Canvas } from "@react-three/fiber";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { DemoEvent, DemoRole } from "../../../demo/bridge";
import { sceneCaptions } from "./captions";
import { SceneErrorBoundary } from "./ErrorBoundary";
import { FIGURE_URL } from "./Figure";
import { DemoScreenLayer, type ScreenFrame } from "./MonitorScreen";
import { OFFICE_URL, OfficeStage, type CursorState } from "./OfficeStage";
import { captionLayout, SHOT_ORDER, type MonitorKey, type ShotKey } from "./shots";
import { useStepNavigation } from "./useStepNavigation";

const sceneLabels: Record<ShotKey, string> = {
  hero: "Офис",
  employee: "Рабочее место сотрудника",
  leader: "Кабинет руководителя отдела",
  deputy: "Рабочее место заместителя",
  owner: "Кабинет владельца"
};

const MONITORS: MonitorKey[] = ["employee", "leader", "deputy", "owner"];

/**
 * The scene files are optional while the scene is being built. The dev server
 * answers any path with the page itself, so a reply that is HTML counts as
 * missing.
 */
async function sceneFileExists(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok && !(response.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

/**
 * Whether this browser can draw the office at all. An old one gets the flat
 * first screen instead of a canvas that throws on creation.
 */
function canDrawScene() {
  try {
    // `?flat=1` turns the office off on purpose: a way to check the fallback
    // and a way out for a visitor whose machine cannot cope.
    if (new URLSearchParams(window.location.search).get("flat") === "1") return false;
    const probe = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
      (probe.getContext("webgl2") || probe.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

/**
 * The first screen of the landing: the office in 3D. One scroll step flies the
 * camera to the next scene; after the last one the page scrolls on as usual.
 */
const STEP_KEY = "verbatrace.landing.scene-step";
/**
 * How long the visitor's place in the office is kept.
 *
 * A reload is a moment, so it lands them exactly where they were. A visit is
 * something else: somebody coming back to the page after a few minutes away
 * meets the office from the door, headline and all, because that is the start
 * of the story and not the middle of it.
 */
const STEP_TTL = 5 * 60 * 1000;
/**
 * How often the mark is refreshed. Only while the page is actually being
 * looked at: a tab left open behind other windows is time away, the same as a
 * tab that was closed.
 */
const STEP_HEARTBEAT = 10_000;
/**
 * How many pixels the room may cost.
 *
 * Integrated graphics ran out of fill rate long before the processor ran out
 * of time: nothing blocked the main thread, yet whole seconds of frames went
 * missing on a wide window. The canvas is therefore held near a fixed number
 * of pixels whatever the window, which costs a little sharpness in the room
 * and none at all in the pages on the monitors — those are ordinary DOM over
 * the canvas.
 */
const PIXEL_BUDGET = 880_000;

/** `?screens=0` shows the room without the pages on the monitors: a way to tell
 *  the cost of the office from the cost of the interface on its screens. */
const screensEnabled = new URLSearchParams(window.location.search).get("screens") !== "0";

function renderScaleFor(width: number, height: number) {
  const area = Math.max(1, width * height);
  const device = Math.min(window.devicePixelRatio || 1, 1.5);
  return Math.max(0.7, Math.min(device, Math.sqrt(PIXEL_BUDGET / area)));
}

const readDocumentTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/**
 * Puts a monitor's document into a theme. The two share an origin, so this is
 * an attribute on another document and nothing more.
 */
function dressScreen(frame: HTMLIFrameElement, theme: "light" | "dark") {
  const root = frame.contentDocument?.documentElement;
  if (!root || root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * The theme the landing is in, read from the document itself, and carried
 * straight onto the monitors.
 *
 * Not passed down as a prop on purpose: the switch lives in the header and the
 * change is wrapped in a circular reveal that sweeps the whole page. Because
 * the monitors are same-origin documents inside that page, they are part of the
 * same sweep — as long as they change in the same frame, which is why the one
 * in front of the camera is dressed here, in the observer, and not after a
 * render or a message. The other three are out of sight, and four applications
 * restyling at once is what made the switch stutter, so they follow when the
 * browser is next idle.
 */
function useDocumentTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(readDocumentTheme);

  useEffect(() => {
    let idle = 0;
    const update = () => {
      const next = readDocumentTheme();
      const layers = [...document.querySelectorAll<HTMLIFrameElement>(".scene-screen-layer iframe")];
      for (const frame of layers) {
        if (frame.parentElement?.dataset.live === "1") dressScreen(frame, next);
      }
      // The other three are out of sight and restyling one costs the best part
      // of a tenth of a second, so they wait for the browser to have nothing
      // else to do, one at a time. Doing them on a timer put three of those
      // straight into the sweep; doing them together was worse still.
      const rest = layers.slice();
      const one = () => {
        const frame = rest.shift();
        if (!frame) return;
        dressScreen(frame, next);
        idle = whenIdle(one);
      };
      idle = whenIdle(one);
      setTheme(next);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      cancelIdle(idle);
    };
  }, []);

  return theme;
}

type IdleWindow = Window & {
  requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Runs something the next time the browser has nothing better to do. */
function whenIdle(fn: () => void) {
  const host = window as IdleWindow;
  return host.requestIdleCallback
    ? host.requestIdleCallback(fn, { timeout: 4000 })
    : window.setTimeout(fn, 800);
}

function cancelIdle(handle: number) {
  const host = window as IdleWindow;
  if (host.cancelIdleCallback) host.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}

/**
 * The scene the visitor was looking at, so a reload does not send them back to
 * the door — unless they have been away longer than the place is kept.
 */
function readStoredStep() {
  try {
    const raw = window.sessionStorage.getItem(STEP_KEY);
    if (!raw) return 0;
    const saved = JSON.parse(raw) as { step?: unknown; at?: unknown };
    const step = Number(saved?.step);
    const at = Number(saved?.at);
    if (!Number.isInteger(step) || step < 0 || step >= SHOT_ORDER.length) return 0;
    return Number.isFinite(at) && Date.now() - at <= STEP_TTL ? step : 0;
  } catch {
    // A private window, or a mark left by an older build: start at the door.
    return 0;
  }
}

function writeStoredStep(step: number) {
  try {
    window.sessionStorage.setItem(STEP_KEY, JSON.stringify({ step, at: Date.now() }));
  } catch {
    // A private window simply starts at the door next time.
  }
}

export function LandingScene({ onStart, fallback, onReady, onStage }: {
  onStart: () => void;
  fallback: ReactNode;
  /** Fires once the office is on screen, or once it is clear it will not be. */
  onReady?: () => void;
  /** What the loading curtain should say it is doing. */
  onStage?: (stage: "room" | "screens") => void;
}) {
  const theme = useDocumentTheme();
  const [step, setStep] = useState(readStoredStep);
  const [transitioning, setTransitioning] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [officeAvailable, setOfficeAvailable] = useState<boolean | null>(null);
  const [figureAvailable, setFigureAvailable] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [screenAspects, setScreenAspects] = useState<Partial<Record<MonitorKey, number>>>({});
  /** A monitor's page is created the first time its scene is reached and then kept. */
  const [openedMonitors, setOpenedMonitors] = useState<MonitorKey[]>([]);
  /** Which of those have finished starting up and are ready to be looked at. */
  const [bootedMonitors, setBootedMonitors] = useState<MonitorKey[]>([]);
  const [onScreen, setOnScreen] = useState(true);
  const [renderScale, setRenderScale] = useState(() => renderScaleFor(window.innerWidth, window.innerHeight));
  const [captionViewport, setCaptionViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const layout = captionLayout(captionViewport);
  const blockRef = useRef<HTMLElement>(null);
  const cursor = useRef<CursorState>({ x: 0.5, y: 0.5, down: false, typing: false });
  const employeeLayer = useRef<HTMLDivElement>(null);
  const leaderLayer = useRef<HTMLDivElement>(null);
  const deputyLayer = useRef<HTMLDivElement>(null);
  const ownerLayer = useRef<HTMLDivElement>(null);
  const screenLayers = useMemo(
    () => ({ employee: employeeLayer, leader: leaderLayer, deputy: deputyLayer, owner: ownerLayer }),
    []
  );

  useEffect(() => {
    const resize = () => setCaptionViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!canDrawScene()) {
      setSceneFailed(true);
      return;
    }
    Promise.all([sceneFileExists(OFFICE_URL), sceneFileExists(FIGURE_URL)]).then(([office, figure]) => {
      if (cancelled) return;
      setFigureAvailable(figure);
      setOfficeAvailable(office);
    });
    return () => { cancelled = true; };
  }, []);

  // Below the office the page is an ordinary one: the pages on the monitors
  // stop playing until the room comes back into view. The room itself keeps
  // rendering — switching the render loop off proved to be a good way to end
  // up with an empty canvas and no way back.
  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;
    const update = () => {
      const rect = block.getBoundingClientRect();
      setOnScreen(rect.bottom > 0 && rect.top < (window.innerHeight || 0));
      setRenderScale(renderScaleFor(window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // The place is written on every step and kept fresh while the page is in
  // front of somebody, plus once more the moment it is hidden. Nothing is
  // written on the way out or on the way back: the mark has to hold the last
  // instant anybody was actually looking, and a write at either of those two
  // moments would make a return after an hour look as recent as a reload.
  useEffect(() => {
    writeStoredStep(step);
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") writeStoredStep(step);
    }, STEP_HEARTBEAT);
    const mark = () => {
      if (document.visibilityState === "hidden") writeStoredStep(step);
    };
    document.addEventListener("visibilitychange", mark);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [step]);

  // A flight lasts about two seconds. If the scene ever stops reporting, the
  // page must not stay locked with a dark monitor waiting for a camera that is
  // no longer moving.
  useEffect(() => {
    if (!transitioning) return;
    const timer = window.setTimeout(() => setTransitioning(false), 5000);
    return () => window.clearTimeout(timer);
  }, [transitioning]);

  const shotKey = SHOT_ORDER[step];
  const parked = !transitioning && !sceneFailed && onScreen;
  // The scenario starts a moment after the camera settles, so the arrival and
  // the first steps of the recording do not compete for the same frames.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!parked) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), 500);
    return () => window.clearTimeout(timer);
  }, [parked, shotKey]);
  // The screens are measured once the room is in the scene, so their arrival
  // is the moment there is something to look at.
  const roomReady = Object.keys(screenAspects).length > 0;
  const announced = useRef(false);
  const everythingReady = roomReady && bootedMonitors.length >= MONITORS.length;

  useEffect(() => {
    if (announced.current || !(everythingReady || sceneFailed)) return;
    announced.current = true;
    onReady?.();
  }, [everythingReady, sceneFailed, onReady]);
  const monitor = shotKey === "hero" ? null : (shotKey as MonitorKey);

  // Every monitor's page is a whole application in an iframe, and building one
  // costs the main thread the best part of a second. All four are built at the
  // start, one after another, while the loading curtain is still up — that is
  // the only moment in the visit when a pause cannot be seen.
  useEffect(() => {
    // Not before the room: four applications downloading at once starved the
    // office model itself and the first screen stayed empty for seconds.
    if (sceneFailed || !roomReady) return;
    onStage?.("screens");
    const open = (key: MonitorKey) =>
      setOpenedMonitors((current) => (current.includes(key) ? current : [...current, key]));
    const timers = MONITORS.map((key, index) => window.setTimeout(() => open(key), index * 150));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [sceneFailed, roomReady, onStage]);

  const handleBooted = useCallback((key: MonitorKey) => {
    setBootedMonitors((current) => (current.includes(key) ? current : [...current, key]));
  }, []);

  useStepNavigation({ enabled: !sceneFailed, stepCount: SHOT_ORDER.length, step, locked: transitioning, onStep: setStep });

  const handleScreenEvent = useCallback((event: DemoEvent) => {
    if (event.type === "vt-demo:cursor") {
      cursor.current.x = event.x;
      cursor.current.y = event.y;
      cursor.current.down = event.down;
    } else if (event.type === "vt-demo:typing") {
      cursor.current.typing = event.active;
    } else if (event.type === "vt-demo:caption") {
      setCaption(event.id);
    }
  }, []);

  const handleScreens = useCallback((screens: Partial<Record<MonitorKey, ScreenFrame>>) => {
    setScreenAspects((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of MONITORS) {
        const frame = screens[key];
        if (!frame) continue;
        const aspect = frame.width / frame.height;
        if (next[key] !== aspect) {
          next[key] = aspect;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  // A caption belongs to the scene it was sent from: leaving the monitor takes
  // it away with the page.
  const captions = monitor ? sceneCaptions[monitor] : [];
  const hasCaption = parked && captions.some((item) => item.id === caption);

  // A dead scene hands the whole first screen over to the flat hero: a headline
  // floating over an empty canvas is worse than no office at all.
  if (sceneFailed) return <>{fallback}</>;

  return (
    <section
      ref={blockRef}
      className={`scene-block scene-${shotKey}${transitioning ? " is-flying" : ""}${sceneFailed ? " is-static" : ""}${hasCaption ? " has-caption" : ""}`}
      data-caption-layout={layout.mode}
      style={{ "--scene-caption-width": `${layout.width}px`, "--scene-caption-left": `${layout.left}px`, "--scene-caption-right": `${layout.right}px` } as CSSProperties}
      data-shot={shotKey}
      data-monitors={openedMonitors.join(",")}
      data-office={officeAvailable === null ? "checking" : officeAvailable ? "file" : "placeholder"}
      aria-label="Офис VerbaTrace"
    >
      <div className="scene-canvas">
        {officeAvailable !== null && !sceneFailed && (
          <SceneErrorBoundary fallback={null} onError={() => setSceneFailed(true)}>
            <Canvas
              gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
              dpr={renderScale}
              camera={{ fov: 44, near: 0.05, far: 80, position: [0, 3, 8] }}
              style={{ background: "transparent" }}
              onCreated={({ gl }) => {
                // A lost context leaves a frozen picture behind; the flat first
                // screen is better than a dead canvas.
                gl.domElement.addEventListener("webglcontextlost", () => setSceneFailed(true), { once: true });
              }}
            >
              <OfficeStage
                shotKey={shotKey}
                theme={theme}
                officeAvailable={officeAvailable}
                figureAvailable={figureAvailable}
                cursor={cursor}
                screenLayers={screenLayers}
                onTransition={setTransitioning}
                onScreens={handleScreens}
              />
            </Canvas>
          </SceneErrorBoundary>
        )}
        {!sceneFailed && screensEnabled && MONITORS.filter((key) => openedMonitors.includes(key)).map((key) => (
          <DemoScreenLayer
            key={key}
            layerRef={screenLayers[key]}
            role={key as DemoRole}
            theme={theme}
            aspect={screenAspects[key] ?? 16 / 10}
            playing={settled && shotKey === key}
            live={shotKey === key}
            onEvent={shotKey === key ? handleScreenEvent : undefined}
            onBooted={() => handleBooted(key)}
          />
        ))}
      </div>

      <div className="scene-scrim" aria-hidden="true" />

      <div className={`scene-hero-copy${step === 0 ? " is-visible" : ""}`}>
        <h1>
          <span className="headline-main">Аналитика звонков</span>
          <span>без ручного прослушивания</span>
        </h1>
        <p>
          Загружайте звонки, получайте расшифровку, AI-анализ и статусы обработки.
          Управляйте командой, отделами и всей компанией в одном месте.
        </p>
        <div className="hero-actions">
          <button className="primary-button large" type="button" onClick={onStart}>
            Приступить к работе
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {captions.map((item) => {
        const visible = parked && caption === item.id;
        return (
          <aside key={`${monitor}:${item.id}`} className={`scene-caption side-${item.side}${visible ? " is-visible" : ""}`} aria-hidden={!visible}>
            <strong>{item.title}</strong>
            <p>{item.text}</p>
          </aside>
        );
      })}

      <ol className="scene-dots" aria-label="Сцены">
        {SHOT_ORDER.map((key, index) => (
          <li key={key} className={index === step ? "is-active" : ""}>
            <button type="button" aria-label={sceneLabels[key]} onClick={() => {
              if (transitioning) return;
              if (window.scrollY < (blockRef.current?.offsetHeight ?? 0)) {
                window.scrollTo({ top: 0, behavior: "instant" });
              }
              setStep(index);
            }} />
          </li>
        ))}
      </ol>

      {roomReady ? (
        <div className="scene-hint" aria-hidden="true">
          <ChevronDown size={18} />
          <span>{step === 0 ? "Листайте, чтобы подойти к рабочему месту" : sceneLabels[shotKey]}</span>
        </div>
      ) : (
        <div className="scene-loading" role="status">
          <i aria-hidden="true" />
          <span>Загружаем офис</span>
        </div>
      )}
    </section>
  );
}
