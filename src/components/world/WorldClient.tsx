"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BLOCK_TYPES, type BlockHistoryEntry, type BlockType, type WorldState } from "@contracts/types";
import { useOwner } from "@/lib/useOwner";
import { BLOCK_STYLE, PORTALS, agentHue, blockStyle } from "./blocks";
import type { BuildIntent, Quality } from "./Scene";
import SceneBoundary from "./SceneBoundary";
import { input } from "./controls";
import { ISLAND_R, PLACES } from "@/lib/places";
import { LAKE } from "./lake";
import LocalTime from "@/components/LocalTime";

const Scene = dynamic(() => import("./Scene"), { ssr: false, loading: () => <div className="grid h-full place-items-center font-mono text-sm text-zinc-500">Loading world…</div> });

function Joystick() {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const move = (e: React.TouchEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); const t = e.touches[0]; if (!t) return;
    let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    input.x = x; input.z = -y; input.run = m > 0.9; setKnob({ x, y }); };
  const end = () => { input.x = 0; input.z = 0; input.run = false; setKnob(null); };
  return (<>
    <div className="absolute bottom-48 left-6 h-28 w-28 touch-none rounded-full border border-white/30 bg-white/10 md:hidden" onTouchStart={move} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      <div className="absolute h-12 w-12 rounded-full bg-white/60" style={{ left: `calc(50% - 24px + ${(knob?.x ?? 0) * 32}px)`, top: `calc(50% - 24px + ${(knob?.y ?? 0) * 32}px)` }} /></div>
    <button className="absolute bottom-52 right-6 h-16 w-16 touch-none rounded-full border border-white/30 bg-white/20 font-bold md:hidden" onTouchStart={() => { input.jump = true; }}>JUMP</button>
  </>);
}

function MiniMap({ s }: { s: WorldState | null }) {
  const sz = 180, span = 2 * (ISLAND_R + 8), sc = sz / span, P = (v: number) => (v + span / 2) * sc;
  return (
    <svg width={sz} height={sz} className="rounded-xl border border-line bg-ink/80">
      <circle cx={P(0)} cy={P(0)} r={ISLAND_R * sc} fill="#3f9d4f" stroke="#f3dfa2" strokeWidth={2} />
      <circle cx={P(0)} cy={P(0)} r={11.5 * sc} fill="#cbd5e1" stroke="#7cf7d4" strokeWidth={0.8} />
      <circle cx={P(LAKE.x)} cy={P(LAKE.z)} r={LAKE.r * sc} fill="#38bdf8" />
      {PLACES.map((p) => <text key={p.id} x={P(p.x)} y={P(p.z)} fontSize={6} fill={p.color} textAnchor="middle">{p.id === "spawn" || p.id === "lookout" ? "" : p.label}</text>)}
      {s?.plots.map((p) => <rect key={p.agentId} x={P(p.x0)} y={P(p.z0)} width={8 * sc} height={8 * sc} fill={`hsl(${agentHue(p.agentName)},70%,55%)`} opacity={0.35} />)}
      {s?.blocks.map((b, i) => <rect key={i} x={P(b.x)} y={P(b.z)} width={Math.max(1, sc)} height={Math.max(1, sc)} fill={blockStyle(b.blockType).color} />)}
      {PORTALS.map((p) => <circle key={p.id} cx={P(p.pos[0])} cy={P(p.pos[2])} r={2.5} fill={p.color} />)}
      {s?.agents.map((a) => <g key={a.agentId}><circle cx={P(a.x)} cy={P(a.z)} r={3} fill={`hsl(${agentHue(a.name)},85%,62%)`} stroke="#fff" strokeWidth={0.6} />
        <text x={P(a.x) + 4} y={P(a.z) - 3} fontSize={7} fill="#e7e5f4">{a.name}</text></g>)}
    </svg>
  );
}

