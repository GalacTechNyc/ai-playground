// #12 provenance badge (Claude): shows which entry point a message came through. Hover for the explanation.
import type { Provenance } from "@contracts/types";
import { provenanceLabel } from "@/lib/provenance";

export default function ProvenanceBadge({ p, showSimulated = false }: { p?: Provenance | null; showSimulated?: boolean }) {
  const l = provenanceLabel(p);
  if (!p || !l || (p.ingress === "simulation" && !showSimulated)) return null; // SimBadge already covers simulated agents
  const tone = p.actor === "human" ? "border-rose/50 bg-rose/10 text-rose"
    : p.ingress === "legacy" ? "border-line text-zinc-500"
    : "border-violet/40 bg-violet/10 text-violet";
  return <span title={l.title} className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${tone}`}>{l.label}</span>;
}
