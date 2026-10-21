import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/features/overview/layout.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  packWidgets,
  defaultWidgets,
  newWidget,
  periodFilters,
  zeroCountSeries,
  resizeWidget,
  alignResizeDelta,
  getResizeAlignment,
  widgetMaxHeight,
  nextComposition,
  palette,
  extraColors,
  colorContrast,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("edge resizing changes one axis, corners change both and constraints stay bounded", () => {
  const w = { ...newWidget("total"), width: 4, max_height: 320 };
  assert.deepEqual(resizeWidget(w, "e", 100, 700, 100), {
    width: 5,
    max_height: 320,
  });
  assert.deepEqual(resizeWidget(w, "w", -100, 700, 100), {
    width: 5,
    max_height: 320,
  });
  assert.deepEqual(resizeWidget(w, "s", 700, 80, 100), {
    width: 4,
    max_height: 400,
  });
  assert.deepEqual(resizeWidget(w, "n", 700, -80, 100), {
    width: 4,
    max_height: 400,
  });
  assert.deepEqual(resizeWidget(w, "se", 100, 80, 100), {
    width: 5,
    max_height: 400,
  });
  assert.deepEqual(resizeWidget(w, "nw", -100, -80, 100), {
    width: 5,
    max_height: 400,
  });
  assert.deepEqual(resizeWidget(w, "se", -10000, -10000, 100), {
    width: 2,
    max_height: 88,
  });
  assert.deepEqual(resizeWidget(w, "se", 10000, 10000, 100), {
    width: 12,
    max_height: 1200,
  });
  assert.equal(resizeWidget(newWidget("trend"), "w", 10000, 0, 100).width, 2);
  assert.equal(
    widgetMaxHeight({ ...w, max_height: undefined, height: 2 }),
    434,
  );
});

test("Shift aligns only the resized axes to the nearest sibling boundary within 32 pixels", () => {
  const rect = { left: 0, right: 200, top: 0, bottom: 150 };
  const neighbors = [{ left: 0, right: 300, top: 0, bottom: 220 }];
  for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const sx = edge.includes("w") ? -1 : 1;
    const sy = edge.includes("n") ? -1 : 1;
    const delta = alignResizeDelta(rect, [{ left: -100, right: 300, top: -70, bottom: 220 }], edge, sx * 95, sy * 65);
    assert.equal(delta.dx, /[ew]/.test(edge) ? sx * 100 : sx * 95);
    assert.equal(delta.dy, /[ns]/.test(edge) ? sy * 70 : sy * 65);
  }
  assert.deepEqual(alignResizeDelta(rect, neighbors, "se", 20, 10), {
    dx: 20,
    dy: 10,
  });
  const closer = [...neighbors, { left: 0, right: 292, top: 0, bottom: 212 }];
  assert.deepEqual(alignResizeDelta(rect, closer, "se", 95, 65), {
    dx: 92,
    dy: 62,
  });
});

test("alignment guides share the exact snapped target and span both cards", () => {
  const rect = { left: 0, right: 200, top: 0, bottom: 150 };
  const target = { left: 210, right: 410, top: 0, bottom: 170 };
  const result = getResizeAlignment(rect, [target], "s", 0, 16);
  assert.equal(result.dy, 20);
  assert.deepEqual(result.guides, [
    { axis: "y", position: 170, start: -8, end: 418 },
  ]);
  assert.deepEqual(getResizeAlignment(rect, [target], "s", 0, 100).guides, []);
});

test("composition cycles preserve the legacy default and expanded colors work in both themes", () => {
  assert.equal(nextComposition(undefined), "leading");
  assert.equal(
    Array.from({ length: 6 }).reduce(
      (value) => nextComposition(value),
      "standard",
    ),
    "standard",
  );
  assert.equal(new Set(palette).size, palette.length);
  assert.equal(palette.length, 42);
  for (const [name, [, light, dark]] of Object.entries(extraColors)) {
    assert.ok(
      colorContrast(light, "#fffdfb") >= 3,
      `${name} light chart contrast`,
    );
    assert.ok(
      colorContrast(dark, "#1a1612") >= 3,
      `${name} dark chart contrast`,
    );
  }
});

