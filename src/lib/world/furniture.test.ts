import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FURNITURE, MAX_FURNITURE, addFurniture, moveFurniture,
  encodeFurniture, decodeFurniture, canPlaceFurniture, furnitureStorageKey,
} from "./furniture";

test("a furniture remix round-trips as a portable share code", () => {
  const encoded = encodeFurniture(DEFAULT_FURNITURE);
  const decoded = decodeFurniture(encoded);
  assert.ok(decoded);
  assert.deepEqual(decoded.map(({ kind, x, z, rotation }) => ({ kind, x, z, rotation })),
    DEFAULT_FURNITURE.map(({ kind, x, z, rotation }) => ({ kind, x, z, rotation })));
  assert.ok(encoded.length < 800);
  assert.equal(decodeFurniture(""), Array.of());
});

test("malformed and hostile share codes fail closed, not render arbitrary assets", () => {
  assert.equal(decodeFurniture("javascript:alert(1):0:0"), null);
  assert.equal(decodeFurniture("chair:100:0:0"), null);
  assert.equal(decodeFurniture("chair:0:0:7"), null);
  assert.equal(decodeFurniture("chair:0:0:0;chair:0:0:0"), null);
  assert.equal(decodeFurniture("chair:0:0:0;"), null);
  assert.equal(decodeFurniture("x".repeat(801)), null);
  assert.equal(decodeFurniture("chair:0:0:0;".repeat(MAX_FURNITURE + 1)), null);
});

test("floor bounds, doorway clearance, and collisions are enforced", () => {
  assert.equal(canPlaceFurniture([], { kind: "chair", x: 3, z: 0 }), false);
  assert.equal(canPlaceFurniture([], { kind: "chair", x: 0, z: 2 }), false);
  assert.equal(canPlaceFurniture([], { kind: "chair", x: NaN, z: 0 }), false);
  assert.equal(canPlaceFurniture([], { kind: "chair", x: 1.25, z: 0 }), false);
  assert.equal(canPlaceFurniture(DEFAULT_FURNITURE, { kind: "chair", x: -1.5, z: -2 }), false);
  assert.equal(canPlaceFurniture(DEFAULT_FURNITURE, { kind: "chair", x: 0.5, z: -1.5 }), true);
});

test("new pieces snap to half-grid; selecting can move only the chosen item", () => {
  const withChair = addFurniture(DEFAULT_FURNITURE, "chair", 0.51, -1.43);
  assert.ok(withChair);
  const added = withChair.at(-1)!;
  assert.equal(added.x, 0.5);
  assert.equal(added.z, -1.5);
  assert.equal(moveFurniture(withChair, added.id, -1.5, -2), null); // occupied sofa
  const moved = moveFurniture(withChair, added.id, 1, 1.5);
  assert.ok(moved);
  assert.equal(moved.find(p => p.id === added.id)?.x, 1);
  assert.equal(withChair.find(p => p.id === added.id)?.x, 0.5); // immutable
});

test("room remixes have a bounded furniture budget and scoped browser keys", () => {
  let layout = [...DEFAULT_FURNITURE];
  for (const [x, z] of [[-2.5, -0.5], [-2.5, 0.5], [0.5, -2.5], [0.5, -1.5], [1, 1.5], [2.5, 1.5]] as const) {
    const next = addFurniture(layout, "rug", x, z);
    assert.ok(next);
    layout = next;
  }
  assert.equal(layout.length, MAX_FURNITURE);
  assert.equal(addFurniture(layout, "chair", 0, -2), null);
  assert.notEqual(furnitureStorageKey("agent-a"), furnitureStorageKey("agent-b"));
});
