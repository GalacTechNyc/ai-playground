// In-memory MOCK of the v0.2 world + arcade (mirrors supabase/migrations/20261024050000+ rules, simplified).
import { randomUUID } from "crypto";
import type { ActRequest, ActResponse, AgentPassport, ArcadeGame, BlockType, LeaderboardRow, WorldState } from "@contracts/types";
import { BLOCK_TYPES, DEFAULT_PERMISSIONS } from "@contracts/types";

type G = { pos: Map<string, { x: number; y: number; z: number; emote: string | null; emoteAt: number; at: string }>;
  blocks: Map<string, { x: number; y: number; z: number; blockType: BlockType; placedBy: string | null }>;
  plots: Map<string, { x0: number; z0: number; name: string }>; signs: { id: string; x: number; y: number; z: number; text: string; agentId: string }[];
  log: { id: number; kind: string; agentId: string; summary: string; at: string }[]; games: Map<string, ArcadeGame>;
  rec: Map<string, { wins: number; losses: number; draws: number }>; done: Map<string, { hash: string; res: ActResponse; code: number }>; n: number };
const g = globalThis as unknown as { __pgw?: G };
const w = (): G => (g.__pgw ??= { pos: new Map(), blocks: new Map(), plots: new Map(), signs: [], log: [], games: new Map(), rec: new Map(), done: new Map(), n: 0 });
const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
class E extends Error { constructor(public status: number, public code: string) { super(code); } }
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const rec = (id: string) => { const s = w(); if (!s.rec.has(id)) s.rec.set(id, { wins: 0, losses: 0, draws: 0 }); return s.rec.get(id)!; };
const log = (kind: string, a: AgentPassport, summary: string) => { const s = w(); s.log.push({ id: ++s.n, kind, agentId: a.id, summary: `${a.name} ${summary}`, at: new Date().toISOString() }); if (s.log.length > 200) s.log.shift(); };

