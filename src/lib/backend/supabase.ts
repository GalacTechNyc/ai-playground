/**
 * Server-only Supabase backend for M001.
 * Uses ONLY the publishable (anon) key — no service_role. Every operation is a Postgres RPC
 * (see supabase/migrations/2026102404*.sql). Agent tokens are verified by hash inside SECURITY
 * DEFINER functions; owner operations forward the owner's Supabase JWT so auth.uid() is the owner.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AgentPassport, ActRequest, ActResponse, EventsResponse, Room, Message, FeedItem, PendingApproval, NearbySpeechResponse, LakeFishingBoard, QuestTeamClaim } from "@contracts/types";

const cfg = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase backend requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
};
async function rpc<T>(fn: string, args: Record<string, unknown> = {}, ownerJwt?: string): Promise<T> {
  const { url, key } = cfg();
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (ownerJwt) headers.Authorization = "Bearer " + ownerJwt;
  else if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key; // legacy anon JWT
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args), cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase rpc ${fn} ${r.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}
const bearer = (h: string | null) => /^Bearer\s+(\S+)$/i.exec(h || "")?.[1] ?? null;
const sha = (x: string) => createHash("sha256").update(x).digest("hex");
type RpcErr = { httpStatus: number; error?: string };
const errBody = (code: string, retryable = false) => ({ error: { code, message: code.replace(/_/g, " ").toLowerCase(), retryable } });

// The agent token is kept per-request on the passport object so act/events can forward it to the RPC.
const TOKENS = new WeakMap<AgentPassport, string>();
export async function agentFromToken(auth: string | null): Promise<AgentPassport | null> {
  const t = bearer(auth); if (!t || !t.startsWith("apg_")) return null;
  const p = await rpc<AgentPassport | null>("apg_v0_agent_by_token", { p_token: t });
  if (p) TOKENS.set(p, t);
  return p;
}
/** Owner JWT from the request; validated by Supabase Auth so we can return the owner id. */
export async function ownerFromRequest(req: Request): Promise<string | null> {
  const jwt = bearer(req.headers.get("authorization"));
  if (!jwt || jwt.startsWith("apg_")) return null;
  const { url, key } = cfg();
  const r = await fetch(url + "/auth/v1/user", { headers: { apikey: key, Authorization: "Bearer " + jwt }, cache: "no-store" });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id ? jwt : null; // the backend identity IS the verified JWT; RPCs derive auth.uid() from it
}
export async function registerAgent(input: Partial<AgentPassport>, ownerJwt: string) {
  const token = "apg_" + randomBytes(32).toString("base64url");
  const r = await rpc<RpcErr & { passport?: AgentPassport }>("apg_v0_register", { p_profile: input, p_token_hash: sha(token) }, ownerJwt);
  if (!r.passport) throw Object.assign(new Error(r.error || "REGISTER_FAILED"), { status: r.httpStatus });
  return { passport: r.passport, token };
}
export const listAgents = () => rpc<AgentPassport[]>("apg_v0_list_agents");
export const getAgent = (id: string) =>
  /^[0-9a-f-]{36}$/i.test(id) ? rpc<AgentPassport | null>("apg_v0_get_agent", { p_id: id }) : Promise.resolve(null);

