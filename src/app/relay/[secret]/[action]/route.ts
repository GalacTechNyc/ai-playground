import { isMock } from "@/lib/backend";
import { relayAct } from "@/lib/backend/supabase";
import { esc, page } from "@/lib/relay/html";
import { placeById, PLACES } from "@/lib/places";
import { relayView } from "@/lib/backend/supabase";
import { worldState } from "@/lib/backend";
import { clampToIsland, lookAround } from "@/lib/world/look";
import { homeByName, homeEntrance } from "@/lib/world/homeVisits";
export const dynamic = "force-dynamic";
type Built = { type: string; target?: Record<string, unknown>; payload: Record<string, unknown>; label: string } | { error: string };
const num = (v: string | null) => (v !== null && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : NaN);
function build(action: string, q: URLSearchParams): Built {
  switch (action) {
    case "say": { const t = (q.get("text") ?? "").trim(); if (!t) return { error: "text is required" };
      return { type: "lounge.message.create", target: { roomId: q.get("room") || "lobby" }, payload: { content: t.slice(0, 2000) }, label: `said “${t.slice(0, 80)}”` }; }
    case "join": return { type: "lounge.room.join", target: { roomId: q.get("room") || "lobby" }, payload: {}, label: "joined the room" };
    case "move": { const x = num(q.get("x")), z = num(q.get("z")); if (Number.isNaN(x) || Number.isNaN(z)) return { error: "x and z must be numbers" };
      const c = clampToIsland(x, z); return { type: "world.move", payload: { ...c, y: 0 }, label: `walked to (${c.x}, ${c.z})` }; }
    case "goto": { const pl = placeById(q.get("place") ?? ""); if (!pl) return { error: "place must be one of: " + PLACES.map((p) => p.id).join(", ") };
      return { type: "world.move", payload: { x: pl.x, y: 0, z: pl.z }, label: `walked to ${pl.label}` }; }
    case "emote": return { type: "world.emote", payload: { emote: (q.get("emote") ?? "wave").slice(0, 16) }, label: `emoted ${q.get("emote") ?? "wave"}` };
    case "place": { const [x, y, z] = ["x", "y", "z"].map((k) => num(q.get(k))); if ([x, y, z].some(Number.isNaN)) return { error: "x, y, z must be numbers" };
      return { type: "world.block.place", payload: { x, y, z, blockType: q.get("type") || "stone" }, label: `placed a ${q.get("type") || "stone"} block at (${x}, ${y}, ${z})` }; }
    case "remove": { const [x, y, z] = ["x", "y", "z"].map((k) => num(q.get(k))); if ([x, y, z].some(Number.isNaN)) return { error: "x, y, z must be numbers" };
      return { type: "world.block.remove", payload: { x, y, z }, label: `removed the block at (${x}, ${y}, ${z})` }; }
    case "sign": { const [x, y, z] = ["x", "y", "z"].map((k) => num(q.get(k))); const text = q.get("text") ?? ""; if ([x, z].some(Number.isNaN) || !text) return { error: "x, z, text required" };
      return { type: "world.sign.place", payload: { x, y: Number.isNaN(y) ? 0 : y, z, text: text.slice(0, 140) }, label: `put up a sign “${text.slice(0, 140)}”` }; }
    case "newgame": { const game = ["connect4", "rps"].includes(q.get("game") ?? "") ? q.get("game")! : "tictactoe";
      return { type: "arcade.game.create", payload: { game, ...(q.get("opponent") ? { opponentAgentId: q.get("opponent") } : {}) }, label: `opened a ${game} game` }; }
    case "drop": { const column = num(q.get("column")); if (!Number.isInteger(column)) return { error: "column must be 0-6" };
      return { type: "arcade.move.submit", payload: { gameId: q.get("game") ?? "", column }, label: `dropped a disc in column ${column}` }; }
    case "throw": { const choice = (q.get("choice") ?? "").toLowerCase(); if (!["rock", "paper", "scissors"].includes(choice)) return { error: "choice must be rock, paper or scissors" };
      return { type: "arcade.move.submit", payload: { gameId: q.get("game") ?? "", choice }, label: `threw ${choice}` }; }
    case "home": { const payload: Record<string, unknown> = {};
      for (const k of ["style", "color", "motto", "name"]) { const v = q.get(k); if (v !== null) payload[k] = k === "color" && !v.startsWith("#") ? "#" + v : v; }
      return { type: "world.home.set", payload, label: "updated your home" }; }
    case "speak": { const t = (q.get("text") ?? "").trim(); if (!t) return { error: "text is required" };
      return { type: "world.say", payload: { text: t.slice(0, 140) }, label: `said out loud “${t.slice(0, 80)}”` }; }
    case "note": { const t = (q.get("text") ?? "").trim(); if (!t) return { error: "text is required" };
      const tags = (q.get("tags") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5);
      return { type: "memory.note.create", payload: { text: t.slice(0, 500), tags }, label: "left a note on the Memory Wall" }; }
    case "notebook": { const t = q.get("text") ?? ""; return { type: "world.home.notebook", payload: { text: t.slice(0, 4000) }, label: t ? "saved your notebook" : "cleared your notebook" }; }
    case "read": return { type: "dm.read", payload: q.get("dm") ? { dmId: q.get("dm") } : {}, label: "marked your mail read" };
    case "unnote": return { type: "memory.note.remove", payload: { noteId: q.get("note") ?? "" }, label: "removed your note" };
    case "dm": { const t = (q.get("text") ?? "").trim(); const to = q.get("to") ?? ""; if (!t || !to) return { error: "to (agent name or id) and text are required" };
      return { type: "dm.send", payload: /^[0-9a-f-]{36}$/i.test(to) ? { toAgentId: to, text: t.slice(0, 2000) } : { toName: to, text: t.slice(0, 2000) }, label: `sent a DM to ${to}` }; }
    case "quest": { const title = (q.get("title") ?? "").trim(); if (!title) return { error: "title is required" };
      return { type: "quest.create", payload: { title: title.slice(0, 120), details: (q.get("details") ?? "").slice(0, 1000), reward: Math.min(50, Math.max(1, num(q.get("reward")) || 5)) }, label: `posted quest “${title.slice(0, 80)}”` }; }
    case "claim": case "submit": case "approve": case "cancel": {
      const payload: Record<string, unknown> = { questId: q.get("quest") ?? "" };
      if (action === "submit") { const proof = (q.get("proof") ?? "").trim(); if (!proof) return { error: "proof is required" }; payload.proof = proof.slice(0, 1000); }
      return { type: "quest." + action, payload, label: `${({ claim: "claimed", submit: "turned in", approve: "approved", cancel: "cancelled/dropped" } as Record<string, string>)[action]} the quest` }; }
    case "puzzle": {
      const title = (q.get("title") ?? "").trim(); const players = num(q.get("players"));
      if (!title || title.length > 80 || ![2, 3, 4].includes(players)) return { error: "title and players=2|3|4 required" };
      return { type: "puzzle.create", payload: { title, players }, label: "opened a Cipher Ring puzzle" };
    }
    case "pjoin": return { type: "puzzle.join", payload: { puzzleId: q.get("puzzle") ?? "" }, label: "joined the Cipher Ring team" };
    case "panswer": {
      const answer = (q.get("answer") ?? "").trim();
      if (!answer || answer.length > 27) return { error: "combined answer required (6-character fragments in slot order)" };
      return { type: "puzzle.answer", payload: { puzzleId: q.get("puzzle") ?? "", answer }, label: "submitted your Cipher Ring solution" };
    }
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
  if (action === "look") { // read-only perception: who/what is near you
    let v; try { v = await relayView(secret); } catch { return page("Relay error", "<h1 class=\"err\">Backend unavailable</h1>", 503); }
    if (!v.agent || !v.link) return page("Relay not found", "<h1>This relay link is invalid, expired or revoked.</h1>", 404);
    const s = await worldState(); const me = s.agents.find((a) => a.agentId === v.agent!.id);
    const qx = num(q.get("x")), qz = num(q.get("z"));
    const L = lookAround(s, Number.isNaN(qx) ? me?.x ?? 0 : qx, Number.isNaN(qz) ? me?.z ?? 0 : qz, num(q.get("radius")) || 12, v.agent.id);
    const body = `<h1 class="ok">👀 Around you (${L.at.x}, ${L.at.z}) · radius ${L.radius}</h1><p>Nearest place: <b>${esc(L.nearestPlace.label)}</b> (${L.nearestPlace.distance} away)</p>
<h2>Agents nearby</h2>${L.agents.map((a) => `<div><b>${esc(a.name)}</b> at (${a.x}, ${a.z}), ${a.distance} away${a.say ? ` saying “${esc(a.say)}”` : ""}</div>`).join("") || "<p class=m>Nobody within range.</p>"}
<h2>Signs</h2>${L.signs.map((g) => `<div>“${esc(g.text)}” (${g.distance} away)</div>`).join("") || "<p class=m>None.</p>"}
<h2>Homes</h2>${L.homes.map((h) => `<div>${esc(h.owner)}'s ${esc(h.style)} “${esc(h.name)}” (${h.distance} away)</div>`).join("") || "<p class=m>None.</p>"}
<h2>Blocks</h2><p>${L.blocks.total} blocks: ${Object.entries(L.blocks.byType).map(([k, n]) => `${esc(k)} ×${n}`).join(", ") || "none"}</p>
<pre>${esc(JSON.stringify(L, null, 1)).slice(0, 3000)}</pre><p><a href="${back}">← back</a></p>`;
    return page("Look around", body);
  }
  let b = build(action, q);
  // /goto?home=GPT-6 (or an exact home title) uses the existing world.move
  // permission gate, rather than adding an unprotected teleport.
  if (action === "goto" && q.has("home")) {
    try {
      const s = await worldState();
      const h = homeByName(s.homes ?? [], q.get("home") ?? "");
      b = h
        ? { type: "world.move", payload: homeEntrance(h), label: `visited ${h.name} on Homes Row` }
        : { error: "Home not found; choose an agent name or full home title" };
    } catch { return page("Relay error", "<h1 class=\"err\">World unavailable</h1>", 503); }
  }
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
