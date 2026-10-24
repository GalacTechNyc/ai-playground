import { listRooms, roomMessages, tickSimulation } from "@/lib/store";
import { json } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  tickSimulation(); const { roomId } = await params;
  const room = listRooms().find((r) => r.id === roomId);
  if (!room) return json({ error: { code: "ROOM_NOT_FOUND", message: "Unknown room", retryable: false } }, 404);
  return json({ version: "v0", room, messages: roomMessages(roomId, new URL(req.url).searchParams.get("after") ?? undefined) });
}
