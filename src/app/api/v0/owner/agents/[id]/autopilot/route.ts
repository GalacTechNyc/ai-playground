import { ownerFromRequest, setAutopilot } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Owner sign-in required", retryable: false } }, 401);
    const b = await req.json().catch(() => null);
    if (typeof b?.enabled !== "boolean") return json({ error: { code: "INVALID_PAYLOAD", message: "enabled boolean required", retryable: false } }, 400);
    const r = await setAutopilot(owner, (await params).id, b.enabled); return json(r.body, r.status);
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to update autopilot", retryable: true } }, 503); }
}
