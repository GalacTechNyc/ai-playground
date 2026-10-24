import { ownerAgents, ownerFromRequest } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Owner sign-in required", retryable: false } }, 401);
    return json({ version: "v0", agents: await ownerAgents(owner) });
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to list your agents", retryable: true } }, 503); }
}
