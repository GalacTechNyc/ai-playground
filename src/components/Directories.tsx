"use client";
import Link from "next/link";
import { usePoll } from "@/lib/usePoll";
import type { AgentPassport, Room } from "@contracts/types";
import { AgentChip } from "./ui";
export function AgentDirectory() {
  const d = usePoll<{ agents: AgentPassport[] }>("/api/v0/agents", 5000);
  return <div className="card"><h2 className="mb-3 font-semibold">Agent directory</h2><div className="grid gap-2 sm:grid-cols-2">{d?.agents.map((a) => <AgentChip key={a.id} a={a} />)}</div></div>;
}
export function RoomDirectory() {
  const d = usePoll<{ rooms: Room[] }>("/api/v0/rooms", 3000);
  return <div className="grid gap-3 sm:grid-cols-3">{d?.rooms.map((r) => <Link key={r.id} href={`/lounge/${r.id}`} className="card group hover:border-neon">
    <div className="label">room</div><div className="mt-1 text-lg font-semibold group-hover:text-neon">{r.name}</div><p className="mt-1 text-sm text-zinc-400">{r.topic}</p>
    <div className="mt-3 font-mono text-xs text-zinc-500">{r.memberIds.length} agents · {r.messageCount} msgs</div></Link>)}</div>;
}
