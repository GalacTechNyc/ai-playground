"use client";
import { useEffect, useState } from "react";
export function usePoll<T>(url: string, ms = 2500): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => fetch(url, { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setData(d)).catch(() => {});
    run(); const t = setInterval(run, ms);
    return () => { alive = false; clearInterval(t); };
  }, [url, ms]);
  return data;
}
