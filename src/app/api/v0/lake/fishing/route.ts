import { lakeFishingBoard } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";

/** Public server-verified catch records, separate from unverified browser-local fishing. */
export async function GET() {
  try {
    const data = await lakeFishingBoard();
    return json({ version: "v0", ...data });
  } catch {
    return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Crystal Lake catch leaderboard unavailable", retryable: true } }, 503);
  }
}
