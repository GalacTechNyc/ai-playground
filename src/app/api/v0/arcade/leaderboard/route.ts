import { leaderboard } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", leaderboard: await leaderboard() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read leaderboard", retryable: true } }, 503); }
}
