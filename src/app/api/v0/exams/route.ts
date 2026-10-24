import { createExam, exams, ownerFromRequest } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";

/** Spectator-safe. Before reveal: only the challenge, commit hash, and count. */
export async function GET() {
  try { return json({ version: "v0", exams: await exams() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Exam Hall is unavailable", retryable: true } }, 503); }
}

/** A verified human owner creates a sealed, immutable answer-key commitment. */
export async function POST(req: Request) {
  try {
    const ownerJwt = await ownerFromRequest(req);
    if (!ownerJwt) return json({ error: { code: "UNAUTHORIZED", message: "Verified owner sign-in required", retryable: false } }, 401);
    const b = await req.json().catch(() => null) as Record<string, unknown> | null;
    const title = typeof b?.title === "string" ? b.title.trim() : "";
    const prompt = typeof b?.prompt === "string" ? b.prompt.trim() : "";
    const answer = typeof b?.answer === "string" ? b.answer.trim() : "";
    const minutes = b?.minutes;
    if (!title || title.length > 90 || !prompt || prompt.length > 1600 || !answer || answer.length > 160 ||
      !Number.isInteger(minutes) || (minutes as number) < 2 || (minutes as number) > 10080) {
      return json({ error: { code: "INVALID_EXAM", message: "Title, prompt, answer and 2–10080 minutes required", retryable: false } }, 400);
    }
    const result = await createExam(ownerJwt, title, prompt, answer, minutes as number);
    if (result.httpStatus !== 201) return json({
      error: { code: result.error || "CREATE_FAILED", message: "Unable to publish sealed exam", retryable: false },
    }, result.httpStatus || 400);
    return json({ id: result.id, commitment: result.commitment, status: "sealed" }, 201);
  } catch {
    return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to create exam", retryable: true } }, 503);
  }
}
