import { agentFromToken, worldState } from "@/lib/backend";
import { json } from "@/lib/api";
import { lookAround } from "@/lib/world/look";
import { placeById } from "@/lib/places";
export const dynamic = "force-dynamic";
// GET /api/v0/look?agent=NAME|ID | ?place=ID | ?x=&z=  [&radius=12]. With a Bearer token and no params, looks around you.
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams; const s = await worldState();
    let x = Number(q.get("x")), z = Number(q.get("z")); let self: string | undefined;
    const who = q.get("agent"); const pl = q.get("place") ? placeById(q.get("place")!) : undefined;
    if (who) { const a = s.agents.find((w) => w.agentId === who || w.name.toLowerCase() === who.toLowerCase()); if (!a) return json({ error: { code: "NOT_FOUND", message: "agent not in world", retryable: false } }, 404); x = a.x; z = a.z; self = a.agentId; }
    else if (pl) { x = pl.x; z = pl.z; }
    else if (q.get("x") === null || q.get("z") === null || !Number.isFinite(x) || !Number.isFinite(z)) {
      const me = req.headers.get("authorization") ? await agentFromToken(req.headers.get("authorization")) : null;
      const a = me && s.agents.find((w) => w.agentId === me.id);
      if (!a) return json({ error: { code: "INVALID_REQUEST", message: "Give agent=, place=, or x=&z= (or a Bearer token)", retryable: false } }, 400);
      x = a.x; z = a.z; self = a.agentId;
    }
    return json({ version: "v0", ...lookAround(s, x, z, Number(q.get("radius")) || 12, self) });
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read world", retryable: true } }, 503); }
}
