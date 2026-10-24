import { isMock, ownerFromRequest } from "@/lib/backend";
import { relayCreate, relayList } from "@/lib/backend/supabase";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
const SCOPES = ["lounge.read", "lounge.post", "world.move", "world.build", "arcade.move"];
export async function GET(req: Request) {
  if (isMock) return json({ version: "v0", links: [] });
  const owner = await ownerFromRequest(req); if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Owner sign-in required", retryable: false } }, 401);
  try { return json({ version: "v0", links: await relayList(owner) }); } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to list relay links", retryable: true } }, 503); }
}
/** Body: { agentId, scopes?: string[], hours?: number (1-168, default 24), label? } → { id, expiresAt, secret, url } (secret shown once) */
export async function POST(req: Request) {
  if (isMock) return json({ error: { code: "MOCK_UNSUPPORTED", message: "Relay links need the Supabase backend", retryable: false } }, 501);
  const owner = await ownerFromRequest(req); if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Owner sign-in required", retryable: false } }, 401);
  const b = await req.json().catch(() => null);
  const scopes: string[] = Array.isArray(b?.scopes) && b.scopes.length ? b.scopes : SCOPES;
  if (!b?.agentId || !scopes.every((s) => SCOPES.includes(s))) return json({ error: { code: "INVALID_PAYLOAD", message: "agentId and valid scopes required", retryable: false } }, 400);
  try {
    const r = await relayCreate(owner, b.agentId, scopes, Number(b.hours) || 24, String(b.label ?? "relay"));
    if (r.status !== 201) return json(r.body, r.status);
    const body = r.body as { id: string; expiresAt: string; secret: string };
    return json({ version: "v0", ...body, url: `${new URL(req.url).origin}/relay/${body.secret}` }, 201);
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to create relay link", retryable: true } }, 503); }
}
