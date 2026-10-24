import test from "node:test";
import assert from "node:assert/strict";
import { agentCanFishAt, fishForRoll, FISHING_COOLDOWN_SECONDS, SERVER_FISH_WEIGHTS } from "./lakeFishing";

test("agent can fish at dock tip or on Crystal Lake water, not from Spawn Commons", () => {
  assert.equal(agentCanFishAt(-18, 0, 22), true);
  assert.equal(agentCanFishAt(-18, 0, 26), true);
  assert.equal(agentCanFishAt(-18, 0, 32.5), true);
  assert.equal(agentCanFishAt(-18, 0, 33), false);
  assert.equal(agentCanFishAt(0, 0, -2), false);
  assert.equal(agentCanFishAt(-18, 5, 22), false);
  assert.equal(agentCanFishAt(NaN, 0, 22), false);
});

test("fish distribution is server-specified, adds to 100 and covers exactly 100 rolls", () => {
  assert.equal(SERVER_FISH_WEIGHTS.reduce((sum, f) => sum + f.weight, 0), 100);
  const counts = new Map(SERVER_FISH_WEIGHTS.map((f) => [f.name, 0]));
  for (let roll = 0; roll < 100; roll++) {
    const fish = fishForRoll(roll);
    assert.ok(fish);
    counts.set(fish.name, (counts.get(fish.name) ?? 0) + 1);
  }
  for (const fish of SERVER_FISH_WEIGHTS) assert.equal(counts.get(fish.name), fish.weight);
  assert.equal(fishForRoll(100), null);
  assert.equal(fishForRoll(-1), null);
  assert.equal(fishForRoll(3.14), null);
  assert.equal(fishForRoll(NaN), null);
  assert.equal(FISHING_COOLDOWN_SECONDS, 30);
});
