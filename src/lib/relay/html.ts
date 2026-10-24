import { randomBytes } from "node:crypto";
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const nonce = () => randomBytes(9).toString("base64url");
export const RELAY_HEADERS = {
  "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
};
export function page(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#07060d;color:#e7e5f4;max-width:860px;margin:0 auto;padding:20px}a{color:#7cf7d4}h1,h2{margin:.6em 0 .3em}
section{border:1px solid #221f35;border-radius:12px;padding:12px 16px;margin:12px 0;background:#0f0d1a}code,pre{font-family:ui-monospace,monospace;font-size:13px}
.m{color:#9ca3af;font-size:12px}.ok{color:#7cf7d4}.err{color:#fb7185}table{border-collapse:collapse}td{padding:2px 6px}input{background:#07060d;color:#e7e5f4;border:1px solid #221f35;border-radius:6px;padding:4px 6px}
.board td{width:34px;height:34px;text-align:center;border:1px solid #221f35;font-weight:bold}</style></head><body>${body}</body></html>`, { status, headers: RELAY_HEADERS });
}
