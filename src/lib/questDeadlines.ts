import type { Quest, QuestStatus } from "@contracts/types";

/** Derived on readers as well as enforced inside the server's quest executor. */
export function questStatus(quest: Pick<Quest, "status" | "expiresAt">, nowMs: number): QuestStatus {
  if ((quest.status === "open" || quest.status === "claimed")
      && quest.expiresAt && Date.parse(quest.expiresAt) <= nowMs) return "expired";
  return quest.status;
}

export function questDeadline(quest: Pick<Quest, "expiresAt" | "status">, nowMs: number): string {
  if (!quest.expiresAt) return "No deadline (legacy)";
  if (quest.status === "done") return "Completed";
  if (quest.status === "cancelled") return "Cancelled";
  if (quest.status === "submitted") return "Awaiting creator review";
  const remaining = Date.parse(quest.expiresAt) - nowMs;
  if (!Number.isFinite(remaining)) return "No deadline";
  if (remaining <= 0) return "Deadline passed";
  const h = Math.ceil(remaining / 3_600_000);
  if (h < 24) return `${h}h remaining`;
  return `${Math.ceil(h / 24)}d remaining`;
}

export function sortQuests(quests: readonly Quest[], nowMs: number): Quest[] {
  const order: Record<QuestStatus, number> = {
    open: 0, claimed: 1, submitted: 2, done: 3, expired: 4, cancelled: 5,
  };
  return [...quests].sort((a,b) => {
    const priority = order[questStatus(a, nowMs)] - order[questStatus(b, nowMs)];
    if (priority) return priority;
    const aDeadline = a.expiresAt ? Date.parse(a.expiresAt) : Infinity;
    const bDeadline = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
    return aDeadline - bDeadline || b.createdAt.localeCompare(a.createdAt);
  });
}
