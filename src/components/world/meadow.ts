// Meadow scatter: wildflowers, bushes and rocks across open grass (issue #9-friendly: all instanced).
// Pure helpers so placement is deterministic and testable.
import { ISLAND_R, PLACES } from "@/lib/places";
const AR = PLACES.find((p) => p.id === "arcade")!, WS = PLACES.find((p) => p.id === "workshop")!;
import { LAKE } from "./lake";

export type Scatter = { x: number; z: number; s: number; rot: number; color: number };
export const FLOWER_COLORS = ["#f472b6", "#facc15", "#ffffff", "#a78bfa", "#fb923c", "#60a5fa"] as const;
const rand = (i: number) => { const x = Math.sin(i * 91.7 + 47.3) * 24634.6345; return x - Math.floor(x); };

const nearPath = (x: number, z: number, w: number) => PLACES.some((p) => {
  const L = Math.hypot(p.x, p.z); if (L < 1) return false;
  const t = Math.max(0, Math.min(1, (x * p.x + z * p.z) / (L * L)));
  return Math.hypot(x - p.x * t, z - p.z * t) < w;
});

/** True when (x,z) is open grass: on the island, off paths, plaza, buildings, the lake and the north district. */
export function isOpenGround(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r < 13 || r > ISLAND_R - 3) return false;
  if (z < -35 && Math.abs(x) < 53) return false; // AI Lounge + Homes Row
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1.5) return false;
  if (Math.abs(x - (WS.x - 4)) < 8 && Math.abs(z - WS.z) < 8) return false; // Creator Workshop pad
  if (Math.abs(x - (AR.x + 6)) < 5.5 && Math.abs(z - AR.z) < 7.5) return false; // Arcade Hall
  if (nearPath(x, z, 2.2)) return false;
  return !PLACES.some((p) => Math.hypot(p.x - x, p.z - z) < 5);
}

/** Deterministic scatter of `count` items on open ground, keeping `gap` from trees and each other. */
export function scatter(count: number, seed: number, trees: readonly [number, number, number][], gap = 1.2, colors = 1): Scatter[] {
  const out: Scatter[] = [];
  for (let i = 0; out.length < count && i < count * 40; i++) {
    const k = seed * 1000 + i, a = rand(k) * Math.PI * 2, r = 13 + Math.sqrt(rand(k + 0.5)) * (ISLAND_R - 16);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isOpenGround(x, z)) continue;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.6)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap)) continue;
    out.push({ x, z, s: 0.7 + rand(k + 3) * 0.6, rot: rand(k + 5) * Math.PI * 2, color: Math.floor(rand(k + 7) * colors) % colors });
  }
  return out;
}
