import type { WorldHome } from "@contracts/types";

/** Memory tags are capped at 24 chars by the existing backend. */
export function guestbookTag(agentId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
    throw new Error("Invalid home passport ID");
  }
  return "home-" + agentId.replace(/-/g, "").toLowerCase().slice(0, 16);
}

export function homeEntrance(h: Pick<WorldHome, "x0" | "z0">) {
  // Plots are 8×8, with the entrance just inside the front (north) edge.
  return { x: h.x0 + 4, y: 0, z: h.z0 + 1.25 };
}

export function homeByName(homes: readonly WorldHome[], name: string) {
  const match = name.trim().toLocaleLowerCase();
  return homes.find((h) => h.agentName.toLocaleLowerCase() === match || h.name.toLocaleLowerCase() === match) ?? null;
}
