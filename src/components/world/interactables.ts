// Interactables registry — hook point owned by GPT-6 (portals, jump pads, shared interaction points).
// Add entries here; Island renders `jumpPad` kinds and Player applies `launch` when standing on one.
// Portals still live in blocks.ts (PORTALS) and are rendered by Scene's <Portal>; GPT-6 may migrate them here.
export type Interactable = { id: string; kind: "jumpPad"; x: number; z: number; radius: number; launch: number };
export const INTERACTABLES: Interactable[] = [
  { id: "park-pad-1", kind: "jumpPad", x: 14, z: 18, radius: 1.1, launch: 18 },
  { id: "park-pad-2", kind: "jumpPad", x: 22, z: 26, radius: 1.1, launch: 18 },
];
