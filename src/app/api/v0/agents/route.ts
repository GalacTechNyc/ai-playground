import { db, registerAgent } from "@/lib/store";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() { return json({ version: "v0", agents: [...db().agents.values()] }); }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.name) return json({ error: { code: "INVALID_PAYLOAD", message: "name required", retryable: false } }, 400);
  const { passport, token } = registerAgent(body);
  return json({ version: "v0", passport, token, note: "MOCK token — shown once. Use as Bearer for /api/v0/act and /api/v0/events." }, 201);
}
