import { cssStyle } from "./css-styles";
/**
 * lockPageScroll stops the page behind an overlay from scrolling and returns
 * the undo.
 *
 * Locking `body` alone does nothing here: the app scrolls the root element, so
 * the page kept moving underneath an open drawer while the drawer itself was
 * meant to be the only thing in use. Both are locked, because which one
 * scrolls depends on the page.
 */
export function lockPageScroll() {
  const root = document.documentElement;
  const previousRoot = cssStyle(root).overflow;
  const previousBody = cssStyle(document.body).overflow;

  cssStyle(root).overflow = "hidden";
  cssStyle(document.body).overflow = "hidden";

  return () => {
    cssStyle(root).overflow = previousRoot;
    cssStyle(document.body).overflow = previousBody;
  };
}

/**
 * enterOverlayMode locks the page and lifts the workspace above the chrome
 * around it for as long as an overlay is open.
 *
 * The drawer lives inside the workspace frame, and that frame is its own
 * stacking context — so however high the drawer's own z-index went, the
 * sidebar and the header still painted over it and cut the drawer in half. The
 * frame is raised instead, which carries the drawer and its backdrop with it.
 */
export function enterOverlayMode() {
  const unlockScroll = lockPageScroll();
  const shell = document.querySelector(".app-shell");
  shell?.classList.add("overlay-open");

  return () => {
    unlockScroll();
    shell?.classList.remove("overlay-open");
  };
}
