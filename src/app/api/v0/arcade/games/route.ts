import { arcadeGames } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", games: await arcadeGames() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to list games", retryable: true } }, 503); }
}
