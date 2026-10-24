import assert from "node:assert/strict";
import test from "node:test";
import type { WorldSign } from "@contracts/types";
import { nearbySignLabels, signDimensions, stackedSigns } from "./signLod";

const sign = (id: string, x: number, z: number, text = "Welcome"): WorldSign =>
  ({ id, x, z, y: 0, agentId: null, text });

test("nearby labels use camera distance and cap expensive texts", () => {
  const all = stackedSigns(Array.from({ length: 80 }, (_, i) => sign(`s${i}`, i * 2, 0)));
  assert.equal(nearbySignLabels(all, 0, 0, "high").length, 24);
  assert.equal(nearbySignLabels(all, 0, 0, "low").length, 10);
  assert.ok(nearbySignLabels(all, 0, 0, "high").every(({ s }) => s.x <= 48));
  assert.ok(nearbySignLabels(all, 0, 0, "low").every(({ s }) => s.x <= 28));
  assert.equal(nearbySignLabels(all, NaN, 0, "high").length, 0);
});

test("camera walking makes different nearest labels readable", () => {
  const all = stackedSigns([
    sign("spawn", 0, 0),
    sign("arcade", 24, 0),
    sign("homes", 0, -38),
    sign("far", 150, 0),
  ]);
  assert.deepEqual(nearbySignLabels(all, 0, 0, "low").map(({ s }) => s.id), ["spawn", "arcade"]);
  assert.deepEqual(nearbySignLabels(all, 150, 0, "low").map(({ s }) => s.id), ["far"]);
  assert.deepEqual(nearbySignLabels(all, 0, -38, "low").map(({ s }) => s.id), ["homes"]);
});

test("overlapping signs stack at different heights without mutating originals", () => {
  const a = sign("one", 0, 0, "A");
  const b = sign("two", 0.4, 0, "B");
  const c = sign("third", 40, 0, "C");
  const originals = [a,b,c];
  const placed = stackedSigns(originals);
  assert.equal(placed.find(({ s }) => s.id === "one")?.k, 0);
  assert.equal(placed.find(({ s }) => s.id === "two")?.k, 1);
  assert.equal(placed.find(({ s }) => s.id === "third")?.k, 0);
  assert.deepEqual(originals, [a,b,c]);
});

test("sign dimensions preserve the prior width and wrapped-line height", () => {
  assert.deepEqual(signDimensions(sign("short",0,0,"Hi")), { width: 2, height: 0.7 });
  assert.equal(signDimensions(sign("long",0,0,"x".repeat(72))).height, 1.15);
  assert.equal(signDimensions(sign("max",0,0,"x".repeat(500))).width, 11.52);
});