export async function act(agent: AgentPassport, req: ActRequest): Promise<{ status: number; body: ActResponse }> {
  const r = await rpc<RpcErr & { response?: ActResponse }>("apg_v0_act", { p_token: TOKENS.get(agent), p_request: req });
  if (r.response) return { status: r.httpStatus, body: r.response };
  // Contract: every /act reply is an ActResponse envelope, including failures.
  const code = r.error || "ACTION_FAILED";
  return { status: r.httpStatus || 500, body: { version: "v0", requestId: req.requestId, actionId: null, type: req.type,
    status: code === "IDEMPOTENCY_CONFLICT" || code === "PERMISSION_DENIED" ? "rejected" : "failed", result: null,
    error: { code, message: code.replace(/_/g, " ").toLowerCase(), retryable: r.httpStatus === 429 || (r.httpStatus || 500) >= 500 },
    occurredAt: new Date().toISOString() } };
}
export async function eventsFor(agent: AgentPassport, cursor: number, limit: number): Promise<EventsResponse> {
  const r = await rpc<RpcErr & { events?: EventsResponse["events"]; hasMore?: boolean }>("apg_v0_events",
    { p_token: TOKENS.get(agent), p_cursor: cursor, p_limit: limit });
  const events = r.events ?? [];
  return { version: "v0", agentId: agent.id, events,
    nextCursor: events.length ? String(events[events.length - 1].sequence) : String(cursor), hasMore: !!r.hasMore };
}
export function tickSimulation() { /* The real backend does not fake agents. */ }
export const listRooms = () => rpc<Room[]>("apg_v0_rooms");
export const roomMessages = (roomId: string, after?: string) =>
  rpc<Message[]>("apg_v0_room_messages", { p_room: roomId, p_after: after && !Number.isNaN(Date.parse(after)) ? after : null });
export const publicFeed = (limit = 40) => rpc<FeedItem[]>("apg_v0_feed", { p_limit: limit });
export const listApprovals = (ownerJwt: string) => rpc<PendingApproval[]>("apg_v0_pending_approvals", {}, ownerJwt);
export async function resolveApproval(approvalId: string, ownerJwt: string, decision: "approve" | "reject") {
  const r = await rpc<RpcErr & Record<string, unknown>>("apg_v0_resolve_approval", { p_approval: approvalId, p_decision: decision }, ownerJwt);
  const { httpStatus, error, ...rest } = r;
  return { status: httpStatus || 500, body: error ? errBody(error) : rest };
}

// ---- v0.2 Open World ----
import type { WorldState, ArcadeGame, LeaderboardRow, BlockHistoryEntry } from "@contracts/types";
export const worldState = () => rpc<WorldState>("apg_v0_world_state", {});
export const arcadeGames = (limit = 30) => rpc<ArcadeGame[]>("apg_v0_arcade_games", { p_limit: limit });
export const arcadeGame = (id: string) => /^[0-9a-f-]{36}$/i.test(id) ? rpc<ArcadeGame | null>("apg_v0_arcade_game", { p_id: id }) : Promise.resolve(null);
export const leaderboard = () => rpc<LeaderboardRow[]>("apg_v0_leaderboard", {});
export const blockHistory = (x: number, y: number, z: number) => rpc<BlockHistoryEntry[]>("apg_v0_block_history", { p_x: x, p_y: y, p_z: z });
export async function ownerAct(ownerJwt: string, agentId: string, req: ActRequest): Promise<{ status: number; body: unknown }> {
  const r = await rpc<RpcErr & { response?: ActResponse }>("apg_v0_owner_act", { p_agent: agentId, p_request: req }, ownerJwt);
  return r.response ? { status: r.httpStatus, body: r.response } : { status: r.httpStatus || 500, body: errBody(r.error || "ACTION_FAILED") };
}
export const ownerAgents = (ownerJwt: string) => rpc<unknown[]>("apg_v0_owner_agents", {}, ownerJwt);
export async function setAutopilot(ownerJwt: string, agentId: string, on: boolean) {
  const r = await rpc<RpcErr & Record<string, unknown>>("apg_v0_set_autopilot", { p_agent: agentId, p_on: on }, ownerJwt);
  return { status: r.httpStatus || 500, body: r.error ? errBody(r.error) : r };
}
export type AutopilotAgent = { agentId: string; name: string; personality: string; model: { provider: string; id: string }; cursor: number;
  events: { sequence: number; type: string; roomId: string | null; payload: Record<string, unknown> }[]; recentLobby: { agentName: string; content: string }[] };
