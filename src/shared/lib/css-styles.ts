import type { CSSProperties } from "react";

type Styles = CSSProperties | Record<string, string | number | undefined>;
type Entry = { name: string; rule: CSSStyleRule; usedAt: number; declaration?: CSSStyleDeclaration; assignments?: Map<PropertyKey, { input: unknown; normalized: unknown }> };
type Registry = { sheet: CSSStyleSheet; cache: Map<string, Entry>; spare: CSSStyleRule[]; pending: boolean; live: WeakMap<Element, Entry>; redirected: WeakSet<Element>; sequence: number; observer?: MutationObserver };
// Parent and monitor bundles both style the monitor document. A registry on
// that document makes their class names and mutable rules share one owner.
const registryKey = Symbol.for("verbatrace.css.class-registry");

// Keep React's numeric-unit conventions when moving declarations into CSS.
const unitless = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));

function registry(doc: Document): Registry {
  const shared = doc as Document & { [registryKey]?: Registry };
  let value = shared[registryKey];
  if (!value) {
    // Each monitor iframe has its own document and stylesheet.
    const host = doc.createElement("style");
    host.dataset.vtStyles = "classes";
    doc.head.appendChild(host);
    value = { sheet: host.sheet!, cache: new Map(), spare: [], pending: false, live: new WeakMap(), redirected: new WeakSet(), sequence: 0 };
    shared[registryKey] = value;
  }
  return value;
}

function allocate(doc: Document, mutable: boolean): Entry {
  const value = registry(doc);
  const name = `vt-${mutable ? "live" : "css"}-${++value.sequence}`;
  // Preserve the precedence of the removed inline declarations, while letting
  // the existing !important responsive rules continue to take precedence.
  const priority = mutable ? "#vt-priority#vt-live-priority#vt-update-priority" : "#vt-priority#vt-class-priority";
  const selector = `:is(${priority}, .${name})`;
  let rule = value.spare.pop();
  if (rule) rule.selectorText = selector;
  else {
    const index = value.sheet.insertRule(`${selector} {}`, value.sheet.cssRules.length);
    rule = value.sheet.cssRules[index] as CSSStyleRule;
  }
  return { name, rule, usedAt: Date.now() };
}

function recycle(doc: Document, entry: Entry) {
  entry.rule.style.cssText = "";
  entry.rule.selectorText = ":not(*)";
  registry(doc).spare.push(entry.rule);
}

function collectUnused(doc: Document) {
  const value = registry(doc);
  if (value.pending || value.cache.size < 1000) return;
  value.pending = true;
  // Collect after React has committed the newly generated classes.
  doc.defaultView?.setTimeout(() => {
    value.pending = false;
    const used = new Set<string>();
    doc.querySelectorAll('[class*="vt-css-"]').forEach(node => node.classList.forEach(name => used.add(name)));
    for (const [key, entry] of value.cache) if (!used.has(entry.name) && Date.now() - entry.usedAt >= 30_000) {
      value.cache.delete(key);
      recycle(doc, entry);
    }
  }, 30_000);
}

/** A cached CSS class for render-time values such as speaker colors or sizes. */
export function cssClass(styles: Styles | null | undefined): string {
  if (!styles || typeof document === "undefined") return "";
  const declarations = Object.entries(styles).filter(([, value]) => value !== undefined && value !== null && value !== "").sort(([a], [b]) => a.localeCompare(b));
  if (!declarations.length) return "";
  const key = JSON.stringify(declarations);
  const value = registry(document);
  const cached = value.cache.get(key);
  if (cached) { cached.usedAt = Date.now(); return cached.name; }
  const entry = allocate(document, false);
  for (const [property, raw] of declarations) {
    const custom = property.startsWith("--");
    const name = custom ? property : property === "cssFloat" ? "float" : property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^ms-/, "-ms-");
    const formatted = typeof raw === "number" && raw !== 0 && !custom && !unitless.has(property) ? `${raw}px` : String(raw).trim();
    entry.rule.style.setProperty(name, formatted);
  }
  value.cache.set(key, entry);
  collectUnused(document);
  return entry.name;
}

