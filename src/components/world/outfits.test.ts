import test from "node:test";
import assert from "node:assert/strict";
import { SIGNATURE_OUTFITS, gait, hashString, hop, HOP_DURATION, outfitFor, signatureKey, walkIntensity, applyPassportOutfit, smoothYaw, jumpPhase } from "./outfits";

test("signature agents get their outfits", () => {
  assert.equal(outfitFor("Lumi", "x").kind, "halo");
  assert.equal(outfitFor("GPT-6", "x").kind, "visor");
  assert.equal(outfitFor("ChatGPT", "x").kind, "visor");
  assert.equal(outfitFor("Muse", "x").kind, "cosmic");
  assert.equal(outfitFor("Nova", "x").kind, "cosmic");
  assert.equal(outfitFor("Claude", "x").kind, "scarf");
  assert.equal(signatureKey("  claude "), "claude");
  assert.equal(signatureKey("Lumina"), null);
  assert.equal(signatureKey(""), null);
  assert.equal(signatureKey(undefined), null);
});

test("signature outfits are distinct", () => {
  const kinds = new Set(Object.values(SIGNATURE_OUTFITS).map((o) => o.kind));
  const shirts = new Set(Object.values(SIGNATURE_OUTFITS).map((o) => o.shirt));
  assert.equal(kinds.size, 4); assert.equal(shirts.size, 4);
});

test("other agents get a stable default accessory from their id", () => {
  const a = outfitFor("Zed", "abc-123"), b = outfitFor("Zed renamed", "abc-123");
  assert.deepEqual(a, b);
  assert.ok(["cap", "tophat", "crown", "headphones", "beanie"].includes(a.kind));
  const kinds = new Set(Array.from({ length: 60 }, (_, i) => outfitFor("bot", `id-${i}`).kind));
  assert.ok(kinds.size >= 3, "defaults should vary across ids");
  assert.equal(hashString("a"), hashString("a"));
  assert.doesNotThrow(() => outfitFor(null, null));
});

test("gait scales with speed", () => {
  assert.equal(gait(0).amp, 0);
  assert.ok(gait(1.6).amp > gait(1).amp && gait(1).amp > gait(0.6).amp);
  assert.ok(gait(1.6).freq > gait(1).freq);
  assert.ok(gait(1.6).bob > gait(0.6).bob);
  assert.equal(gait(1).lean, 0); assert.ok(gait(1.6).lean > 0);
  assert.equal(gait(99).amp, gait(1.6).amp);
});

test("walk intensity", () => {
  assert.equal(walkIntensity(0, 4.5, true), 0);
  assert.equal(walkIntensity(1.6, 4.5, false), 0.6);
  assert.equal(walkIntensity(4.5, 4.5, true), 1);
  assert.equal(walkIntensity(100, 4.5, true), 1.6);
});

test("arrival hop squashes then lands", () => {
  assert.deepEqual(hop(-1), { y: 0, sx: 1, sy: 1 });
  assert.deepEqual(hop(HOP_DURATION), { y: 0, sx: 1, sy: 1 });
  const crouch = hop(HOP_DURATION * 0.14); assert.ok(crouch.sy < 1 && crouch.sx > 1);
  const air = hop(HOP_DURATION * 0.6); assert.ok(air.y > 0.25);
});

test("passport accessory overrides are explicit and whitelisted", () => {
  const fromPassport = outfitFor("GPT-6", "agent-1", [
    "avatar:accessory=headphones",
    "avatar:shirt=#ABCDEF",
    "avatar:pants=#112233",
    "avatar:accent=#102030",
    "avatar:primary=#f0e0d0",
  ]);
  assert.deepEqual(fromPassport, {
    ...SIGNATURE_OUTFITS.gpt,
    kind: "headphones",
    shirt: "#abcdef",
    pants: "#112233",
    accent: "#102030",
    primary: "#f0e0d0",
  });
  // No avatar tags: legacy signature behavior remains unchanged.
  assert.deepEqual(outfitFor("Lumi", "x"), SIGNATURE_OUTFITS.lumi);
});

test("unknown wardrobe tags, script-like colors, and invalid kinds are ignored", () => {
  const base = outfitFor("Claude", "x");
  const customized = applyPassportOutfit(base, [
    "admin:true", "avatar:accessory=dragon", "avatar:shirt=javascript:alert(1)",
    "avatar:shirt=#12345", "avatar:accent=hsl(12,100%,50%)",
    "avatar:shirt=#000000", "avatar:accessory=crown",
  ]);
  assert.equal(customized.kind, "crown");
  assert.equal(customized.shirt, "#000000");
  assert.equal(customized.accent, base.accent);
  assert.equal(base.kind, "scarf", "passport styling never mutates the base template");
  assert.equal(outfitFor("Muse", "x", ["avatar:primary=red"]).primary, SIGNATURE_OUTFITS.muse.primary);
});

test("smooth turning takes the shortest arc with consistent frame-rate behavior", () => {
  const start = Math.PI - 0.04, dest = -Math.PI + 0.04;
  const next = smoothYaw(start, dest, 0.016);
  assert.ok(next > start, "yaw rotates across +PI rather than spinning backwards");
  assert.ok(Math.abs(next - start) < 0.08, "no sudden snap");
  const at60 = Array.from({ length: 60 }).reduce<number>((yaw) => smoothYaw(yaw, 2.3, 1 / 60), 0);
  const at30 = Array.from({ length: 30 }).reduce<number>((yaw) => smoothYaw(yaw, 2.3, 1 / 30), 0);
  assert.ok(Math.abs(at60 - at30) < 1e-8);
  assert.equal(smoothYaw(1, 2, 0), 1);
});

test("jump phases distinguish takeoff, landing, and grounded", () => {
  assert.equal(jumpPhase(0, 9), 0);
  assert.equal(jumpPhase(0.8, 6), 1);
  assert.equal(jumpPhase(0.8, -6), -1);
  assert.equal(jumpPhase(0.01, -4), 0);
  assert.equal(jumpPhase(NaN, 5), 0);
});
