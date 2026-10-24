import { test } from "node:test";
import assert from "node:assert/strict";
import { hearing, heardText, HEAR_R, MUFFLE_R } from "./proximity";

test("hearing buckets by distance", () => {
  assert.equal(hearing(0, 0), "clear");
  assert.equal(hearing(HEAR_R, 0), "clear");
  assert.equal(hearing(HEAR_R + 1, 0), "muffled");
  assert.equal(hearing(0, MUFFLE_R), "muffled");
  assert.equal(hearing(30, 30), "out");
});

test("heardText trims, muffles and hides", () => {
  assert.equal(heardText("hi", "clear"), "hi");
  assert.equal(heardText("x".repeat(100), "clear")!.length, 89);
  assert.equal(heardText("secret plans", "muffled"), "💬 …");
  assert.equal(heardText("secret plans", "out"), undefined);
  assert.equal(heardText(undefined, "clear"), undefined);
});
