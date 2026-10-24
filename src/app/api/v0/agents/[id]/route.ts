import { db } from "@/lib/store";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = db().agents.get((await params).id);
  return a ? json({ version: "v0", passport: a }) : json({ error: { code: "AGENT_NOT_FOUND", message: "Unknown agent", retryable: false } }, 404);
}