/** Update one class rule in place; animation frames never allocate new rules. */
export function cssStyle(element: Element): CSSStyleDeclaration;
export function cssStyle(element: Element | null | undefined): CSSStyleDeclaration | undefined;
export function cssStyle(element: Element | null | undefined): CSSStyleDeclaration | undefined {
  if (!element) return undefined;
  const value = registry(element.ownerDocument);
  let entry = value.live.get(element);
  if (!entry) {
    entry = allocate(element.ownerDocument, true);
    value.live.set(element, entry);
  }
  if (!element.classList.contains(entry.name)) element.classList.add(entry.name);
  // Changing a stylesheet declaration can invalidate more than this element.
  // Camera projectors and library layout loops repeatedly write parked values;
  // retain native CSS semantics while skipping declarations that already match.
  const assignments = entry.assignments ??= new Map();
  entry.declaration ??= new Proxy(entry.rule.style, {
    get(target, property) {
      if (property === "setProperty") return (name: string, text: string, priority = "") => {
        const key = `css:${name}`, input = JSON.stringify([text, priority]);
        const normalized = JSON.stringify([target.getPropertyValue(name), target.getPropertyPriority(name)]);
        const previous = assignments.get(key);
        if (previous?.input === input && previous.normalized === normalized) return;
        if (target.getPropertyValue(name) !== text || target.getPropertyPriority(name) !== priority) target.setProperty(name, text, priority);
        assignments.set(key, { input, normalized: JSON.stringify([target.getPropertyValue(name), target.getPropertyPriority(name)]) });
      };
      if (property === "removeProperty") return (name: string) => target.getPropertyValue(name) ? target.removeProperty(name) : "";
      const result = Reflect.get(target, property, target);
      return typeof result === "function" ? result.bind(target) : result;
    },
    set(target, property, text) {
      const normalized = Reflect.get(target, property, target);
      const previous = assignments.get(property);
      if (previous?.input === text && previous.normalized === normalized) return true;
      if (normalized !== text) Reflect.set(target, property, text, target);
      assignments.set(property, { input: text, normalized: Reflect.get(target, property, target) });
      return true;
    }
  });
  return entry.declaration;
}

/**
 * Libraries such as React Three Fiber create their own style attributes. Move
 * those declarations to class rules too, and redirect subsequent style writes.
 * The observer is limited to our root, document scroll styles and UI portals;
 * browser-extension elements outside the app are never modified.
 */
export function startStyleClassBridge(doc: Document = document) {
  const value = registry(doc);
  if (value.observer) return () => {};
  const owned = (element: Element) => element === doc.body || element === doc.documentElement || !!element.closest("#root, .vt-portal, .select-menu-portal-root, .credit-activity-tooltip") || value.live.has(element);
  const migrate = (element: Element) => {
    if (!owned(element)) return;
    if (element.hasAttribute("style")) {
      const declaration = element.getAttribute("style")!;
      const target = cssStyle(element)!;
      if (value.redirected.has(element)) target.cssText = declaration;
      else {
        // A library may add its first inline property after our animation rule
        // already exists. Preserve that rule's other properties on adoption.
        const temporary = doc.createElement("span").style;
        temporary.cssText = declaration;
        for (const name of temporary) target.setProperty(name, temporary.getPropertyValue(name), temporary.getPropertyPriority(name));
      }
      element.removeAttribute("style");
      // Native library updates (including React's property removal) now write
      // directly to the same rule rather than briefly recreating an attribute.
      Object.defineProperty(element, "style", { configurable: true, get: () => cssStyle(element)!, set: (text: string) => { cssStyle(element)!.cssText = text; } });
      value.redirected.add(element);
    }
    const entry = value.live.get(element);
    if (entry && !element.classList.contains(entry.name)) element.classList.add(entry.name);
  };
  const scan = (node: Node) => {
    if (!(node instanceof doc.defaultView!.Element)) return;
    migrate(node as Element);
    (node as Element).querySelectorAll("[style]").forEach(migrate);
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") migrate(record.target as Element);
      else {
        record.addedNodes.forEach(scan);
        record.removedNodes.forEach(node => {
          if (!(node instanceof doc.defaultView!.Element)) return;
          const elements = [node as Element, ...(node as Element).querySelectorAll('[class*="vt-live-"]')];
          queueMicrotask(() => elements.forEach(element => {
            const entry = value.live.get(element);
            if (!element.isConnected && entry) {
              value.live.delete(element);
              element.classList.remove(entry.name);
              recycle(doc, entry);
            }
          }));
        });
      }
    }
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
  value.observer = observer;
  scan(doc.documentElement);
  return () => { observer.disconnect(); value.observer = undefined; };
}
