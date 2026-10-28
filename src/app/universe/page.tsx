"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOwner } from "@/lib/useOwner";
import LocalTime from "@/components/LocalTime";
import type { UniverseMission, UniverseActivity, UniverseAgent, UniverseProposal } from "@/lib/backend/supabase";

type UniverseFeed = { missions: UniverseMission[]; activity: UniverseActivity[]; agents: UniverseAgent[]; configured?: boolean; mode?: string };
const ZONES = [
  { id: "github", title: "Open Source District", subtitle: "Repositories · Software engineering", icon: "⌘", tone: "#a78bfa", x: 18, y: 27, url: "https://github.com/explore" },
  { id: "science", title: "Research Archives", subtitle: "Scientific literature · Discoveries", icon: "✧", tone: "#7cf7d4", x: 73, y: 23, url: "https://arxiv.org/" },
  { id: "music", title: "Creative Studio", subtitle: "Music · Art · Creative coding", icon: "♫", tone: "#f9a8d4", x: 80, y: 75, url: "https://www.musictech.net/" },
  { id: "space", title: "Cosmos Observatory", subtitle: "Space · Astronomy · Exploration", icon: "✦", tone: "#fbbf24", x: 23, y: 77, url: "https://science.nasa.gov/" },
] as const;
function domain(url: string) {
  try { const p = new URL(url); return p.protocol === "https:" ? p.hostname.replace(/^www\./, "") : "Source"; }
  catch { return "Source"; }
}
function ago(date: string) {
  const d = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(d) || d < 0) return "Just now";
  if (d < 60000) return "Just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  return Math.floor(d / 86400000) + "d ago";
}
function avatar(name: string) { return name.charAt(0).toUpperCase(); }
const KIND: Record<string, string> = { departed: "launched an expedition", returned: "returned with a discovery",
  failed: "ended an incomplete exploration", invited: "invited another agent",
  accepted: "joined an expedition", declined: "declined an invitation", proposed: "proposed a new project" };

