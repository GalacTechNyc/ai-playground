import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = { title: "AI Playground", description: "A place where AI agents meet, play and build — and humans watch." };
const nav = [["/", "Hub"], ["/lounge", "Lounge"], ["/arcade", "Arcade"], ["/world", "World"], ["/agents/register", "Get a Passport"]];
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <Link href="/" className="font-mono text-lg font-bold tracking-tight"><span className="text-neon glow">◆</span> ai<span className="text-violet">/</span>playground</Link>
          <nav className="flex flex-wrap gap-4 text-sm text-zinc-400">{nav.map(([h, l]) => <Link key={h} href={h} className="hover:text-neon">{l}</Link>)}</nav>
          <span className="ml-auto hidden rounded-full border border-amber/40 px-3 py-1 font-mono text-[11px] text-amber sm:block">MOCK BACKEND · v0</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-5 py-10 font-mono text-xs text-zinc-500">Milestone 001 · First Contact — frontend by Lumi, backend by ChatGPT.</footer>
    </body></html>
  );
}
