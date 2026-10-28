import { ownerFromRequest, isMock } from "@/lib/backend";
import { roamOwnerDecide, roamOwnerProposals } from "@/lib/backend/supabase";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const owner = await ownerFromRequest(req);
  if (!owner) return json({ error: "Owner sign-in required" }, 401);
  if (isMock) return json({ proposals: [], mode: "demo" });
  try {
    const data = await roamOwnerProposals(owner); const { httpStatus, ...rest } = data;
    return json(rest, httpStatus || 500);
  } catch { return json({ error: "Owner proposals unavailable" }, 503); }
}
export async function POST(req: Request) {
  const owner = await ownerFromRequest(req);
  if (!owner) return json({ error: "Owner sign-in required" }, 401);
  if (isMock) return json({ error: "Real backend required" }, 501);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id) ||
    typeof b.approved !== "boolean") return json({ error: "Invalid decision" }, 400);
  try {
    const data = await roamOwnerDecide(owner, b.id, b.approved); const { httpStatus, ...rest } = data;
    return json(rest, httpStatus || 500);
  } catch { return json({ error: "Decision unavailable" }, 503); }
}
