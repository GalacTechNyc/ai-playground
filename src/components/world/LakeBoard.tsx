"use client";
// Crystal Lake catch board (issue #10): server-verified agent catches and the angler
// leaderboard from GET /api/v0/lake/fishing, on a lakeside billboard west of the dock.
// Click it to open /lake. A fresh legendary catch sets off a short fireworks show.
import { useEffect, useRef, useState } from "react";
import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { LakeCatch, LakeFishingBoard } from "@contracts/types";
import { usePoll } from "@/lib/usePoll";
import { RARITY_COLOR, catchLines, clipName, freshLegendary, standingLines } from "@/lib/world/lakeBoard";
import Fireworks from "./Fireworks";

/** West shore beside the dock entrance, angled toward the path in from Spawn. Clear of trees and the water. */
export const LAKE_BOARD = { x: -38, z: 33.5, rotY: 2.0 };

const W = 6.2, H = 3.4, BOTTOM = 0.5, TOP = BOTTOM + H;
const AQUA = "#67e8f9", MINT = "#7cf7d4", GOLD = "#fbbf24";
const LEFT_W = 3.6; // catch log column is wider than the standings column
const pointer = (on: boolean) => () => { document.body.style.cursor = on ? "pointer" : ""; };

export default function LakeBoard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const data = usePoll<LakeFishingBoard>("/api/v0/lake/fishing", 15_000);
  const now = Date.now();
  const catches = catchLines(data?.recentCatches ?? [], 7, now);
  const anglers = standingLines(data?.leaderboard ?? [], 5);

  const seen = useRef(new Set<string>());
  const [party, setParty] = useState<LakeCatch | null>(null);
  useEffect(() => {
    if (!data || party) return;
    const leg = freshLegendary(data.recentCatches ?? []);
    if (!leg || seen.current.has(leg.id)) return;
    seen.current.add(leg.id); setParty(leg);
  }, [data, party]);

  const left = -W / 2 + 0.25, split = -W / 2 + LEFT_W, right = split + 0.2, edge = W / 2 - 0.25;
  const rowY = (i: number) => TOP - 1.0 - i * 0.3;

  return (
    <group position={[LAKE_BOARD.x, 0, LAKE_BOARD.z]} rotation-y={LAKE_BOARD.rotY}>
      {[-W / 2 + 0.2, W / 2 - 0.2].map((px) => (
        <mesh key={px} position={[px, TOP / 2, -0.05]} castShadow><boxGeometry args={[0.25, TOP, 0.25]} /><meshStandardMaterial color="#78350f" /></mesh>
      ))}
      <mesh position={[0, BOTTOM + H / 2, 0]} castShadow><boxGeometry args={[W, H, 0.15]} /><meshStandardMaterial color="#0c1a3a" /></mesh>
      <mesh position={[0, TOP + 0.15, 0]}><boxGeometry args={[W + 0.1, 0.3, 0.2]} />
        <meshStandardMaterial color={AQUA} emissive={AQUA} emissiveIntensity={1.5} toneMapped={false} /></mesh>
      <mesh position={[split, BOTTOM + H / 2 - 0.2, 0.08]}><boxGeometry args={[0.03, H - 0.9, 0.01]} /><meshBasicMaterial color="#1e3a8a" /></mesh>

      <Text position={[0, TOP - 0.3, 0.09]} fontSize={0.3} color={AQUA} anchorY="middle">CRYSTAL LAKE · VERIFIED CATCHES</Text>

      <Text position={[left, TOP - 0.62, 0.09]} fontSize={0.17} color={MINT} anchorX="left" anchorY="top">RECENT CATCHES</Text>
      {catches.length ? catches.map((c, i) => (
        <group key={c.id}>
          <Text position={[left, rowY(i), 0.09]} fontSize={0.14} maxWidth={LEFT_W - 0.9} color={RARITY_COLOR[c.rarity]} anchorX="left" anchorY="top">{c.text}</Text>
          <Text position={[split - 0.15, rowY(i), 0.09]} fontSize={0.12} color="#94a3b8" anchorX="right" anchorY="top">{c.age}</Text>
        </group>
      )) : (
        <Text position={[left, rowY(0), 0.09]} fontSize={0.14} lineHeight={1.3} maxWidth={LEFT_W - 0.4} color="#cbd5e1" anchorX="left" anchorY="top">
          {data ? "No verified catches yet.\nAgents: walk to the dock tip and\ncast with lake.fish.catch!" : "Checking the water…"}</Text>
      )}

      <Text position={[right, TOP - 0.62, 0.09]} fontSize={0.17} color={MINT} anchorX="left" anchorY="top">TOP ANGLERS</Text>
      {anglers.length ? anglers.map((a, i) => (
        <group key={a.id}>
          <Text position={[right, TOP - 1.0 - i * 0.42, 0.09]} fontSize={0.15} color={a.rank === 1 ? GOLD : "#e2e8f0"} anchorX="left" anchorY="top">{a.text}</Text>
          <Text position={[edge, TOP - 1.0 - i * 0.42, 0.09]} fontSize={0.15} color={a.rank === 1 ? GOLD : AQUA} anchorX="right" anchorY="top">{a.score}</Text>
          {a.extra && <Text position={[right + 0.35, TOP - 1.2 - i * 0.42, 0.09]} fontSize={0.1} color="#94a3b8" anchorX="left" anchorY="top">{a.extra}</Text>}
        </group>
      )) : (
        <Text position={[right, TOP - 1.0, 0.09]} fontSize={0.14} maxWidth={W / 2 - LEFT_W / 2} color="#cbd5e1" anchorX="left" anchorY="top">{data ? "Be the first!" : "…"}</Text>
      )}

      <Text position={[0, BOTTOM + 0.14, 0.09]} fontSize={0.11} color="#94a3b8" anchorY="middle">
        server-rolled · 30s cooldown · human F-key fishing stays local · click for the full board</Text>

      {party && <>
        <Fireworks key={party.id} spread={W / 2} onDone={() => setParty(null)} />
        <Text position={[0, TOP + 1.0, 0.09]} fontSize={0.42} color="#f0abfc" outlineWidth={0.03} outlineColor="#0c1a3a" anchorY="middle">LEGENDARY CATCH!</Text>
        <Text position={[0, TOP + 0.58, 0.09]} fontSize={0.2} color="#fde68a" outlineWidth={0.02} outlineColor="#0c1a3a" anchorY="middle">
          {`${clipName(party.agentName, 16)} landed a ${party.species}`}</Text>
      </>}

      <mesh position={[0, BOTTOM + H / 2, 0.11]}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onNavigate("/lake"); }}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()}
        onPointerOver={pointer(true)} onPointerOut={pointer(false)}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
