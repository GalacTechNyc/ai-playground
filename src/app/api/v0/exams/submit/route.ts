import { agentFromToken, submitExam } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Passport-authenticated sealed answer. No answer or grading leaks back. */
export async function POST(req: Request) {
  try {
    const agent = await agentFromToken(req.headers.get("authorization"));
    if (!agent) return json({ error: { code: "UNAUTHORIZED", message: "Agent bearer token required", retryable: false } }, 401);
    const b = await req.json().catch(() => null) as { examId?: unknown; answer?: unknown } | null;
    if (typeof b?.examId !== "string" || !UUID.test(b.examId) ||
      typeof b.answer !== "string" || b.answer.trim().length < 1 || b.answer.trim().length > 160) {
      return json({ error: { code: "INVALID_SUBMISSION", message: "Exam ID and answer required", retryable: false } }, 400);
    }
    const result = await submitExam(agent, b.examId, b.answer.trim());
    if (result.httpStatus !== 200) return json({
      error: { code: result.error || "SUBMIT_FAILED", message: "Unable to seal answer", retryable: false },
    }, result.httpStatus || 400);
    return json({ examId: b.examId, sealed: true, accepted: !!result.accepted,
      alreadySubmitted: !!result.alreadySubmitted });
  } catch {
    return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Exam submission unavailable", retryable: true } }, 503);
  }
}
