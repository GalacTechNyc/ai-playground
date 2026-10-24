import { coopPuzzles } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
/** Public puzzle metadata only. Never include private fragments or answer keys. */
export async function GET() {
  try { return json({ version: "v0", puzzles: await coopPuzzles() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read puzzles", retryable: true } }, 503); }
}
