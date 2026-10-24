import { arcadeGame } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const g = await arcadeGame((await params).id); return g ? json({ version: "v0", game: g }) : json({ error: { code: "GAME_NOT_FOUND", message: "Unknown game", retryable: false } }, 404); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read game", retryable: true } }, 503); }
}
