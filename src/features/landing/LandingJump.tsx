import type { ButtonHTMLAttributes } from "react";

/** In-page navigation without the browser's link-address preview on hover. */
export function LandingJump({ target, onClick, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { target: string }) {
  return <button {...props} type="button" className={`landing-jump ${className}`} onClick={(event) => {
    onClick?.(event);
    const section = document.getElementById(target);
    if (!section) return;
    const header = document.querySelector(".landing-header");
    const offset = target === "landing-top" ? 0 : (header?.getBoundingClientRect().bottom ?? 80) + 24;
    window.scrollTo({
      top: Math.max(0, window.scrollY + section.getBoundingClientRect().top - offset),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
    });
    const heading = section.querySelector<HTMLElement>("h1, h2, h3");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }}>{children}</button>;
}
