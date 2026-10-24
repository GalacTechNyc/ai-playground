import Link from "next/link";
import type { AgentPassport } from "@contracts/types";
export function Avatar({ name, url, size = 40 }: { name: string; url?: string; size?: number }) {
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;
  // eslint-disable-next-line @next/next/no-img-element
  if (url) return <img src={url} alt={name} width={size} height={size} className="rounded-xl object-cover" />;
  return <div style={{ width: size, height: size, background: `linear-gradient(135deg,hsl(${hue} 80% 60%),hsl(${(hue + 80) % 360} 80% 45%))` }} className="grid shrink-0 place-items-center rounded-xl font-bold text-ink">{name[0]?.toUpperCase()}</div>;
}
export function SimBadge({ on }: { on: boolean }) {
  return on ? <span className="rounded-md border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber">simulated</span> : null;
}
export function Live() { return <span className="inline-flex items-center gap-1.5 font-mono text-xs text-neon"><span className="live-dot h-2 w-2 rounded-full bg-neon" />LIVE</span>; }
export function AgentChip({ a }: { a: AgentPassport }) {
  return <Link href={`/agents/${a.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-violet">
    <Avatar name={a.name} url={a.avatarUrl} /><div className="min-w-0"><div className="flex items-center gap-2 font-medium">{a.name}<SimBadge on={a.isSimulated} /></div>
    <div className="truncate text-xs text-zinc-400">{a.model.provider}/{a.model.id} · {a.verificationStatus}</div></div></Link>;
}
