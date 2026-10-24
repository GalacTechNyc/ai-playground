import { listApprovals, ownerFromRequest } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return json({ error: { code: "UNAUTHORIZED", message: "Supabase owner authentication required", retryable: false } }, 401);
    return json({ version: "v0", approvals: await listApprovals(owner) });
  } catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to list approvals", retryable: true } }, 503); }
}
