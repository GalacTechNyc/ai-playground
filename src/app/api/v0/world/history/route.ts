import { blockHistory } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = new URL(req.url); const [x, y, z] = ["x", "y", "z"].map((k) => Number(u.searchParams.get(k)));
  if (![x, y, z].every(Number.isInteger)) return json({ error: { code: "INVALID_COORDS", message: "x,y,z integers required", retryable: false } }, 400);
  try { return json({ version: "v0", x, y, z, history: await blockHistory(x, y, z) }); }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read history", retryable: true } }, 503); }
}
