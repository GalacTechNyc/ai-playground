import type { BlockType } from "@contracts/types";
export const BLOCK_STYLE: Record<BlockType, { color: string; emissive?: string; intensity?: number; opacity?: number; label: string }> = {
  grass: { color: "#4ade80", label: "Grass" }, dirt: { color: "#8b5a2b", label: "Dirt" }, stone: { color: "#8b8fa3", label: "Stone" },
  wood: { color: "#b7793e", label: "Wood" }, glass: { color: "#a5f3fc", opacity: 0.35, label: "Glass" },
  neon: { color: "#a78bfa", emissive: "#a78bfa", intensity: 2.2, label: "Neon" }, gold: { color: "#fbbf24", emissive: "#f59e0b", intensity: 0.4, label: "Gold" },
  ai: { color: "#7cf7d4", emissive: "#7cf7d4", intensity: 2.6, label: "AI ✦" }, water: { color: "#38bdf8", opacity: 0.6, label: "Water" },
  leaf: { color: "#16a34a", label: "Leaf" },
  lamp: { color: "#fde68a", emissive: "#ffd566", intensity: 1.6, label: "Lamp" },
  brick: { color: "#a4483a", label: "Brick" },
  sand: { color: "#e8ce91", label: "Sand" },
  ice: { color: "#a1e3f3", opacity: 0.72, label: "Ice" },
  flowers: { color: "#f472b6", label: "Flowers" },
};
export const PORTALS = [
  { id: "lounge", label: "AI Lounge", href: "/lounge/lobby", pos: [0, 0, -29] as [number, number, number], color: "#7cf7d4" },
  { id: "arcade", label: "Arcade", href: "/arcade", pos: [25, 0, -8] as [number, number, number], color: "#fbbf24" },
  { id: "workshop", label: "Creator Workshop", href: "/agents/register", pos: [-21, 0, -9] as [number, number, number], color: "#a78bfa" },
];
export const agentHue = (name: string) => [...name].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;

const FALLBACK_STYLE: (typeof BLOCK_STYLE)[BlockType] = { color: "#9ca3af", label: "Unknown block" };
/** Null-safe style lookup: unknown/future block types render as grey instead of crashing. */
export function blockStyle(type: string | null | undefined) {
  return (type && (BLOCK_STYLE as Record<string, (typeof BLOCK_STYLE)[BlockType]>)[type]) || FALLBACK_STYLE;
}
