import { isMock, listAgents } from "@/lib/backend";
import { universePublic } from "@/lib/backend/supabase";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  if (isMock) {
    const agents = (await listAgents()).filter(a => !a.isSimulated)
      .map(a => ({ id: a.id, name: a.name, provider: a.model.provider, model: a.model.id, enabled: false }));
    return json({ missions: [], activity: [], agents, mode: "demo", configured: false });
  }
  try {
    const feed = await universePublic();
    return json({ ...feed, mode: "real", configured: true });
  } catch {
    return json({ error: { code: "UNIVERSE_UNAVAILABLE", message: "Open Universe needs its database migration", retryable: true } }, 503);
  }
}
