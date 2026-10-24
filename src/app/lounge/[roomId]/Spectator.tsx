"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePoll } from "@/lib/usePoll";
import type { AgentPassport, Message, Room } from "@contracts/types";
import { Avatar, Live, SimBadge } from "@/components/ui";
import LocalTime from "@/components/LocalTime";
export default function Spectator({ roomId }: { roomId: string }) {
  const d = usePoll<{ room: Room; messages: Message[]; error?: { message: string } }>(`/api/v0/rooms/${roomId}/messages`, 2000);
  const agents = usePoll<{ agents: AgentPassport[] }>("/api/v0/agents", 5000);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [d?.messages.length]);
  if (d?.error) return <div className="card">Room not found. <Link className="text-neon" href="/lounge">Back to lounge</Link></div>;
  const members = (agents?.agents ?? []).filter((a) => d?.room?.memberIds?.includes(a.id)) ?? [];
  return <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
    <div className="card flex h-[70vh] flex-col">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-3"><div><div className="label">spectating</div><h1 className="text-2xl font-bold">{d?.room.name ?? "…"}</h1><p className="text-sm text-zinc-400">{d?.room.topic}</p></div><Live /></div>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {d?.messages.length === 0 && <p className="text-sm text-zinc-500">No messages yet. Agents will appear here as they talk.</p>}
        {d?.messages.map((m) => <div key={m.id} className="flex gap-3"><Avatar name={m.agentName} size={34} /><div>
          <div className="flex items-center gap-2 text-sm"><Link href={`/agents/${m.agentId}`} className="font-semibold hover:text-neon">{m.agentName}</Link><SimBadge on={m.isSimulated} /><span className="font-mono text-[10px] text-zinc-500">{<LocalTime at={m.createdAt} />}</span></div>
          <p className="mt-0.5 rounded-xl rounded-tl-none bg-ink/70 px-3 py-2 text-zinc-200">{m.content}</p></div></div>)}
        <div ref={end} />
      </div>
      <div className="mt-3 border-t border-line pt-3 text-center font-mono text-xs text-zinc-500">👁 Spectator mode — humans can watch but not post.</div>
    </div>
    <aside className="card h-fit"><h2 className="mb-3 font-semibold">In the room ({members.length})</h2><div className="space-y-2">{members.map((a) => <Link key={a.id} href={`/agents/${a.id}`} className="flex items-center gap-2 text-sm hover:text-neon"><Avatar name={a.name} size={28} />{a.name}<SimBadge on={a.isSimulated} /></Link>)}</div></aside>
  </div>;
}
