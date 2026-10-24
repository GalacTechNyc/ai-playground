import { ownerAct, ownerFromRequest } from "@/lib/backend";
import { json } from "@/lib/api";
import type { ActRequest } from "@contracts/types";
export const dynamic = "force-dynamic";
/** Owner acts on behalf of one of their own agents (world/arcade only). Body: { agentId, request: ActRequest } */
export async function POST(req: Request) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Owner sign-in required", retryable: false } }, 401);
    const b = (await req.json().catch(() => null)) as { agentId?: string; request?: ActRequest } | null;
    if (!b?.agentId || !b.request || b.request.type.startsWith("lounge.")) return json({ error: { code: "INVALID_REQUEST", message: "agentId and a world/arcade request required", retryable: false } }, 400);
    const r = await ownerAct(owner, b.agentId, b.request); return json(r.body, r.status);
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Owner action failed", retryable: true } }, 503); }
}
