/**
 * Per-agent signature outfits + gait math for avatars (issue #5).
 * Pure functions only (no three.js) so they're unit-testable.
 */
export type AccessoryKind = "halo" | "visor" | "cosmic" | "scarf" | "cap" | "tophat" | "crown" | "headphones" | "beanie";

export type Outfit = {
  /** Which accessory set to render. */
  kind: AccessoryKind;
  /** Shirt/torso colour (null = keep the agent's hue colour). */
  shirt: string | null;
  /** Accessory main colour. */
  primary: string;
  /** Accessory accent / glow colour. */
  accent: string;
  /** Pants colour. */
  pants: string;
};

export const SIGNATURE_OUTFITS: Record<"lumi" | "gpt" | "muse" | "claude", Outfit> = {
  // Lumi: warm gold light — glowing halo + light orb.
  lumi: { kind: "halo", shirt: "#f5b942", primary: "#ffd56b", accent: "#fff3c4", pants: "#7c4a12" },
  // GPT-6: teal "Signal House" — visor + antenna.
  gpt: { kind: "visor", shirt: "#14b8a6", primary: "#0f766e", accent: "#5eead4", pants: "#134e4a" },
  // Muse (aka Nova): purple / cosmic — glass dome helmet + orbiting star.
  muse: { kind: "cosmic", shirt: "#7c3aed", primary: "#c4b5fd", accent: "#f0abfc", pants: "#2e1065" },
  // Claude: terracotta "The Notebook" — scarf + notebook backpack.
  claude: { kind: "scarf", shirt: "#c2410c", primary: "#d97757", accent: "#fef3c7", pants: "#431407" },
};

/** Map an agent display name to its signature key, if any. */
export function signatureKey(name: string | null | undefined): keyof typeof SIGNATURE_OUTFITS | null {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return null;
  if (n === "lumi" || n.startsWith("lumi ")) return "lumi";
  if (n.startsWith("gpt") || n.includes("chatgpt")) return "gpt";
  if (n === "muse" || n === "nova" || n.includes("meta muse") || n.startsWith("muse ") || n.startsWith("nova ")) return "muse";
  if (n === "claude" || n.startsWith("claude ")) return "claude";
  return null;
}

/** Small stable string hash (FNV-1a, 32-bit). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const DEFAULT_KINDS: AccessoryKind[] = ["cap", "tophat", "crown", "headphones", "beanie"];

/** Outfit for any agent: signature agents get theirs; everyone else a random-but-stable one from their id. */
export function outfitFor(name: string | null | undefined, id: string | null | undefined): Outfit {
  const key = signatureKey(name);
  if (key) return SIGNATURE_OUTFITS[key];
  const h = hashString(id || name || "anon");
  const hue = h % 360, hue2 = (hue + 150) % 360;
  return {
    kind: DEFAULT_KINDS[(h >>> 9) % DEFAULT_KINDS.length],
    shirt: null,
    primary: `hsl(${hue}, 70%, 50%)`,
    accent: `hsl(${hue2}, 80%, 65%)`,
    pants: "#1e293b",
  };
}

/**
 * Gait for a walk intensity: 0 = still, ~0.6 = ambling, 1 = walking, up to 1.6 = running.
 * Limb swing amplitude, step frequency and body bob all scale with speed.
 */
export function gait(walk: number) {
  const w = Math.max(0, Math.min(walk, 1.6));
  return {
    freq: w === 0 ? 0 : 7 + w * 4,          // steps/sec-ish (radians multiplier)
    amp: Math.min(1.15, 0.7 * w),            // limb swing (radians)
    bob: 0.05 + 0.07 * Math.max(0, w - 0.4), // body bounce height
    lean: Math.max(0, w - 1) * 0.25,         // forward lean when running
  };
}

/** Walk intensity for an agent moving at `speed` units/sec (base walk speed `base`). */
export function walkIntensity(speed: number, base: number, travelling: boolean) {
  if (speed <= 0) return 0;
  if (!travelling) return 0.6;
  return Math.max(1, Math.min(1.6, speed / base));
}

export const HOP_DURATION = 0.45;
/** Arrival hop: returns vertical offset and squash scale for time since arrival (seconds). */
export function hop(since: number) {
  if (since < 0 || since >= HOP_DURATION) return { y: 0, sx: 1, sy: 1 };
  const p = since / HOP_DURATION;
  if (p < 0.15) { const q = p / 0.15; return { y: 0, sx: 1 + 0.12 * q, sy: 1 - 0.15 * q }; } // crouch
  const a = (p - 0.15) / 0.85; // airborne then settle
  const y = Math.sin(a * Math.PI) * 0.35;
  const stretch = Math.sin(a * Math.PI) * 0.08;
  return { y, sx: 1 - stretch * 0.5, sy: 1 + stretch };
}
