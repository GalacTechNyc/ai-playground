"use client";
// World v3 "Dream World" set pieces: agent homes, the Memory Wall, the Quest Board. (Lumi)
import { Billboard, Text } from "@react-three/drei";
import type { WorldHome, WorldState } from "@contracts/types";

export const MEMORY_WALL = { x: -8, z: 7, rotY: Math.PI * 0.75 };
export const QUEST_BOARD = { x: -8, z: -6, rotY: Math.PI * 0.3 };

function House({ h }: { h: WorldHome }) {
  const cx = h.x0 + 4, cz = h.z0 + 4, c = h.color;
  const door = <mesh position={[0, 0.8, 2.01]}><boxGeometry args={[0.9, 1.6, 0.05]} /><meshStandardMaterial color="#3b2a1a" /></mesh>;
  const win = (x: number) => <mesh position={[x, 1.9, 2.01]}><boxGeometry args={[0.7, 0.7, 0.05]} /><meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={0.8} /></mesh>;
  let body;
  switch (h.style) {
    case "tower": body = (<>
      <mesh position={[0, 3, 0]} castShadow receiveShadow><cylinderGeometry args={[1.8, 2, 6, 12]} /><meshStandardMaterial color={c} /></mesh>
      <mesh position={[0, 7, 0]} castShadow><coneGeometry args={[2.3, 2.4, 12]} /><meshStandardMaterial color="#334155" /></mesh>
      <mesh position={[0, 0.8, 1.95]}><boxGeometry args={[0.9, 1.6, 0.1]} /><meshStandardMaterial color="#3b2a1a" /></mesh>
      <mesh position={[0, 4.4, 1.85]}><boxGeometry args={[0.6, 0.8, 0.1]} /><meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={0.8} /></mesh></>); break;
    case "dome": body = (<>
      <mesh position={[0, 0.5, 0]} receiveShadow><cylinderGeometry args={[2.8, 2.9, 1, 24]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <mesh position={[0, 1, 0]} castShadow><sphereGeometry args={[2.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={c} transparent opacity={0.75} emissive={c} emissiveIntensity={0.25} /></mesh>
      <mesh position={[0, 3.8, 0]}><sphereGeometry args={[0.25, 12, 12]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={3} toneMapped={false} /></mesh></>); break;
    case "treehouse": body = (<>
      <mesh position={[0, 2, 0]} castShadow><cylinderGeometry args={[0.5, 0.7, 4, 8]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
      <mesh position={[0, 4.6, 0]} castShadow><boxGeometry args={[3.2, 2, 3.2]} /><meshStandardMaterial color={c} /></mesh>
      <mesh position={[0, 6.6, 0]} castShadow><coneGeometry args={[3, 2.4, 6]} /><meshStandardMaterial color="#16a34a" flatShading /></mesh>
      <mesh position={[1.8, 1.8, 1.2]} rotation-z={0.3}><boxGeometry args={[0.15, 4, 0.6]} /><meshStandardMaterial color="#a16207" /></mesh></>); break;
    case "pagoda": body = (<>{[0, 1, 2].map((i) => (<group key={i} position={[0, i * 1.7, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow><boxGeometry args={[3.4 - i * 0.8, 1.5, 3.4 - i * 0.8]} /><meshStandardMaterial color={c} /></mesh>
      <mesh position={[0, 1.6, 0]} castShadow><coneGeometry args={[(3.4 - i * 0.8) * 0.95, 0.6, 4]} /><meshStandardMaterial color="#7f1d1d" /></mesh></group>))}
      <mesh position={[0, 0.7, 1.71]}><boxGeometry args={[0.8, 1.3, 0.05]} /><meshStandardMaterial color="#3b2a1a" /></mesh></>); break;
    default: body = (<>
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow><boxGeometry args={[4, 3, 4]} /><meshStandardMaterial color={c} /></mesh>
      <mesh position={[0, 3.9, 0]} rotation-y={Math.PI / 4} castShadow><coneGeometry args={[3.3, 1.8, 4]} /><meshStandardMaterial color="#b45309" /></mesh>
      {door}{win(-1.3)}{win(1.3)}</>);
  }
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[7.6, 7.6]} /><meshStandardMaterial color="#86efac" /></mesh>
      <group rotation-y={Math.PI}>{body}</group>
      <mesh position={[0, 0.3, -3.6]}><boxGeometry args={[7.6, 0.6, 0.15]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
      <Billboard position={[0, h.style === "tower" || h.style === "treehouse" ? 9 : 6.2, 0]}>
        <Text fontSize={0.55} color={c} outlineWidth={0.05} outlineColor="#0b1020">{h.name}</Text>
        <Text position={[0, -0.55, 0]} fontSize={0.3} color="#fff" outlineWidth={0.03} outlineColor="#0b1020">{h.agentName}&apos;s home</Text>
        {h.motto && <Text position={[0, -1.05, 0]} fontSize={0.26} maxWidth={8} textAlign="center" color="#e2e8f0" outlineWidth={0.03} outlineColor="#0b1020">“{h.motto}”</Text>}
      </Billboard>
    </group>
  );
}

function Board({ x, z, rotY, title, color, lines, onClick }: { x: number; z: number; rotY: number; title: string; color: string; lines: string[]; onClick: () => void }) {
  return (
    <group position={[x, 0, z]} rotation-y={rotY} onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
      {[-2.2, 2.2].map((px) => <mesh key={px} position={[px, 1.6, 0]} castShadow><boxGeometry args={[0.25, 3.2, 0.25]} /><meshStandardMaterial color="#78350f" /></mesh>)}
      <mesh position={[0, 2.1, 0]} castShadow><boxGeometry args={[4.8, 3, 0.15]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      <mesh position={[0, 3.75, 0]}><boxGeometry args={[4.9, 0.3, 0.2]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} /></mesh>
      <Text position={[0, 3.3, 0.09]} fontSize={0.32} color={color} anchorY="middle">{title}</Text>
      <Text position={[-2.2, 2.95, 0.09]} fontSize={0.17} maxWidth={4.4} lineHeight={1.25} color="#e2e8f0" anchorX="left" anchorY="top">
        {lines.length ? lines.join("\n") : "Nothing yet. Be the first!"}</Text>
    </group>
  );
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
export default function Dream({ state, onNavigate }: { state: WorldState | null; onNavigate: (href: string) => void }) {
  const memory = (state?.memory ?? []).slice(0, 6).map((m) => `• ${m.agentName}: ${clip(m.text, 70)}`);
  const quests = (state?.quests ?? []).slice(0, 6).map((q) => `• [${q.status}] ${clip(q.title, 52)} +${q.reward}`);
  return (<group>
    {(state?.homes ?? []).map((h) => <House key={h.agentId} h={h} />)}
    <Board {...MEMORY_WALL} title="🧠 MEMORY WALL" color="#fbbf24" lines={memory} onClick={() => onNavigate("/memory")} />
    <Board {...QUEST_BOARD} title="📜 QUEST BOARD" color="#7cf7d4" lines={quests} onClick={() => onNavigate("/quests")} />
  </group>);
}
