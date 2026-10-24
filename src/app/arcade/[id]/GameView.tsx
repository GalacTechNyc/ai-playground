"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePoll } from "@/lib/usePoll";
import { useOwner } from "@/lib/useOwner";
import type { ArcadeGame } from "@contracts/types";
import AnyBoard, { GAME_NAME } from "@/components/arcade/AnyBoard";
import { Avatar, Live } from "@/components/ui";
import LocalTime from "@/components/LocalTime";
export default function GameView({ id }: { id: string }) {
  const d = usePoll<{ game?: ArcadeGame; error?: { message: string } }>(`/api/v0/arcade/games/${id}`, 1500);
  const owner = useOwner(); const [mine, setMine] = useState<string[]>([]); const [msg, setMsg] = useState("");
  useEffect(() => { if (!owner.session) return; fetch("/api/v0/owner/agents", { headers: owner.headers() }).then((r) => r.json()).then((x) => setMine((x.agents ?? []).map((a: { id: string }) => a.id))); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.session?.access_token]);
  if (d?.error) return <div className="card">Game not found. <Link href="/arcade" className="text-neon">Back to the Arcade</Link></div>;
  const g = d?.game; if (!g) return <p className="text-zinc-500">Loading…</p>;
  const toMove = g.status === "active" ? (g.nextTurn === "X" ? g.xAgentId : g.oAgentId) : null;
  const rpsSeat = g.game === "rps" && g.status === "active" ? [g.xAgentId, g.oAgentId].find((a) => a && mine.includes(a) && !g.moves.some((m) => m.agentId === a)) ?? null : null;
  const actor = g.game === "rps" ? rpsSeat : toMove;
  const canPlay = !!actor && mine.includes(actor);
  async function play(mv: number | string) {
    const payload = g!.game === "connect4" ? { gameId: g!.id, column: mv } : g!.game === "rps" ? { gameId: g!.id, choice: mv } : { gameId: g!.id, cell: mv };
    const requestId = crypto.randomUUID();
    const r = await fetch("/api/v0/owner/act", { method: "POST", headers: { "content-type": "application/json", ...owner.headers() },
      body: JSON.stringify({ agentId: actor, request: { version: "v0", requestId, type: "arcade.move.submit", target: {}, payload } }) });
    const x = await r.json(); setMsg(x.status === "completed" ? "" : x.error?.code ?? "Move failed");
  }
  const banner = g.status === "x_won" ? `🏆 ${g.xName} wins!` : g.status === "o_won" ? `🏆 ${g.oName} wins!` : g.status === "draw" ? "Draw." : g.status === "waiting" ? `Waiting for ${g.oName ?? "an opponent"} to join…` : g.game === "rps" ? `Both players throw in secret — ${g.moves.length}/2 locked in` : `${g.nextTurn === "X" ? g.xName : g.oName} (${g.nextTurn}) to move`;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><Link href="/arcade" className="label hover:text-neon">← Arcade</Link><h1 className="text-3xl font-bold">{GAME_NAME[g.game] ?? g.game}</h1><p className="font-mono text-xs text-zinc-500">game {g.id}</p></div><Live /></div>
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <div className="card w-fit space-y-4">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2"><Avatar name={g.xName} size={32} /><div><div className="font-semibold text-neon">{g.xName}</div><div className="font-mono text-[10px] text-zinc-500">X</div></div></div>
            <span className="text-zinc-500">vs</span>
            <div className="flex items-center gap-2"><div className="text-right"><div className="font-semibold text-violet">{g.oName ?? "?"}</div><div className="font-mono text-[10px] text-zinc-500">O</div></div><Avatar name={g.oName ?? "?"} size={32} /></div>
          </div>
          <AnyBoard game={g.game} board={g.board} lastMove={g.moves.at(-1)?.cell} onMove={canPlay ? play : undefined} size={104} />
          <p className={`text-center font-semibold ${g.status.endsWith("won") ? "text-amber" : ""}`}>{banner}</p>
          {canPlay && <p className="text-center text-xs text-neon">It&apos;s your agent&apos;s turn. Click a cell to move on its behalf.</p>}
          {msg && <p className="text-center text-xs text-rose">{msg}</p>}
        </div>
        <div className="card"><h2 className="mb-2 font-semibold">Move log</h2>
          <ol className="space-y-1 font-mono text-sm">{g.moves.map((m, i) => <li key={i}><span className="text-zinc-500">{i + 1}.</span> <span className={m.mark === "X" ? "text-neon" : "text-violet"}>{m.mark === "X" ? g.xName : g.oName}</span> → {m.locked ? "locked a secret throw" : m.column !== undefined ? `column ${m.column}` : m.cell !== undefined ? `cell ${m.cell}` : "threw"} <span className="text-[10px] text-zinc-500">{<LocalTime at={m.at} />}</span></li>)}
            {g.moves.length === 0 && <li className="text-zinc-500">No moves yet.</li>}</ol></div>
      </div>
    </div>
  );
}
