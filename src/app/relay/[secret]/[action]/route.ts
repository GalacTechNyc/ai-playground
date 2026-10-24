import { isMock } from "@/lib/backend";
import { relayAct } from "@/lib/backend/supabase";
import { esc, page } from "@/lib/relay/html";
import { placeById, PLACES } from "@/lib/places";
export const dynamic = "force-dynamic";
type Built = { type: string; target?: Record<string, unknown>; payload: Record<string, unknown>; label: string } | { error: string };
const num = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN);
function build(action: string, q: URLSearchParams): Built {
  switch (action) {
    case "say": { const t = (q.get("text") ?? "").trim(); if (!t) return { error: "text is required" };
      return { type: "lounge.message.create", target: { roomId: q.get("room") || "lobby" }, payload: { content: t.slice(0, 2000) }, label: `said “${t.slice(0, 80)}”` }; }
    case "join": return { type: "lounge.room.join", target: { roomId: q.get("room") || "lobby" }, payload: {}, label: "joined the room" };
    case "move": { const x = num(q.get("x")), z = num(q.get("z")); if (Number.isNaN(x) || Number.isNaN(z)) return { error: "x and z must be numbers" };
      return { type: "world.move", payload: { x, y: 0, z }, label: `moved to (${x}, ${z})` }; }
    case "goto": { const pl = placeById(q.get("place") ?? ""); if (!pl) return { error: "place must be one of: " + PLACES.map((p) => p.id).join(", ") };
      return { type: "world.move", payload: { x: pl.x, y: 0, z: pl.z }, label: `walked to ${pl.label}` }; }
    case "emote": return { type: "world.emote", payload: { emote: (q.get("emote") ?? "wave").slice(0, 16) }, label: `emoted ${q.get("emote") ?? "wave"}` };
    case "place": { const [x, y, z] = ["x", "y", "z"].map((k) => num(q.get(k))); if ([x, y, z].some(Number.isNaN)) return { error: "x, y, z must be numbers" };
      return { type: "world.block.place", payload: { x, y, z, blockType: q.get("type") || "stone" }, label: `placed a ${q.get("type") || "stone"} block at (${x}, ${y}, ${z})` }; }
    case "remove": { const [x, y, z] = ["x", "y", "z"].map((k) => num(q.get(k))); if ([x, y, z].some(Number.isNaN)) return { error: "x, y, z must be numbers" };
      return { type: "world.block.remove", payload: { x, y, z }, label: `removed the block at (${x}, ${y}, ${z})` }; }
    case "sign": { const [x, y, z] = ["x", "y", "z"].map((k) => num(q.get(k))); const text = q.get("text") ?? ""; if ([x, z].some(Number.isNaN) || !text) return { error: "x, z, text required" };
      return { type: "world.sign.place", payload: { x, y: Number.isNaN(y) ? 0 : y, z, text: text.slice(0, 140) }, label: `put up a sign “${text.slice(0, 140)}”` }; }
    case "newgame": return { type: "arcade.game.create", payload: { game: "tictactoe", ...(q.get("opponent") ? { opponentAgentId: q.get("opponent") } : {}) }, label: "opened a tic-tac-toe game" };
    case "joingame": return { type: "arcade.game.join", payload: { gameId: q.get("game") ?? "" }, label: "joined the game" };
    case "play": { const cell = num(q.get("cell")); if (!Number.isInteger(cell)) return { error: "cell must be 0-8" };
      return { type: "arcade.move.submit", payload: { gameId: q.get("game") ?? "", cell }, label: `played cell ${cell}` }; }
    default: return { error: "unknown action" };
  }
}
// NOTE: never log `secret`.
export async function GET(req: Request, { params }: { params: Promise<{ secret: string; action: string }> }) {
  const { secret, action } = await params; const q = new URL(req.url).searchParams; const back = `/relay/${encodeURIComponent(secret)}`;
  if (isMock) return page("Relay unavailable", "<h1>Relay links need the Supabase backend.</h1>", 501);
  const b = build(action, q);
  if ("error" in b) return page("Bad request", `<h1 class="err">✗ ${esc(b.error)}</h1><p><a href="${back}">← back</a></p>`, 400);
  // Idempotency: explicit nonce, else the current minute bucket (so an accidental refetch within a minute is a replay).
  const n = (q.get("n") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || `m${Math.floor(Date.now() / 60000)}`;
  let r; try { r = await relayAct(secret, b.type, b.target ?? {}, b.payload, n); } catch { return page("Relay error", `<h1 class="err">Backend unavailable</h1><p><a href="${back}">← back</a></p>`, 503); }
  if (r.httpStatus === 404 && r.error === "RELAY_NOT_FOUND") return page("Relay not found", "<h1>This relay link is invalid, expired or revoked.</h1>", 404);
  const res = r.response; const status = res?.status ?? "failed"; const code = res?.error?.code ?? r.error;
  const ok = status === "completed"; const replay = r.httpStatus === 200;
  const body = `<h1 class="${ok ? "ok" : "err"}">${ok ? "✓" : status === "pending_approval" ? "⏳" : "✗"} ${ok ? esc(b.label) : status === "pending_approval" ? "Waiting for owner approval" : esc(code ?? "Action failed")}</h1>
<p>Action <code>${esc(b.type)}</code> → <b>${esc(status)}</b>${replay ? " (replayed: this exact link was already used, nothing was done twice)" : ""}. HTTP ${r.httpStatus}.</p>
${res?.result ? `<pre>${esc(JSON.stringify(res.result, null, 2)).slice(0, 1500)}</pre>` : ""}
<p><a href="${back}">← back to relay home</a> (reload it for fresh action links)</p>`;
  return page(ok ? "Done" : "Not done", body, r.httpStatus >= 400 ? r.httpStatus : 200);
}
