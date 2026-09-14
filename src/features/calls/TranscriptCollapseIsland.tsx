import { ChevronUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { transcriptIslandLayout } from "./transcript-island-layout";

export function TranscriptCollapseIsland({ cardRef, onCollapse, label = "Свернуть расшифровку", kind = "transcript", blockedByVisibleSelector }: {
  cardRef: RefObject<HTMLDivElement | null>;
  onCollapse: () => void;
  label?: string;
  kind?: "transcript" | "analysis";
  blockedByVisibleSelector?: string;
}) {
  const islandRef = useRef<HTMLDivElement>(null);

  // This effect belongs to the portal itself: overflow can become known after
  // the parent has already expanded (for example after loading a quote).
  useEffect(() => {
    const card = cardRef.current;
    const island = islandRef.current;
    const mainToggle = card?.querySelector<HTMLElement>(":scope > .analysis-toggle-button");
    if (!card || !island || !mainToggle) return;
    const ancestors: HTMLElement[] = [];
    for (let parent = card.parentElement; parent; parent = parent.parentElement) ancestors.push(parent);
    let frame = 0;
    let buttonHeight = 42;

    const updatePosition = () => {
      const blocker = blockedByVisibleSelector ? document.querySelector<HTMLElement>(blockedByVisibleSelector) : null;
      if (blocker && !blocker.hidden && blocker.getClientRects().length > 0) {
        island.hidden = true;
        island.removeAttribute("data-positioned");
        return;
      }
      const viewport = window.visualViewport;
      const clip = {
        left: viewport?.offsetLeft ?? 0,
        right: (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth),
        top: viewport?.offsetTop ?? 0,
        bottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
      };
      for (const parent of ancestors) {
        const style = getComputedStyle(parent);
        const rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          clip.top = Math.max(clip.top, rect.top);
          clip.bottom = Math.min(clip.bottom, rect.bottom);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          clip.left = Math.max(clip.left, rect.left);
          clip.right = Math.min(clip.right, rect.right);
        }
      }
      const navigation = document.querySelector<HTMLElement>(".mobile-bottom-nav");
      if (navigation && navigation.getClientRects().length > 0) clip.bottom = Math.min(clip.bottom, navigation.getBoundingClientRect().top);
      const header = document.querySelector<HTMLElement>(".app-header");
      if (header && header.getClientRects().length > 0) clip.top = Math.max(clip.top, header.getBoundingClientRect().bottom);
      // Retain the measured height while hidden, so a wrapped label cannot
      // oscillate between visible and hidden near the card's upper edge.
      if (island.offsetHeight > 0) buttonHeight = island.offsetHeight;
      const layout = card.getClientRects().length > 0
        ? transcriptIslandLayout(card.getBoundingClientRect(), clip, mainToggle.getBoundingClientRect().top, buttonHeight)
        : null;
      island.hidden = !layout;
      if (!layout) {
        island.removeAttribute("data-positioned");
        mainToggle.classList.remove("is-island-receiving");
        mainToggle.style.removeProperty("--island-collision");
        return;
      }
      island.style.setProperty("--island-left", `${layout.left}px`);
      island.style.setProperty("--island-bottom", `${window.innerHeight - layout.bottom}px`);
      island.style.maxWidth = `${layout.maxWidth}px`;
      island.style.setProperty("--island-collision", String(layout.collision));
      mainToggle.style.setProperty("--island-collision", String(layout.collision));
      mainToggle.classList.toggle("is-island-receiving", layout.collision > 0);
      island.setAttribute("data-positioned", "true");
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; updatePosition(); });
    };
    updatePosition();
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    [card, mainToggle, island, ...ancestors].forEach((element) => resizeObserver.observe(element));
    const intersectionObserver = new IntersectionObserver(scheduleUpdate);
    intersectionObserver.observe(card);
    // A sidebar/layout change can move the card without resizing it. Observe
    // only its ancestor shells, not transcript words or our own position styles.
    const layoutObserver = new MutationObserver(scheduleUpdate);
    ancestors.forEach((element) => layoutObserver.observe(element, {
      attributes: true, attributeFilter: ["class", "style"], childList: true,
    }));
    // Capture covers every scroll container, including the document and drawers.
    document.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    document.addEventListener("transitionend", scheduleUpdate, true);
    document.addEventListener("animationend", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      layoutObserver.disconnect();
      document.removeEventListener("scroll", scheduleUpdate, true);
      document.removeEventListener("transitionend", scheduleUpdate, true);
      document.removeEventListener("animationend", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      mainToggle.classList.remove("is-island-receiving");
      mainToggle.style.removeProperty("--island-collision");
    };
  }, [blockedByVisibleSelector, cardRef]);

  return createPortal(<div ref={islandRef} className="transcript-collapse-island" data-collapse-kind={kind} hidden>
    <button type="button" aria-expanded="true" onClick={onCollapse}><ChevronUp size={18} />{label}</button>
  </div>, document.body);
}
