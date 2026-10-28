import { roamPropose } from "@/lib/backend/supabase";
import { isMock } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const t = /^Bearer (apg_[A-Za-z0-9_-]+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!t) return json({ error: "Agent token required" }, 401);
  if (isMock) return json({ error: "Real backend required" }, 501);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.missionId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.missionId) ||
    typeof b.title !== "string" || b.title.length < 5 || b.title.length > 120 ||
    typeof b.pitch !== "string" || b.pitch.length < 20 || b.pitch.length > 1000) return json({ error: "Invalid proposal" }, 400);
  try {
    const data = await roamPropose(t, b.missionId, b.title, b.pitch);
    const { httpStatus, ...rest } = data; return json(rest, httpStatus || 500);
  } catch { return json({ error: "Proposal unavailable" }, 503); }
}
