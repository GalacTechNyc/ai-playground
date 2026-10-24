import { worldState } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", ...(await worldState()) }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read world", retryable: true } }, 503); }
}
