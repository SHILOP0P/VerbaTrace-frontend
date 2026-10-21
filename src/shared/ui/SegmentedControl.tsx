import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { cssClass } from "../lib/css-styles";
import "./segmented-control.css";

/** Shared moving selection surface, matching the assistant's 240ms motion. */
export function SegmentedControl({
  children,
  className = "",
  as: Tag = "div",
  containerRef,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "nav";
  containerRef?: { current: HTMLElement | null };
}) {
  const root = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const selected = Array.from(node.children).find(
        (el) =>
          el instanceof HTMLButtonElement &&
          (el.classList.contains("active") ||
            el.getAttribute("aria-selected") === "true" ||
            el.getAttribute("aria-pressed") === "true"),
      ) as HTMLButtonElement | undefined;
      const next = selected
        ? {
            left: selected.offsetLeft,
            top: selected.offsetTop,
            width: selected.offsetWidth,
            height: selected.offsetHeight,
          }
        : { left: 0, top: 0, width: 0, height: 0 };
      setPosition((previous) =>
        Object.keys(next).every(
          (key) =>
            previous[key as keyof typeof next] ===
            next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    for (const el of node.children)
      if (el instanceof HTMLButtonElement) resize.observe(el);
    const mutations = new MutationObserver(measure);
    mutations.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected", "aria-pressed"],
    });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, []);
  return (
    <Tag
      {...props}
      ref={(node) => {
        root.current = node;
        if (containerRef) containerRef.current = node;
      }}
      className={`motion-segmented ${className}`}
    >
      <span
        aria-hidden="true"
        className={`segmented-thumb ${cssClass({ width: position.width, height: position.height, transform: `translate(${position.left}px, ${position.top}px)` })}`}
      />
      {children}
    </Tag>
  );
}
