import test from "node:test";
import assert from "node:assert/strict";
import { FLOWER_COLORS, isOpenGround, scatter } from "./meadow";
import { LAKE } from "./lake";

test("open ground excludes plaza, lake, workshop and the sea", () => {
  assert.equal(isOpenGround(0, 0), false);
  assert.equal(isOpenGround(LAKE.x, LAKE.z), false);
  assert.equal(isOpenGround(-46, 3), false);
  assert.equal(isOpenGround(95, 0), false);
});
test("scatter is deterministic, on open ground and spaced", () => {
  const a = scatter(120, 1, [[20, 20, 1]], 0.9, FLOWER_COLORS.length), b = scatter(120, 1, [[20, 20, 1]], 0.9, FLOWER_COLORS.length);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 100, `got ${a.length}`);
  for (const p of a) {
    assert.ok(isOpenGround(p.x, p.z));
    assert.ok(Math.hypot(p.x - 20, p.z - 20) >= 1.6);
    assert.ok(p.color >= 0 && p.color < FLOWER_COLORS.length);
  }
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z) >= 0.9);
});
