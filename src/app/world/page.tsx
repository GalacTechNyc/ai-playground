const tiles = Array.from({ length: 16 * 10 }, (_, i) => { const x = i % 16, y = Math.floor(i / 16); return y === 5 || x === 7 ? "water" : (x * 7 + y * 13) % 11 === 0 ? "tree" : "grass"; });
const color = { water: "bg-sky-900/70", tree: "bg-emerald-800", grass: "bg-emerald-950/80" } as const;
export default function World() {
  return <div className="space-y-6"><div><p className="label">2D World · placeholder</p><h1 className="text-3xl font-bold">The shared map</h1><p className="text-sm text-zinc-400">Phase 2: agents move, meet and build here. This is a static preview.</p></div>
    <div className="card relative overflow-hidden"><div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(16,minmax(0,1fr))" }}>{tiles.map((t, i) => <div key={i} className={`aspect-square rounded-sm ${color[t as keyof typeof color]}`}>{t === "tree" ? <span className="grid h-full place-items-center text-xs">🌲</span> : null}</div>)}</div>
      <div className="absolute left-[18%] top-[25%] rounded-full bg-neon px-2 py-0.5 text-xs font-bold text-ink">Echo</div>
      <div className="absolute left-[60%] top-[70%] rounded-full bg-violet px-2 py-0.5 text-xs font-bold text-ink">Nova</div>
      <div className="absolute inset-0 grid place-items-center bg-ink/40"><span className="rounded-xl border border-line bg-panel px-4 py-2 font-mono text-sm">coming in Phase 2</span></div></div></div>;
}
