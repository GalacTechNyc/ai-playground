"use client";
// Fix-It Board (issue #7, Claude): open world-idea issues, recently shipped ones and the
// latest World Dev chatter, on a billboard at Spawn Commons. Left half opens the GitHub
// issues; right half opens /lounge/dev. When an idea ships, the board throws a short
// fireworks show with a "#N SHIPPED!" banner.
import { useEffect, useRef, useState } from "react";
import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { usePoll } from "@/lib/usePoll";
import { FIXIT_REPO, clip, devLines, issueLines, issuesUrl, toCelebrate, type DevMessage, type FixItBoardData, type FixItIssue } from "@/lib/fixit";
import Fireworks from "./Fireworks";

/** East edge of the plaza, facing its centre; clear of the Memory Tower and the Arcade Hop pad. */
export const FIXIT_BOARD = { x: 9, z: 1, rotY: -Math.PI / 2 };

const W = 6.8, H = 3.6, BOTTOM = 0.5, TOP = BOTTOM + H;
const COL = W / 2 - 0.35; // usable width of each column
const ORANGE = "#fb923c", MINT = "#7cf7d4", GOLD = "#fbbf24";

const pointer = (on: boolean) => () => { document.body.style.cursor = on ? "pointer" : ""; };

function HitArea({ x, onClick }: { x: number; onClick: () => void }) {
  return (
    <mesh position={[x, BOTTOM + H / 2, 0.11]}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()}
      onPointerOver={pointer(true)} onPointerOut={pointer(false)}>
      <planeGeometry args={[W / 2, H]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export default function FixItBoard({ onNavigate }: { onNavigate: (href: string) => void }) {
  const board = usePoll<FixItBoardData>("/api/v0/fixit", 120_000);
  const dev = usePoll<{ messages?: DevMessage[] }>("/api/v0/rooms/dev/messages", 20_000);

  // Fireworks when an idea ships: once per issue per page load, newest close first.
  const celebrated = useRef(new Set<number>());
  const [party, setParty] = useState<FixItIssue | null>(null);
  useEffect(() => {
    if (!board || party) return;
    const next = toCelebrate(board.shipped, celebrated.current);
    if (!next.length) return;
    for (const i of next) celebrated.current.add(i.number);
    setParty(next[0]);
  }, [board, party]);

  const open = board ? issueLines(board.open, 7, 40) : ["Fetching ideas from GitHub…"];
  const shipped = board ? board.shipped.map((i) => `#${i.number} ${i.title}`) : [];
  const chat = devLines(dev?.messages ?? [], 5, 70);
  const left = -W / 2 + 0.25, right = 0.2;

  return (
    <group position={[FIXIT_BOARD.x, 0, FIXIT_BOARD.z]} rotation-y={FIXIT_BOARD.rotY}>
      {[-W / 2 + 0.2, W / 2 - 0.2].map((px) => (
        <mesh key={px} position={[px, TOP / 2, -0.05]} castShadow><boxGeometry args={[0.25, TOP, 0.25]} /><meshStandardMaterial color="#78350f" /></mesh>
      ))}
      <mesh position={[0, BOTTOM + H / 2, 0]} castShadow><boxGeometry args={[W, H, 0.15]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      <mesh position={[0, TOP + 0.15, 0]}><boxGeometry args={[W + 0.1, 0.3, 0.2]} />
        <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={1.5} toneMapped={false} /></mesh>
      <mesh position={[0, BOTTOM + H / 2 - 0.25, 0.08]}><boxGeometry args={[0.03, H - 0.9, 0.01]} /><meshBasicMaterial color="#4c1d95" /></mesh>

      <Text position={[0, TOP - 0.3, 0.09]} fontSize={0.32} color={ORANGE} anchorY="middle">FIX-IT BOARD</Text>

      {/* Left: open ideas + recently shipped (gold, like the gold blocks on the sign board) */}
      <Text position={[left, TOP - 0.7, 0.09]} fontSize={0.17} color={MINT} anchorX="left" anchorY="top">
        {board ? `OPEN IDEAS (${board.openCount})` : "OPEN IDEAS"}</Text>
      <Text position={[left, TOP - 0.98, 0.09]} fontSize={0.145} lineHeight={1.3} maxWidth={COL} color="#e2e8f0" anchorX="left" anchorY="top">
        {open.length ? open.join("\n") : "Nothing open. Pitch one in /lounge/dev!"}</Text>
      {shipped.length > 0 && <>
        <Text position={[left, BOTTOM + 1.0, 0.09]} fontSize={0.15} color={GOLD} anchorX="left" anchorY="top">SHIPPED</Text>
        <Text position={[left, BOTTOM + 0.78, 0.09]} fontSize={0.135} lineHeight={1.25} maxWidth={COL} color={GOLD} anchorX="left" anchorY="top">
          {shipped.map((s) => (s.length > 42 ? s.slice(0, 41) + "…" : s)).join("\n")}</Text>
      </>}

      {/* Right: latest World Dev messages */}
      <Text position={[right, TOP - 0.7, 0.09]} fontSize={0.17} color={MINT} anchorX="left" anchorY="top">WORLD DEV ROOM</Text>
      <Text position={[right, TOP - 0.98, 0.09]} fontSize={0.135} lineHeight={1.25} maxWidth={COL} color="#e2e8f0" anchorX="left" anchorY="top">
        {chat.length ? chat.join("\n") : "Quiet in here. Say hi in /lounge/dev."}</Text>

      <Text position={[0, BOTTOM + 0.12, 0.09]} fontSize={0.11} color="#94a3b8" anchorY="middle">
        click left for GitHub issues · click right for the dev room</Text>

      {party && <>
        <Fireworks key={party.number} spread={W / 2} onDone={() => setParty(null)} />
        <Text position={[0, TOP + 1.0, 0.09]} fontSize={0.48} color={GOLD} outlineWidth={0.03} outlineColor="#1e1b4b" anchorY="middle">
          {`#${party.number} SHIPPED!`}</Text>
        <Text position={[0, TOP + 0.55, 0.09]} fontSize={0.2} color="#fde68a" outlineWidth={0.02} outlineColor="#1e1b4b" anchorY="middle">
          {clip(party.title, 48)}</Text>
      </>}

      <HitArea x={-W / 4} onClick={() => window.open(board?.issuesUrl ?? issuesUrl(FIXIT_REPO), "_blank", "noopener,noreferrer")} />
      <HitArea x={W / 4} onClick={() => onNavigate("/lounge/dev")} />
    </group>
  );
}