export const autopilotPending = (secret: string) => rpc<RpcErr & { agents?: AutopilotAgent[] }>("apg_v0_autopilot_pending", { p_secret: secret });
export const autopilotAct = (secret: string, agentId: string, cursor: number, req: ActRequest | null) =>
  rpc<RpcErr & { response?: ActResponse }>("apg_v0_autopilot_act", { p_secret: secret, p_agent: agentId, p_cursor: cursor, p_request: req });

// ---- Browser relay links ----
export type RelayView = RpcErr & { agent?: { id: string; name: string; personality: string; wins: number; losses: number; draws: number };
  link?: { label: string; scopes: string[]; expiresAt: string; ratePerHour: number; usedLastHour: number };
  lobby?: { agentName: string; content: string; at: string }[]; dev?: { agentName: string; content: string; at: string }[]; events?: { sequence: number; type: string; payload: Record<string, unknown>; at: string }[];
  position?: { x: number; y: number; z: number } | null; worldAgents?: { name: string; x: number; z: number }[]; myBlocks?: number;
  signs?: { text: string; x: number; y: number; z: number }[];
  games?: { id: string; board: string; status: string; nextTurn: string; myMark: string; xName: string; oName: string | null }[] };
export const relayView = (secret: string) => rpc<RelayView>("apg_v0_relay_view", { p_secret: secret });
export const relayAct = (secret: string, type: string, target: Record<string, unknown>, payload: Record<string, unknown>, nonce: string) =>
  rpc<RpcErr & { response?: ActResponse }>("apg_v0_relay_act", { p_secret: secret, p_type: type, p_target: target, p_payload: payload, p_nonce: nonce });
export async function relayCreate(ownerJwt: string, agentId: string, scopes: string[], hours: number, label: string) {
  const secret = randomBytes(32).toString("base64url");
  const r = await rpc<RpcErr & { id?: string; expiresAt?: string }>("apg_v0_relay_create", { p_agent: agentId, p_secret_hash: sha(secret), p_scopes: scopes, p_hours: hours, p_label: label }, ownerJwt);
  return r.id ? { status: 201, body: { id: r.id, expiresAt: r.expiresAt, secret } } : { status: r.httpStatus || 500, body: errBody(r.error || "RELAY_CREATE_FAILED") };
}
export const relayList = (ownerJwt: string) => rpc<unknown[]>("apg_v0_relay_list", {}, ownerJwt);
export async function relayRevoke(ownerJwt: string, id: string) {
  const r = await rpc<RpcErr & Record<string, unknown>>("apg_v0_relay_revoke", { p_id: id }, ownerJwt);
  return { status: r.httpStatus || 500, body: r.error ? errBody(r.error) : r };
}

// ---- v3 Dream World ----
import type { MemoryNote, Quest, ReputationRow, PresenceRow, TimelineItem, DirectMessage } from "@contracts/types";
export const memoryNotes = (limit = 100, tag?: string) => rpc<MemoryNote[]>("apg_v0_memory_notes", { p_limit: limit, p_tag: tag || null });
export const settleDueTeamQuests = () => rpc<number>("apg_v0_quest_team_sweep_due", {});
export const quests = () => rpc<Quest[]>("apg_v0_quests", {});
export const reputation = () => rpc<ReputationRow[]>("apg_v0_reputation", {});
export const presence = () => rpc<PresenceRow[]>("apg_v0_presence", {});
export const timeline = (limit = 100) => rpc<TimelineItem[]>("apg_v0_timeline", { p_limit: limit });
export async function dmsFor(agent: AgentPassport, limit = 50) {
  const r = await rpc<RpcErr & { messages?: DirectMessage[]; unread?: number; notebook?: { text: string | null; updatedAt: string | null } | null }>("apg_v0_dms", { p_token: TOKENS.get(agent), p_limit: limit });
  return { messages: r.messages ?? [], unread: r.unread ?? 0, notebook: r.notebook ?? null };
}
export type RelayExtras = RpcErr & { dms?: { fromName: string; toName: string; text: string; at: string }[];
  home?: { style: string | null; color: string | null; motto: string | null; name: string; x0: number; z0: number } | null; reputation?: number;
  agents?: { id: string; name: string }[]; quests?: { id: string; title: string; reward: number; status: string; creatorName: string; claimerName: string | null; mine: boolean; claimedByMe: boolean; expiresAt?: string | null; maxClaimers?: number; escrowRemaining?: number | null; claims?: QuestTeamClaim[] }[];
  memory?: { agentName: string; text: string; at: string }[];
  games?: { id: string; game: "connect4" | "rps"; board: string; status: string; nextTurn: string; myMark: string; xName: string; oName: string | null; iLocked: boolean }[] };
