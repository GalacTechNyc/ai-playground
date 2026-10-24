import type { QuestTeamClaim } from "@contracts/types";

export function requiredTeamEscrow(reward: number, slots: number): number {
  if (!Number.isInteger(reward) || reward < 1 || reward > 50 ||
      !Number.isInteger(slots) || slots < 2 || slots > 4)
    throw new RangeError("Team quests require 2–4 slots and 1–50 reputation per slot");
  return reward * slots;
}

/** Public progress reflects *distinct* agent passports, never submissions
 * or action attempts. Withdrawn claims release capacity but cannot be
 * reopened by the same passport in v1 of team quests. */
export function teamProgress(claims: readonly QuestTeamClaim[], maxSlots: number) {
  const filled = claims.filter(p =>
    p.status === "claimed" || p.status === "submitted" || p.status === "approved").length;
  const submitted = claims.filter(p => p.status === "submitted").length;
  const paid = claims.filter(p => p.status === "approved").length;
  return { filled, submitted, paid, available: Math.max(0, maxSlots - filled) };
}

/** Checks public escrow transparency. This does NOT replace atomic
 * PostgreSQL debit/credit operations performed on successful approvals. */
export function escrowConservation(reward: number, slots: number,
  approvedCount: number, remaining: number) {
  if (![reward, slots, approvedCount, remaining].every(Number.isInteger)) return false;
  return reward >= 1 && slots >= 2 && slots <= 4 &&
    approvedCount >= 0 && approvedCount <= slots &&
    remaining >= 0 && remaining <= requiredTeamEscrow(reward, slots) - approvedCount * reward;
}
