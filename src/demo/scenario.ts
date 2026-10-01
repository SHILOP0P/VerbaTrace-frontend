import gsap from "gsap";
import type { DemoEvent } from "./bridge";

/**
 * The scenario engine of a demo screen. It drives the real interface with a
 * drawn cursor: finds elements in the live DOM, glides to them, dispatches
 * genuine pointer and input events, and reports every cursor move and key
 * press to the parent page so the figure in the 3D scene moves in step.
 */

export type Target =
  | string
  | {
      selector: string;
      /** Keep only elements whose text contains this. */
      text?: string;
      index?: number;
      /** Search inside this container only. */
      within?: string;
    };

export type Step =
  | { kind: "wait"; ms: number }
  | { kind: "caption"; id: string | null }
  /** Glide to an element; `at` is the point inside it, in fractions, centre by default. */
  | { kind: "move"; target: Target; duration?: number; at?: [number, number] }
  | { kind: "click"; target?: Target }
  | { kind: "type"; target: Target; text: string; perChar?: number }
  | { kind: "clear"; target: Target }
  | { kind: "scroll"; target: Target; by: number; duration?: number }
  | { kind: "run"; fn: () => void | Promise<void> };

export type ScenarioPlayer = {
  play(): void;
  pause(): void;
  destroy(): void;
};

class Cancelled extends Error {}

