import { ListFilter } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { drawerLayoutQuery } from "../lib/drawer-layout";

export function MobileCallDrawerTrigger({
  open,
  onToggle
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [showHeaderTrigger, setShowHeaderTrigger] = useState(false);
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const mobileQuery = window.matchMedia(drawerLayoutQuery);
    if (!anchor) return;

    let frameId = 0;
    const updateHeaderTrigger = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        // The button joins the row of header icons — notifications, theme,
        // avatar — because that is where the header's controls live. Hung off
        // the body instead it sat underneath the header, which paints above it.
        setHeaderHost(document.querySelector<HTMLElement>(".app-header .profile-block") ?? document.body);

        if (!mobileQuery.matches) {
          setShowHeaderTrigger(false);
          return;
        }

        // Once the button in the page has scrolled behind the header, the copy
        // in the header takes over. The header's own height is the threshold,
        // because it is what hides the original.
        const header = document.querySelector<HTMLElement>(".app-header");
        const hiddenBelow = header ? header.getBoundingClientRect().bottom : 84;
        setShowHeaderTrigger(anchor.getBoundingClientRect().bottom <= hiddenBelow);
      });
    };

    updateHeaderTrigger();
    document.addEventListener("scroll", updateHeaderTrigger, true);
    window.addEventListener("resize", updateHeaderTrigger);
    mobileQuery.addEventListener("change", updateHeaderTrigger);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("scroll", updateHeaderTrigger, true);
      window.removeEventListener("resize", updateHeaderTrigger);
      mobileQuery.removeEventListener("change", updateHeaderTrigger);
    };
  }, []);

  return (
    <>
      <div className="mobile-call-drawer-trigger-anchor" ref={anchorRef}>
        <button
          className="ghost-button mobile-call-drawer-trigger"
          type="button"
          aria-controls="mobile-call-drawer"
          aria-expanded={open}
          onClick={onToggle}
        >
          <ListFilter size={18} />
          <span>Звонки и фильтры</span>
        </button>
      </div>
      {headerHost && createPortal(
        <button
          // icon-button so it is styled by the same rules as the header's other
          // icons, in both themes, instead of a copy that drifts from them.
          className={`icon-button mobile-call-drawer-header-trigger ${showHeaderTrigger || open ? "visible" : ""} ${open ? "drawer-open" : ""}`}
          type="button"
          aria-label={open ? "Закрыть звонки и фильтры" : "Открыть звонки и фильтры"}
          aria-controls="mobile-call-drawer"
          aria-expanded={open}
          tabIndex={showHeaderTrigger || open ? 0 : -1}
          onClick={onToggle}
        >
          <ListFilter size={20} />
        </button>,
        headerHost
      )}
    </>
  );
}
