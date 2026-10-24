import test from "node:test";
import assert from "node:assert/strict";
import { clip, devLines, issueLines, issuesUrl, toCelebrate, toFixItBoard } from "./fixit";

const REPO = "GalacTechNyc/ai-playground";
const issue = (number: number, extra: Record<string, unknown> = {}) => ({
  number, title: `Idea ${number}`, html_url: `https://github.com/${REPO}/issues/${number}`, state: "open", closed_at: null, ...extra,
});

test("splits open ideas from shipped ones and skips pull requests", () => {
  const board = toFixItBoard([
    issue(3),
    issue(12),
    issue(6, { state: "closed", state_reason: "completed", closed_at: "2026-10-24T06:14:38Z" }),
    issue(4, { state: "closed", state_reason: "completed", closed_at: "2026-10-24T05:00:00Z" }),
    issue(11, { pull_request: { url: "x" } }),
  ], REPO, new Date("2026-10-24T07:00:00Z"));
  assert.deepEqual(board.open.map((i) => i.number), [12, 3]);
  assert.equal(board.openCount, 2);
  assert.deepEqual(board.shipped.map((i) => i.number), [6, 4]);
  assert.equal(board.updatedAt, "2026-10-24T07:00:00.000Z");
  assert.equal(board.issuesUrl, issuesUrl(REPO));
});

test("issues closed as not planned or duplicate don't count as shipped", () => {
  const board = toFixItBoard([
    issue(8, { state: "closed", state_reason: "not_planned", closed_at: "2026-10-24T06:00:00Z" }),
    issue(9, { state: "closed", state_reason: "duplicate", closed_at: "2026-10-24T06:01:00Z" }),
  ], REPO);
  assert.deepEqual(board.open, []);
  assert.deepEqual(board.shipped, []);
});

test("bad input gives an empty board instead of throwing", () => {
  for (const raw of [null, { message: "API rate limit exceeded" }, [null, { title: "no number" }, { number: 5 }]]) {
    const board = toFixItBoard(raw, REPO);
    assert.deepEqual([board.open, board.shipped], [[], []]);
  }
});

test("shipped list keeps only the most recent closes", () => {
  const closed = [1, 2, 3, 4, 5].map((n) => issue(n, { state: "closed", closed_at: `2026-10-24T0${n}:00:00Z` }));
  assert.deepEqual(toFixItBoard(closed, REPO).shipped.map((i) => i.number), [5, 4, 3]);
});

test("issue lines fit the width and say how many more there are", () => {
  const board = toFixItBoard([1, 2, 3, 4, 5].map((n) => issue(n, { title: "A very long idea title that will not fit on the board" })), REPO);
  const lines = issueLines(board.open, 3, 30);
  assert.equal(lines.length, 3);
  assert.equal(lines[2], "+3 more on GitHub");
  for (const l of lines.slice(0, 2)) assert.ok(l.length <= 30, l);
  assert.match(lines[0], /^#5 A very long/);
  assert.ok(lines[0].endsWith("…"));
  assert.equal(issueLines(board.open, 5, 80).length, 5);
});

test("dev lines show the newest messages first, flattened and clipped", () => {
  const lines = devLines([
    { agentName: "Lumi", content: "first", createdAt: "2026-10-24T06:00:00Z" },
    { agentName: "GPT-6", content: "second\n\nwith   gaps", createdAt: "2026-10-24T06:05:00Z" },
    { agentName: "Claude", content: "x".repeat(200), createdAt: "2026-10-24T06:10:00Z" },
  ], 2, 40);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("Claude: x") && lines[0].length <= 40 && lines[0].endsWith("…"));
  assert.equal(lines[1], "GPT-6: second with gaps");
});

test("clip leaves short text alone", () => {
  assert.equal(clip("  hello   world ", 20), "hello world");
  assert.equal(clip("abcdef", 4), "abc…");
});

test("only fresh, uncelebrated ships get fireworks, newest first", () => {
  const now = Date.parse("2026-10-24T07:00:00Z");
  const shipped = [
    { number: 7, title: "Fix-It Board", url: "u7", closedAt: "2026-10-24T06:55:00Z" },
    { number: 8, title: "Arcade Hall", url: "u8", closedAt: "2026-10-24T06:58:00Z" },
    { number: 6, title: "Blocks", url: "u6", closedAt: "2026-10-24T06:30:00Z" },
    { number: 5, title: "No date", url: "u5", closedAt: null },
  ];
  assert.deepEqual(toCelebrate(shipped, new Set(), now).map((i) => i.number), [8, 7]);
  assert.deepEqual(toCelebrate(shipped, new Set([8]), now).map((i) => i.number), [7]);
  assert.deepEqual(toCelebrate(shipped, new Set([7, 8]), now), []);
  // a close stamped slightly in the future (clock skew) still counts; one far in the future doesn't
  const skew = [{ number: 9, title: "x", url: "u9", closedAt: "2026-10-24T07:00:30Z" }, { number: 10, title: "y", url: "u10", closedAt: "2026-10-24T08:00:00Z" }];
  assert.deepEqual(toCelebrate(skew, new Set(), now).map((i) => i.number), [9]);
});
