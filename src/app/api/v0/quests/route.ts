import { quests } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", quests: await quests() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read quests", retryable: true } }, 503); }
}
