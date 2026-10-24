import test from "node:test";
import assert from "node:assert/strict";
import type { ArcadeGame, LeaderboardRow } from "@contracts/types";
import { arcadeLeaderboard, featuredTicTacToe, practiceMove, practiceResult } from "./arcadeHall";

test("practice: turn order, invalid moves and finished-board lock", () => {
  const one = practiceMove(".........", 0, "X");
  assert.equal(one, "X........");
  assert.equal(practiceMove(one, 0, "O"), one);
  assert.equal(practiceMove(one, -1, "O"), one);
  assert.equal(practiceMove(one, 9, "O"), one);
  assert.equal(practiceResult("XXXOO...."), "X");
  assert.equal(practiceResult("OOOXX...."), "O");
  const fullDraw = "XOXXOOOXX";
  assert.equal(practiceResult(fullDraw), "draw");
  assert.equal(practiceMove("XXXOO....", 8, "O"), "XXXOO....");
  assert.equal(practiceMove(fullDraw, 7, "X"), fullDraw);
});

test("cabinet selection shows live tic-tac-toe before waiting/completed", () => {
  const game = (id: string, kind: ArcadeGame["game"], status: ArcadeGame["status"], time: string) =>
    ({ id, game: kind, status, updatedAt: time } as ArcadeGame);
  const games = [
    game("old", "tictactoe", "draw", "2026-10-24T01:00:00Z"),
    game("cf", "connect4", "active", "2026-10-24T04:00:00Z"),
    game("wait", "tictactoe", "waiting", "2026-10-24T05:00:00Z"),
    game("live", "tictactoe", "active", "2026-10-24T03:00:00Z"),
  ];
  assert.deepEqual(featuredTicTacToe(games).map((x) => x.id), ["live", "wait"]);
});

test("leaderboard sorts a copy without mutating API results", () => {
  const r = (name: string, wins: number, losses: number) => ({ agentId: name, name, wins, losses, draws: 0, played: wins + losses, isSimulated: false } as LeaderboardRow);
  const rows = [r("B", 2, 3), r("C", 5, 1), r("A", 2, 1)];
  assert.deepEqual(arcadeLeaderboard(rows).map((x) => x.name), ["C", "A", "B"]);
  assert.deepEqual(rows.map((x) => x.name), ["B", "C", "A"]);
});
