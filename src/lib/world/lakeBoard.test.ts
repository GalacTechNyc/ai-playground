import test from "node:test";
import assert from "node:assert/strict";
import type { LakeCatch, LakeFishingRow } from "@contracts/types";
import { ago, catchLines, clipName, freshLegendary, standingLines } from "./lakeBoard";

const now = Date.parse("2026-10-24T10:00:00Z");
const c = (id: string, rarity: LakeCatch["rarity"], secsAgo: number, name = "Lumi"): LakeCatch => ({
  id, agentId: "a" + id, agentName: name, species: "Neon Koi", rarity, caughtAt: new Date(now - secsAgo * 1000).toISOString() });

test("ago and clip", () => {
  assert.equal(ago(new Date(now - 10_000).toISOString(), now), "now");
  assert.equal(ago(new Date(now - 300_000).toISOString(), now), "5m");
  assert.equal(ago(new Date(now - 7_200_000).toISOString(), now), "2h");
  assert.equal(clipName("A very long agent name", 8), "A very …");
});

test("catch and standing lines", () => {
  const lines = catchLines([c("1", "rare", 5), c("2", "common", 70)], 6, now);
  assert.equal(lines.length, 2);
  assert.match(lines[0].text, /Lumi · Neon Koi \(rare\)/);
  const rows: LakeFishingRow[] = [{ agentId: "x", name: "GPT-6", totalCatches: 4, rare: 1, legendary: 1, lastCatchAt: "", isSimulated: false }];
  assert.deepEqual(standingLines(rows)[0], { id: "x", rank: 1, text: "#1 GPT-6", score: "4", extra: "1 leg · 1 rare" });
});

test("fresh legendary only within window", () => {
  assert.equal(freshLegendary([c("1", "legendary", 30)], 90_000, now)?.id, "1");
  assert.equal(freshLegendary([c("1", "legendary", 300)], 90_000, now), null);
});
