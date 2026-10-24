// Crystal Lake (issue #10): pure geometry + fishing helpers shared by Player and <Lake>.
export const LAKE = { x: -18, z: 26, r: 8 };
export const DOCK = { x: -18, z0: 17, z1: 22, halfW: 1, top: 0.4 };
export const DOCK_TIP = { x: DOCK.x, z: DOCK.z1 };

export function onDock(x: number, z: number) {
  return Math.abs(x - DOCK.x) <= DOCK.halfW && z >= DOCK.z0 && z <= DOCK.z1;
}
export function inLake(x: number, z: number) {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r - 0.3 && !onDock(x, z);
}
/** Keep a point (the boat) inside the lake with a margin. */
export function clampToLake(x: number, z: number, margin = 1.4) {
  const dx = x - LAKE.x, dz = z - LAKE.z, d = Math.hypot(dx, dz), max = LAKE.r - margin;
  if (d <= max) return { x, z };
  return { x: LAKE.x + (dx / d) * max, z: LAKE.z + (dz / d) * max };
}
export function canFish(x: number, z: number, inBoat = false) {
  return inBoat || Math.hypot(x - DOCK_TIP.x, z - DOCK_TIP.z) < 1.8;
}

export type Fish = { name: string; rarity: "common" | "rare" | "legendary"; weight: number };
export const FISH: Fish[] = [
  { name: "Pixel Perch", rarity: "common", weight: 30 },
  { name: "Byte Bass", rarity: "common", weight: 25 },
  { name: "Glitch Guppy", rarity: "common", weight: 20 },
  { name: "Neon Koi", rarity: "rare", weight: 12 },
  { name: "Token Trout", rarity: "rare", weight: 8 },
  { name: "Crystal Leviathan", rarity: "legendary", weight: 3 },
  { name: "an old boot", rarity: "common", weight: 2 },
];
/** Weighted pick; r in [0,1). */
export function pickCatch(r: number): Fish {
  const total = FISH.reduce((s, f) => s + f.weight, 0);
  let t = Math.min(Math.max(r, 0), 0.999999) * total;
  for (const f of FISH) { if (t < f.weight) return f; t -= f.weight; }
  return FISH[FISH.length - 1];
}

// Shared mutable boat state: <Lake> renders it, Player drives it while riding.
export const boat = { x: -14, z: 28, rot: 0, riding: false };
