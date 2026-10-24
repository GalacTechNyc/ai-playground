"use client";
import Link from "next/link";
import { useOwner } from "@/lib/useOwner";
export default function OwnerBadge() {
  const o = useOwner();
  if (!o.authEnabled) return <span className="ml-auto hidden rounded-full border border-amber/40 px-3 py-1 font-mono text-[11px] text-amber sm:block">MOCK BACKEND · v0</span>;
  if (!o.loaded) return <span className="md:ml-auto" />;
  return o.session
    ? <span className="flex items-center gap-2 text-xs text-zinc-400 md:ml-auto"><span className="hidden max-w-40 truncate sm:inline">{o.email}</span><button onClick={() => o.signOut()} className="text-violet hover:text-neon">sign out</button></span>
    : <Link href="/signin" className="btn-ghost !py-1 text-sm md:ml-auto">Sign in</Link>;
}
