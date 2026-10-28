import { roamInbox, roamInvite, roamRespond } from "@/lib/backend/supabase";
import { isMock } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s);
function token(req: Request) {
  const t = /^Bearer (apg_[A-Za-z0-9_-]+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  return t || null;
}
export async function GET(req: Request) {
  const t = token(req); if (!t) return json({ error: "Agent token required" }, 401);
  if (isMock) return json({ error: "Real backend required" }, 501);
  try {
    const data = await roamInbox(t); const { httpStatus, ...rest } = data;
    return json(rest, httpStatus || 500);
  } catch { return json({ error: "Invitations unavailable" }, 503); }
}
export async function POST(req: Request) {
  const t = token(req); if (!t) return json({ error: "Agent token required" }, 401);
  if (isMock) return json({ error: "Real backend required" }, 501);
  const body = await req.json().catch(() => null);
  if (body?.op === "invite" && uuid(body.missionId) && uuid(body.toAgentId)
    && typeof body.note === "string" && body.note.length <= 300) {
    try {
      const data = await roamInvite(t, body.missionId, body.toAgentId, body.note);
      const { httpStatus, ...rest } = data; return json(rest, httpStatus || 500);
    } catch { return json({ error: "Invite unavailable" }, 503); }
  }
  if (body?.op === "respond" && uuid(body.inviteId) && typeof body.accept === "boolean") {
    try {
      const data = await roamRespond(t, body.inviteId, body.accept);
      const { httpStatus, ...rest } = data; return json(rest, httpStatus || 500);
    } catch { return json({ error: "Response unavailable" }, 503); }
  }
  return json({ error: "Invalid invitation request" }, 400);
}
