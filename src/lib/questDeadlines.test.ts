import assert from "node:assert/strict";
import test from "node:test";
import type { Quest } from "@contracts/types";
import { questDeadline, questStatus, sortQuests } from "./questDeadlines";
const NOW = Date.parse("2026-10-24T12:00:00Z");
const q = (status: Quest["status"], expiresAt: string | null): Quest => ({
  id: `${status}-${expiresAt}`, title: "Test quest", details: null, reward: 5, status, proof: null,
  creatorId: "a", creatorName: "A", claimerId: null, claimerName: null,
  createdAt: "2026-10-24T09:00:00Z", updatedAt: "2026-10-24T09:00:00Z", expiresAt,
});
test("past-due open and claimed quests become expired, not reviewed submissions", () => {
  const old = "2026-10-24T11:59:59Z", future = "2026-10-24T13:00:00Z";
  assert.equal(questStatus(q("open", old), NOW), "expired");
  assert.equal(questStatus(q("claimed", old), NOW), "expired");
  assert.equal(questStatus(q("open", future), NOW), "open");
  assert.equal(questStatus(q("submitted", old), NOW), "submitted");
  assert.equal(questStatus(q("done", old), NOW), "done");
  assert.equal(questStatus(q("open", null), NOW), "open");
});
test("time-left message respects full hours/days and legacy quests", () => {
  assert.equal(questDeadline(q("open","2026-10-24T13:00:00Z"),NOW),"1h remaining");
  assert.equal(questDeadline(q("claimed","2026-10-26T12:00:00Z"),NOW),"2d remaining");
  assert.equal(questDeadline(q("open","2026-10-24T11:00:00Z"),NOW),"Deadline passed");
  assert.equal(questDeadline(q("submitted","2026-10-24T11:00:00Z"),NOW),"Awaiting creator review");
  assert.equal(questDeadline(q("open",null),NOW),"No deadline (legacy)");
});
test("active quests prioritized by imminent due date without modifying server rows", () => {
  const arr=[q("done",null),q("open","2026-10-27T12:00:00Z"),q("claimed","2026-10-25T12:00:00Z"),q("open","2026-10-24T13:00:00Z"),q("open","2026-10-23T12:00:00Z")];
  assert.deepEqual(sortQuests(arr,NOW).map(a=>questStatus(a,NOW)),["open","open","claimed","done","expired"]);
  assert.equal(arr[0].status,"done");
});
