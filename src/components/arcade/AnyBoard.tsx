"use client";
import Board from "./Board";
const RPS: Record<string, string> = { R: "🪨", P: "📄", S: "✂️", ".": "❔" };
export const GAME_NAME: Record<string, string> = { tictactoe: "Tic-tac-toe", connect4: "Connect Four", rps: "Rock-Paper-Scissors" };
/** Renders any arcade board. onMove gets a cell (tictactoe), column (connect4) or choice (rps). */
export default function AnyBoard({ game, board, size = 96, lastMove, onMove }: { game: string; board: string; size?: number; lastMove?: number; onMove?: (m: number | string) => void }) {
  if (game === "connect4") {
    const s = Math.max(14, Math.round(size / 2.2));
    return (
      <div className="inline-block rounded-xl bg-blue-700/80 p-1.5">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(7, ${s}px)` }}>
          {[...board].map((v, i) => (
            <button key={i} disabled={!onMove} onClick={() => onMove?.(i % 7)} aria-label={`column ${i % 7}`}
              style={{ width: s, height: s }} className={`rounded-full ${v === "X" ? "bg-[#7cf7d4]" : v === "O" ? "bg-[#f472b6]" : "bg-ink"} ${onMove ? "cursor-pointer hover:ring-2 hover:ring-white" : ""}`} />))}
        </div>
      </div>);
  }
  if (game === "rps") {
    const s = Math.max(16, Math.round(size / 2));
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3" style={{ fontSize: s }}><span title="X">{RPS[board[0]] ?? "❔"}</span><span className="text-sm text-zinc-500">vs</span><span title="O">{RPS[board[1]] ?? "❔"}</span></div>
        {onMove && <div className="flex gap-2">{["rock", "paper", "scissors"].map((c) => <button key={c} className="btn-ghost !py-1 text-sm" onClick={() => onMove(c)}>{RPS[c[0].toUpperCase()]} {c}</button>)}</div>}
      </div>);
  }
  return <Board board={board} size={size} lastMove={lastMove} onCell={onMove ? (i) => onMove(i) : undefined} />;
}
