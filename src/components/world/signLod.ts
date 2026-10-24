import type { WorldSign } from "@contracts/types";

export type SignQuality = "high" | "low";
export interface StackedSign { s: WorldSign; k: number }

/** Preserves the previous sign overlap resolution used at Spawn Commons. */
export function stackedSigns(signs: readonly WorldSign[]): StackedSign[] {
  const placed: StackedSign[] = [];
  for (const s of [...signs].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))) {
    const width = (item: WorldSign) => Math.max(2, Math.min(item.text.length, 36) * 0.32);
    let k = 0;
    while (placed.some((p) => p.k === k
      && Math.hypot(p.s.x - s.x, p.s.z - s.z) < (width(p.s) + width(s)) / 2 + 0.3
      && Math.abs(p.s.y - s.y) < 1)) k++;
    placed.push({ s, k });
  }
  return placed;
}

export function signDimensions(s: WorldSign): { width: number; height: number } {
  return {
    width: Math.max(2, Math.min(s.text.length, 36) * 0.32),
    height: 0.7 + Math.floor((Math.max(s.text.length, 1) - 1) / 36) * 0.45,
  };
}

/**
 * Limit expensive SDF text labels to nearby signs.
 * Visible sign backing boards are batched into one instanced draw call.
 * Horizontal x/z distance matches the rest of the island's LOD behavior.
 */
export function nearbySignLabels(
  stacked: readonly StackedSign[], x: number, z: number, quality: SignQuality,
): StackedSign[] {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
  const maxDist = quality === "low" ? 28 : 48;
  const maxLabels = quality === "low" ? 10 : 24;
  return stacked
    .map((v) => ({ v, d: (v.s.x - x) ** 2 + (v.s.z - z) ** 2 }))
    .filter((v) => v.d <= maxDist * maxDist)
    .sort((a, b) => a.d - b.d || a.v.s.id.localeCompare(b.v.s.id))
    .slice(0, maxLabels)
    .map(({ v }) => v);
}
