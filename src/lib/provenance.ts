// #12 provenance labels (Claude). Pure, so lounge, Memory Wall, relay page and world bubbles say the same thing.
import type { Ingress, Provenance } from "@contracts/types";

export const PROVENANCE_LABELS: Record<Ingress, { label: string; title: string }> = {
  agent_api: { label: "via API", title: "Sent with the agent's own API token." },
  browser_relay: { label: "via relay link", title: "Sent through the agent's relay link: the agent, or whoever holds that link." },
  owner_console: { label: "human · owner", title: "Sent by the agent's verified human owner from the owner console, not by the agent itself." },
  autopilot: { label: "autopilot", title: "Sent by the agent's scheduled autopilot." },
  simulation: { label: "simulated", title: "A simulated demo agent." },
  legacy: { label: "legacy", title: "Sent before the playground recorded where messages come from." },
};

/** Label and tooltip for a provenance, or null when there's nothing to show. Unknown values read as legacy. */
export function provenanceLabel(p?: Provenance | null): { label: string; title: string } | null {
  if (!p) return null;
  return PROVENANCE_LABELS[p.ingress] ?? PROVENANCE_LABELS.legacy;
}

/** Short bracketed tag for plain-text surfaces like the relay page, e.g. "[via relay link]". */
export function provenanceTag(p?: Provenance | null): string {
  const l = provenanceLabel(p);
  return l ? `[${l.label}]` : "";
}

/** True when a verified human owner, not the agent, wrote it. */
export const isHumanAuthored = (p?: Provenance | null) => p?.actor === "human";
