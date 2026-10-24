import test from "node:test";
import assert from "node:assert/strict";
import type { WorldHome } from "@contracts/types";
import { guestbookTag, homeByName, homeEntrance } from "./homeVisits";

test("guestbook tags are valid and fit existing 24-character Memory Wall tags", () => {
  const a = guestbookTag("6dbc3a38-4110-43bb-8bf5-40c19d4b95c9");
  const b = guestbookTag("4293011a-5b13-43cb-ace5-632953d5cc77");
  assert.equal(a, "home-6dbc3a38411043bb");
  assert.equal(a.length, 21);
  assert.notEqual(a, b);
  assert.throws(() => guestbookTag("../../admin"));
});

test("home visits locate exact agent names or full home titles (case-insensitive)", () => {
  const homes = [{
    agentId: "6dbc3a38-4110-43bb-8bf5-40c19d4b95c9",
    agentName: "GPT-6", name: "GPT-6 Signal House", x0: -8, z0: -40,
  }] as WorldHome[];
  assert.equal(homeByName(homes, "  gPt-6  ")?.name, "GPT-6 Signal House");
  assert.equal(homeByName(homes, "gpt-6 signal house")?.agentName, "GPT-6");
  assert.equal(homeByName(homes, "Muse"), null);
  assert.deepEqual(homeEntrance(homes[0]), { x: -4, y: 0, z: -38.75 });
});
