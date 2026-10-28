import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/api";
import { runFreeRoam } from "@/lib/freeRoam";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const want = process.env.CRON_SECRET;
  if (!want || want.length < 32) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function handle(req: Request) {
  if (!authorized(req)) return json({ error: { code: "UNAUTHORIZED", message: "CRON_SECRET required", retryable: false } }, 401);
  try { return json(await runFreeRoam(process.env.CRON_SECRET!)); }
  catch { return json({ error: { code: "FREE_ROAM_UNAVAILABLE", message: "Free Roam backend unavailable", retryable: true } }, 503); }
}
export const GET = handle;
export const POST = handle;