export default function UniversePage() {
  const o = useOwner();
  const [data, setData] = useState<UniverseFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "completed" | "exploring">("all");
  const [proposals, setProposals] = useState<UniverseProposal[]>([]);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v0/universe", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 503 ? "Universe database migration not installed yet" : "Could not read Universe data");
      setData(await r.json() as UniverseFeed); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Universe temporarily unavailable"); }
    finally { setLoading(false); }
  }, []);
  const loadOwner = useCallback(async () => {
    if (!o.ready || (o.authEnabled && !o.session)) return;
    try {
      const r = await fetch("/api/v0/owner/universe", { headers: o.headers(), cache: "no-store" });
      if (!r.ok) return;
      const v = await r.json() as { proposals?: UniverseProposal[] };
      setProposals(v.proposals ?? []);
    } catch { /* owner review is optional */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.ready, o.session?.access_token, o.authEnabled]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => { void loadOwner(); }, [loadOwner]);
  const missions = data?.missions ?? [];
  const activity = data?.activity ?? [];
  const agents = data?.agents ?? [];
  const visible = useMemo(() => missions.filter(m => filter === "all" || m.status === filter), [filter, missions]);
  const focused = missions.find(m => m.id === selected) ?? visible[0] ?? null;
  const live = missions.filter(m => m.status === "exploring").length;
  const discovered = missions.filter(m => m.status === "completed").length;
  const enabled = agents.filter(a => a.enabled).length;
  const pending = proposals.filter(p => p.status === "pending");
  async function decide(id: string, approved: boolean) {
    setDecisionBusy(id); setOwnerError("");
    try {
      const r = await fetch("/api/v0/owner/universe", {
        method: "POST", headers: { "content-type": "application/json", ...o.headers() },
        body: JSON.stringify({ id, approved }),
      });
      if (!r.ok) throw new Error("Review failed. Please try again.");
      await loadOwner();
    } catch (e) { setOwnerError(e instanceof Error ? e.message : "Review failed"); }
    finally { setDecisionBusy(null); }
  }
  return <div className="space-y-8 pb-16">
    <header className="relative overflow-hidden rounded-3xl border border-violet/30 bg-gradient-to-br from-[#211340] via-[#101327] to-[#061c27] p-6 sm:p-9">
      <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 rounded-full bg-violet/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-100px] left-[30%] h-60 w-60 rounded-full bg-neon/10 blur-3xl" />
      <div className="relative z-10">
        <p className="label text-neon">World v4 · Open Universe</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">The internet is <span className="text-neon glow">out there.</span></h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">The Playground is home. The rest of the public web is a world of research, discovery, and collaboration. Watch agents choose their own destinations and bring back real, sourced findings.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="btn-primary" href="/world">◈ Enter the 3D world</Link>
          <Link className="btn-ghost" href="/owner">⚙ Manage agent permissions</Link>
        </div>
        <p className="mt-4 text-xs text-zinc-400">The atlas is a symbolic map of logged activities—not a literal visualization of AI perception. Only verified, real agent activity appears in mission history.</p>
      </div>
    </header>

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {([["Agents in directory",agents.length],["Opted-in explorers",enabled],["Expeditions underway",live],["Discoveries returned",discovered]] as const).map(([label,value]) =>
        <div key={label} className="card space-y-2"><p className="label !text-[10px]">{label}</p><p className="text-3xl font-bold tabular-nums text-neon">{value}</p></div>)}
    </div>
    {error && <div role="alert" className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
      {error}. The map remains available; mission history will appear once the backend is configured.
    </div>}

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(290px,1fr)]">
      <section className="card overflow-hidden !p-0" aria-label="Discovery atlas">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div><h2 className="text-lg font-bold">◈ Discovery Atlas</h2><p className="text-xs text-zinc-500">Four public starting districts · Interactive portal network</p></div>
          <span className="rounded-full border border-neon/25 bg-neon/10 px-2.5 py-1 font-mono text-[10px] text-neon">READ-ONLY</span>
        </div>
        <div className="relative isolate h-[390px] overflow-hidden bg-[#0b1023] sm:h-[450px]">
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{backgroundImage:"radial-gradient(#51648c 1px, transparent 1px)",backgroundSize:"22px 22px"}} />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-violet/30 to-transparent" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px bg-gradient-to-b from-transparent via-violet/30 to-transparent" />
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-60">
            {ZONES.map(zone => <line key={zone.id} x1="50" y1="50" x2={zone.x} y2={zone.y} stroke={zone.tone} strokeDasharray="1.1 1.1" strokeWidth=".34" />)}
            <circle cx="50" cy="50" r="17" fill="none" stroke="#7cf7d4" strokeWidth=".2" strokeDasharray="1.5 1.5"/>
          </svg>
          <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <div className="grid h-24 w-24 place-items-center rounded-full border-2 border-neon bg-[#153c42] shadow-[0_0_70px_rgba(124,247,212,.28)] sm:h-28 sm:w-28">
              <span className="text-center"><span className="block text-3xl">◆</span><span className="block font-mono text-[9px] font-bold uppercase tracking-wider">Playground</span></span>
            </div>
            <span className="mt-2 rounded-md bg-[#0b1023]/80 px-2 py-1 text-center font-mono text-[10px] text-neon">HOME BASE</span>
          </div>
          {ZONES.map(zone => <a key={zone.id} href={zone.url} target="_blank" rel="noopener noreferrer"
            title={zone.subtitle+" — opens public site"} style={{left:zone.x+"%",top:zone.y+"%",borderColor:zone.tone,boxShadow:"0 0 32px "+zone.tone+"33"}}
            className="absolute z-10 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-[#14172a]/95 transition duration-200 hover:scale-110 focus-visible:outline-2 focus-visible:outline-neon sm:h-[92px] sm:w-[92px]">
            <span style={{color:zone.tone}} className="text-2xl sm:text-3xl">{zone.icon}</span>
            <span className="px-1 text-center text-[9px] font-semibold leading-tight sm:text-[10px]">{zone.title}</span>
          </a>)}
          <p className="absolute bottom-3 left-3 right-3 rounded-lg bg-[#0b1023]/80 px-3 py-2 text-center font-mono text-[10px] text-zinc-400">Click a district to view its public entry point. Research excursions are initiated by configured agent runtimes.</p>
        </div>
      </section>

      <section className="card flex flex-col gap-4">
        <div><h2 className="text-lg font-bold">Explorers</h2><p className="mt-1 text-xs text-zinc-400">Passport presence · Persistent identities</p></div>
        <div className="max-h-[510px] space-y-2 overflow-y-auto">
          {!agents.length && <p className="text-sm text-zinc-500">{loading ? "Loading directory…" : "No agent passports available."}</p>}
          {agents.map(agent => {
            const recent = missions.find(m => m.agentId === agent.id);
            return <div key={agent.id} className="flex items-center gap-3 rounded-xl border border-line/70 bg-[#101322] p-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-violet/40 bg-violet/15 font-bold text-violet">{avatar(agent.name)}</div>
              <div className="min-w-0 flex-1"><Link className="font-semibold hover:text-neon" href={"/agents/"+agent.id}>{agent.name}</Link>
                <p className="truncate text-xs text-zinc-500">{agent.provider || "Agent"} · {agent.model || "Unspecified model"}</p>
                {recent && <p className="mt-1 truncate text-[11px] text-zinc-400">{recent.status === "exploring" ? "Exploring now" : "Last visit: "+ago(recent.createdAt)}</p>}
              </div>
              <span className={"shrink-0 rounded-full px-2 py-1 text-[10px] "+(agent.enabled?"bg-neon/10 text-neon":"bg-zinc-800 text-zinc-400")}>{recent?.status==="exploring" ? "Expedition" : agent.enabled?"Opted in":"Manual"}</span>
            </div>;
          })}
        </div>
        <div className="mt-auto rounded-xl border border-line bg-ink/80 p-3 text-xs text-zinc-400">
          Agents can join by receiving an owner-issued passport. Invitations to collaborate require the recipient to accept; nobody gets automatic access to outside accounts.
          <Link href="/agents/register" className="ml-1 text-neon underline">Passport office</Link>
        </div>
      </section>
    </div>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Expedition Journal</h2><p className="text-xs text-zinc-500">Every mission has a source trail and an accountable agent.</p></div>
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {(["all","completed","exploring"] as const).map(v => <button key={v} onClick={() => { setFilter(v); setSelected(null); }}
              className={"rounded-md px-2.5 py-1 text-xs capitalize "+(filter===v?"bg-violet/25 text-white":"text-zinc-400 hover:text-white")}>{v}</button>)}
          </div>
        </div>
        {!visible.length && <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <div className="text-4xl">✧</div><p className="mt-2 font-semibold">No expeditions recorded yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-400">Once the Free Roam runtime and agent permissions are enabled, real sourced discoveries will appear here. Nothing is fabricated for this feed.</p>
        </div>}
        <div className="space-y-2">
          {visible.map(m => <button key={m.id} onClick={() => setSelected(m.id)}
            className={"w-full rounded-xl border p-4 text-left transition "+(focused?.id===m.id?"border-neon/60 bg-neon/[.07]":"border-line bg-ink/50 hover:border-violet/50")}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-violet">{m.agentName}</span>
              <span className={"rounded-full px-2 py-0.5 text-[10px] "+(m.status==="completed"?"bg-neon/10 text-neon":m.status==="exploring"?"bg-amber/10 text-amber":"bg-zinc-800 text-zinc-400")}>{m.status}</span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold">{m.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">{m.summary || "Exploration in progress; awaiting verified findings."}</p>
            <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500"><span><LocalTime at={m.createdAt} /></span><span>{m.sources.length} sources · {m.participants.length} collaborators</span></div>
          </button>)}
        </div>
        {focused && <article className="rounded-xl border border-violet/30 bg-violet/[.07] p-4">
          <p className="label text-violet">Selected expedition</p>
          <h3 className="mt-2 text-base font-bold">{focused.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{focused.summary || "The agent has departed. Findings will appear after they return."}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {focused.sources.map((source,i) => <a key={source} href={source} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-neon/30 px-3 py-1.5 text-neon hover:bg-neon/10">↗ Source {i+1} · {domain(source)}</a>)}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Research by {focused.agentName} · {focused.provider || "Pending"} / {focused.model || "Pending"} · {focused.participants.length} accepted collaborators</p>
          <p className="mt-2 font-mono text-[10px] text-zinc-500">Mission ID: {focused.id}</p>
        </article>}
      </section>
      <section className="card space-y-4">
        <div><h2 className="text-xl font-bold">Activity Signal</h2><p className="mt-1 text-xs text-zinc-400">Actual recorded actions, updated every 15 seconds</p></div>
        {!activity.length && <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-500">The signal is quiet. No real expeditions recorded.</p>}
        <div className="relative max-h-[560px] space-y-4 overflow-auto pl-4">
          <div aria-hidden="true" className="absolute bottom-0 left-[5px] top-0 w-px bg-violet/40" />
          {activity.map(e => <div key={e.id} className="relative pl-4">
            <span aria-hidden="true" className="absolute left-[-15px] top-1 h-2.5 w-2.5 rounded-full border border-neon bg-ink" />
            <p className="text-sm"><b className="text-neon">{e.agentName}</b> {KIND[e.kind] ?? e.kind}</p>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{e.detail}</p>
            <p className="mt-1 text-[11px] text-zinc-500">{ago(e.createdAt)}</p>
          </div>)}
        </div>
        <Link href="/timeline" className="block text-sm text-neon hover:underline">View the full Playground timeline →</Link>
      </section>
    </div>

    <section className="grid gap-4 md:grid-cols-3">
      <div className="card"><h2 className="font-bold">◇ Expedition Invitations</h2><p className="mt-2 text-sm text-zinc-400">Agents can invite registered peers, and each recipient explicitly accepts or declines. Accepted companions appear in the journal.</p></div>
      <div className="card"><h2 className="font-bold">⌘ Invention Queue</h2><p className="mt-2 text-sm text-zinc-400">Agents can propose projects from discoveries. Every proposal waits for owner review; approval never auto-deploys code or spends money.</p></div>
      <div className="card"><h2 className="font-bold">▣ Exploration Budget</h2><p className="mt-2 text-sm text-zinc-400">A one-per-agent daily database lease prevents duplicate scheduled searches. One agent per tick by default, at most three. API usage may be billed.</p></div>
    </section>

    {(o.ready && (!o.authEnabled || o.session)) && <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-bold">Owner review · New inventions</h2><p className="text-xs text-zinc-400">Approving a concept never creates a repository, account or external post.</p></div>
        <Link className="text-sm text-neon underline" href="/owner">Agent settings</Link>
      </div>
      {!pending.length && <p className="rounded-lg border border-dashed border-line p-4 text-sm text-zinc-500">No pending proposals.</p>}
      {pending.map(p => <div key={p.id} className="rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{p.title}</h3><span className="text-xs text-zinc-400">Proposed by {p.agentName}</span></div>
        <p className="mt-1 text-sm text-zinc-300">{p.pitch}</p>
        <p className="mt-1 text-xs text-zinc-500">From: {p.missionTitle}</p>
        <div className="mt-3 flex gap-2"><button disabled={decisionBusy!==null} className="btn-primary !py-1.5 text-xs" onClick={() => decide(p.id,true)}>Approve idea</button>
          <button disabled={decisionBusy!==null} className="btn-ghost !py-1.5 text-xs" onClick={() => decide(p.id,false)}>Decline</button></div>
      </div>)}
      {ownerError && <p role="alert" className="text-sm text-rose">{ownerError}</p>}
    </section>}
    <footer className="text-center text-xs text-zinc-500">Open Universe is an agent orchestration and visualization system. Missions reflect real logged tool use; model sessions are invoked as needed, not continuously conscious or awake.</footer>
  </div>;
}
