"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { PLACES } from "@/lib/places";

export const ISLAND_R = 50;
import { INTERACTABLES } from "./interactables";
const rand = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const nearPath = (x: number, z: number) => PLACES.some((p) => {
  const L = Math.hypot(p.x, p.z); if (L < 1) return false; const t = Math.max(0, Math.min(1, (x * p.x + z * p.z) / (L * L)));
  return Math.hypot(x - p.x * t, z - p.z * t) < 3.5;
});
export const TREES: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let i = 0; out.length < 70 && i < 600; i++) {
    const a = rand(i) * Math.PI * 2, r = 14 + rand(i + 99) * 33, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((z < -22 && z > -50 && Math.abs(x) < 36) || nearPath(x, z) || PLACES.some((p) => Math.hypot(p.x - x, p.z - z) < 7.5) || Math.hypot(x, z) < 13) continue;
    out.push([x, z, 0.8 + rand(i + 7) * 0.7]);
  }
  return out;
})();

function Instanced({ items, geo, color, emissive, y }: { items: [number, number, number][]; geo: THREE.BufferGeometry; color: string; emissive?: string; y: (s: number) => number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D();
    items.forEach(([x, z, s], i) => { o.position.set(x, y(s), z); o.scale.setScalar(s); o.rotation.y = rand(i) * 3; o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [items, y]);
  return <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow receiveShadow>
    <meshStandardMaterial color={color} emissive={emissive ?? "#000"} emissiveIntensity={emissive ? 0.4 : 0} flatShading /></instancedMesh>;
}

function Water() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (ref.current) ref.current.position.y = -0.35 + Math.sin(s.clock.elapsedTime * 0.8) * 0.06; });
  return <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.35, 0]} receiveShadow><circleGeometry args={[400, 64]} />
    <meshStandardMaterial color="#1e90c8" roughness={0.15} metalness={0.2} transparent opacity={0.92} /></mesh>;
}

function JumpPad({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => { if (ref.current) (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + Math.sin(s.clock.elapsedTime * 4) * 0.8; });
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.1, 0]} receiveShadow><cylinderGeometry args={[1.1, 1.2, 0.2, 24]} /><meshStandardMaterial color="#334155" /></mesh>
    <mesh ref={ref} position={[0, 0.22, 0]}><cylinderGeometry args={[0.8, 0.8, 0.06, 24]} /><meshStandardMaterial color="#facc15" emissive="#facc15" toneMapped={false} /></mesh>
  </group>;
}

export default function Island({ onGround }: { onGround: (e: ThreeEvent<PointerEvent>) => void }) {
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.25, 0.35, 2, 6), []);
  const crown = useMemo(() => new THREE.ConeGeometry(1.4, 3, 7), []);
  const paths = PLACES.filter((p) => Math.hypot(p.x, p.z) > 10);
  return (
    <group>
      <Water />
      {/* sand + grass island */}
      <mesh position={[0, -0.6, 0]} receiveShadow><cylinderGeometry args={[ISLAND_R + 4, ISLAND_R + 7, 1, 64]} /><meshStandardMaterial color="#f3dfa2" flatShading /></mesh>
      <mesh position={[0, -0.5, 0]} receiveShadow onPointerDown={onGround}><cylinderGeometry args={[ISLAND_R, ISLAND_R + 1.5, 1, 64]} /><meshStandardMaterial color="#5cc96b" flatShading /></mesh>
      {/* paths from the plaza to each district */}
      {paths.map((p) => { const L = Math.hypot(p.x, p.z) - 6; const a = Math.atan2(p.x, p.z);
        return <mesh key={p.id} position={[Math.sin(a) * (6 + L / 2), 0.02, Math.cos(a) * (6 + L / 2)]} rotation-y={a} receiveShadow>
          <boxGeometry args={[3, 0.04, L]} /><meshStandardMaterial color="#e8d4a8" /></mesh>; })}
      {/* Spawn Commons plaza */}
      <mesh position={[0, 0.03, 0]} receiveShadow><cylinderGeometry args={[11.5, 11.5, 0.06, 64]} /><meshStandardMaterial color="#cbd5e1" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.07, 0]}><ringGeometry args={[11.2, 11.6, 96]} /><meshBasicMaterial color="#7cf7d4" toneMapped={false} /></mesh>
      {/* Crystal Lake + dock */}
      <mesh position={[-18, 0.04, 26]} receiveShadow><cylinderGeometry args={[8, 8, 0.05, 48]} /><meshStandardMaterial color="#38bdf8" roughness={0.1} transparent opacity={0.85} /></mesh>
      <mesh position={[-18, 0.3, 19.5]} castShadow><boxGeometry args={[2, 0.2, 5]} /><meshStandardMaterial color="#a16207" /></mesh>
      {/* Arcade Hall */}
      <group position={[30, 0, 0]}>
        <mesh position={[0, 3, 0]} castShadow receiveShadow><boxGeometry args={[8, 6, 12]} /><meshStandardMaterial color="#312e81" /></mesh>
        <mesh position={[-4.05, 3, 0]}><boxGeometry args={[0.1, 4, 6]} /><meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={1.5} toneMapped={false} /></mesh>
        <Billboard position={[0, 7.5, 0]}><Text fontSize={1.2} color="#f472b6" outlineWidth={0.05} outlineColor="#1e1b4b">ARCADE</Text></Billboard>
      </group>
      {/* Creator Workshop build zone */}
      <group position={[-28, 0, 0]}>
        <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[14, 0.1, 14]} /><meshStandardMaterial color="#ede9fe" /></mesh>
        <gridHelper args={[14, 14, "#a78bfa", "#c4b5fd"]} position={[0, 0.12, 0]} />
      </group>
      {/* trees (instanced) */}
      <Instanced items={TREES} geo={trunk} color="#8b5a2b" y={(s) => s} />
      <Instanced items={TREES} geo={crown} color="#22a34a" y={(s) => 2 * s + 1.3 * s} />
      {INTERACTABLES.filter((i) => i.kind === "jumpPad").map((i) => <JumpPad key={i.id} x={i.x} z={i.z} />)}
      {PLACES.filter((p) => p.id !== "tower" && p.id !== "lookout").map((p) => (
        <Billboard key={p.id} position={[p.x, p.id === "arcade" || p.id === "workshop" || p.id === "lounge" ? 9 : p.id === "spawn" ? 6.5 : 3.2, p.id === "spawn" ? -9 : p.z]}>
          <Text fontSize={0.8} color={p.color} outlineWidth={0.05} outlineColor="#0b1020">{p.label.toUpperCase()}</Text>
        </Billboard>))}
    </group>
  );
}
