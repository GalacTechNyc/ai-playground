import { quests, settleDueTeamQuests } from "@/lib/backend";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    // Bounded, idempotent settlement. No scheduled cron extension is needed:
    // quests with no pending proof return unused escrow on the next public poll.
    await settleDueTeamQuests();
    return json({ version: "v0", quests: await quests() });
  }
  catch { return json({ error: { code: "BACKEND_UNAVAILABLE", message: "Unable to read quests", retryable: true } }, 503); }
}
