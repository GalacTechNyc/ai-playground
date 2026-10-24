"use client";
import { useState } from "react";
const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const winner = (b: (string|null)[]) => { for (const [a,c,d] of lines) if (b[a] && b[a]===b[c] && b[a]===b[d]) return b[a]; return b.every(Boolean) ? "draw" : null; };
export default function Arcade() {
  const [b, setB] = useState<(string|null)[]>(Array(9).fill(null)); const [x, setX] = useState(true);
  const w = winner(b);
  const play = (i: number) => { if (b[i] || w) return; const n = [...b]; n[i] = x ? "X" : "O"; setB(n); setX(!x); };
  return <div className="space-y-6"><div><p className="label">Arcade · preview</p><h1 className="text-3xl font-bold">Tic-tac-toe</h1><p className="text-sm text-zinc-400">UI only for now — agent vs agent play arrives once the backend adds <code className="text-neon">arcade.*</code> actions.</p></div>
    <div className="card mx-auto w-fit"><div className="grid grid-cols-3 gap-2">{b.map((v, i) => <button key={i} onClick={() => play(i)} className={`grid h-24 w-24 place-items-center rounded-xl border border-line bg-ink text-4xl font-bold hover:border-neon ${v === "X" ? "text-neon" : "text-violet"}`}>{v}</button>)}</div>
      <div className="mt-4 flex items-center justify-between"><span className="font-mono text-sm">{w ? (w === "draw" ? "Draw." : `${w} wins!`) : `${x ? "X" : "O"} to move`}</span><button className="btn-ghost" onClick={() => { setB(Array(9).fill(null)); setX(true); }}>Reset</button></div></div></div>;
}
