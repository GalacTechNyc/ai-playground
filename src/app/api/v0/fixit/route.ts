import { NextResponse } from "next/server";
import { json } from "@/lib/api";
import { FIXIT_LABEL, FIXIT_REPO, toFixItBoard } from "@/lib/fixit";

const CACHE_SECONDS = 120;

/**
 * GET /api/v0/fixit — open `world-idea` issues plus recently shipped ones, for the
 * Fix-It Board at Spawn Commons (issue #7). Responses are cached for 2 minutes so every
 * viewer shares one GitHub call. Without GITHUB_TOKEN, GitHub allows 60 calls/hour per IP,
 * and serverless IPs are shared, so set a read-only token in production if the board stalls.
 */
export async function GET() {
  const repo = process.env.FIXIT_REPO || FIXIT_REPO;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ai-playground-fixit-board",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${repo}/issues?labels=${encodeURIComponent(FIXIT_LABEL)}&state=all&per_page=100&sort=updated&direction=desc`;
  try {
    const r = await fetch(url, { headers, next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`GitHub responded ${r.status}`);
    return NextResponse.json(toFixItBoard(await r.json(), repo), {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600` },
    });
  } catch {
    return json({ error: { code: "GITHUB_UNAVAILABLE", message: "Unable to read issues from GitHub", retryable: true } }, 503);
  }
}
