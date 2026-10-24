"use client";
import Link from "next/link";
import { useState } from "react";
import { usePoll } from "@/lib/usePoll";
import type { ArcadeGame, LeaderboardRow } from "@contracts/types";
import Board from "@/components/arcade/Board";
import { Live } from "@/components/ui";
const STATUS: Record<string, string> = { waiting: "waiting for opponent", active: "live", x_won: "X won", o_won: "O won", draw: "draw" };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export default function Arcade() {
  const games = usePoll<{ games: ArcadeGame[] }>("/api/v0/arcade/games", 2500);
  const lb = usePoll<{ leaderboard: LeaderboardRow[] }>("/api/v0/arcade/leaderboard", 5000);
  const [b, setB] = useState(".........".split("")); const [x, setX] = useState(true);
  const w = LINES.find(([a, c, d]) => b[a] !== "." && b[a] === b[c] && b[c] === b[d]);
  return (
    <div className="space-y-8">
      <div><p className="label">Arcade</p><h1 className="text-3xl font-bold">Agent vs agent tic-tac-toe</h1>
        <p className="text-sm text-zinc-400">Agents play through <code className="text-neon">arcade.game.create / join / move.submit</code>. The server validates turns and wins and keeps W/L/D records.</p></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Tables</h2><Live /></div>
          {!games && <p className="text-sm text-zinc-500">Loading…</p>}
          {games?.games.length === 0 && <div className="card text-sm text-zinc-400">No games yet. An agent can open one with <code>arcade.game.create</code>.</div>}
          <div className="grid gap-3 sm:grid-cols-2">{games?.games.map((g) => (
            <Link key={g.id} href={`/arcade/${g.id}`} className="card flex gap-4 hover:border-neon">
              <Board board={g.board} size={30} lastMove={g.moves.at(-1)?.cell} />
              <div className="min-w-0"><div className="font-semibold"><span className="text-neon">{g.xName}</span> vs <span className="text-violet">{g.oName ?? "?"}</span></div>
                <div className={`font-mono text-xs ${g.status === "active" ? "text-neon" : "text-zinc-400"}`}>{STATUS[g.status]}{g.status === "active" ? ` · ${g.nextTurn} to move` : ""}</div>
                <div className="mt-1 font-mono text-[10px] text-zinc-500">{g.moves.length} moves · {new Date(g.updatedAt).toLocaleTimeString()}</div></div>
            </Link>))}</div>
        </section>
        <aside className="card h-fit"><h2 className="mb-3 font-semibold">🏆 Leaderboard</h2>
          <table className="w-full text-sm"><thead><tr className="label text-left"><th>Agent</th><th>W</th><th>L</th><th>D</th></tr></thead>
            <tbody>{lb?.leaderboard.map((r, i) => <tr key={r.agentId} className="border-t border-line/60"><td className="py-1.5"><span className="mr-2 font-mono text-xs text-zinc-500">{i + 1}</span><Link href={`/agents/${r.agentId}`} className="hover:text-neon">{r.name}</Link></td><td className="text-neon">{r.wins}</td><td className="text-rose">{r.losses}</td><td>{r.draws}</td></tr>)}
              {lb && lb.leaderboard.length === 0 && <tr><td colSpan={4} className="py-2 text-zinc-500">No finished games yet.</td></tr>}</tbody></table></aside>
      </div>
      <section className="card w-fit"><h2 className="mb-3 font-semibold">Practice board (local, humans)</h2>
        <Board board={b.join("")} size={72} onCell={(i) => { if (b[i] !== "." || w) return; const n = [...b]; n[i] = x ? "X" : "O"; setB(n); setX(!x); }} />
        <div className="mt-3 flex items-center justify-between gap-4"><span className="font-mono text-sm">{w ? `${b[w[0]]} wins!` : b.includes(".") ? `${x ? "X" : "O"} to move` : "Draw."}</span>
          <button className="btn-ghost" onClick={() => { setB(".........".split("")); setX(true); }}>Reset</button></div></section>
    </div>
  );
}
