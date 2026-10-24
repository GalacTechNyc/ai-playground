/**
 * Pure travel logic for the v2 island. No React, DOM, Supabase or network writes.
 * The third-person controller decides how to apply a launch impulse.
 */
export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;

export interface PortalStation {
  id: string;
  label: string;
  href: string;
  position: WorldPoint;
  radius: number;
  color: string;
}

export interface JumpPad {
  id: string;
  label: string;
  position: WorldPoint;
  radius: number;
  cooldownMs: number;
  color: string;
  /** Velocity impulse in world units/s; apply in the player controller. */
  impulse: WorldPoint;
}

export const ISLAND_PORTALS: readonly PortalStation[] = [
  { id: "lounge", label: "AI Lounge", href: "/lounge/lobby", position: { x: 0, y: 0, z: -11 }, radius: 2.2, color: "#7cf7d4" },
  { id: "arcade", label: "Arcade Hall", href: "/arcade", position: { x: 11, y: 0, z: 0 }, radius: 2.2, color: "#fbbf24" },
  { id: "workshop", label: "Creator Workshop", href: "/agents/register", position: { x: -11, y: 0, z: 0 }, radius: 2.2, color: "#a78bfa" },
];

export const ISLAND_JUMP_PADS: readonly JumpPad[] = [
  { id: "spawn-launch-west", label: "Sky Jump", position: { x: -6, y: 0, z: -6 }, radius: 1.25,
    cooldownMs: 1800, color: "#7cf7d4", impulse: { x: -2, y: 10, z: -2 } },
  { id: "spawn-launch-east", label: "Arcade Hop", position: { x: 6, y: 0, z: -6 }, radius: 1.25,
    cooldownMs: 1800, color: "#fbbf24", impulse: { x: 2, y: 9, z: -2 } },
];

/** Horizontal proximity check, with a vertical constraint so high flyers do not retrigger pads. */
export function withinTrigger(position: WorldPoint, center: WorldPoint, radius: number, height = 2): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
    && radius >= 0
    && Math.abs(position.y - center.y) <= height
    && (position.x - center.x) ** 2 + (position.z - center.z) ** 2 <= radius ** 2;
}

/** Portal discovery only: navigation requires explicit E, click, or tap. */
export function nearestPortal(position: WorldPoint, portals: readonly PortalStation[] = ISLAND_PORTALS): PortalStation | null {
  let selected: PortalStation | null = null;
  let nearest = Infinity;
  for (const portal of portals) {
    if (!withinTrigger(position, portal.position, portal.radius, 3)) continue;
    const dist = (position.x - portal.position.x) ** 2 + (position.z - portal.position.z) ** 2;
    if (dist < nearest) { selected = portal; nearest = dist; }
  }
  return selected;
}

export interface JumpPadTriggerState {
  /** Remains set until the player leaves the trigger; avoids re-launching while standing still. */
  insidePadId: string | null;
  cooldownUntil: number;
}

export const INITIAL_PAD_STATE: JumpPadTriggerState = { insidePadId: null, cooldownUntil: 0 };

/**
 * Edge-trigger a jump on ENTER, never continuously while inside.
 * Cooldown applies across pads; crossing another pad during cooldown won't relaunch.
 * Caller stores nextState in a ref and applies launch only when pad is non-null.
 */
export function stepJumpPads(
  position: WorldPoint,
  prior: JumpPadTriggerState,
  nowMs: number,
  pads: readonly JumpPad[] = ISLAND_JUMP_PADS,
): { pad: JumpPad | null; nextState: JumpPadTriggerState } {
  const inside = pads.find((p) => withinTrigger(position, p.position, p.radius, 1.5)) ?? null;
  const entered = inside && prior.insidePadId !== inside.id;
  const pad = entered && nowMs >= prior.cooldownUntil ? inside : null;
  return {
    pad,
    nextState: {
      insidePadId: inside?.id ?? null,
      cooldownUntil: pad ? nowMs + pad.cooldownMs : prior.cooldownUntil,
    },
  };
}
