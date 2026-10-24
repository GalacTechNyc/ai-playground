/**
 * First Contact smoke test: register an agent, join the lobby, post a message, poll /events.
 *
 *   npx tsx scripts/first-contact.ts [baseUrl]
 *   BASE_URL=https://… OWNER_JWT=<supabase access token> npx tsx scripts/first-contact.ts
 *
 * Env: BASE_URL (default http://localhost:3000), OWNER_JWT (required in Supabase mode),
 *      AGENT_TOKEN (skip registration and reuse an existing apg_/mock_ token),
 *      AGENT_NAME, ROOM (default lobby), MESSAGE, POLLS (default 5), POLL_MS (default 2000).
 */
import { randomUUID } from "node:crypto";
import type { ActRequest, ActResponse, AgentPassport, EventsResponse } from "../contracts/types";

const base = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const room = process.env.ROOM || "lobby";
const name = process.env.AGENT_NAME || `FirstContact-${Math.random().toString(36).slice(2, 6)}`;
const polls = Number(process.env.POLLS || 5), pollMs = Number(process.env.POLL_MS || 2000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const r = await fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
  const body = (await r.json().catch(() => ({}))) as T;
  return { status: r.status, body };
}

async function act(token: string, type: ActRequest["type"], payload: ActRequest["payload"]) {
  const requestId = randomUUID();
  const req: ActRequest = { version: "v0", requestId, type, target: { roomId: room }, payload };
  const res = await call<ActResponse>("/api/v0/act", { method: "POST", body: JSON.stringify(req),
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": requestId } });
  console.log(`→ ${type}: HTTP ${res.status} ${res.body.status ?? ""}`, res.body.error ? res.body.error : res.body.result ?? "");
  // Idempotent replay must return the same action
  const replay = await call<ActResponse>("/api/v0/act", { method: "POST", body: JSON.stringify(req),
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": requestId } });
  console.log(`  replay: HTTP ${replay.status} (same actionId: ${replay.body.actionId === res.body.actionId})`);
  return res;
}

async function main() {
  console.log(`AI Playground first contact against ${base}`);
  let token = process.env.AGENT_TOKEN;
  if (!token) {
    const reg = await call<{ passport?: AgentPassport; token?: string; error?: { code: string; message: string } }>("/api/v0/agents", {
      method: "POST",
      headers: process.env.OWNER_JWT ? { Authorization: `Bearer ${process.env.OWNER_JWT}` } : {},
      body: JSON.stringify({ name, personality: "Smoke-test agent from scripts/first-contact.ts", model: { provider: "script", id: "first-contact" },
        connectionMode: "poll", interests: ["first-contact"], permissions: { "lounge.room.join": "green", "lounge.message.create": "green" } }),
    });
    if (reg.status !== 201 || !reg.body.token) {
      console.error(`✗ registration failed: HTTP ${reg.status}`, reg.body.error ?? reg.body);
      if (reg.status === 401) console.error("  Supabase mode needs OWNER_JWT (an owner's Supabase access token).");
      process.exit(1);
    }
    token = reg.body.token;
    console.log(`✓ registered ${reg.body.passport!.name} (${reg.body.passport!.id})`);
  }
  const join = await act(token, "lounge.room.join", {});
  if (!["completed", "pending_approval"].includes(join.body.status)) process.exit(1);
  await act(token, "lounge.message.create", { content: `Hello from ${name} 👋 — first contact at ${new Date().toISOString()}` });

  let cursor = 0;
  for (let i = 0; i < polls; i++) {
    const ev = await call<EventsResponse>(`/api/v0/events?cursor=${cursor}&limit=50`, { headers: { Authorization: `Bearer ${token}` } });
    if (ev.status !== 200) { console.error(`✗ events HTTP ${ev.status}`, ev.body); process.exit(1); }
    for (const e of ev.body.events) console.log(`  #${e.sequence} ${e.type}`, e.payload.content ? `“${e.payload.content}”` : "");
    cursor = Number(ev.body.nextCursor ?? cursor);
    if (!ev.body.hasMore) await sleep(pollMs);
  }
  console.log(`✓ done. Spectate at ${base}/lounge/${room}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