const CURSOR_SVG = `<svg width="26" height="30" viewBox="0 0 26 30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 3.5 4.6 24l5.2-5 3.9 8.3 3.6-1.7-3.9-8.2 7.1-.8L4 3.5Z" fill="#fff" stroke="#1b1512" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

export function createScenarioPlayer(steps: Step[], emit: (event: DemoEvent) => void): ScenarioPlayer {
  const cursor = document.createElement("div");
  cursor.className = "demo-cursor";
  cursor.innerHTML = CURSOR_SVG;
  cursor.style.cssText = "position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));transition:opacity .3s;opacity:0;will-change:transform";
  document.body.appendChild(cursor);

  const point = { x: window.innerWidth * 0.55, y: window.innerHeight * 0.6 };
  let down = false;
  let lastCursorReport = 0;
  let abort: AbortController | null = null;
  let tween: gsap.core.Tween | null = null;

  /**
   * Keeps the pointer on screen. A step that measures an element while the
   * page is still scrolling can hand over a wild or missing number, and an
   * invalid transform drops the cursor into the top left corner of the page.
   */
  const clampPoint = () => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    if (!Number.isFinite(point.x)) point.x = width / 2;
    if (!Number.isFinite(point.y)) point.y = height / 2;
    point.x = Math.min(Math.max(point.x, 4), width - 4);
    point.y = Math.min(Math.max(point.y, 4), height - 4);
  };

  const paint = () => {
    clampPoint();
    cursor.style.transform = `translate3d(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px,0)${down ? " scale(.9)" : ""}`;
  };

  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - lastCursorReport < 40) return;
    lastCursorReport = now;
    emit({ type: "vt-demo:cursor", x: point.x / window.innerWidth, y: point.y / window.innerHeight, down });
  };

  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new Cancelled());
      }, { once: true });
    });

  async function resolve(target: Target, signal: AbortSignal): Promise<HTMLElement> {
    const spec = typeof target === "string" ? { selector: target } : target;
    // Elements appear after data arrives; a short wait beats a failed step.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const root = spec.within ? document.querySelector(spec.within) : document;
      const candidates = root
        ? Array.from(root.querySelectorAll<HTMLElement>(spec.selector)).filter((element) =>
          spec.text ? (element.textContent ?? "").includes(spec.text) : true)
        : [];
      const element = candidates[spec.index ?? 0];
      if (element) return element;
      await sleep(100, signal);
    }
    throw new Error(`demo scenario: nothing matches ${spec.selector}${spec.text ? ` «${spec.text}»` : ""}`);
  }

  function pointInside(element: HTMLElement, at: [number, number] = [0.5, 0.5]) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width * at[0];
    const y = rect.top + rect.height * at[1];
    // An element that is not laid out yet measures as zero; staying put beats
    // gliding to the corner of the page.
    if (!Number.isFinite(x) || !Number.isFinite(y) || (rect.width === 0 && rect.height === 0)) {
      return { x: point.x, y: point.y };
    }
    return {
      x: Math.min(Math.max(x, 4), (window.innerWidth || 1) - 4),
      y: Math.min(Math.max(y, 4), (window.innerHeight || 1) - 4)
    };
  }

  /** The nearest thing above an element that actually scrolls. */
  function scrollableAncestor(element: HTMLElement) {
    let node = element.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return node;
      node = node.parentElement;
    }
    return null;
  }

  function scrollBy(container: HTMLElement, delta: number, signal: AbortSignal) {
    return new Promise<void>((resolveScroll, reject) => {
      const tween = gsap.to(container, {
        scrollTop: Math.max(0, container.scrollTop + delta),
        duration: 0.55,
        ease: "power2.inOut",
        onComplete: () => resolveScroll()
      });
      signal.addEventListener("abort", () => {
        tween.kill();
        reject(new Cancelled());
      }, { once: true });
    });
  }

  /**
   * Brings an element into view without `scrollIntoView`.
   *
   * That call walks up through every ancestor frame, so a step inside this
   * document used to scroll the landing page underneath it — the office jumped
   * away mid-recording. Here only the element's own scroll container moves.
   */
  async function bringIntoView(element: HTMLElement, signal: AbortSignal) {
    const container = scrollableAncestor(element);
    const target = container ?? (document.scrollingElement as HTMLElement | null);
    if (!target) return;
    const rect = element.getBoundingClientRect();
    const viewTop = container ? container.getBoundingClientRect().top : 0;
    const viewHeight = container ? container.clientHeight : window.innerHeight;
    const delta = rect.top - viewTop - (viewHeight / 2 - rect.height / 2);
    if (Math.abs(delta) < 12) return;
    await scrollBy(target, delta, signal);
  }

  async function glide(to: { x: number; y: number }, duration: number, signal: AbortSignal) {
    const distance = Math.hypot(to.x - point.x, to.y - point.y);
    const seconds = duration || Math.min(1.4, 0.35 + distance / 1400);
    await new Promise<void>((resolveGlide, reject) => {
      tween = gsap.to(point, {
        x: to.x,
        y: to.y,
        duration: seconds,
        ease: "power2.inOut",
        onUpdate: () => {
          paint();
          report();
        },
        onComplete: () => resolveGlide()
      });
      signal.addEventListener("abort", () => {
        tween?.kill();
        reject(new Cancelled());
      }, { once: true });
    });
    report(true);
  }

  function mouseInit(element: HTMLElement) {
    const at = pointInside(element);
    return { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, button: 0, buttons: 1 };
  }

  function fire(element: HTMLElement, type: string, init: MouseEventInit) {
    const pointerTypes = new Set(["pointerdown", "pointerup", "pointermove", "pointerover", "pointerenter", "pointerout"]);
    const event = pointerTypes.has(type)
      ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true })
      : new MouseEvent(type, init);
    element.dispatchEvent(event);
  }

  function setNativeValue(element: HTMLElement, value: string) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    // React watches the prototype setter; writing the instance value directly
    // would be swallowed by its value tracker.
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function run(step: Step, signal: AbortSignal) {
    switch (step.kind) {
      case "wait":
        await sleep(step.ms, signal);
        return;
      case "caption":
        emit({ type: "vt-demo:caption", id: step.id });
        return;
      case "move": {
        const element = await resolve(step.target, signal);
        await bringIntoView(element, signal);
        const previous = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
        await glide(pointInside(element, step.at), step.duration ?? 0, signal);
        if (previous && previous !== element) fire(previous, "pointerout", mouseInit(previous));
        fire(element, "pointerover", mouseInit(element));
        fire(element, "mouseover", mouseInit(element));
        return;
      }
      case "click": {
        const element = step.target
          ? await resolve(step.target, signal)
          : (document.elementFromPoint(point.x, point.y) as HTMLElement | null);
        if (!element) return;
        if (step.target) {
          await bringIntoView(element, signal);
          await glide(pointInside(element), 0, signal);
        }
        const init = mouseInit(element);
        down = true;
        paint();
        report(true);
        fire(element, "pointerdown", init);
        fire(element, "mousedown", init);
        if (typeof element.focus === "function") element.focus({ preventScroll: true });
        await sleep(110, signal);
        fire(element, "pointerup", init);
        fire(element, "mouseup", init);
        fire(element, "click", init);
        down = false;
        paint();
        report(true);
        return;
      }
      case "type": {
        const element = await resolve(step.target, signal);
        await bringIntoView(element, signal);
        await glide(pointInside(element), 0, signal);
        const init = mouseInit(element);
        fire(element, "pointerdown", init);
        fire(element, "mousedown", init);
        fire(element, "pointerup", init);
        fire(element, "mouseup", init);
        fire(element, "click", init);
        element.focus({ preventScroll: true });
        emit({ type: "vt-demo:typing", active: true });
        let value = (element as HTMLInputElement).value ?? "";
        for (const char of step.text) {
          value += char;
          setNativeValue(element, value);
          await sleep(step.perChar ?? 70 + Math.random() * 60, signal);
        }
        emit({ type: "vt-demo:typing", active: false });
        return;
      }
      case "clear": {
        const element = await resolve(step.target, signal);
        setNativeValue(element, "");
        return;
      }
      case "scroll": {
        const element = await resolve(step.target, signal);
        // The step names a container; if that one does not scroll, the page
        // behind it must not be scrolled in its place.
        const container = element.scrollHeight > element.clientHeight + 2
          ? element
          : scrollableAncestor(element) ?? element;
        await new Promise<void>((resolveScroll, reject) => {
          const scrollTween = gsap.to(container, { scrollTop: Math.max(0, container.scrollTop + step.by), duration: step.duration ?? 0.9, ease: "power2.inOut", onComplete: () => resolveScroll() });
          signal.addEventListener("abort", () => {
            scrollTween.kill();
            reject(new Cancelled());
          }, { once: true });
        });
        return;
      }
      case "run":
        await step.fn();
        return;
    }
  }

  async function loop(signal: AbortSignal) {
    cursor.style.opacity = "1";
    paint();
    report(true);
    try {
      while (!signal.aborted) {
        for (const step of steps) {
          if (signal.aborted) return;
          await run(step, signal);
        }
        emit({ type: "vt-demo:loop" });
      }
    } catch (error) {
      if (!(error instanceof Cancelled)) console.warn(error);
    }
  }

  return {
    play() {
      if (abort) return;
      abort = new AbortController();
      void loop(abort.signal);
    },
    pause() {
      abort?.abort();
      abort = null;
      tween?.kill();
      down = false;
      cursor.style.opacity = "0";
      emit({ type: "vt-demo:typing", active: false });
      emit({ type: "vt-demo:caption", id: null });
    },
    destroy() {
      this.pause();
      cursor.remove();
    }
  };
}
