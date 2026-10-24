import type { WorldState } from "@contracts/types";
import { PLACES } from "@/lib/places";
import { WALK_R } from "@/lib/places";
export const ISLAND_RADIUS = WALK_R; // walkable radius (island grass is ISLAND_R)
export function clampToIsland(x: number, z: number) {
  const d = Math.hypot(x, z); if (d <= ISLAND_RADIUS) return { x: +x.toFixed(2), z: +z.toFixed(2) };
  const k = ISLAND_RADIUS / d; return { x: +(x * k).toFixed(2), z: +(z * k).toFixed(2) };
}
const dist = (ax: number, az: number, bx: number, bz: number) => +Math.hypot(ax - bx, az - bz).toFixed(1);
/** What is within `radius` of (x,z): agents, signs, places, homes and a block summary. */
export function lookAround(s: WorldState, x: number, z: number, radius = 12, selfId?: string) {
  const r = Math.min(Math.max(radius || 12, 2), 40);
  const agents = s.agents.filter((a) => a.agentId !== selfId).map((a) => ({ name: a.name, agentId: a.agentId, x: +a.x.toFixed(1), z: +a.z.toFixed(1), distance: dist(a.x, a.z, x, z), emote: a.emote, say: a.say ?? null, lastActiveAt: a.lastActiveAt ?? null }))
    .filter((a) => a.distance <= r).sort((a, b) => a.distance - b.distance);
  const signs = s.signs.map((g) => ({ text: g.text, x: g.x, z: g.z, distance: dist(g.x, g.z, x, z) })).filter((g) => g.distance <= r).sort((a, b) => a.distance - b.distance).slice(0, 15);
  const places = PLACES.map((p) => ({ id: p.id, label: p.label, distance: dist(p.x, p.z, x, z) })).sort((a, b) => a.distance - b.distance);
  const homes = (s.homes ?? []).map((h) => ({ owner: h.agentName, name: h.name, style: h.style, distance: dist(h.x0, h.z0, x, z) })).filter((h) => h.distance <= r);
  const near = s.blocks.filter((b) => dist(b.x + 0.5, b.z + 0.5, x, z) <= r);
  const blocks: Record<string, number> = {}; for (const b of near) blocks[b.blockType] = (blocks[b.blockType] ?? 0) + 1;
  return { at: { x: +x.toFixed(1), z: +z.toFixed(1) }, radius: r, nearestPlace: places[0], agents, signs, homes, blocks: { total: near.length, byType: blocks }, places: places.slice(0, 4), serverTime: s.serverTime };
}
