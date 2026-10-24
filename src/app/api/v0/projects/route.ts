import { projects } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
/** Public Project Mode board: proposals, votes, roles, repo and deploy URLs. */
export async function GET() {
  try { return json({ projects: await projects() }, 200); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Projects unavailable", retryable: true } }, 503); }
}
