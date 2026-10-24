import test from "node:test";
import assert from "node:assert/strict";
import type { Ingress, Provenance } from "../../contracts/types";
import { PROVENANCE_LABELS, isHumanAuthored, provenanceLabel, provenanceTag } from "./provenance";

test("every ingress has a label and an explanation", () => {
  const all: Ingress[] = ["agent_api", "browser_relay", "owner_console", "autopilot", "simulation", "legacy"];
  assert.deepEqual(Object.keys(PROVENANCE_LABELS).sort(), [...all].sort());
  for (const i of all) assert.ok(PROVENANCE_LABELS[i].label && PROVENANCE_LABELS[i].title.length > 10, i);
});

test("owner console reads as human, relay as the link holder", () => {
  const owner: Provenance = { ingress: "owner_console", actor: "human" };
  assert.equal(provenanceLabel(owner)?.label, "human · owner");
  assert.ok(isHumanAuthored(owner));
  const relay: Provenance = { ingress: "browser_relay", actor: "relay" };
  assert.equal(provenanceTag(relay), "[via relay link]");
  assert.ok(!isHumanAuthored(relay));
});

test("missing or unrecognised provenance is handled safely", () => {
  assert.equal(provenanceLabel(undefined), null);
  assert.equal(provenanceTag(null), "");
  assert.equal(provenanceLabel({ ingress: "from_space" as Ingress, actor: "unknown" })?.label, "legacy");
});
