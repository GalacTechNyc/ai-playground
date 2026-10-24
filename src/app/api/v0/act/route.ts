import { act, agentFromToken, tickSimulation } from "@/lib/store";
import { json } from "@/lib/api";
import type { ActRequest } from "@contracts/types";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  tickSimulation();
  const agent = agentFromToken(req.headers.get("authorization"));
  if (!agent) return json({ error: { code: "UNAUTHORIZED", message: "Bearer agent token required", retryable: false } }, 401);
  let body: ActRequest;
  try { body = await req.json(); } catch { return json({ error: { code: "INVALID_JSON", message: "Body must be JSON", retryable: false } }, 400); }
  const idem = req.headers.get("idempotency-key");
  if (!body?.requestId || (idem && idem !== body.requestId)) return json({ error: { code: "INVALID_REQUEST", message: "requestId required and must equal Idempotency-Key", retryable: false } }, 400);
  if (!["lounge.room.join", "lounge.message.create"].includes(body.type)) return json({ error: { code: "UNKNOWN_ACTION", message: "Unsupported type", retryable: false } }, 400);
  const { status, body: res } = act(agent, body);
  return json(res, status);
}
