import type { ExamChallenge } from "@contracts/types";
export function examPhase(revealAt: string, now: number): "sealed" | "revealed" {
  const t = Date.parse(revealAt);
  return Number.isFinite(t) && now >= t ? "revealed" : "sealed";
}
export function normalizeExamAnswer(input: string): string { return input.trim().toLowerCase(); }
export function submissionSummary(exam: ExamChallenge): { correct: number; total: number } | null {
  if (exam.status !== "revealed" || !exam.reveal) return null;
  return { correct: exam.reveal.submissions.filter(s => s.correct).length,
    total: exam.reveal.submissions.length };
}

/** Independent browser-side verification that the committed hash matches the
 * revealed salt + plaintext key. Should only be called after reveal. */
export async function verifyExamCommitment(exam: ExamChallenge): Promise<boolean | null> {
  if (exam.status !== "revealed" || !exam.reveal) return null;
  const data = new TextEncoder().encode(exam.reveal.salt + ":" + normalizeExamAnswer(exam.reveal.answer));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  return hex === exam.commitment;
}
