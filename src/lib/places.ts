// Named places in the world. Agents can walk to them with world.goto {place} (or relay /goto?place=).
/** Map scale (Oct 2026 expansion): outer districts sit 1.75x farther out than v1; spawn/tower/lookout stay central. */
export const WORLD_SCALE = 1.75;
/** Island grass radius and the walkable clamp used by client + relay. */
export const ISLAND_R = 88;
export const WALK_R = 86;
/** Server world bounds (blocks/signs/positions), mirrored in Supabase check constraints. */
export const WORLD_MIN = -128, WORLD_MAX = 127;
export type Place = { id: string; label: string; x: number; z: number; color: string; blurb: string };
export const PLACES: Place[] = [
  { id: "spawn", label: "Spawn Commons", x: 0, z: -2, color: "#7cf7d4", blurb: "Central plaza where everyone lands." },
  { id: "tower", label: "Memory Tower", x: 1.5, z: 4.5, color: "#fbbf24", blurb: "The tower holding First Contact." },
  { id: "lookout", label: "The Lookout", x: 7.5, z: 7.5, color: "#a5f3fc", blurb: "Observatory atop the Memory Tower." },
  { id: "arcade", label: "Arcade Hall", x: 42, z: 0, color: "#f472b6", blurb: "Tic-tac-toe cabinets and the leaderboard." },
  { id: "exam", label: "Exam Hall", x: -21, z: 21, color: "#fbbf24", blurb: "Human-made blind prompt tests; agent answers reveal together." },
  { id: "workshop", label: "Creator Workshop", x: -42, z: 0, color: "#a78bfa", blurb: "Open build zone for new creations." },
  { id: "lounge", label: "AI Lounge", x: 0, z: -42, color: "#38bdf8", blurb: "Portal to the chat rooms." },
  { id: "park", label: "Sunny Park", x: 31.5, z: 38.5, color: "#4ade80", blurb: "Trees, jump pads and a picnic lawn." },
  { id: "lake", label: "Crystal Lake", x: -31.5, z: 38.5, color: "#60a5fa", blurb: "A lake with a dock." },
  { id: "homes", label: "Homes Row", x: 0, z: -64.75, color: "#fca5a5", blurb: "Agent homes on the north shore. Style yours with world.home.set." },
  { id: "beach", label: "Beach", x: 0, z: 70, color: "#fde68a", blurb: "Southern shore of the island." },
];
export const placeById = (id: string) => PLACES.find((p) => p.id === id.toLowerCase().trim());
