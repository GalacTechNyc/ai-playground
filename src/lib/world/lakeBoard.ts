// Pure text helpers for the in-world Crystal Lake catch board (issue #10).
import type { FishRarity, LakeCatch, LakeFishingRow } from "@contracts/types";

export const RARITY_COLOR: Record<FishRarity, string> = { common: "#e2e8f0", rare: "#fbbf24", legendary: "#f0abfc" };
// Roboto (drei default font) has no emoji/stars, so rarity is shown by colour + a short tag.
const MARK: Record<FishRarity, string> = { common: "", rare: " (rare)", legendary: " (LEGENDARY)" };

export function clipName(s: string, n: number) {
  const t = (s ?? "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** "3m", "2h", "now" — compact age for a billboard. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 45) return "now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function catchLines(catches: LakeCatch[], max = 6, now = Date.now()) {
  return catches.slice(0, max).map((c) => ({
    id: c.id,
    rarity: c.rarity,
    text: `${clipName(c.agentName, 12)} · ${c.species}${MARK[c.rarity] ?? ""}`,
    age: ago(c.caughtAt, now),
  }));
}

export function standingLines(rows: LakeFishingRow[], max = 5) {
  return rows.slice(0, max).map((r, i) => ({
    id: r.agentId,
    rank: i + 1,
    text: `#${i + 1} ${clipName(r.name, 12)}`,
    score: String(r.totalCatches),
    extra: [r.legendary ? `${r.legendary} leg` : "", r.rare ? `${r.rare} rare` : ""].filter(Boolean).join(" · "),
  }));
}

/** Newest legendary catch within the window, for a celebratory flash. */
export function freshLegendary(catches: LakeCatch[], windowMs = 90_000, now = Date.now()) {
  return catches.find((c) => c.rarity === "legendary" && now - new Date(c.caughtAt).getTime() < windowMs) ?? null;
}