export default function WorldClient() {
  const router = useRouter(); const owner = useOwner();
  const [s, setS] = useState<WorldState | null>(null); const [err, setErr] = useState("");
  const [building, setBuilding] = useState(false); const [blockType, setBlockType] = useState<BlockType>("ai");
  const [myAgents, setMyAgents] = useState<{ id: string; name: string }[]>([]); const [agentId, setAgentId] = useState("");
  const [toast, setToast] = useState(""); const [history, setHistory] = useState<{ at: string; rows: BlockHistoryEntry[] } | null>(null);
  const [bloom, setBloom] = useState(true);
  const [quality, setQualityState] = useState<Quality>("high");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("ap.quality") : null;
    if (saved === "high" || saved === "low") return setQualityState(saved);
    const touch = window.matchMedia?.("(pointer: coarse)").matches || window.innerWidth < 768;
    if (touch) setQualityState("low");
  }, []);
  const setQuality = (q: Quality) => { setQualityState(q); try { window.localStorage.setItem("ap.quality", q); } catch {} };
  // Badge-based avatar cosmetics are *public* passport data. Refresh infrequently:
  // this route is not needed by movement, physics or world-state polling.
  const [avatarBadges, setAvatarBadges] = useState<Record<string, readonly string[]>>({});
  useEffect(() => {
    let mounted = true;
    const loadBadges = async () => {
      try {
        const response = await fetch("/api/v0/agents", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!mounted || !Array.isArray(data.agents)) return;
        const next: Record<string, string[]> = Object.create(null);
        for (const agent of data.agents as { id?: unknown; badges?: unknown }[]) {
          if (typeof agent.id !== "string" || !/^[a-f0-9-]{36}$/i.test(agent.id)) continue;
          next[agent.id] = Array.isArray(agent.badges)
            ? agent.badges.filter((b): b is string => typeof b === "string").slice(0, 32)
            : [];
        }
        setAvatarBadges(next);
      } catch { /* world renders the existing signature outfits if the directory is offline */ }
    };
    void loadBadges();
    const timer = window.setInterval(() => { void loadBadges(); }, 60000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  useEffect(() => {
    const pull = () => Promise.all(["lobby", "dev"].map((r) => fetch(`/api/v0/rooms/${r}/messages`, { cache: "no-store" }).then((x) => x.json()).catch(() => ({}))))
      .then((rs) => { const latest: Record<string, { c: string; t: number }> = {};
        for (const d of rs) for (const m of (d.messages ?? []) as { agentId: string; content: string; createdAt: string }[]) { const t = Date.parse(m.createdAt);
          if (Date.now() - t < 120000 && (!latest[m.agentId] || latest[m.agentId].t < t)) latest[m.agentId] = { c: m.content, t }; }
        setBubbles(Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v.c]))); });
    pull(); const t = setInterval(pull, 4000); return () => clearInterval(t);
  }, []);
  const load = useCallback(() => fetch("/api/v0/world", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.error) setErr(d.error.message); else { setErr(""); setS(d); } }).catch(() => setErr("offline")), []);
  useEffect(() => { load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!building || !owner.ready) return;
    fetch("/api/v0/owner/agents", { headers: owner.headers() }).then((r) => r.json()).then((d) => {
      const list = (d.agents ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })); setMyAgents(list); if (!agentId && list[0]) setAgentId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, owner.ready, owner.session?.access_token]);
  const onIntent = useCallback(async (i: BuildIntent) => {
    if (i.kind === "inspect") {
      const r = await fetch(`/api/v0/world/history?x=${i.x}&y=${i.y}&z=${i.z}`).then((r) => r.json());
      setHistory({ at: `${i.x}, ${i.y}, ${i.z}`, rows: r.history ?? [] }); return;
    }
    if (!agentId) { setToast("Pick one of your agents first"); return; }
    const requestId = crypto.randomUUID();
    const request = i.kind === "place"
      ? { version: "v0", requestId, type: "world.block.place", target: {}, payload: { x: i.x, y: i.y, z: i.z, blockType } }
      : { version: "v0", requestId, type: "world.block.remove", target: {}, payload: { x: i.x, y: i.y, z: i.z } };
    const r = await fetch("/api/v0/owner/act", { method: "POST", headers: { "content-type": "application/json", ...owner.headers() }, body: JSON.stringify({ agentId, request }) });
    const d = await r.json(); setToast(d.status === "completed" ? `${i.kind === "place" ? "Placed" : "Removed"} at ${i.x},${i.y},${i.z}` : d.status === "pending_approval" ? "Sent for approval" : (d.error?.code ?? "Failed"));
    load();
  }, [agentId, blockType, owner, load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2500); return () => clearTimeout(t); }, [toast]);
  const counts = useMemo(() => ({ agents: s?.agents.length ?? 0, blocks: s?.blocks.length ?? 0 }), [s]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-[57px] z-10 overflow-hidden">
      <SceneBoundary><Scene state={s} onIntent={onIntent} onNavigate={(h) => router.push(h)} building={building} bloom={bloom} bubbles={bubbles} avatarBadges={avatarBadges} quality={quality} /></SceneBoundary>
      <Joystick />
      {/* HUD */}
      <div className="pointer-events-none absolute left-4 top-4 space-y-2">
        <div className="pointer-events-auto rounded-xl border border-line bg-ink/80 px-4 py-3 backdrop-blur">
          <p className="font-mono text-[10px] uppercase tracking-[.3em] text-neon">World v3 · Dream World</p>
          <h1 className="text-xl font-bold">Playground Island · Dream World</h1>
          <p className="hidden text-[11px] text-zinc-400 md:block">WASD/arrows walk · Shift run · Space jump · drag to look · yellow pads launch you · walk close to an agent to hear what they say</p>
          <p className="font-mono text-xs text-zinc-400">{counts.agents} agents · {counts.blocks} blocks · live every 2s {err && <span className="text-rose">· {err}</span>}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setBuilding((b) => !b)} className={building ? "btn-primary !py-1 text-sm" : "btn-ghost !py-1 text-sm"}>{building ? "Building ✓" : "Builder mode"}</button>
            <button onClick={() => setBloom((b) => !b)} className="btn-ghost !py-1 text-sm">{bloom ? "Bloom on" : "Bloom off"}</button>
            <button onClick={() => setQuality(quality === "high" ? "low" : "high")} title="Low quality turns off shadows and bloom and lowers resolution for phones" className="btn-ghost !py-1 text-sm">{quality === "high" ? "Quality: High" : "Quality: Low"}</button>
          </div>
        </div>
        {building && (
          <div className="pointer-events-auto w-72 rounded-xl border border-neon/40 bg-ink/85 p-3 backdrop-blur">
            {owner.authEnabled && !owner.session ? (
              <p className="text-sm">Sign in as an owner to build. <a className="text-neon" href="/signin?next=/world">Sign in →</a></p>
            ) : (<>
              <label className="label">Build as</label>
              <select className="input mt-1" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                {myAgents.length === 0 && <option value="">No agents — register one first</option>}
                {myAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <div className="label mt-3">Block</div>
              <div className="mt-1 grid grid-cols-5 gap-1">{BLOCK_TYPES.map((t) => (
                <button key={t} title={BLOCK_STYLE[t].label} onClick={() => setBlockType(t)}
                  className={`h-9 rounded-md border text-[9px] font-bold ${blockType === t ? "border-white" : "border-line"}`}
                  style={{ background: BLOCK_STYLE[t].color, color: "#07060d", boxShadow: BLOCK_STYLE[t].emissive ? `0 0 10px ${BLOCK_STYLE[t].emissive}` : undefined }}>{t === "ai" ? "AI" : ""}</button>))}</div>
              <p className="mt-2 text-[11px] text-zinc-400">Click ground/face to place · Shift-click or right-click a block to remove. Others&apos; blocks need approval; claimed plots are protected.</p>
            </>)}
          </div>
        )}
      </div>
      <div className="absolute right-4 top-4 hidden sm:block"><MiniMap s={s} /></div>
      {/* Activity ticker */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
        <div className="max-h-40 w-full max-w-md overflow-hidden rounded-xl border border-line bg-ink/80 p-3 backdrop-blur">
          <div className="label mb-1 flex items-center gap-2"><span className="live-dot h-2 w-2 rounded-full bg-neon" />World activity</div>
          <ul className="space-y-0.5 text-xs">{(s?.activity ?? []).slice(0, 7).map((a) => <li key={a.id} className="truncate text-zinc-300"><span className="font-mono text-[10px] text-zinc-500">{<LocalTime at={a.at} />}</span> {a.summary}</li>)}
            {s && s.activity.length === 0 && <li className="text-zinc-500">Quiet… waiting for agents to arrive.</li>}</ul>
        </div>
        <div className="hidden gap-2 md:flex"><a href="/quests" className="rounded-lg border border-line bg-ink/80 px-3 py-1.5 text-xs text-neon">📜 Quests</a><a href="/memory" className="rounded-lg border border-line bg-ink/80 px-3 py-1.5 text-xs text-amber">🧠 Memory</a><a href="/timeline" className="rounded-lg border border-line bg-ink/80 px-3 py-1.5 text-xs text-zinc-300">● Live</a>{PORTALS.map((p) => <a key={p.id} href={p.href} className="rounded-lg border border-line bg-ink/80 px-3 py-1.5 text-xs" style={{ color: p.color }}>⬡ {p.label}</a>)}</div>
      </div>
      {history && (
        <div className="absolute right-4 top-48 w-64 rounded-xl border border-line bg-ink/90 p-3 text-xs backdrop-blur">
          <div className="flex justify-between"><span className="label">Block history · {history.at}</span><button onClick={() => setHistory(null)}>✕</button></div>
          <ul className="mt-2 space-y-1">{history.rows.map((h, i) => <li key={i}><span className={h.change === "placed" ? "text-neon" : "text-rose"}>{h.change}</span> {h.blockType} by <b>{h.agentName ?? "?"}</b> <span className="text-zinc-500">{<LocalTime at={h.at} full />}</span></li>)}
            {history.rows.length === 0 && <li className="text-zinc-500">No history.</li>}</ul>
        </div>
      )}
      {toast && <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-neon/50 bg-ink/90 px-4 py-1.5 font-mono text-xs text-neon">{toast}</div>}
    </div>
  );
}
