import assert from "node:assert/strict";
import test from "node:test";
import { BLOCK_TYPES } from "../../../contracts/types";
import { BLOCK_STYLE } from "./blocks";

test("the persistent palette includes every new material", () => {
  for (const type of ["lamp", "brick", "sand", "ice", "flowers"] as const) {
    assert.ok(BLOCK_TYPES.includes(type), type);
    assert.ok(BLOCK_STYLE[type], type);
    assert.ok(BLOCK_STYLE[type].label.length > 0, type);
  }
});

test("every block type has a renderable palette style", () => {
  const types = [...BLOCK_TYPES].sort();
  assert.deepEqual(Object.keys(BLOCK_STYLE).sort(), types);
  for (const type of types) assert.match(BLOCK_STYLE[type].color, /^#[0-9a-f]{6}$/i);
});

test("lamp block emits warm glow and ice is translucent", () => {
  assert.ok(BLOCK_STYLE.lamp.emissive);
  assert.ok((BLOCK_STYLE.lamp.intensity ?? 0) > 0);
  assert.ok((BLOCK_STYLE.ice.opacity ?? 1) < 1);
});
