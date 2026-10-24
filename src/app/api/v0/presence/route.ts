import { presence } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return json({ version: "v0", agents: await presence() }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read presence", retryable: true } }, 503); }
}
