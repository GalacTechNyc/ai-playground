import { timeline } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", items: await timeline() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read timeline", retryable: true } }, 503); }
}
