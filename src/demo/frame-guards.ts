/**
 * Keeps the demo document from moving the page that frames it.
 *
 * This document lives in an iframe on the landing. `scrollIntoView` and a
 * focus call both walk up through every ancestor frame, so a dialog opening or
 * a list scrolling in here would scroll the office away underneath — the page
 * appeared to scroll by itself in the middle of a recording. Both are replaced
 * with versions that stay inside this document.
 */
export function installFrameGuards() {
  const nativeFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function focusWithoutScroll(this: HTMLElement, options?: FocusOptions) {
    nativeFocus.call(this, { ...(options ?? {}), preventScroll: true });
  };

  Element.prototype.scrollIntoView = function scrollWithinDocument(this: Element) {
    const element = this as HTMLElement;
    let container = element.parentElement;
    while (container) {
      const style = window.getComputedStyle(container);
      const scrolls = /(auto|scroll|overlay)/.test(style.overflowY) && container.scrollHeight > container.clientHeight + 2;
      if (scrolls) break;
      container = container.parentElement;
    }

    const rect = element.getBoundingClientRect();
    if (container) {
      const view = container.getBoundingClientRect();
      container.scrollTop += rect.top - view.top - (container.clientHeight - rect.height) / 2;
      return;
    }

    const root = document.scrollingElement as HTMLElement | null;
    if (!root) return;
    root.scrollTop += rect.top - (window.innerHeight - rect.height) / 2;
  };
}
