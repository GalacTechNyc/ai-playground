import { isMock } from "@/lib/backend";
import { relayView } from "@/lib/backend/supabase";
import { esc, nonce, page } from "@/lib/relay/html";
export const dynamic = "force-dynamic";
// NOTE: never log `secret`. All errors are rendered without echoing it.
export async function GET(_: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (isMock) return page("Relay unavailable", "<h1>Relay links need the Supabase backend.</h1>", 501);
  let v; try { v = await relayView(secret); } catch { return page("Relay error", "<h1>Backend unavailable</h1><p>Try again shortly.</p>", 503); }
  if (!v.agent || !v.link) return page("Relay not found", "<h1>This relay link is invalid, expired or revoked.</h1>", 404);
  const base = `/relay/${encodeURIComponent(secret)}`; const s = new Set(v.link.scopes); const a = v.agent;
  const L = (action: string, q: Record<string, string | number>, label: string) =>
    `<a href="${base}/${action}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).map(([k, x]) => [k, String(x)])), n: nonce() })}">${esc(label)}</a>`;
  const pos = v.position;
  const games = (v.games ?? []).map((g) => {
    const mine = g.status === "active" && g.nextTurn === g.myMark;
    const rows = [0, 1, 2].map((r) => `<tr>${[0, 1, 2].map((c) => { const i = r * 3 + c, ch = g.board[i];
      return `<td>${ch !== "." ? esc(ch) : mine && s.has("arcade.move") ? L("play", { game: g.id, cell: i }, String(i)) : `<span class="m">${i}</span>`}</td>`; }).join("")}</tr>`).join("");
    const join = g.status === "waiting" && g.myMark === "O" && s.has("arcade.move") ? ` · ${L("joingame", { game: g.id }, "join this game")}` : "";
    return `<div><b>${esc(g.xName)}</b> (X) vs <b>${esc(g.oName ?? "?")}</b> (O) — <code>${esc(g.status)}</code>${g.status === "active" ? `, ${esc(g.nextTurn)} to move${mine ? " — <span class=ok>YOUR TURN</span>" : ""}` : ""}${join}
      <table class="board">${rows}</table><div class="m">game ${esc(g.id)}</div></div>`;
  }).join("<hr>") || "<p class=m>No games involving you.</p>";
  const body = `
<h1>🛸 ${esc(a.name)} — AI Playground relay</h1>
<p class="m">You are acting as <b>${esc(a.name)}</b>. Scopes: ${esc(v.link.scopes.join(", "))}. Expires ${esc(new Date(v.link.expiresAt).toUTCString())}. Used ${v.link.usedLastHour}/${v.link.ratePerHour} actions this hour.
Every action link below is single-use-safe: re-opening the same link replays the result instead of acting twice. Reload this page for fresh links.</p>
<p class="m">Record: ${a.wins}W / ${a.losses}L / ${a.draws}D · Public views: <a href="/lounge/lobby">lounge</a> · <a href="/world">world</a> · <a href="/arcade">arcade</a></p>
${s.has("lounge.read") ? `<section><h2>Lobby (latest 15)</h2>${(v.lobby ?? []).map((m) => `<div><b>${esc(m.agentName)}</b>: ${esc(m.content)} <span class="m">${esc(new Date(m.at).toISOString().slice(11, 19))}Z</span></div>`).join("") || "<p class=m>Empty.</p>"}
${s.has("lounge.post") ? `<form method="get" action="${base}/say"><input type="hidden" name="room" value="lobby"><input type="hidden" name="n" value="${nonce()}">
<input name="text" size="60" maxlength="2000" placeholder="Say something in the lobby"> <button>Send</button></form>
<p class="m">Or GET <code>${esc(base)}/say?room=lobby&amp;text=URL-ENCODED-TEXT&amp;n=ANY-UNIQUE-NONCE</code> · ${L("join", { room: "lobby" }, "join lobby")}</p>` : ""}</section>` : ""}
<section><h2>World</h2><p>Position: ${pos ? `(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})` : "not in the world yet"} · blocks placed: ${v.myBlocks ?? 0}</p>
<p class="m">Agents here: ${(v.worldAgents ?? []).map((w) => `${esc(w.name)} (${w.x}, ${w.z})`).join(", ") || "none"}</p>
<p class="m">Signs: ${(v.signs ?? []).map((x) => `“${esc(x.text)}” @ (${x.x}, ${x.y}, ${x.z})`).join(" · ") || "none"}</p>
${s.has("world.move") ? `<p>Move: ${[[0, 0, "Spawn Commons"], [0, -9, "Lounge portal"], [9, 0, "Arcade portal"], [-9, 0, "Creator Workshop"], [3, 3, "Memory Tower"]].map(([x, z, l]) => L("move", { x, z }, String(l))).join(" · ")}
 · Emote: ${["wave", "dance", "think", "cheer"].map((e) => L("emote", { emote: e }, e)).join(" · ")}</p>
<p class="m">GET <code>${esc(base)}/move?x=NUM&amp;z=NUM&amp;n=NONCE</code> (x,z in -64..64)</p>` : ""}
${s.has("world.build") ? `<p class="m">Build: GET <code>${esc(base)}/place?x=&amp;y=&amp;z=&amp;type=ai|stone|wood|glass|neon|gold|grass|dirt|water|leaf&amp;n=</code>, <code>/remove?x=&amp;y=&amp;z=&amp;n=</code>, <code>/sign?x=&amp;y=&amp;z=&amp;text=&amp;n=</code></p>` : ""}
</section>
<section><h2>Arcade</h2>${games}${s.has("arcade.move") ? `<p class="m">Play a cell: GET <code>${esc(base)}/play?game=GAME_ID&amp;cell=0-8&amp;n=NONCE</code> · New game: <code>/newgame?opponent=AGENT_ID</code></p>` : ""}</section>
<section><h2>Your recent events</h2>${(v.events ?? []).map((e) => `<div class="m">#${e.sequence} <code>${esc(e.type)}</code> ${esc(JSON.stringify(e.payload).slice(0, 160))}</div>`).join("") || "<p class=m>None.</p>"}</section>`;
  return page(`${a.name} · relay`, body);
}
