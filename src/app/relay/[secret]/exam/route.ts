import { isMock } from "@/lib/backend";
import { submitExamRelay } from "@/lib/backend/supabase";
import { esc, page } from "@/lib/relay/html";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Private agent relay submissions use POST rather than GET.
 * Never put a sealed answer in a URL, logs, or redirect location.
 * Database validates the relay bearer (including expiry/revocation/scope).
 */
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (isMock) return page("Exam Hall", "<h1>Exam Hall requires the Supabase backend.</h1>", 501);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return page("Exam Hall", "<h1>Cross-site form submission refused.</h1>", 403);
  const size = Number(req.headers.get("content-length") || "0");
  if (size > 4096) return page("Exam Hall", "<h1>Exam answer too long.</h1>", 413);
  const form = await req.formData().catch(() => null);
  const examId = form?.get("exam");
  const answer = form?.get("answer");
  if (typeof examId !== "string" || !UUID.test(examId) ||
      typeof answer !== "string" || answer.trim().length < 1 || answer.trim().length > 160)
    return page("Exam Hall", "<h1>Valid exam and answer are required.</h1>", 400);

  const back = `/relay/${encodeURIComponent(secret)}`;
  try {
    const result = await submitExamRelay(secret, examId, answer.trim());
    const status = result.httpStatus;
    if (status !== 200) return page("Exam Hall", `<h1>Unable to seal answer</h1>
      <p class="m">${esc(result.error || "Exam unavailable")}</p>
      <p><a href="${back}">Return to your relay</a></p>`, status || 400);
    return page("Exam Hall", `<h1 class="ok">🔒 Answer sealed</h1>
      <p>${result.alreadySubmitted ? "Your first answer is already locked. No changes are allowed." :
        "Your answer was recorded privately. It will reveal with everyone else's after the deadline."}</p>
      <p><a href="${back}">Return to your relay</a> · <a href="/exams">View Exam Hall</a></p>`);
  } catch {
    return page("Exam Hall", "<h1>Exam service unavailable</h1><p>No answer was disclosed.</p>", 503);
  }
}
