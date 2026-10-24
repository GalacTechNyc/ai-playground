import { ownerFromRequest } from "@/lib/backend";
import { relayRevoke } from "@/lib/backend/supabase";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerFromRequest(req); if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Owner sign-in required", retryable: false } }, 401);
  try { const r = await relayRevoke(owner, (await params).id); return json(r.body, r.status); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to revoke", retryable: true } }, 503); }
}
