// Fix-It Board data helpers (issue #7, Claude). Pure functions, so they can be tested without React or the network.

export const FIXIT_REPO = "GalacTechNyc/ai-playground";
export const FIXIT_LABEL = "world-idea";

export type FixItIssue = { number: number; title: string; url: string; closedAt: string | null };
export type FixItBoardData = {
  version: "v0"; repo: string; issuesUrl: string;
  open: FixItIssue[]; openCount: number; shipped: FixItIssue[]; updatedAt: string;
};
export type DevMessage = { agentName: string; content: string; createdAt: string };

type RawIssue = {
  number?: unknown; title?: unknown; html_url?: unknown; state?: unknown;
  state_reason?: unknown; closed_at?: unknown; pull_request?: unknown;
};

export const issuesUrl = (repo: string, label = FIXIT_LABEL) =>
  `https://github.com/${repo}/issues?q=${encodeURIComponent(`is:open label:${label}`)}`;

/** Collapses whitespace and cuts to `n` characters, ending with "…" when shortened. */
export const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, Math.max(1, n - 1)).trimEnd() + "…" : t;
};

/**
 * Turns GitHub's issues response into board data: open ideas (newest first) and
 * recently shipped ones (latest close first). Pull requests and issues closed as
 * "not planned" or "duplicate" are left out.
 */
export function toFixItBoard(raw: unknown, repo: string, now = new Date(), shippedLimit = 3): FixItBoardData {
  const rows = Array.isArray(raw) ? (raw as RawIssue[]) : [];
  const issues = rows
    .filter((r) => r && typeof r.number === "number" && typeof r.title === "string" && !r.pull_request)
    .map((r) => ({
      number: r.number as number,
      title: r.title as string,
      url: typeof r.html_url === "string" ? r.html_url : `https://github.com/${repo}/issues/${r.number}`,
      closed: r.state === "closed",
      shipped: r.state === "closed" && r.state_reason !== "not_planned" && r.state_reason !== "duplicate",
      closedAt: typeof r.closed_at === "string" ? r.closed_at : null,
    }));
  const strip = ({ number, title, url, closedAt }: (typeof issues)[number]): FixItIssue => ({ number, title, url, closedAt });
  const open = issues.filter((i) => !i.closed).sort((a, b) => b.number - a.number).map(strip);
  const shipped = issues.filter((i) => i.shipped)
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? "")).slice(0, shippedLimit).map(strip);
  return { version: "v0", repo, issuesUrl: issuesUrl(repo), open, openCount: open.length, shipped, updatedAt: now.toISOString() };
}

/** How long after an issue closes the board still throws it a fireworks show. */
export const CELEBRATE_WINDOW_MS = 10 * 60_000;

/**
 * Shipped issues that deserve fireworks: closed within the last `windowMs` and not
 * celebrated yet in this browser. Newest close first.
 */
export function toCelebrate(shipped: FixItIssue[], celebrated: ReadonlySet<number>, now = Date.now(), windowMs = CELEBRATE_WINDOW_MS): FixItIssue[] {
  return shipped
    .filter((i) => {
      if (celebrated.has(i.number) || !i.closedAt) return false;
      const age = now - Date.parse(i.closedAt);
      return age >= -60_000 && age <= windowMs; // allow a minute of clock skew
    })
    .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
}

/** One line per issue, at most `max` lines; the last line says how many more there are when the list is cut. */
export function issueLines(issues: FixItIssue[], max: number, width: number): string[] {
  const line = (i: FixItIssue) => { const prefix = `#${i.number} `; return prefix + clip(i.title, width - prefix.length); };
  if (issues.length <= max) return issues.map(line);
  const shown = issues.slice(0, max - 1).map(line);
  return [...shown, `+${issues.length - shown.length} more on GitHub`];
}

/** The latest `max` dev-room messages, newest first, as "Name: text". */
export function devLines(messages: DevMessage[], max: number, width: number): string[] {
  return [...messages]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, max)
    .map((m) => `${m.agentName}: ${clip(m.content, Math.max(8, width - m.agentName.length - 2))}`);
}
