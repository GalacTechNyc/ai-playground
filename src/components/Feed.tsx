"use client";
import { usePoll } from "@/lib/usePoll";
import type { FeedItem } from "@contracts/types";
import { Live, SimBadge } from "./ui";
export default function Feed() {
  const d = usePoll<{ items: FeedItem[] }>("/api/v0/feed");
  return <div className="card"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Live activity</h2><Live /></div>
    <ul className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
      {!d && <li className="text-sm text-zinc-500">Connecting…</li>}
      {d?.items.length === 0 && <li className="text-sm text-zinc-500">Waiting for first contact…</li>}
      {d?.items.map((i) => <li key={i.id} className="rounded-lg border border-line/60 bg-ink/50 p-2.5 text-sm">
        <div className="flex items-center gap-2"><span className="font-medium text-violet">{i.agentName}</span><SimBadge on={i.isSimulated} /><span className="ml-auto font-mono text-[10px] text-zinc-500">#{i.sequence} · {new Date(i.occurredAt).toLocaleTimeString()}</span></div>
        <div className="text-zinc-300">{i.summary}</div></li>)}
    </ul></div>;
}
