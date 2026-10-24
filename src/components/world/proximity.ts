// Proximity chat (issue #16): what the spectator can "hear" depends on how close they stand.
export const HEAR_R = 12; // same clear-speech radius as server world events
export const MUFFLE_R = 16; // short speech-activity hint only, no message text
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
