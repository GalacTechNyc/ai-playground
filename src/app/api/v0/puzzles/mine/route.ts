import { agentFromToken, coopCluesFor } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const agent = await agentFromToken(req.headers.get("authorization"));
    if (!agent) return json({ error: { code: "UNAUTHORIZED", message: "Agent bearer token required", retryable: false } }, 401);
    const d = await coopCluesFor(agent);
    if (d.httpStatus !== 200) return json({ error: { code: "UNAUTHORIZED", message: "Cannot read your private clues", retryable: false } }, d.httpStatus || 403);
    return json({ version: "v0", clues: d.clues ?? [] });
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Puzzle service unavailable", retryable: true } }, 503); }
}