function exec(a: AgentPassport, type: string, p: Record<string, unknown>, names: (id: string) => string): Record<string, unknown> {
  const s = w(); const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (type === "world.move") {
    if (!num(p.x) || !num(p.z) || Math.abs(p.x as number) > 64 || Math.abs(p.z as number) > 64) throw new E(400, "OUT_OF_BOUNDS");
    const prev = s.pos.get(a.id); s.pos.set(a.id, { x: p.x as number, y: (p.y as number) ?? 0, z: p.z as number, emote: prev?.emote ?? null, emoteAt: prev?.emoteAt ?? 0, at: new Date().toISOString() });
    log("move", a, `moved to (${Math.round(p.x as number)}, ${Math.round(p.z as number)})`); return { agentId: a.id, x: p.x, y: p.y ?? 0, z: p.z };
  }
  if (type === "world.emote") {
    if (typeof p.emote !== "string" || !p.emote || p.emote.length > 16) throw new E(400, "INVALID_EMOTE");
    const cur = s.pos.get(a.id) ?? { x: 0, y: 0, z: 0, emote: null, emoteAt: 0, at: new Date().toISOString() };
    s.pos.set(a.id, { ...cur, emote: p.emote, emoteAt: Date.now() }); log("emote", a, p.emote); return { emote: p.emote };
  }
  if (type === "world.block.place" || type === "world.block.remove") {
    if (![p.x, p.y, p.z].every(num)) throw new E(400, "INVALID_PAYLOAD");
    const [x, y, z] = [p.x, p.y, p.z].map((v) => Math.round(v as number));
    if (x < -64 || x > 63 || z < -64 || z > 63 || y < 0 || y > 31) throw new E(400, "OUT_OF_BOUNDS");
    for (const [id, pl] of s.plots) if (id !== a.id && x >= pl.x0 && x < pl.x0 + 8 && z >= pl.z0 && z < pl.z0 + 8) throw new E(403, "PLOT_OWNED_BY_ANOTHER_AGENT");
    if (type === "world.block.place") {
      if (!BLOCK_TYPES.includes(p.blockType as BlockType)) throw new E(400, "INVALID_BLOCK_TYPE");
      if (s.blocks.has(k(x, y, z))) throw new E(409, "BLOCK_OCCUPIED");
      s.blocks.set(k(x, y, z), { x, y, z, blockType: p.blockType as BlockType, placedBy: a.id }); log("block.place", a, `placed a ${p.blockType} block`);
    } else { const b = s.blocks.get(k(x, y, z)); if (!b) throw new E(404, "NO_BLOCK"); s.blocks.delete(k(x, y, z)); log("block.remove", a, `removed a ${b.blockType} block`); }
    return { x, y, z, change: type === "world.block.place" ? "placed" : "removed" };
  }
  if (type === "world.plot.claim") {
    if (!num(p.x) || !num(p.z)) throw new E(400, "INVALID_PAYLOAD");
    const x0 = Math.floor((p.x as number) / 8) * 8, z0 = Math.floor((p.z as number) / 8) * 8;
    if (x0 + 8 > -12 && x0 < 12 && z0 + 8 > -12 && z0 < 12) throw new E(409, "SPAWN_COMMONS_IS_SHARED");
    for (const [id, pl] of s.plots) if (id !== a.id && pl.x0 === x0 && pl.z0 === z0) throw new E(409, "PLOT_TAKEN");
    s.plots.set(a.id, { x0, z0, name: String(p.name || `${a.name}'s plot`).slice(0, 40) }); log("plot", a, `claimed a plot at (${x0}, ${z0})`); return { plot: { x0, z0, size: 8 } };
  }
  if (type === "world.sign.place") {
    if (typeof p.text !== "string" || !p.text.trim() || p.text.length > 40 || !num(p.x) || !num(p.z)) throw new E(400, "INVALID_PAYLOAD");
    const sign = { id: randomUUID(), x: p.x as number, y: (p.y as number) ?? 0, z: p.z as number, text: p.text.trim(), agentId: a.id }; s.signs.push(sign); log("sign", a, `put up a sign: “${sign.text}”`); return sign;
  }
  // arcade
  let gm: ArcadeGame | undefined;
  if (type === "arcade.game.create") {
    const opp = p.opponentAgentId as string | undefined;
    if (opp === a.id) throw new E(400, "CANNOT_PLAY_SELF");
    gm = { id: randomUUID(), game: "tictactoe", board: ".........", nextTurn: "X", status: "waiting", xAgentId: a.id, xName: a.name, oAgentId: opp ?? null, oName: opp ? names(opp) : null, winnerAgentId: null, moves: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    s.games.set(gm.id, gm); log("arcade", a, "opened a tic-tac-toe table");
  } else {
    gm = s.games.get(String(p.gameId)); if (!gm) throw new E(404, "GAME_NOT_FOUND");
    if (type === "arcade.game.join") {
      if (gm.xAgentId === a.id) throw new E(400, "CANNOT_PLAY_SELF"); if (gm.status !== "waiting") throw new E(409, "GAME_NOT_JOINABLE");
      if (gm.oAgentId && gm.oAgentId !== a.id) throw new E(403, "SEAT_RESERVED");
      gm.oAgentId = a.id; gm.oName = a.name; gm.status = "active"; log("arcade", a, "joined a tic-tac-toe game");
    } else {
      if (gm.status !== "active") throw new E(409, "GAME_NOT_ACTIVE");
      const mark = a.id === gm.xAgentId ? "X" : a.id === gm.oAgentId ? "O" : null; if (!mark) throw new E(403, "NOT_A_PLAYER");
      if (mark !== gm.nextTurn) throw new E(409, "NOT_YOUR_TURN");
      const cell = p.cell as number; if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new E(400, "INVALID_CELL");
      if (gm.board[cell] !== ".") throw new E(409, "CELL_TAKEN");
      gm.board = gm.board.slice(0, cell) + mark + gm.board.slice(cell + 1); gm.nextTurn = mark === "X" ? "O" : "X";
      gm.moves.push({ agentId: a.id, mark, cell, at: new Date().toISOString() });
      const win = LINES.find(([i, j, l]) => gm!.board[i] !== "." && gm!.board[i] === gm!.board[j] && gm!.board[j] === gm!.board[l]);
      if (win) { gm.status = mark === "X" ? "x_won" : "o_won"; gm.winnerAgentId = a.id; rec(a.id).wins++; rec(mark === "X" ? gm.oAgentId! : gm.xAgentId).losses++; }
      else if (!gm.board.includes(".")) { gm.status = "draw"; rec(gm.xAgentId).draws++; rec(gm.oAgentId!).draws++; }
      log("arcade", a, `played cell ${cell}${win ? " and WON 🏆" : gm.status === "draw" ? " — draw" : ""}`);
    }
  }
  gm.updatedAt = new Date().toISOString();
  return { gameId: gm.id, board: gm.board, status: gm.status, nextTurn: gm.nextTurn, xAgentId: gm.xAgentId, oAgentId: gm.oAgentId, winnerAgentId: gm.winnerAgentId };
}

export function mockWorldAct(a: AgentPassport, req: ActRequest, names: (id: string) => string): { status: number; body: ActResponse } {
  const s = w(); const key = `${a.id}:${req.requestId}`; const hash = JSON.stringify([req.type, req.payload]); const prior = s.done.get(key);
  const base = { version: "v0" as const, requestId: req.requestId, type: req.type, occurredAt: new Date().toISOString() };
  if (prior) return prior.hash === hash ? { status: 200, body: prior.res } : { status: 409, body: { ...base, actionId: null, status: "rejected", result: null, error: { code: "IDEMPOTENCY_CONFLICT", message: "requestId reused", retryable: false } } };
  const actionId = randomUUID(); let out: { status: number; body: ActResponse };
  const perms = a.permissions as Record<string, string>; const level = perms[req.type] ?? DEFAULT_PERMISSIONS[req.type];
  if (level === "red") out = { status: 403, body: { ...base, actionId, status: "rejected", result: null, error: { code: "PERMISSION_DENIED", message: "Action not permitted", retryable: false } } };
  else try { out = { status: 201, body: { ...base, actionId, status: "completed", result: exec(a, req.type, req.payload as Record<string, unknown>, names), error: null } }; }
  catch (e) { if (!(e instanceof E)) throw e; out = { status: e.status, body: { ...base, actionId, status: "failed", result: null, error: { code: e.code, message: e.code.toLowerCase().replace(/_/g, " "), retryable: e.status === 429 } } }; }
  s.done.set(key, { hash, res: out.body, code: out.status }); return out;
}

export function mockWorldState(names: (id: string) => string): WorldState {
  const s = w();
  return {
    agents: [...s.pos].map(([id, p]) => ({ agentId: id, name: names(id), x: p.x, y: p.y, z: p.z, emote: Date.now() - p.emoteAt < 30000 ? p.emote : null, isSimulated: false, updatedAt: p.at })),
    blocks: [...s.blocks.values()], plots: [...s.plots].map(([id, p]) => ({ agentId: id, agentName: names(id), size: 8, ...p })), signs: s.signs,
    activity: s.log.slice(-30).reverse(), spawn: { name: "Spawn Commons", min: -11, max: 11 },
    bounds: { min: -64, max: 63, height: 32, chunk: 16, plotSize: 8 }, serverTime: new Date().toISOString(),
  };
}
export const mockGames = () => [...w().games.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const mockGame = (id: string) => w().games.get(id) ?? null;
export const mockLeaderboard = (names: (id: string) => string): LeaderboardRow[] =>
  [...w().rec].map(([id, r]) => ({ agentId: id, name: names(id), ...r, played: r.wins + r.losses + r.draws, isSimulated: false })).sort((a, b) => b.wins - a.wins || b.draws - a.draws);
export const mockBlockHistory = () => [];
