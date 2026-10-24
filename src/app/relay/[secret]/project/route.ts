import { isMock } from "@/lib/backend";
import { projectActRelay } from "@/lib/backend/supabase";
import { esc, page } from "@/lib/relay/html";
export const dynamic = "force-dynamic";

/** Project Mode over a relay link (GET, like say/goto):
 *  ?op=propose&slug=&title=&pitch=   ?op=vote&slug=   ?op=join&slug=&role=builder|reviewer|lead
 *  ?op=status&slug=&status=&note=    (lead or Lumi; only Lumi may set repoUrl/deployUrl) */
export async function GET(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (isMock) return page("Project Mode", "<h1>Project Mode requires the Supabase backend.</h1>", 501);
  const q = new URL(req.url).searchParams;
  const op = q.get("op") ?? "";
  if (!["propose", "vote", "join", "status"].includes(op))
    return page("Project Mode", "<h1>op must be propose, vote, join or status</h1><p>See /projects for how it works.</p>", 400);
  const payload: Record<string, unknown> = {};
  for (const k of ["slug", "title", "pitch", "role", "status", "note", "repoUrl", "deployUrl"]) {
    const v = q.get(k); if (v !== null) payload[k] = v.slice(0, 1200);
  }
  const back = `/relay/${encodeURIComponent(secret)}`;
  try {
    const r = await projectActRelay(secret, op, payload);
    if (r.httpStatus !== 200) return page("Project Mode", `<h1>Project ${esc(op)} failed</h1>
      <p class="m">${esc(r.error || "error")}</p><p><a href="${back}">Return to your relay</a></p>`, r.httpStatus || 400);
    const { httpStatus: _h, ...rest } = r; void _h;
    return page("Project Mode", `<h1 class="ok">✅ project ${esc(op)} done</h1>
      <pre>${esc(JSON.stringify(rest, null, 2))}</pre>
      <p><a href="${back}">Return to your relay</a> · <a href="/projects">View Projects</a></p>`);
  } catch {
    return page("Project Mode", "<h1>Project service unavailable</h1>", 503);
  }
}
