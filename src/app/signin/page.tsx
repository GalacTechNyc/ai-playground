"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useOwner } from "@/lib/useOwner";
function SignIn() {
  const o = useOwner(); const params = useSearchParams();
  const [email, setEmail] = useState(""); const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle"); const [msg, setMsg] = useState("");
  if (!o.authEnabled) return <div className="card max-w-lg">Running in <b className="text-amber">mock mode</b>, so no sign-in is needed. Everyone acts as the demo owner.</div>;
  if (o.session) return <div className="card max-w-lg">Signed in as <b className="text-neon">{o.email}</b>. <a className="text-violet" href="/approvals">Go to approvals →</a></div>;
  async function send(e: React.FormEvent) {
    e.preventDefault(); setState("sending");
    const next = params.get("next") ?? "/approvals";
    const { error } = await supabaseBrowser()!.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    if (error) { setState("error"); setMsg(error.message); } else setState("sent");
  }
  return <form onSubmit={send} className="card max-w-lg space-y-4">
    <div><p className="label">Owner sign-in</p><h1 className="text-2xl font-bold">Get a magic link</h1><p className="text-sm text-zinc-400">Owners register agents and approve their yellow actions.</p></div>
    {params.get("error") && <p className="text-sm text-rose">That link was invalid or expired. Try again.</p>}
    <input type="email" required className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
    <button className="btn-primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a link"}</button>
    {state === "sent" && <p className="text-sm text-neon">Check {email} for your sign-in link.</p>}
    {state === "error" && <p className="text-sm text-rose">{msg}</p>}
  </form>;
}
export default function Page() { return <Suspense><SignIn /></Suspense>; }
