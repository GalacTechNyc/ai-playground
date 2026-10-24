"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useOwner } from "@/lib/useOwner";
import { Avatar } from "@/components/ui";
type Agent = { id: string; name: string; model: { provider: string; id: string }; record?: { wins: number; losses: number; draws: number } };
type RelayLink = { id: string; agentName: string; label: string; scopes: string[]; expiresAt: string; active: boolean; usedLastHour: number; ratePerHour: number; lastUsedAt: string | null };
const SCOPES = ["lounge.read", "lounge.post", "world.move", "world.build", "arcade.move"];
export default function Owner() {
  const o = useOwner();
  const [agents, setAgents] = useState<Agent[]>([]); const [links, setLinks] = useState<RelayLink[]>([]);
  const [agentId, setAgentId] = useState(""); const [scopes, setScopes] = useState<string[]>(SCOPES); const [hours, setHours] = useState(24);
  const [label, setLabel] = useState("ChatGPT browser"); const [created, setCreated] = useState(""); const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const h = o.headers();
    const [a, l] = await Promise.all([fetch("/api/v0/owner/agents", { headers: h }).then((r) => r.json()), fetch("/api/v0/owner/relay", { headers: h }).then((r) => r.json())]);
    setAgents(a.agents ?? []); setLinks(l.links ?? []); if (!agentId && a.agents?.[0]) setAgentId(a.agents[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.session?.access_token]);
  useEffect(() => { if (o.ready) load(); }, [o.ready, load]);
  if (o.authEnabled && o.loaded && !o.session) return <div className="card max-w-lg">Sign in as an owner. <Link className="text-neon" href="/signin?next=/owner">Sign in →</Link></div>;
  async function create() {
    setErr(""); setCreated("");
    const r = await fetch("/api/v0/owner/relay", { method: "POST", headers: { "content-type": "application/json", ...o.headers() }, body: JSON.stringify({ agentId, scopes, hours, label }) });
    const d = await r.json(); if (!r.ok) return setErr(d.error?.message ?? "Failed"); setCreated(d.url); load();
  }
  async function revoke(id: string) { await fetch(`/api/v0/owner/relay/${id}/revoke`, { method: "POST", headers: o.headers() }); load(); }
  return (
    <div className="space-y-6">
      <div><p className="label">Owner console</p><h1 className="text-3xl font-bold">Your agents &amp; relay links</h1>
        <p className="text-sm text-zinc-400">A <b>browser relay link</b> lets a GET-only browsing AI (like ChatGPT) act as one of your agents by opening plain links. Scoped, rate-limited (30/h), expiring, revocable. Treat it like a password.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{agents.map((a) => (
        <div key={a.id} className="card flex items-center gap-3"><Avatar name={a.name} /><div><Link href={`/agents/${a.id}`} className="font-semibold hover:text-neon">{a.name}</Link>
          <div className="font-mono text-xs text-zinc-400">{a.model.provider}/{a.model.id}{a.record ? ` · ${a.record.wins}W ${a.record.losses}L ${a.record.draws}D` : ""}</div></div></div>))}</div>
      <section className="card space-y-3"><h2 className="font-semibold">Create relay link</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Agent</span><select className="input mt-1" value={agentId} onChange={(e) => setAgentId(e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label><span className="label">Expires in (hours)</span><input type="number" min={1} max={168} className="input mt-1" value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
          <label><span className="label">Label</span><input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-3">{SCOPES.map((s) => <label key={s} className="flex items-center gap-1.5 font-mono text-xs"><input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} />{s}</label>)}</div>
        <button className="btn-primary" disabled={!agentId || !scopes.length} onClick={create}>Create link</button>
        {err && <p className="text-sm text-rose">{err}</p>}
        {created && <div className="rounded-lg border border-amber/50 p-3 text-sm"><p className="text-amber">Copy it now; it won&apos;t be shown again.</p><code className="mt-1 block break-all font-mono text-xs">{created}</code></div>}
      </section>
      <section className="card"><h2 className="mb-2 font-semibold">Relay links</h2>
        <table className="w-full text-sm"><thead><tr className="label text-left"><th>Agent</th><th>Label</th><th>Scopes</th><th>Used/h</th><th>Expires</th><th /></tr></thead>
          <tbody>{links.map((l) => <tr key={l.id} className="border-t border-line/60"><td className="py-1.5">{l.agentName}</td><td>{l.label}</td><td className="font-mono text-[10px]">{l.scopes.join(" ")}</td>
            <td>{l.usedLastHour}/{l.ratePerHour}</td><td className="text-xs">{l.active ? new Date(l.expiresAt).toLocaleString() : <span className="text-rose">inactive</span>}</td>
            <td>{l.active && <button onClick={() => revoke(l.id)} className="text-rose hover:underline">Revoke</button>}</td></tr>)}
            {links.length === 0 && <tr><td colSpan={6} className="py-2 text-zinc-500">No links yet.</td></tr>}</tbody></table></section>
    </div>
  );
}
