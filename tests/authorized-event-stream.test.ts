import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { AuthorizedEventStream } from "../src/shared/lib/authorized-event-stream.ts";

test("permanent HTTP failures stop SSE reconnects across consumers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); });
  for (const status of [400, 401, 403, 404, 410]) {
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(null, { status }); });
    const stream = new AuthorizedEventStream("/events", async () => undefined);
    await setImmediate();
    const expected = status === 401 ? 2 : 1;
    assert.equal(requests, expected);
    t.mock.timers.tick(60_000);
    await setImmediate();
    assert.equal(requests, expected, `HTTP ${status} must not retry`);
    stream.close();
  }
});

test("failed refresh stops the stream without a retry loop", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(null, { status: 401 }); });
  const stream = new AuthorizedEventStream("/events", async () => { throw new Error("expired session"); });
  await setImmediate();
  t.mock.timers.tick(60_000);
  await setImmediate();
  assert.equal(requests, 1);
  stream.close();
});

test("temporary failures back off and cleanup cancels the pending request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  t.after(() => { Reflect.deleteProperty(globalThis, "window"); });
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(null, { status: 503 }); });
  const stream = new AuthorizedEventStream("/events", async () => undefined);
  await setImmediate();
  t.mock.timers.tick(2_000);
  await setImmediate();
  assert.equal(requests, 2);
  t.mock.timers.tick(2_000);
  await setImmediate();
  assert.equal(requests, 2);
  t.mock.timers.tick(2_000);
  await setImmediate();
  assert.equal(requests, 3);
  stream.close();
  t.mock.timers.tick(60_000);
  await setImmediate();
  assert.equal(requests, 3);
});