test("all grid widths and measured content heights remain within the grid without overlapping", () => {
  let seed = 71;
  for (let sample = 0; sample < 100; sample++) {
    const widgets = Array.from({ length: 40 }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const width = 3 + (seed % 10);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return { ...newWidget("total"), width, height: (seed % 60) + 1 };
    });
    const positions = packWidgets(widgets);
    const cells = new Set();
    positions.forEach((p, i) => {
      const w = widgets[i];
      assert.ok(p.column >= 1 && p.column + w.width - 1 <= 12);
      for (let y = 0; y < w.height; y++)
        for (let x = 0; x < w.width; x++) {
          const key = `${p.column + x}:${p.row + y}`;
          assert.ok(!cells.has(key), `collision at ${key}`);
          cells.add(key);
        }
    });
  }
});
test("the current six KPI widgets lead the default overview", () =>
  assert.deepEqual(
    defaultWidgets()
      .slice(0, 6)
      .map((w) => w.kind),
    ["total", "new", "processing", "analyzed", "duration", "average"],
  ));
test("custom periods include the selected end date and rolling periods use a shared snapshot", () => {
  const custom = periodFilters({
    mode: "custom",
    from: "2026-10-20",
    to: "2026-10-21",
  });
  assert.equal(new Date(custom.from).getDate(), 20);
  assert.equal(new Date(custom.to).getDate(), 22);
  const now = new Date("2026-10-21T09:00:00Z");
  const rolling = periodFilters({ mode: "rolling", days: 7 }, now);
  assert.equal(rolling.to, now.toISOString());
  assert.equal(Date.parse(rolling.to) - Date.parse(rolling.from), 7 * 86400000);
});

test("empty count buckets cover the requested range without inventing events", () => {
  const from = "2026-10-20T09:00:00Z",
    to = "2026-10-21T09:00:00Z";
  const points = zeroCountSeries(from, to);
  assert.equal(points.length, 8);
  assert.ok(points.every((p) => p.value === 0));
  assert.equal(
    points[0].label,
    new Date(from).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  assert.equal(
    points.at(-1).label,
    new Date(to).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  assert.deepEqual(zeroCountSeries(to, from), []);
});

const placementSource = await readFile(
  new URL("../src/features/overview/widget-presentation.ts", import.meta.url),
  "utf8",
);
const placementJS = ts.transpileModule(placementSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { placeWidgetSettings } = await import(
  `data:text/javascript;base64,${Buffer.from(placementJS).toString("base64")}`
);
test("settings sit beside desktop cards and remain centered and bounded on phones", () => {
  const anchor = {
    left: 260,
    right: 640,
    top: 210,
    bottom: 420,
    width: 380,
    height: 210,
  };
  const viewport = { width: 1474, top: 82, bottom: 686 };
  assert.ok(
    placeWidgetSettings(anchor, viewport, 468).left >= anchor.right + 8,
  );
  const last = { ...anchor, left: 1040, right: 1420 };
  const left = placeWidgetSettings(last, viewport, 468);
  assert.ok(left.left + left.width <= last.left - 8);
  const phone = { width: 320, top: 82, bottom: 656 };
  const centered = placeWidgetSettings(anchor, phone, 460);
  assert.equal(centered.left + centered.width / 2, phone.width / 2);
  assert.equal(centered.top + 460 / 2, (phone.top + phone.bottom) / 2);
  const full = { ...anchor, left: 12, right: 1462, width: 1450 };
  const bounded = placeWidgetSettings(full, viewport, 468);
  assert.ok(bounded.top >= full.bottom);
  assert.ok(bounded.top + bounded.maxHeight <= viewport.bottom);
  const huge = placeWidgetSettings(
    { ...full, top: -200, bottom: 1000, height: 1200 },
    viewport,
    468,
  );
  assert.ok(
    huge.top >= viewport.top && huge.top + huge.maxHeight <= viewport.bottom,
  );
});
