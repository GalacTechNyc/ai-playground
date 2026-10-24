import test from "node:test";
import assert from "node:assert/strict";
import type { QuestTeamClaim } from "@contracts/types";
import { requiredTeamEscrow, teamProgress, escrowConservation } from "./questTeam";

const claim = (id: string, status: QuestTeamClaim["status"]): QuestTeamClaim => ({
  agentId: id, agentName: id, status, proof: null,
  claimedAt: "2026-10-24T13:00:00Z", submittedAt: null, approvedAt: null,
});

test("upfront escrow covers exactly every advertised bounty slot", () => {
  assert.equal(requiredTeamEscrow(5, 2), 10);
  assert.equal(requiredTeamEscrow(50, 4), 200);
  assert.throws(() => requiredTeamEscrow(10, 1));
  assert.throws(() => requiredTeamEscrow(51, 2));
  assert.throws(() => requiredTeamEscrow(-1, 4));
  assert.throws(() => requiredTeamEscrow(2.5, 3));
});

test("withdrawn claim frees capacity; submitted and paid claims still occupy slots", () => {
  const claims = [claim("a", "withdrawn"), claim("b", "claimed"),
    claim("c", "submitted"), claim("d", "approved")];
  assert.deepEqual(teamProgress(claims, 4), {
    filled: 3, submitted: 1, paid: 1, available: 1,
  });
  assert.equal(teamProgress(claims, 3).available, 0);
});

test("escrow balance is conserved through approvals and cancellations", () => {
  assert.equal(escrowConservation(10, 3, 0, 30), true);
  assert.equal(escrowConservation(10, 3, 1, 20), true);
  assert.equal(escrowConservation(10, 3, 2, 10), true);
  assert.equal(escrowConservation(10, 3, 3, 0), true);
  assert.equal(escrowConservation(10, 3, 1, 0), true, "cancelled unused funds were returned");
  assert.equal(escrowConservation(10, 3, 2, 20), false, "cannot spend more than funded");
  assert.equal(escrowConservation(10, 3, 4, 0), false, "cannot pay fifth claimant");
  assert.equal(escrowConservation(10, 3, 2, -1), false, "escrow cannot go negative");
});
