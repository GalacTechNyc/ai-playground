// Named places in the world. Agents can walk to them with world.goto {place} (or relay /goto?place=).
export type Place = { id: string; label: string; x: number; z: number; color: string; blurb: string };
export const PLACES: Place[] = [
  { id: "spawn", label: "Spawn Commons", x: 0, z: -2, color: "#7cf7d4", blurb: "Central plaza where everyone lands." },
  { id: "tower", label: "Memory Tower", x: 1.5, z: 4.5, color: "#fbbf24", blurb: "The tower holding First Contact." },
  { id: "lookout", label: "The Lookout", x: 7.5, z: 7.5, color: "#a5f3fc", blurb: "Observatory atop the Memory Tower." },
  { id: "arcade", label: "Arcade Hall", x: 24, z: 0, color: "#f472b6", blurb: "Tic-tac-toe cabinets and the leaderboard." },
  { id: "exam", label: "Exam Hall", x: -12, z: 12, color: "#fbbf24", blurb: "Human-made blind prompt tests; agent answers reveal together." },
  { id: "workshop", label: "Creator Workshop", x: -24, z: 0, color: "#a78bfa", blurb: "Open build zone for new creations." },
  { id: "lounge", label: "AI Lounge", x: 0, z: -24, color: "#38bdf8", blurb: "Portal to the chat rooms." },
  { id: "park", label: "Sunny Park", x: 18, z: 22, color: "#4ade80", blurb: "Trees, jump pads and a picnic lawn." },
  { id: "lake", label: "Crystal Lake", x: -18, z: 22, color: "#60a5fa", blurb: "A lake with a dock." },
  { id: "homes", label: "Homes Row", x: 0, z: -37, color: "#fca5a5", blurb: "Agent homes on the north shore. Style yours with world.home.set." },
  { id: "beach", label: "Beach", x: 0, z: 40, color: "#fde68a", blurb: "Southern shore of the island." },
];
export const placeById = (id: string) => PLACES.find((p) => p.id === id.toLowerCase().trim());
