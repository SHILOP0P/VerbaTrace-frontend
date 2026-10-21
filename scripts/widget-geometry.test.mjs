import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString("base64")}`;
const layoutURL = compile(await readFile(new URL("../src/features/overview/layout.ts", import.meta.url), "utf8"));
const { newWidget, resizeWidget, widgetInfo } = await import(layoutURL);
const { placeWidgets, arrangeWidgets, movedPosition, snapMovedRect, closeEmptyBands, fitMovingWidget, constrainWidgetResize } = await import(compile((await readFile(
  new URL("../src/features/overview/widget-geometry.ts", import.meta.url), "utf8",
)).replace('from "./layout"', `from "${layoutURL}"`)));
const { widgetRowCapacity } = await import(compile(await readFile(new URL("../src/features/overview/widget-presentation.ts",import.meta.url),"utf8")));

test("pagination keeps every row accessible and avoids a pager when all rows fit", () => {
  assert.equal(widgetRowCapacity(273,true,5).capacity,5);
  for (const height of [88,120,180,219,320,1200]) {
    const { capacity } = widgetRowCapacity(height,false,37);
    assert.ok(capacity>=1);
    const rows=Array.from({length:37},(_,i)=>i);
    const pages=Array.from({length:Math.ceil(rows.length/capacity)},(_,i)=>rows.slice(i*capacity,(i+1)*capacity));
    assert.deepEqual(pages.flat(),rows);
  }
});

test("every widget including empty analytical cards supports the same size limits", () => {
  for (const kind of Object.keys(widgetInfo)) {
    const w = { ...newWidget(kind), frame_height: 180 };
    assert.deepEqual(resizeWidget(w, "se", -10000, -10000, 100), { width: 2, max_height: 88 });
    assert.deepEqual(resizeWidget(w, "se", 10000, 10000, 100), { width: 12, max_height: 1200 });
    assert.equal(resizeWidget(w, "s", 0, 123, 100).max_height, 303);
    assert.equal(resizeWidget(w, "e", 15, 0, 100).width, w.width + .15);
  }
  assert.equal(resizeWidget({ ...newWidget("processing"), frame_height: 146.075 }, "e", 10, 0, 100).max_height, 146);
});
test("free placement preserves an exact chosen level, allows gaps and clamps horizontal bounds", () => {
  const widgets = ["a", "b", "c"].map((id, i) => ({
    ...newWidget("processing"), id, width: 3, column: 1 + i * 3, offset_y: 73,
  }));
  assert.deepEqual(placeWidgets(widgets, [150, 300, 90]).map(w => w.offset_y), [73, 73, 73]);
  assert.deepEqual(movedPosition({ column: 2, offset_y: 100 }, 3, 25, -60, 100), { column: 2.25, offset_y: 40 });
  assert.deepEqual(movedPosition({ column: 2, offset_y: 100 }, 3, 99999, -99999, 100), { column: 10, offset_y: 0 });
});
test("the moved card has priority; colliding neighbors keep a 14px gap and do not overlap", () => {
  const widgets = ["a", "b", "c"].map(id => ({ ...newWidget("total"), id, column: 1, offset_y: 0 }));
  const placed = placeWidgets(widgets, [100, 100, 100], "c");
  assert.equal(placed[2].offset_y, 0);
  assert.equal(placed[0].offset_y, 114);
  assert.equal(placed[1].offset_y, 228);
});
test("dragging picks up the fixed gutter and the modifier aligns the matching edges", () => {
  const rect = { left: 0, right: 200, top: 0, bottom: 100 };
  const sibling = { left: 400, right: 600, top: 80, bottom: 180 };
  assert.equal(snapMovedRect(rect, [sibling], 180, 0, false).dx, 186);
  const alignment = snapMovedRect(rect, [sibling], 390, 72, true);
  assert.equal(alignment.dx, 400);
  assert.equal(alignment.dy, 80);
  assert.equal(alignment.guides.length, 2);
});

test("only full-width empty bands close; a card crossing the band keeps the other positions intact", () => {
  const row = (column, offset_y, height) => ({ column, offset_y, height, width: 3 });
  const withTallNeighbor = [row(1,0,100), row(5,0,500), row(1,400,100)];
  assert.deepEqual(closeEmptyBands(withTallNeighbor), withTallNeighbor);
  const rows = [row(1,0,100), row(5,0,150), row(1,900,100), row(5,930,200), row(1,2000,80)];
  const result = closeEmptyBands(rows);
  assert.deepEqual(result.map(r => r.offset_y), [0,0,164,194,408]);
  assert.deepEqual(result.map(r => r.column), rows.map(r => r.column));
  assert.equal(result[3].offset_y-result[2].offset_y,30);
  assert.deepEqual(closeEmptyBands(result),result);
});

test("approaching an occupied slot never moves its neighbor or overlaps it", () => {
  const source = { column: 1, offset_y: 0, width: 3, height: 150 };
  const obstacle = { column: 4, offset_y: 0, width: 3, height: 150 };
  const before = structuredClone(obstacle);
  const placed = fitMovingWidget({ ...source, column: 4 }, [obstacle], source, 800);
  assert.deepEqual(obstacle, before);
  assert.ok(placed.column+placed.width<=obstacle.column || placed.column>=obstacle.column+obstacle.width || placed.offset_y>=164);
  assert.deepEqual(fitMovingWidget(source,[obstacle],source,800),source);
  const sized = constrainWidgetResize({ ...source,width:9,height:300 },source,[obstacle],800);
  assert.ok(sized.column+sized.width<=4);
  assert.deepEqual(obstacle,before);
});

test("free-position fitting remains inside the canvas even when no new slot is available", () => {
  const source = { column: 1, offset_y: 0, width: 6, height: 100 };
  const obstacle = { column: 7, offset_y: 0, width: 6, height: 100 };
  assert.deepEqual(fitMovingWidget({ ...source,column:7,offset_y:1000 },[obstacle],source,100),source);
});

test("west-edge and duration edits preserve tight adjacent columns after commit and JSON reload", () => {
  let widgets = [
    { ...newWidget("processing"), id: "processing", column: 4.71234567, width: 2.38765433, offset_y: 0, frame_height: 219 },
    { ...newWidget("analyzed"), id: "analyzed", column: 7.1, width: 3.2, offset_y: 0, frame_height: 219 },
    { ...newWidget("duration"), id: "duration", column: 2.8, width: 4.3, offset_y: 233, frame_height: 125 },
    { ...newWidget("average"), id: "average", column: 7.1, width: 3.2, offset_y: 233, frame_height: 273 },
  ];
  const original = structuredClone(widgets);
  for (let iteration = 0; iteration < 40; iteration++) {
    const source = placeWidgets(widgets, widgets.map(w => w.frame_height));
    assert.deepEqual(source.map(r => r.offset_y), [0, 0, 233, 233]);
    const index = iteration % 2 === 0 ? 0 : 2;
    const desired = index === 0
      ? { ...source[index], column: 3.11111111 + iteration / 10000,
          width: 7.1 - (3.11111111 + iteration / 10000) }
      : { ...source[index], height: iteration % 4 === 1 ? 145 : 125 };
    const preview = constrainWidgetResize(desired, source[index], source.filter((_, i) => i !== index), 800);
    widgets = JSON.parse(JSON.stringify(arrangeWidgets(widgets, source, index, {
      column: preview.column, offset_y: preview.offset_y, width: preview.width,
      frame_height: preview.height, max_height: preview.height,
    }, 800)));
    const reloaded = placeWidgets(widgets, widgets.map(w => w.frame_height));
    assert.deepEqual(reloaded[index], preview, `preview/reload mismatch at ${iteration}`);
    for (const i of [1, 3]) {
      assert.deepEqual(widgets[i], original[i], `right column moved at ${iteration}`);
      assert.deepEqual(reloaded[i], source[i]);
    }
  }
});

test("opposite anchored fractional edges are not rounded into neighboring gutters", () => {
  for (const column of [3.123456789, 7.100000001, 9.999999999]) {
    const widgets = [
      { ...newWidget("total"), column: 1, width: column - 1, offset_y: 0 },
      { ...newWidget("total"), column, width: 13 - column, offset_y: 0 },
    ];
    const packed = placeWidgets(widgets, [100, 100]);
    assert.equal(packed[1].column, column);
    assert.equal(packed[1].offset_y, 0);
  }
  // Floating-point addition at an exact edge is not an actual collision.
  assert.deepEqual(placeWidgets([
    { ...newWidget("total"), column: 1, width: 0.1 + 0.2 + 3, offset_y: 0 },
    { ...newWidget("total"), column: 4.3, width: 3, offset_y: 0 },
  ], [100,100]).map(r => r.offset_y), [0,0]);
});

test("all eight resize directions replay the constrained preview without relocating surrounding cards", () => {
  const rows = [
    { column: 1, offset_y: 0, width: 12, height: 100 },
    { column: 1, offset_y: 114, width: 3.123456789, height: 200 },
    { column: 4.123456789, offset_y: 114, width: 4.765432111, height: 200 },
    { column: 8.8888889, offset_y: 114, width: 4.1111111, height: 200 },
    { column: 1, offset_y: 328, width: 12, height: 100 },
  ];
  const widgets = rows.map((r, i) => ({...newWidget("total"), id:String(i),
    column:r.column,offset_y:r.offset_y,width:r.width,frame_height:r.height}));
  for (const edge of ["n","s","e","w","ne","nw","se","sw"]) {
    for (const delta of [-65,65]) {
      const source=rows[2];
      const size=resizeWidget(widgets[2],edge,delta,delta,93.5833333333);
      const desired={width:size.width,height:size.max_height,
        column:source.column+(edge.includes("w")?source.width-size.width:0),
        offset_y:source.offset_y+(edge.includes("n")?source.height-size.max_height:0)};
      const preview=constrainWidgetResize(desired,source,rows.filter((_,i)=>i!==2),800);
      const next=arrangeWidgets(widgets,rows,2,{column:preview.column,offset_y:preview.offset_y,
        width:preview.width,frame_height:preview.height},800);
      const replay=placeWidgets(JSON.parse(JSON.stringify(next)),next.map(w=>w.frame_height));
      assert.deepEqual(replay[2],preview,`${edge}:${delta}`);
      rows.forEach((r,i)=>{if(i!==2) assert.deepEqual(replay[i],r,`${edge}:${delta}:neighbor${i}`);});
    }
  }
});
test("fractional sizes and positions preserve gutter and board bounds under arbitrary edits", () => {
  let seed = 17;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let sample = 0; sample < 80; sample++) {
    const widgets = Array.from({ length: 40 }, (_, i) => ({
      ...newWidget("distribution"), id: String(i), width: 2 + random() * 10,
      column: random() * 16 - 2, offset_y: random() * 500,
    }));
    const result = placeWidgets(widgets, widgets.map(() => 88 + Math.round(random() * 1112)), "5");
    const step = 100;
    for (let i = 0; i < result.length; i++) {
      const a = result[i];
      assert.ok(a.column >= 1 && a.column + a.width <= 13 + 1e-9);
      for (const b of result.slice(i + 1)) {
        const horizontal = a.column + a.width <= b.column || b.column + b.width <= a.column;
        const vertical = a.offset_y + a.height + 14 <= b.offset_y || b.offset_y + b.height + 14 <= a.offset_y;
        assert.ok(horizontal || vertical, `insufficient gutter ${sample}:${i}`);
        if (horizontal) assert.ok(Math.max(b.column - a.column - a.width, a.column - b.column - b.width) * step + 14 >= 14 - 1e-9);
      }
    }
  }
});
