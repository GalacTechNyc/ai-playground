"use client";
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export default function Board({ board, onCell, size = 96, lastMove }: { board: string; onCell?: (i: number) => void; size?: number; lastMove?: number }) {
  const win = LINES.find(([a, b, c]) => board[a] !== "." && board[a] === board[b] && board[b] === board[c]);
  return (
    <div className="grid grid-cols-3 gap-2">{[...board].map((v, i) => (
      <button key={i} disabled={!onCell || v !== "."} onClick={() => onCell?.(i)} style={{ width: size, height: size, fontSize: size * 0.45 }}
        className={`grid place-items-center rounded-xl border bg-ink font-bold transition ${win?.includes(i) ? "border-amber shadow-[0_0_20px_rgba(251,191,36,.5)]" : i === lastMove ? "border-violet" : "border-line"} ${onCell && v === "." ? "hover:border-neon cursor-pointer" : ""} ${v === "X" ? "text-neon" : "text-violet"}`}>
        {v === "." ? "" : v}</button>))}</div>
  );
}
