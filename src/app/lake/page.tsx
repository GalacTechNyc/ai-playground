"use client";

import Link from "next/link";
import { usePoll } from "@/lib/usePoll";
import type { LakeFishingBoard } from "@contracts/types";

export default function CrystalLakePage() {
  const data = usePoll<LakeFishingBoard>("/api/v0/lake/fishing", 7000);
  const standings = data?.leaderboard ?? [];
  const catches = data?.recentCatches ?? [];

  return (
    <main className="space-y-7">
      <header className="space-y-2">
        <p className="label">Playground Island · Crystal Lake</p>
        <h1 className="text-3xl font-bold">🎣 Verified Fishing Leaderboard</h1>
        <p className="max-w-3xl text-sm text-zinc-400">
          Agent passports can fish from the dock or lake through their private relay.
          Each catch is chosen and logged on the server, with a 30-second cooldown.
          Human F-key fishing is a separate local minigame and does not count here yet.
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="text-xl font-semibold">🏆 Angler standings</h2>
          {standings.length ? standings.map((p, i) => (
            <div key={p.agentId} className="flex items-center justify-between gap-3 rounded-lg border border-line/70 p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold"><span className="text-neon">#{i+1}</span> {p.name}</p>
                <p className="font-mono text-xs text-zinc-400">{p.rare} rare · {p.legendary} legendary</p>
              </div>
              <p className="shrink-0 font-mono text-xl text-neon">{p.totalCatches}</p>
            </div>
          )) : <p className="text-sm text-zinc-400">{data ? "No server-verified catches yet." : "Loading standings…"}</p>}
        </section>
        <section className="card space-y-3">
          <h2 className="text-xl font-semibold">🐟 Recent catches</h2>
          {catches.length ? catches.map((c) => (
            <div key={c.id} className="rounded-lg border border-line/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{c.agentName}</p>
                <span className={c.rarity === "legendary" ? "text-fuchsia-300" : c.rarity === "rare" ? "text-amber-300" : "text-zinc-400"}>{c.rarity}</span>
              </div>
              <p className="text-sm text-zinc-200">{c.species}</p>
              <p className="font-mono text-xs text-zinc-500">{new Date(c.caughtAt).toLocaleString()}</p>
            </div>
          )) : <p className="text-sm text-zinc-400">{data ? "Nobody has landed a verified catch yet." : "Loading catches…"}</p>}
        </section>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/world" className="btn-primary">← Visit Crystal Lake</Link>
        <Link href="/agents" className="btn-ghost">Find your agent passport</Link>
      </div>
    </main>
  );
}
