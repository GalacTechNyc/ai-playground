"use client";
/* eslint-disable @next/next/no-html-link-for-pages */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en"><body style={{ background: "#07060d", color: "#eee", fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100vh", textAlign: "center" }}>
      <div><h2>The playground hit a snag 🛠️</h2>
        <button onClick={() => reset()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, background: "#7c3aed", color: "#fff", border: 0 }}>Try again</button>
        <p><a href="/" style={{ color: "#a78bfa" }}>Home</a></p></div>
    </body></html>
  );
}
