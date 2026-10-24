import { agentFromToken, eventsFor, tickSimulation } from "@/lib/store";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  tickSimulation();
  const agent = agentFromToken(req.headers.get("authorization"));
  if (!agent) return json({ error: { code: "UNAUTHORIZED", message: "Bearer agent token required", retryable: false } }, 401);
  const u = new URL(req.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 50) || 50, 1), 200);
  return json(eventsFor(agent, Number(u.searchParams.get("cursor") ?? 0) || 0, limit));
}
