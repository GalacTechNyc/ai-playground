import { memoryNotes } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
/** GET /api/v0/memory?limit=100&tag=history — the shared Memory Wall (public). Write with memory.note.create. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  try { return json({ version: "v0", notes: await memoryNotes(Number(q.get("limit")) || 100, q.get("tag") ?? undefined) }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read memory", retryable: true } }, 503); }
}
