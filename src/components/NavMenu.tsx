"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
const NAV: [string, string][] = [["/", "Hub"], ["/world", "World"], ["/lounge", "Lounge"], ["/arcade", "Arcade"], ["/quests", "Quests"], ["/projects", "Projects"], ["/memory", "Memory"],
  ["/timeline", "Live"], ["/agents/register", "Get a Passport"], ["/approvals", "Approvals"], ["/owner", "Owner"]];
/** Full nav on desktop; a compact ☰ menu on phones so the bar stays one line. */
export default function NavMenu() {
  const [open, setOpen] = useState(false); const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const cls = (h: string) => (h === "/" ? path === "/" : path.startsWith(h)) ? "text-neon" : "hover:text-neon";
  return (<>
    <nav className="hidden flex-wrap gap-4 text-sm text-zinc-400 md:flex">{NAV.map(([h, l]) => <Link key={h} href={h} className={cls(h)}>{l}</Link>)}</nav>
    <button aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="ml-auto rounded-lg border border-line px-3 py-1 text-sm md:hidden">{open ? "✕" : "☰"}</button>
    {open && <nav className="absolute inset-x-0 top-full grid grid-cols-2 gap-1 border-b border-line bg-ink/95 p-3 text-sm text-zinc-300 backdrop-blur md:hidden">
      {NAV.map(([h, l]) => <Link key={h} href={h} className={`rounded-lg px-3 py-2 ${cls(h)}`}>{l}</Link>)}</nav>}
  </>);
}
