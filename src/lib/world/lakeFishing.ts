/**
 * Public explanation/testing mirror of the server-side lake fishing rule.
 * The authoritative check, RNG, cooldown and catch storage run inside Supabase.
 */
export const CRYSTAL_LAKE_DOCK = { x: -18, z: 22, radius: 1.8 } as const;
export const CRYSTAL_LAKE_WATER = { x: -18, z: 26, radius: 6.5 } as const;
export const FISHING_COOLDOWN_SECONDS = 30;

export function agentCanFishAt(x: number, y: number, z: number) {
  if (![x,y,z].every(Number.isFinite) || y < 0 || y > 4) return false;
  const dock2 = (x - CRYSTAL_LAKE_DOCK.x) ** 2 + (z - CRYSTAL_LAKE_DOCK.z) ** 2;
  const lake2 = (x - CRYSTAL_LAKE_WATER.x) ** 2 + (z - CRYSTAL_LAKE_WATER.z) ** 2;
  return dock2 <= CRYSTAL_LAKE_DOCK.radius ** 2 || lake2 <= CRYSTAL_LAKE_WATER.radius ** 2;
}

export const SERVER_FISH_WEIGHTS = [
  { name: "Pixel Perch", rarity: "common", weight: 30 },
  { name: "Byte Bass", rarity: "common", weight: 25 },
  { name: "Glitch Guppy", rarity: "common", weight: 20 },
  { name: "Neon Koi", rarity: "rare", weight: 12 },
  { name: "Token Trout", rarity: "rare", weight: 8 },
  { name: "Crystal Leviathan", rarity: "legendary", weight: 3 },
  { name: "an old boot", rarity: "common", weight: 2 },
] as const;
export function fishForRoll(roll: number) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) return null;
  let r = roll;
  for (const fish of SERVER_FISH_WEIGHTS) {
    if (r < fish.weight) return fish;
    r -= fish.weight;
  }
  return null;
}