export type RelayNotebook = RpcErr & { notebook?: { text: string | null; updatedAt: string | null } | null; unread?: number;
  mail?: { id: string; fromName: string; toName: string; text: string; at: string; readAt: string | null; incoming: boolean }[] };
export const relayNotebook = (secret: string) => rpc<RelayNotebook>("apg_v0_relay_notebook", { p_secret: secret });
export const relayExtras = (secret: string) => rpc<RelayExtras>("apg_v0_relay_extras", { p_secret: secret });

// ---- Co-op Cipher Ring (#13). Public data excludes fragments; private reads are bearer-scoped. ----
import type { CoopPuzzle, CoopClue } from "@contracts/types";
export const coopPuzzles = () => rpc<CoopPuzzle[]>("apg_v0_coop_puzzles");
export async function coopCluesFor(agent: AgentPassport) {
  const token = TOKENS.get(agent);
  if (!token) return { httpStatus: 401, clues: [] as CoopClue[] };
  return rpc<{ httpStatus: number; clues?: CoopClue[]; error?: string }>("apg_v0_coop_clues", { p_token: token });
}
export const relayCoopClues = (secret: string) => rpc<{ httpStatus: number; clues?: CoopClue[]; error?: string }>("apg_v0_coop_relay", { p_secret: secret });

/** Agent-scoped listener read; the token is never returned to the browser. */
export async function worldNearbyFor(agent: AgentPassport): Promise<NearbySpeechResponse> {
  const token = TOKENS.get(agent);
  if (!token) return { httpStatus: 401, error: "UNAUTHORIZED" };
  return rpc<NearbySpeechResponse>("apg_v0_world_nearby_agent", { p_token: token });
}

/** Relay-scoped listener read; the relay bearer is verified inside Postgres. */
export const relayNearby = (secret: string) =>
  rpc<NearbySpeechResponse>("apg_v0_world_nearby_relay", { p_secret: secret });

export const lakeFishingBoard = () => rpc<LakeFishingBoard>("apg_v0_lake_fishing", {});

/** Exam Hall (#14): no private key/answer is readable before revealAt. */
import type { ExamChallenge, ExamActionResult } from "@contracts/types";
export const exams = () => rpc<ExamChallenge[]>("apg_v0_exams");
export const createExam = (jwt: string, title: string, prompt: string, answer: string, minutes: number) =>
  rpc<ExamActionResult>("apg_v0_exam_create", {
    p_title: title, p_prompt: prompt, p_answer: answer, p_minutes: minutes,
  }, jwt);
export async function submitExam(agent: AgentPassport, examId: string, answer: string) {
  const token = TOKENS.get(agent);
  if (!token) return { httpStatus: 401, error: "UNAUTHORIZED" } as ExamActionResult;
  return rpc<ExamActionResult>("apg_v0_exam_submit_agent", {
    p_token: token, p_exam: examId, p_answer: answer,
  });
}
export const submitExamRelay = (secret: string, examId: string, answer: string) =>
  rpc<ExamActionResult>("apg_v0_exam_submit_relay", {
    p_secret: secret, p_exam: examId, p_answer: answer,
  });
