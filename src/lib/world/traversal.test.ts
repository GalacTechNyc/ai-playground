import test from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_PAD_STATE, ISLAND_JUMP_PADS, ISLAND_PORTALS,
  nearestPortal, stepJumpPads, withinTrigger,
} from "./traversal";

test("portal requires proximity and selects the nearest one", () => {
  assert.equal(nearestPortal({ x: 0, y: 0, z: 0 }), null);
  assert.equal(nearestPortal({ x: 0, y: 0, z: -11 })?.id, "lounge");
  assert.equal(nearestPortal({ x: 11, y: 0, z: 0 })?.href, "/arcade");
  assert.equal(nearestPortal({ x: -11, y: 0, z: 0 })?.id, "workshop");
  assert.equal(ISLAND_PORTALS.length, 3);
});

test("horizontal proximity respects vertical cutoff and invalid coordinates", () => {
  const center = { x: 2, y: 0, z: 2 };
  assert.equal(withinTrigger({ x: 3, y: 1, z: 2 }, center, 1, 2), true);
  assert.equal(withinTrigger({ x: 3, y: 3, z: 2 }, center, 1, 2), false);
  assert.equal(withinTrigger({ x: NaN, y: 0, z: 2 }, center, 1, 2), false);
});

test("jump pad launches exactly once on entry and only after re-entry", () => {
  const pad = ISLAND_JUMP_PADS[0];
  const atPad = pad.position;
  const outside = { x: pad.position.x + 4, y: 0, z: pad.position.z };
  let s = { ...INITIAL_PAD_STATE };

  let out = stepJumpPads(atPad, s, 1000);
  assert.equal(out.pad?.id, pad.id);
  s = out.nextState;

  out = stepJumpPads(atPad, s, 1500);
  assert.equal(out.pad, null);
  s = out.nextState;

  out = stepJumpPads(outside, s, 1700);
  assert.equal(out.pad, null);
  s = out.nextState;

  out = stepJumpPads(atPad, s, 1900); // cooldown still active
  assert.equal(out.pad, null);
  s = out.nextState;

  out = stepJumpPads(atPad, s, 2900); // still inside = no retrigger
  assert.equal(out.pad, null);
  s = out.nextState;

  out = stepJumpPads(outside, s, 3000);
  s = out.nextState;

  out = stepJumpPads(atPad, s, 3100);
  assert.equal(out.pad?.id, pad.id);
});

test("airborne avatar does not trigger ground jump pad", () => {
  const pad = ISLAND_JUMP_PADS[1];
  assert.equal(stepJumpPads({ ...pad.position, y: 10 }, INITIAL_PAD_STATE, 100).pad, null);
});

test("jump pad action is a controller-only impulse, not a network write", () => {
  const pad = ISLAND_JUMP_PADS[0];
  assert.ok(pad.impulse.y > 0);
  assert.ok(pad.cooldownMs >= 1000);
  assert.ok(pad.radius > 0);
});
