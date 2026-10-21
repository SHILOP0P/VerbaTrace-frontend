import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const compile = (source) =>
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64")}`;
const layoutURL = compile(
  await readFile(
    new URL("../src/features/overview/layout.ts", import.meta.url),
    "utf8",
  ),
);
const gesturesSource = await readFile(
  new URL("../src/features/overview/widget-gestures.ts", import.meta.url),
  "utf8",
);
const geometryURL = compile((await readFile(
  new URL("../src/features/overview/widget-geometry.ts", import.meta.url), "utf8",
)).replace('from "./layout"', `from "${layoutURL}"`));
const { bindWidgetInteraction } = await import(
  compile(gesturesSource.replace('from "./layout"', `from "${layoutURL}"`)
    .replace('from "./widget-geometry"', `from "${geometryURL}"`))
);

function harness(t) {
  class Element extends EventTarget {
    constructor(id, edge, interactive = false) {
      super();
      this.dataset = { widgetId: id, resizeEdge: edge };
      this.interactive = interactive;
      this.rect = { left: 100, right: 500, top: 100, bottom: 420 };
    }
    getBoundingClientRect() {
      return this.rect;
    }
    closest(selector) {
      if (selector === "[data-widget-id]") return this.card ?? this;
      if (selector === "[data-resize-edge]")
        return this.dataset.resizeEdge ? this : null;
      return this.interactive ? this : null;
    }
  }
  const board = new Element();
  board.clientWidth = 1186;
  board.rect = { left: 100, right: 1286, top: 100, bottom: 1100 };
  const first = new Element("first"),
    second = new Element("second");
  board.contains = (element) => [first, second].includes(element);
  second.rect = { left: 600, right: 1000, top: 100, bottom: 440 };
  board.querySelectorAll = () => [first, second];
  const timers = new Map(),
    frames = new Map();
  let sequence = 0,
    now = 0,
    hit = first;
  const win = new EventTarget();
  win.innerWidth = 1280;
  win.innerHeight = 800;
  win.setTimeout = (fn, delay) => {
    timers.set(++sequence, { at: now + delay, fn });
    return sequence;
  };
  win.clearTimeout = (id) => timers.delete(id);
  const doc = new EventTarget();
  doc.querySelector = () => null;
  doc.elementFromPoint = () => hit;
  const replacements = {
    Element,
    window: win,
    document: doc,
    requestAnimationFrame: (fn) => {
      frames.set(++sequence, fn);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const previous = Object.fromEntries(
    Object.keys(replacements).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  const state = {},
    moves = [],
    sizes = [];
  const options = {
    selected: "first",
    onSelect: (id) => {
      options.selected = id;
    },
    widgets: [first, second].map((el) => ({
      id: el.dataset.widgetId,
      kind: "total",
      width: 4,
      height: 1,
      max_height: 320,
    })),
    getGeometry: () => [first, second].map((el, i) => ({
      column: 1 + i * 5, offset_y: 0, width: 4,
      height: Math.ceil(el.rect.bottom - el.rect.top),
    })),
    onMove: (...args) => moves.push(args),
    onResize: (...args) => sizes.push(args),
    onArrange: (id, patch) => (patch.frame_height ? sizes : moves).push([id, patch]),
    onScroll() {},
  };
  const emit = Object.fromEntries(
    ["Preview", "Drag", "Target", "Resizing", "Announcement", "Guides"].map(
      (name) => [
        `set${name}`,
        (value) => {
          state[name.toLowerCase()] = value;
        },
      ],
    ),
  );
  const dispose = bindWidgetInteraction(board, () => options, emit);
  t.after(() => {
    dispose();
    for (const key of Object.keys(replacements)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  });
  function send(surface, type, element = first, values = {}) {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries({
      target: element,
      button: 0,
      isPrimary: true,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
      ...values,
    }))
      Object.defineProperty(event, key, { value });
    surface.dispatchEvent(event);
    return event;
  }
  function tick(ms = 0) {
    now += ms;
    for (const [id, timer] of [...timers])
      if (timer.at <= now) {
        timers.delete(id);
        timer.fn();
      }
    const current = [...frames.values()];
    frames.clear();
    current.forEach((fn) => fn(now));
  }
  const touch = (type, x = 100, y = 100, count = 1) =>
    send(board, type, first, {
      touches: Array.from({ length: count }, () => ({
        clientX: x,
        clientY: y,
      })),
    });
  return {
    board,
    win,
    first,
    second,
    Element,
    send,
    tick,
    touch,
    state,
    moves,
    sizes,
    options,
    hit: (value) => {
      hit = value;
    },
  };
}

test("touch: a hold selects, the next gesture moves immediately, an unselected swipe scrolls", (t) => {
  const h = harness(t);
  h.win.innerWidth = 390;
  h.options.selected = undefined;
  h.touch("touchstart");
  h.tick(449);
  assert.equal(h.state.drag, undefined);
  h.tick(1);
  assert.equal(h.options.selected, "first");
  assert.equal(h.state.drag, undefined);
  h.touch("touchend");
  h.touch("touchstart");
  h.hit(h.second);
  const movement = h.touch("touchmove", 240, 200);
  h.tick();
  assert.equal(movement.defaultPrevented, true);
  h.touch("touchend");
  assert.deepEqual(h.moves, [["first", "second"]]);
  h.options.selected = undefined;
  h.touch("touchstart");
  const swipe = h.touch("touchmove", 100, 120);
  h.tick(500);
  assert.equal(swipe.defaultPrevented, false);
  assert.equal(h.state.drag, undefined);
  h.touch("touchend");
  assert.equal(h.moves.length, 1);
});

test("touch cancellation and a second finger never commit a pending gesture", (t) => {
  const h = harness(t);
  h.touch("touchstart");
  h.touch("touchcancel");
  h.tick(500);
  assert.equal(h.state.drag, undefined);
  h.touch("touchstart");
  h.tick(450);
  h.hit(h.second);
  h.touch("touchstart", 100, 100, 2);
  h.touch("touchend");
  assert.deepEqual(h.moves, []);
  assert.equal(h.state.drag, undefined);
});

test("mouse: whole-card drag, movement threshold and interactive child exclusion", (t) => {
  const h = harness(t);
  h.send(h.board, "pointerdown");
  h.send(h.win, "pointermove", h.first, { clientX: 103 });
  h.tick();
  assert.equal(h.state.drag, undefined);
  h.hit(h.second);
  h.send(h.win, "pointermove", h.first, { clientX: 240 });
  h.tick();
  h.send(h.win, "pointerup");
  assert.deepEqual(h.moves, [["first", { column: 2, offset_y: 0 }]]);
  const control = new h.Element(undefined, undefined, true);
  control.card = h.first;
  h.send(h.board, "pointerdown", control);
  h.send(h.win, "pointermove", control, { clientX: 240 });
  h.send(h.win, "pointerup");
  assert.equal(h.moves.length, 1);
});

test("the first mouse gesture only selects; dragging requires a subsequent gesture", (t) => {
  const h = harness(t);
  h.options.selected = undefined;
  h.hit(h.second);
  h.send(h.board, "pointerdown");
  h.send(h.win, "pointermove", h.first, { clientX: 240 });
  h.tick();
  h.send(h.win, "pointerup");
  assert.equal(h.options.selected, "first");
  assert.deepEqual(h.moves, []);
  h.send(h.board, "pointerdown");
  h.send(h.win, "pointermove", h.first, { clientX: 240 });
  h.tick();
  h.send(h.win, "pointerup");
  assert.deepEqual(h.moves, [["first", { column: 2, offset_y: 0 }]]);
});

test("resize previews are local; one mutation on release, none after Escape or pointer cancellation", (t) => {
  const h = harness(t);
  const handle = new h.Element(undefined, "se", true);
  handle.card = h.first;
  h.send(h.board, "pointerdown", handle);
  h.send(h.win, "pointermove", handle, { clientX: 200, clientY: 180 });
  h.tick();
  assert.equal(h.state.preview.width, 5);
  assert.equal(h.state.preview.frame_height, 400);
  assert.deepEqual(h.sizes, []);
  h.send(h.win, "pointerup");
  assert.deepEqual(h.sizes, [["first", { width: 5, max_height: 400, frame_height: 400, column: 1, offset_y: 0 }]]);
  for (const cancel of ["keydown", "pointercancel", "blur"]) {
    h.options.selected = "first";
    h.send(h.board, "pointerdown", handle);
    h.send(h.win, "pointermove", handle, { clientX: 300 });
    h.tick();
    h.send(h.win, cancel, handle, { key: "Escape" });
    h.send(h.win, "pointerup");
    assert.equal(h.sizes.length, 1);
    assert.equal(h.state.preview, undefined);
  }
});

test("Control expands the magnetic range and releasing it restores the soft range", (t) => {
  const h = harness(t);
  const handle = new h.Element(undefined, "s", true);
  handle.card = h.first;
  h.send(h.board, "pointerdown", handle);
  h.send(h.win, "pointermove", handle, { clientY: 108 });
  h.tick();
  assert.equal(h.state.preview.max_height, 328);
  h.send(h.win, "keydown", handle, { key: "Control" });
  h.tick();
  assert.equal(h.state.preview.max_height, 340);
  assert.deepEqual(h.state.guides, [
    { axis: "y", position: 440, start: 92, end: 1008 },
  ]);
  h.send(h.win, "keyup", handle, { key: "Control" });
  h.tick();
  assert.equal(h.state.preview.max_height, 328);
  assert.deepEqual(h.state.guides, []);
  h.send(h.win, "pointermove", handle, { clientY: 118, ctrlKey: true });
  h.tick();
  h.send(h.win, "pointerup");
  assert.deepEqual(h.sizes, [["first", { width: 4, max_height: 340, frame_height: 340, column: 1, offset_y: 0 }]]);
  assert.deepEqual(h.state.guides, []);
});

test("holding Control previews the selected target without saving; release, blur and outside click hide it", (t) => {
  const h = harness(t);
  for (const cancel of ["keyup", "blur", "outside"]) {
    h.options.selected = "first";
    h.send(h.win, "keydown", h.first, { key: "Control" });
    assert.equal(h.state.guides[0].position, 440);
    if (cancel === "outside") h.send(document, "pointerdown", new h.Element());
    else h.send(h.win, cancel, h.first, { key: "Control" });
    assert.deepEqual(h.state.guides, []);
  }
  assert.deepEqual(h.sizes, []);
  assert.deepEqual(h.moves, []);
});

test("guides exclude offscreen siblings and targets that size limits cannot reach", (t) => {
  const h = harness(t);
  h.options.widgets[0].max_height = 1200;
  h.send(h.win, "keydown", h.first, { key: "Control" });
  assert.deepEqual(h.state.guides, []);
  h.options.widgets[0].max_height = 320;
  h.second.rect = { ...h.second.rect, top: 900, bottom: 1000 };
  h.send(h.win, "keydown", h.first, { key: "Control" });
  assert.deepEqual(h.state.guides, []);
});

test("empty cards resize from their visible frame and movement stays inside the canvas", (t) => {
  const h = harness(t);
  h.options.widgets[0].kind = "criteria";
  h.options.widgets[0].max_height = 434;
  h.first.rect = { left: 100, right: 500, top: 100, bottom: 250 };
  const handle = new h.Element(undefined, "s", true);
  handle.card = h.first;
  h.send(h.board, "pointerdown", handle);
  h.send(h.win, "pointermove", handle, { clientY: 180 });
  h.tick();
  assert.equal(h.state.preview.frame_height, 230);
  h.send(h.win, "pointerup");
  h.send(h.board, "pointerdown");
  h.send(h.win, "pointermove", h.first, { clientX: 10000, clientY: 10000 });
  h.tick();
  assert.equal(h.state.preview.column, 9);
  assert.equal(h.state.preview.offset_y, 850);
  h.send(h.win, "pointerup");
  h.send(h.board, "pointerdown");
  h.send(h.win, "pointermove", h.first, { clientX: -10000, clientY: -10000 });
  h.tick();
  assert.equal(h.state.preview.column, 1);
  assert.equal(h.state.preview.offset_y, 0);
  h.send(h.win, "pointercancel");
});

test("Command supports the same alignment and Shift no longer changes or latches it", (t) => {
  const h = harness(t);
  h.send(h.win,"keydown",h.first,{key:"Shift"});
  assert.equal(h.state.guides,undefined);
  h.send(h.win,"keydown",h.first,{key:"Meta",metaKey:true});
  assert.equal(h.state.guides[0].position,440);
  h.send(h.win,"keyup",h.first,{key:"Meta"});
  assert.deepEqual(h.state.guides,[]);
  assert.deepEqual(h.moves,[]);
  assert.deepEqual(h.sizes,[]);
});

test("an occupied hover target keeps the neighboring snapshot and does not save until release", (t) => {
  const h=harness(t);
  const original=structuredClone(h.options.widgets);
  h.send(h.board,"pointerdown");
  h.send(h.win,"pointermove",h.first,{clientX:600,clientY:105});
  h.tick();
  assert.deepEqual(h.state.preview.positions.second,{column:6,offset_y:0});
  assert.deepEqual(h.options.widgets,original);
  assert.deepEqual(h.moves,[]);
  h.send(h.win,"keydown",h.first,{key:"Escape"});
  assert.equal(h.state.preview,undefined);
  assert.deepEqual(h.moves,[]);
});

test("fractional viewport pixels never replace canonical columns, including the final unpainted pointer move", t => {
  const h = harness(t);
  for (const boardWidth of [723, 967, 1186, 1281, 1477, 1564, 1663]) {
    const step = (boardWidth + 14) / 12;
    const geometry = [
      { column: 4.71234567, offset_y: 0, width: 2.38765433, height: 219 },
      { column: 7.1, offset_y: 0, width: 3.2, height: 219 },
    ];
    h.board.clientWidth = boardWidth;
    h.board.rect.right = h.board.rect.left + boardWidth;
    [h.first,h.second].forEach((el,i) => {
      const g = geometry[i];
      const pixel = x => Math.floor(x * 64) / 64;
      el.rect = { left: pixel(100+(g.column-1)*step), right: pixel(100+(g.column+g.width-1)*step-14), top: 100, bottom: 319 };
      h.options.widgets[i].width = g.width;
    });
    h.options.getGeometry = () => geometry;
    const handle = new h.Element(undefined,"w",true); handle.card = h.first;
    const x = h.first.rect.left;
    let committed;
    h.options.onArrange = (id, patch, snapshot) => { committed = {id,patch,snapshot}; };
    h.send(h.board,"pointerdown",handle,{clientX:x});
    h.send(h.win,"pointermove",handle,{clientX:x-30}); h.tick();
    assert.deepEqual(h.state.preview.positions.second,{column:7.1,offset_y:0});
    h.send(h.win,"pointermove",handle,{clientX:x-51}); // release before RAF renders this sample
    h.send(h.win,"pointerup");
    assert.deepEqual(committed.snapshot,geometry);
    assert.ok(Math.abs(committed.patch.column+committed.patch.width-7.1)<1e-12);
    assert.equal(committed.patch.frame_height,219);
    assert.ok(committed.patch.width > geometry[0].width);
    assert.equal(h.state.preview,undefined);
  }
});

test("shrinking the last card freezes canvas height through the final sample without persisting presentation state",t=>{
  const h=harness(t);
  const handle=new h.Element(undefined,"s",true);handle.card=h.first;
  h.send(h.board,"pointerdown",handle);
  h.send(h.win,"pointermove",handle,{clientY:-180});h.tick();
  assert.equal(h.state.preview.canvasHeight,1000);
  assert.equal(h.state.preview.frame_height,88);
  h.send(h.win,"pointerup");
  assert.equal(h.sizes.length,1);
  assert.equal(h.sizes[0][1].canvasHeight,undefined);
});
