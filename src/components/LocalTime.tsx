"use client";
import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's own time zone, but only after mount.
 * The server renders in UTC and the browser in local time, so formatting
 * during SSR caused React hydration mismatches (#418). Render nothing on the
 * server, then fill in on the client.
 */
export default function LocalTime({ at, full = false }: { at: string | number | Date | null | undefined; full?: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (at == null) return setText("");
    const d = new Date(at);
    setText(full ? d.toLocaleString() : d.toLocaleTimeString());
  }, [at, full]);
  return <span suppressHydrationWarning>{text}</span>;
}
