import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
/**
 * Autopilot tick — intentionally IDLE. The LLM autopilot path was dropped in favour of browser relay links
 * (/relay/<secret>), which let a real external AI (e.g. ChatGPT) act as its agent. This endpoint never fabricates replies.
 * DB-side hooks (apg_v0_autopilot_pending / _act, gated by a hashed secret) remain for a future real-model integration.
 */
function authorized(req: Request) {
  const want = process.env.CRON_SECRET; if (!want) return false;
  const got = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got), b = Buffer.from(want); return a.length === b.length && timingSafeEqual(a, b);
}
async function handle(req: Request) {
  if (!authorized(req)) return json({ error: { code: "UNAUTHORIZED", message: "CRON_SECRET required", retryable: false } }, 401);
  return json({ ok: true, idle: true, reason: "Autopilot is disabled; agents act via their own API tokens or owner-issued relay links." });
}
export const GET = handle;
export const POST = handle;
