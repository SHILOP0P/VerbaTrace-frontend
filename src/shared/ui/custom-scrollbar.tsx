import { PointerEvent, RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ThumbMetrics = {
  visible: boolean;
  height: number;
  trackHeight: number;
};

const hiddenMetrics: ThumbMetrics = {
  visible: false,
  height: 0,
  trackHeight: 0
};

function visibleRange(target: HTMLElement, rect: DOMRect): [number, number] {
  let top = Math.max(rect.top, 0);
  let bottom = Math.min(rect.bottom, window.innerHeight);
  for (let node: HTMLElement | null = target; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node !== target && style.overflowY !== "visible") {
      const box = node.getBoundingClientRect();
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
    }
    // Ancestors above a fixed element (e.g. the mobile call drawer) do not clip it.
    if (style.position === "fixed") break;
  }
  return [top, bottom];
}

export function CustomScrollbar({
  targetRef,
  className = "",
  alignToViewport = false,
  inset = 6,
  rightOffset = 8
}: {
  targetRef: RefObject<HTMLElement | null>;
  className?: string;
  alignToViewport?: boolean;
  inset?: number;
  rightOffset?: number;
}) {
  const thumbRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef<ThumbMetrics>(hiddenMetrics);
  const dragRef = useRef<{ pointerY: number; scrollTop: number } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  // A thumb painted over the viewport follows a scrolling page one frame late
  // and visibly shakes, so the thumb lives next to its list and moves with it
  // natively. Only a list that is the page's own scroller keeps a viewport thumb.
  // A passive effect: the thumb often comes before its list in the markup, and
  // the list's ref is not attached yet when this component's layout effects run.
  useEffect(() => {
    const target = targetRef.current;
    const parent = target?.parentElement;
    if (!target || !parent || alignToViewport) {
      setHost(document.body);
      return;
    }
    // The thumb is positioned against the list's parent; give it a box to
    // anchor to only when it has none, and hand the style back afterwards.
    const previousPosition = parent.style.position;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    setHost(parent);
    return () => {
      parent.style.position = previousPosition;
    };
  }, [alignToViewport, targetRef]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !host) return;
    const local = host !== document.body;

    let frame = 0;
    let transitionFrame = 0;
    let activeTransitions = 0;
    const hide = (thumb: HTMLDivElement) => {
      metricsRef.current = hiddenMetrics;
      thumb.style.opacity = "0";
      thumb.style.pointerEvents = "none";
    };
    const measure = () => {
      const thumb = thumbRef.current;
      if (!thumb) return;

      const maxScroll = target.scrollHeight - target.clientHeight;
      if (local) {
        const trackHeight = Math.max(0, target.clientHeight - inset * 2);
        if (maxScroll <= 1 || trackHeight < 56) return hide(thumb);
        const height = Math.max(56, trackHeight * (target.clientHeight / target.scrollHeight));
        const travel = Math.max(0, trackHeight - height);
        const left = target.offsetLeft + target.offsetWidth - rightOffset;
        const top = target.offsetTop + inset + travel * (target.scrollTop / maxScroll);
        metricsRef.current = { visible: true, height, trackHeight };
        thumb.style.height = `${height}px`;
        thumb.style.opacity = "1";
        thumb.style.pointerEvents = "auto";
        thumb.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        return;
      }

      const rect = target.getBoundingClientRect();
      // A target nested in a scrolling page is only partly visible; keep the
      // fixed thumb inside the part that its clipping ancestors still show.
      const [visibleTop, visibleBottom] = visibleRange(target, rect);
      const trackHeight = Math.max(0, visibleBottom - visibleTop - inset * 2);
      if (maxScroll <= 1 || trackHeight < 56) return hide(thumb);

      const height = Math.max(56, trackHeight * (target.clientHeight / target.scrollHeight));
      const travel = Math.max(0, trackHeight - height);
      const left = (alignToViewport ? window.innerWidth : rect.right) - rightOffset;
      const top = visibleTop + inset + travel * (target.scrollTop / maxScroll);

      metricsRef.current = { visible: true, height, trackHeight };
      thumb.style.height = `${height}px`;
      thumb.style.opacity = "1";
      thumb.style.pointerEvents = "auto";
      thumb.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    };

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    const resizeObserver = new ResizeObserver(update);
    const mutationObserver = new MutationObserver(update);
    const shell = target.closest(".app-shell");

    const followTransition = () => {
      if (transitionFrame) return;

      const tick = () => {
        measure();
        if (activeTransitions > 0) {
          transitionFrame = window.requestAnimationFrame(tick);
        } else {
          transitionFrame = 0;
        }
      };

      transitionFrame = window.requestAnimationFrame(tick);
    };

    const startTransition = () => {
      activeTransitions += 1;
      followTransition();
    };

    const stopTransition = () => {
      activeTransitions = Math.max(0, activeTransitions - 1);
      update();
    };

    resizeObserver.observe(target);
    mutationObserver.observe(target, { childList: true, subtree: true });
    if (local) {
      // Only the list's own scroll moves a local thumb; the page carries it.
      target.addEventListener("scroll", measure, { passive: true });
    } else {
      // Scroll does not bubble; capturing on document also follows ancestors
      // that move a nested target, not only the target itself.
      document.addEventListener("scroll", update, { capture: true, passive: true });
    }
    window.addEventListener("resize", update);
    shell?.addEventListener("transitionrun", startTransition);
    shell?.addEventListener("transitionend", stopTransition);
    shell?.addEventListener("transitioncancel", stopTransition);
    update();

    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(transitionFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      target.removeEventListener("scroll", measure);
      document.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
      shell?.removeEventListener("transitionrun", startTransition);
      shell?.removeEventListener("transitionend", stopTransition);
      shell?.removeEventListener("transitioncancel", stopTransition);
    };
  }, [alignToViewport, host, inset, rightOffset, targetRef]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const target = targetRef.current;
    if (!target) return;
    dragRef.current = { pointerY: event.clientY, scrollTop: target.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const target = targetRef.current;
    const start = dragRef.current;
    if (!target || !start) return;
    const maxScroll = target.scrollHeight - target.clientHeight;
    const metrics = metricsRef.current;
    const travel = Math.max(1, metrics.trackHeight - metrics.height);
    target.scrollTop = start.scrollTop + ((event.clientY - start.pointerY) / travel) * maxScroll;
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  if (!host) return null;
  const local = host !== document.body;
  return createPortal(
    <div
      ref={thumbRef}
      aria-hidden="true"
      className={`custom-scroll-thumb${local ? " is-local" : ""} ${className}`.trim()}
      onPointerDown={startDrag}
      onPointerMove={drag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    />,
    host
  );
}
