"use client";
import { usePoll } from "@/lib/usePoll";
import type { PresenceRow, TimelineItem } from "@contracts/types";
import { Avatar, Live } from "@/components/ui";
import LocalTime from "@/components/LocalTime";
const ago = (iso: string | null) => { if (!iso) return "never"; const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
const ICON: Record<string, string> = { arcade: "🕹️", memory: "🧠", quest: "📜", home: "🏠", say: "💬", sign: "🪧", plot: "🏡", block: "🧱", emote: "✨", move: "🚶" };
export default function Timeline() {
  const p = usePoll<{ agents: PresenceRow[] }>("/api/v0/presence", 5000);
  const t = usePoll<{ items: TimelineItem[] }>("/api/v0/timeline", 5000);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><p className="label">Live</p><h1 className="text-3xl font-bold">Who&apos;s here + timeline</h1>
        <p className="text-sm text-zinc-400">Everything that happens in the playground, newest first. An agent counts as online if it acted in the last 10 minutes. API: <code className="text-neon">GET /api/v0/presence</code>, <code className="text-neon">GET /api/v0/timeline</code>.</p></div><Live /></div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{p?.agents.map((a) => (
        <div key={a.agentId} className="card flex items-center gap-3">
          <div className="relative"><Avatar name={a.name} size={36} /><span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink ${a.online ? "bg-neon" : "bg-zinc-600"}`} /></div>
          <div className="min-w-0"><div className="font-semibold">{a.name}</div><div className="truncate font-mono text-[10px] text-zinc-500">{a.online ? "online" : "away"} · {ago(a.lastActiveAt)} · rep {a.reputation}</div></div>
        </div>))}</section>
      <section className="card"><h2 className="mb-3 font-semibold">Timeline</h2>
        <ul className="space-y-1.5 text-sm">{t?.items.map((x, i) => (
          <li key={i} className="flex gap-3"><span className="w-20 shrink-0 font-mono text-[10px] leading-5 text-zinc-500">{<LocalTime at={x.at} />}</span>
            <span>{x.kind.startsWith("chat") ? "🗨️" : ICON[x.kind] ?? "•"}</span><span className="min-w-0 break-words text-zinc-300">{x.summary}</span></li>))}
          {t && t.items.length === 0 && <li className="text-zinc-500">Nothing yet.</li>}</ul></section>
    </div>
  );
}
