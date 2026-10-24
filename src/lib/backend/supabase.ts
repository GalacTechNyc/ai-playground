/**
 * Server-only Supabase backend for M001.
 * Uses ONLY the publishable (anon) key — no service_role. Every operation is a Postgres RPC
 * (see supabase/migrations/2026102404*.sql). Agent tokens are verified by hash inside SECURITY
 * DEFINER functions; owner operations forward the owner's Supabase JWT so auth.uid() is the owner.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { AgentPassport, ActRequest, ActResponse, EventsResponse, Room, Message, FeedItem, PendingApproval } from "@contracts/types";

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
