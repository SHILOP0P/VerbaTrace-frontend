import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/features/overview/layout-persistence.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { createLayoutPersistence } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);
const widget = {
  id: "calls",
  kind: "total",
  width: 4,
  height: 1,
  max_height: 210,
  color: "blue",
  period: { mode: "all" },
  chart: true,
};
const layout = (version = 1, patch = {}) => ({
  version,
  widgets: [{ ...widget, ...patch }],
});
const conflict = () => Object.assign(new Error("Conflict"), { status: 409 });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("an unchanged remote layout retries its advanced version without discarding the local resize", async () => {
  let remote = layout(),
    state;
  const writes = [];
  const store = createLayoutPersistence(
    {
      load: async () => remote,
      save: async (next) => {
        writes.push(next);
        if (next.version !== remote.version) throw conflict();
        return (remote = { ...next, version: next.version + 1 });
      },
    },
    (next) => {
      state = next;
    },
  );
  await store.reload();
  // Different property order is the same set of settings.
  remote = { version: 8, widgets: [{ period: { mode: "all" }, ...widget }] };
  store.change([{ ...widget, width: 6 }]);
  await settle();
  assert.deepEqual(
    writes.map((item) => item.version),
    [1, 8],
  );
  assert.equal(remote.widgets[0].width, 6);
  assert.equal(state.value.version, 9);
  assert.equal(state.error, "");
  assert.equal(store.dirty(), false);
});

test("a real conflict preserves an editable draft and replaces the remote layout only after explicit retry", async () => {
  let remote = layout(),
    state;
  const writes = [];
  const store = createLayoutPersistence(
    {
      load: async () => remote,
      save: async (next) => {
        writes.push(next);
        if (next.version !== remote.version) throw conflict();
        return (remote = { ...next, version: next.version + 1 });
      },
    },
    (next) => {
      state = next;
    },
  );
  await store.reload();
  remote = layout(2, { color: "teal" });
  store.change([{ ...widget, width: 6 }]);
  await settle();
  assert.equal(state.conflict, true);
  store.change([{ ...widget, width: 6, max_height: 430 }]);
  assert.equal(state.value.widgets[0].max_height, 430);
  assert.equal(writes.length, 1);
  assert.equal(remote.widgets[0].color, "teal");
  await store.retry();
  assert.equal(writes.length, 1);
  await store.retry(true);
  assert.equal(remote.widgets[0].max_height, 430);
  assert.equal(remote.widgets[0].width, 6);
  assert.equal(state.conflict, false);
  assert.equal(store.dirty(), false);
});

test("network recovery saves the latest draft, including edits made after failure", async () => {
  let remote = layout(),
    state,
    offline = true;
  const store = createLayoutPersistence(
    {
      load: async () => remote,
      save: async (next) => {
        if (offline) throw new Error("Сеть недоступна");
        return (remote = { ...next, version: next.version + 1 });
      },
    },
    (next) => {
      state = next;
    },
  );
  await store.reload();
  store.change([{ ...widget, width: 5 }]);
  await settle();
  assert.match(state.error, /Сеть недоступна/);
  store.change([{ ...widget, width: 7, max_height: 390 }]);
  offline = false;
  await store.retry();
  assert.equal(remote.widgets[0].width, 7);
  assert.equal(remote.widgets[0].max_height, 390);
  assert.equal(state.error, "");
});

test("edits queued during a save use the returned version and survive a later failure", async () => {
  let state,
    count = 0;
  const gate = deferred(),
    writes = [];
  const store = createLayoutPersistence(
    {
      load: async () => layout(),
      save: async (next) => {
        writes.push(next);
        if (++count === 1) {
          await gate.promise;
          return { ...next, version: 2 };
        }
        if (count === 2) throw new Error("Connection lost");
        return { ...next, version: next.version + 1 };
      },
    },
    (next) => {
      state = next;
    },
  );
  await store.reload();
  store.change([{ ...widget, width: 5 }]);
  store.change([{ ...widget, width: 8 }]);
  gate.resolve();
  await settle();
  assert.equal(writes[1].version, 2);
  assert.equal(state.value.widgets[0].width, 8);
  await store.retry();
  assert.equal(writes[2].version, 2);
  assert.equal(writes[2].widgets[0].width, 8);
});

test("a background load cannot replace a resize made while it was in flight", async () => {
  let state,
    loads = 0;
  const gate = deferred();
  const store = createLayoutPersistence(
    {
      load: async () => (++loads === 1 ? layout() : gate.promise),
      save: async (next) => ({ ...next, version: 2 }),
    },
    (next) => {
      state = next;
    },
  );
  await store.reload();
  const refreshing = store.refresh();
  store.change([{ ...widget, width: 6 }]);
  await settle();
  gate.resolve(layout(1));
  await refreshing;
  assert.equal(state.value.widgets[0].width, 6);
  assert.equal(state.value.version, 2);
});

test("a pristine editor refreshes another tab's saved layout; disposal stops notifications", async () => {
  let remote = layout(),
    state,
    notifications = 0;
  const store = createLayoutPersistence(
    { load: async () => remote, save: async (next) => next },
    (next) => {
      state = next;
      notifications++;
    },
  );
  await store.reload();
  remote = layout(7, { width: 9 });
  await store.refresh();
  assert.equal(state.value.widgets[0].width, 9);
  store.dispose();
  const before = notifications;
  await store.refresh();
  assert.equal(notifications, before);
});
