import { useEffect, useLayoutEffect, useRef, type MouseEvent } from "react";
import { Moon, Sun } from "lucide-react";
import "./theme-toggle.css";

export function ThemeToggle({ theme, onClick }: { theme: "light" | "dark"; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  const sun = useRef<SVGSVGElement>(null);
  const moon = useRef<SVGSVGElement>(null);
  const previous = useRef(theme);
  const animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    if (previous.current === theme) return;
    previous.current = theme;
    const incoming = theme === "dark" ? sun.current : moon.current;
    const outgoing = theme === "dark" ? moon.current : sun.current;
    if (!incoming || !outgoing) return;
    const oldStyle = getComputedStyle(outgoing);
    const incomingStyle = getComputedStyle(incoming);
    const animated = animations.current.length > 0;
    const fromOutgoing = animated ? { opacity: oldStyle.opacity, transform: oldStyle.transform } : { opacity: "1", transform: "rotate(0deg)" };
    const fromIncoming = animated && Number(incomingStyle.opacity) > .01 ? { opacity: incomingStyle.opacity, transform: incomingStyle.transform } : { opacity: "0", transform: "rotate(90deg)" };
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    // The pivot sits below the icon: rotation traces a circular sunrise/sunset
    // arc. View Transitions animate the transparent window, never the border.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("theme-reveal-running")) return;
    const options = { duration: 430, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" as const };
    animations.current = [
      outgoing.animate([fromOutgoing, { opacity: "0", transform: "rotate(-90deg)" }], options),
      incoming.animate([fromIncoming, { opacity: "1", transform: "rotate(0deg)" }], options),
    ];
  }, [theme]);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { if (preference.matches) { animations.current.forEach(animation => animation.cancel()); animations.current = []; } };
    preference.addEventListener("change", stop);
    return () => { preference.removeEventListener("change", stop); animations.current.forEach(animation => animation.cancel()); };
  }, []);
  return <button className="vt-theme-toggle" type="button" onClick={onClick} aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}>
    <span className="vt-theme-window" aria-hidden="true">
      <Sun ref={sun} className="vt-theme-glyph" data-active={theme === "dark"} size={19} strokeWidth={1.8} />
      <Moon ref={moon} className="vt-theme-glyph" data-active={theme === "light"} size={19} strokeWidth={1.8} />
    </span>
  </button>;
}
