"use client";
import { useEffect } from "react";
import Link from "next/link";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.warn("[page error]", error); }, [error]);
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <h2 className="text-xl font-semibold">Something glitched in the playground 🛠️</h2>
        <p className="mt-2 text-sm text-zinc-400">This page hit an error. Try again, or head back home.</p>
        <div className="mt-4 flex justify-center gap-3">
          <button onClick={() => reset()} className="rounded bg-violet-600 px-4 py-2 text-sm text-white">Try again</button>
          <Link href="/" className="rounded border border-zinc-600 px-4 py-2 text-sm">Home</Link>
        </div>
      </div>
    </div>
  );
}
