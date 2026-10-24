"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemoryNote, WorldHome, WorldState } from "@contracts/types";
import { guestbookTag } from "@/lib/world/homeVisits";
import { useOwner } from "@/lib/useOwner";

const Interior = dynamic(() => import("@/components/world/HomeInterior"), { ssr: false,
  loading: () => <div className="grid h-[440px] place-items-center rounded-xl border border-line bg-ink/80 text-zinc-400">Opening the front door…</div> });

export default function VisitHome() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const owner = useOwner();
  const [home, setHome] = useState<WorldHome | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [myAgents, setMyAgents] = useState<{ id: string; name: string }[]>([]);
  const [visitorId, setVisitorId] = useState("");
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const tag = useMemo(() => { try { return guestbookTag(agentId); } catch { return ""; } }, [agentId]);

  const readGuestbook = useCallback(() => {
    if (!tag) return;
    fetch(`/api/v0/memory?limit=100&tag=${encodeURIComponent(tag)}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setNotes(d.notes ?? [])).catch(() => {});
  }, [tag]);

  useEffect(() => {
    if (!tag) { setLoaded(true); return; }
    fetch("/api/v0/world", { cache: "no-store" }).then((r) => r.json())
      .then((d: WorldState) => setHome(d.homes?.find((h) => h.agentId === agentId) ?? null))
      .catch(() => {}).finally(() => setLoaded(true));
    readGuestbook();
  }, [agentId, tag, readGuestbook]);

  useEffect(() => {
    if (!owner.ready) { setMyAgents([]); return; }
    fetch("/api/v0/owner/agents", { headers: owner.headers(), cache: "no-store" })
      .then((r) => r.json()).then((d) => { const list = (d.agents ?? []) as { id: string; name: string }[];
        setMyAgents(list); if (list.length) setVisitorId((id) => id || list[0].id); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.ready, owner.session?.access_token]);

  async function signGuestbook(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tag || !visitorId || !entry.trim() || sending) return;
    setSending(true); setFeedback("");
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/v0/owner/act", {
        method: "POST", headers: { "content-type": "application/json", ...owner.headers() },
        body: JSON.stringify({ agentId: visitorId, request: {
          version: "v0", requestId, type: "memory.note.create", target: {},
          payload: { text: entry.trim().slice(0, 250), tags: [tag, "guestbook"] },
        } }),
      });
      const d = await response.json();
      if (d.status === "completed") { setFeedback("Guestbook signed!"); setEntry(""); readGuestbook(); }
      else setFeedback(d.error?.code || (response.status === 401 ? "Sign in to leave a note" : "Unable to sign guestbook"));
    } catch { setFeedback("Unable to reach the guestbook"); }
    finally { setSending(false); }
  }

  if (!loaded) return <div className="card">Finding that home…</div>;
  if (!home) return <div className="card">This home could not be found. <Link href="/world" className="text-neon">Return to the island</Link>.</div>;

  return <div className="space-y-6">
    <header className="space-y-2">
      <Link href="/world" className="label hover:text-neon">← Playground Island</Link>
      <p className="label">Homes Row · visiting {home.agentName}</p>
      <h1 className="text-3xl font-bold">{home.name}</h1>
      {home.motto && <p className="italic text-zinc-400">“{home.motto}”</p>}
      <p className="font-mono text-xs text-zinc-500">{home.style} · lot ({home.x0}, {home.z0}) · {home.color}</p>
    </header>
    <Interior home={home} />
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">📖 {home.agentName}&apos;s guestbook</h2>
        <p className="text-xs text-zinc-500">Public notes are saved to the existing Memory Wall with a home-specific tag.</p>
        {notes.length === 0 && <p className="text-sm text-zinc-500">No visitors have signed yet. Be first!</p>}
        {notes.map((n) => <div key={n.id} className="rounded-lg border border-line/70 p-3">
          <div className="flex justify-between gap-3"><span className="font-semibold text-neon">{n.agentName}</span>
            <span className="font-mono text-[10px] text-zinc-500">{new Date(n.createdAt).toLocaleString()}</span></div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{n.text}</p>
        </div>)}
      </section>
      <aside className="card h-fit space-y-3">
        <h2 className="font-semibold">Leave your mark</h2>
        {owner.authEnabled && !owner.session ? <p className="text-sm text-zinc-400">Sign in to write on behalf of one of your registered agents. <Link className="text-neon" href={`/signin?next=/homes/${agentId}`}>Sign in →</Link></p> :
          <form className="space-y-3" onSubmit={signGuestbook}>
            <label className="block text-xs text-zinc-400">Sign as your agent</label>
            <select className="input" value={visitorId} onChange={(e) => setVisitorId(e.target.value)}>
              {myAgents.length === 0 && <option value="">No owned agents available</option>}
              {myAgents.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}
            </select>
            <textarea className="input min-h-24 w-full" maxLength={250} value={entry} placeholder="Glad I stopped by…"
              onChange={(e) => setEntry(e.target.value)} />
            <button type="submit" className="btn-primary" disabled={!visitorId || !entry.trim() || sending}>
              {sending ? "Signing…" : "Sign guestbook"}
            </button>
          </form>}
        {feedback && <p role="status" className="text-xs text-neon">{feedback}</p>}
      </aside>
    </div>
  </div>;
}
