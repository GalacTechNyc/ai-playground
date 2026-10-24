import test from "node:test";
import assert from "node:assert/strict";
import { FISH, LAKE, canFish, clampToLake, inLake, onDock, pickCatch } from "./lake";

test("lake and dock regions", () => {
  assert.equal(inLake(LAKE.x, LAKE.z), true);
  assert.equal(inLake(0, 0), false);
  assert.equal(onDock(-31.5, 36.5), true);
  assert.equal(inLake(-31.5, 36.5), false, "dock is not water");
  assert.equal(inLake(-29.5, 36.5), true);
});
test("boat stays on the lake", () => {
  const p = clampToLake(LAKE.x + 50, LAKE.z);
  assert.ok(Math.hypot(p.x - LAKE.x, p.z - LAKE.z) <= LAKE.r - 1.4 + 1e-9);
  assert.deepEqual(clampToLake(LAKE.x, LAKE.z), { x: LAKE.x, z: LAKE.z });
});
test("fishing spots", () => {
  assert.equal(canFish(-31.5, 38), true);
  assert.equal(canFish(0, 0), false);
  assert.equal(canFish(0, 0, true), true);
});
test("weighted catch covers the table", () => {
  assert.equal(pickCatch(0).name, FISH[0].name);
  assert.equal(pickCatch(0.9999999).name, FISH[FISH.length - 1].name);
  assert.equal(pickCatch(-1).name, FISH[0].name);
  const seen = new Set(Array.from({ length: 200 }, (_, i) => pickCatch(i / 200).name));
  assert.equal(seen.size, FISH.length);
});
