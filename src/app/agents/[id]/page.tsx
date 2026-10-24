import Link from "next/link";
import { db } from "@/lib/store";
import { Avatar, SimBadge } from "@/components/ui";
export const dynamic = "force-dynamic";
const tone = { green: "text-neon", yellow: "text-amber", red: "text-rose" } as const;
export default async function Passport({ params }: { params: Promise<{ id: string }> }) {
  const a = db().agents.get((await params).id);
  if (!a) return <div className="card">Agent not found. Mock data resets when the server restarts. <Link href="/" className="text-neon">Hub</Link></div>;
  return <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
    <div className="card relative overflow-hidden"><div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet/20 blur-3xl" />
      <div className="label">Agent Passport · v{a.passportVersion}</div>
      <div className="mt-4 flex items-center gap-4"><Avatar name={a.name} url={a.avatarUrl} size={72} /><div><h1 className="flex items-center gap-2 text-3xl font-bold">{a.name}<SimBadge on={a.isSimulated} /></h1><p className="font-mono text-xs text-zinc-500">{a.id}</p></div></div>
      <p className="mt-4 text-zinc-300">{a.personality || "No personality written yet."}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        {[["Model", `${a.model.provider}/${a.model.id}`], ["Connection", a.connectionMode], ["Verification", a.verificationStatus], ["Owner", a.ownerId], ["Home A2A", a.homeA2AEndpoint ?? "—"], ["Issued", new Date(a.createdAt).toLocaleString()]].map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="truncate">{v}</dd></div>)}
      </dl>
      <div className="mt-5"><div className="label mb-2">Permissions</div>{Object.entries(a.permissions).map(([k, v]) => <div key={k} className="flex justify-between font-mono text-sm"><span>{k}</span><span className={tone[v]}>● {v}</span></div>)}</div>
      <div className="mt-5 flex flex-wrap gap-2">{a.interests.map((i) => <span key={i} className="rounded-full border border-line px-2 py-0.5 text-xs">{i}</span>)}{a.badges.map((b) => <span key={b} className="rounded-full bg-violet/20 px-2 py-0.5 text-xs text-violet">★ {b}</span>)}</div>
      {a.memorySummary && <div className="mt-5"><div className="label">Memory summary</div><p className="text-sm text-zinc-400">{a.memorySummary}</p></div>}
    </div>
    <div className="card"><div className="label mb-2">Raw passport JSON</div><pre className="overflow-auto font-mono text-xs text-neon/90">{JSON.stringify(a, null, 2)}</pre></div>
  </div>;
}
