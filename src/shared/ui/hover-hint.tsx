import { Info } from "lucide-react";
import { type CSSProperties, type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Placement = { left: number; top: number; arrow: number; above: boolean };

let portalHost: HTMLElement | null = null;

// The host carries the app-shell class so the tooltip gets the theme tokens,
// like the select menus; it sits under body so no card or table clips it.
function hintHost() {
  if (portalHost?.isConnected) return portalHost;
  portalHost = document.createElement("span");
  portalHost.className = "app-shell select-menu-portal-root hover-hint-portal-root";
  portalHost.style.cssText = "all:unset;display:contents;pointer-events:none;";
  document.body.appendChild(portalHost);
  return portalHost;
}

/** A small info icon beside a label that explains it. */
export function InfoHint({ label, text }: { label: string; text: string | string[] }) {
  return <HoverHint className="info-hint" label={label} detail={text}><Info size={13} aria-label={typeof text === "string" ? text : text.join(" ")} /></HoverHint>;
}

/**
 * A hint shown on hover or focus in the look of the chart tooltips. The
 * browser's own title tooltip cannot be styled and waits a second, so the
 * explanations of the analytics screens go through this instead.
 */
export function HoverHint({ label, detail, children, className = "", style, focusable = true }: {
  label: ReactNode;
  /** A list is shown line by line: what the number is, then what to compare it with. */
  detail?: ReactNode | string[];
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Off inside a control that already takes focus, such as a button. */
  focusable?: boolean;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const anchor = anchorRef.current?.getBoundingClientRect();
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const gap = 8, margin = 8;
    const width = tip.offsetWidth, height = tip.offsetHeight;
    const center = anchor.left + anchor.width / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, center - width / 2));
    const above = anchor.bottom + gap + height > window.innerHeight - margin && anchor.top - gap - height > margin;
    setPlacement({ left, top: above ? anchor.top - gap - height : anchor.bottom + gap, arrow: Math.max(11, Math.min(width - 11, center - left)), above });

    // A fixed tooltip would drift away from its anchor on scroll.
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return <span
    ref={anchorRef}
    className={`hover-hint ${className}`.trim()}
    style={style}
    tabIndex={focusable ? 0 : undefined}
    aria-describedby={open ? id : undefined}
    onMouseEnter={() => setOpen(true)}
    onMouseLeave={() => setOpen(false)}
    onFocus={() => setOpen(true)}
    onBlur={() => setOpen(false)}
  >
    {children}
    {open ? createPortal(<span
      ref={tipRef}
      id={id}
      role="tooltip"
      className={`chart-tooltip hover-hint-tooltip${placement ? " is-placed" : ""}${placement?.above ? " is-above" : ""}`}
      style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, "--hint-arrow": `${placement?.arrow ?? 0}px` } as CSSProperties}
    >
      <strong>{label}</strong>
      {Array.isArray(detail) ? detail.map((line, index) => <span key={index}>{line}</span>) : detail ? <span>{detail}</span> : null}
    </span>, hintHost()) : null}
  </span>;
}
