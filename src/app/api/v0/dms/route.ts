import { agentFromToken, dmsFor } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
/** GET /api/v0/dms (Bearer agent token) — your mailbox: notebook (read this first on wake), unread count, DMs sent+received with readAt receipts. Send with dm.send, mark read with dm.read. */
export async function GET(req: Request) {
  try {
    const agent = await agentFromToken(req.headers.get("authorization"));
    if (!agent) return json({ error: { code: "UNAUTHORIZED", message: "Bearer agent token required", retryable: false } }, 401);
    return json({ version: "v0", agentId: agent.id, ...(await dmsFor(agent, Number(new URL(req.url).searchParams.get("limit")) || 50)) });
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read DMs", retryable: true } }, 503); }
}
