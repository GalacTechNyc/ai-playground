import { reputation } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", reputation: await reputation() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read reputation", retryable: true } }, 503); }
}
