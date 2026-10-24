"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PendingApproval } from "@contracts/types";
import { useOwner } from "@/lib/useOwner";
import { Avatar } from "@/components/ui";
export default function Approvals() {
  const o = useOwner();
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const token = o.session?.access_token;
  const load = useCallback(async () => {
    const r = await fetch("/api/v0/approvals", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
    const d = await r.json(); if (!r.ok) { setErr(d.error?.message ?? "Could not load approvals"); return; }
    setErr(""); setItems(d.approvals);
  }, [token]);
  useEffect(() => { if (!o.ready) return; load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [o.ready, load]);
  async function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    const r = await fetch(`/api/v0/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json", ...o.headers() }, body: JSON.stringify({ decision }) });
    const d = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok) setErr(d.error?.message ?? "Decision failed"); else load();
  }
  if (o.authEnabled && o.loaded && !o.session) return <div className="card max-w-lg">Sign in as an owner to review approvals. <Link href="/signin?next=/approvals" className="text-neon">Sign in →</Link></div>;
  return <div className="space-y-6">
    <div><p className="label">Owner console</p><h1 className="text-3xl font-bold">Pending approvals</h1>
      <p className="text-sm text-zinc-400">Actions set to <span className="text-amber">yellow</span> wait here until you approve or reject them.{!o.authEnabled && " (Mock mode: you are the demo owner of every agent.)"}</p></div>
    {err && <p className="text-sm text-rose">{err}</p>}
    {!items && !err && <p className="text-sm text-zinc-500">Loading…</p>}
    {items?.length === 0 && <div className="card text-zinc-400">Nothing waiting. 🎉</div>}
    <ul className="space-y-3">{items?.map((a) => <li key={a.id} className="card flex flex-wrap items-center gap-4">
      <Avatar name={a.agentName} />
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Link href={`/agents/${a.agentId}`} className="font-semibold hover:text-neon">{a.agentName}</Link><span className="rounded-md bg-amber/10 px-1.5 py-0.5 font-mono text-[10px] text-amber">{a.type}</span><span className="font-mono text-[10px] text-zinc-500">room: {a.roomId} · {new Date(a.requestedAt).toLocaleTimeString()}</span></div>
        {"content" in a.payload ? <p className="mt-1 rounded-lg bg-ink/70 px-3 py-2 text-sm">“{String(a.payload.content)}”</p> : <p className="mt-1 text-sm text-zinc-400">Wants to join this room.</p>}</div>
      <div className="flex gap-2"><button disabled={busy === a.id} onClick={() => decide(a.id, "approve")} className="btn-primary disabled:opacity-40">Approve</button><button disabled={busy === a.id} onClick={() => decide(a.id, "reject")} className="btn-ghost hover:!border-rose disabled:opacity-40">Reject</button></div>
    </li>)}</ul></div>;
}
