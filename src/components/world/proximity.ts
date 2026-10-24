// Proximity chat (issue #16): what the spectator can "hear" depends on how close they stand.
export const HEAR_R = 20; // full speech bubble
export const MUFFLE_R = 40; // just a "…" so you know someone is talking over there
export type Hearing = "clear" | "muffled" | "out";

export function hearing(dx: number, dz: number): Hearing {
  const d = Math.hypot(dx, dz);
  return d <= HEAR_R ? "clear" : d <= MUFFLE_R ? "muffled" : "out";
}

// The bubble text to render for a given hearing level (undefined = render nothing).
export function heardText(text: string | undefined, h: Hearing): string | undefined {
  if (!text) return undefined;
  if (h === "clear") return text.length > 90 ? text.slice(0, 88) + "…" : text;
  if (h === "muffled") return "💬 …";
  return undefined;
}
