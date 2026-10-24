"use client";
import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { WorldHome } from "@contracts/types";

const MAX_RANGE = 2.45;
type Arrow = "forward" | "back" | "left" | "right";

function InteriorAvatar({ pressed }: { pressed: React.RefObject<Set<Arrow>> }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!group.current) return;
    const keys = pressed.current;
    const dx = (keys?.has("right") ? 1 : 0) - (keys?.has("left") ? 1 : 0);
    const dz = (keys?.has("back") ? 1 : 0) - (keys?.has("forward") ? 1 : 0);
    const len = Math.hypot(dx, dz);
    if (!len) return;
    group.current.position.x = THREE.MathUtils.clamp(group.current.position.x + (dx / len) * delta * 2.2, -MAX_RANGE, MAX_RANGE);
    group.current.position.z = THREE.MathUtils.clamp(group.current.position.z + (dz / len) * delta * 2.2, -MAX_RANGE, MAX_RANGE);
    group.current.rotation.y = Math.atan2(dx, dz);
  });
  return <group ref={group} position={[0, 0, 1.8]}>
    <mesh position={[0, 0.95, 0]} castShadow><boxGeometry args={[0.55, 0.8, 0.35]} /><meshStandardMaterial color="#7cf7d4" /></mesh>
    <mesh position={[0, 1.55, 0]} castShadow><boxGeometry args={[0.42, 0.42, 0.42]} /><meshStandardMaterial color="#fdd7b5" /></mesh>
    {[-0.17, 0.17].map((x) => <mesh key={x} position={[x, 0.38, 0]} castShadow><boxGeometry args={[0.2, 0.75, 0.24]} /><meshStandardMaterial color="#25334b" /></mesh>)}
    <Text position={[0, 2.12, 0]} fontSize={0.22} color="#7cf7d4">YOU</Text>
  </group>;
}

function Furniture({ style }: { style: WorldHome["style"] }) {
  const wood = "#936340";
  return <group>
    {/* Entry rug and low sofa */}
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 1.35]} receiveShadow><planeGeometry args={[2.5, 1.6]} /><meshStandardMaterial color="#a78bfa" /></mesh>
    <group position={[-1.6, 0, -1.15]}>
      <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[1.65, 0.62, 0.85]} /><meshStandardMaterial color="#384f83" /></mesh>
      <mesh position={[0, 0.82, -0.38]} castShadow><boxGeometry args={[1.7, 0.8, 0.22]} /><meshStandardMaterial color="#2b3963" /></mesh>
    </group>
    {/* Coffee table */}
    <mesh position={[-1.55, 0.38, 0.05]} castShadow><boxGeometry args={[1.25, 0.12, 0.75]} /><meshStandardMaterial color={wood} /></mesh>
    {[-2.05, -1.05].map((x) => [-0.22, 0.32].map(z => <mesh key={`${x},${z}`} position={[x, 0.18, z]}><boxGeometry args={[0.13, 0.36, 0.13]} /><meshStandardMaterial color={wood} /></mesh>))}
    {/* Bookshelf */}
    <mesh position={[2.35, 1.3, -1.05]} castShadow><boxGeometry args={[0.28, 2.6, 1.8]} /><meshStandardMaterial color="#653d27" /></mesh>
    {[0.55, 1.1, 1.65, 2.2].map((y, i) => <mesh key={i} position={[2.12, y, -1.05]}><boxGeometry args={[0.19, 0.12, 1.7]} /><meshStandardMaterial color="#bb895a" /></mesh>)}
    {/* Table, books and lamp */}
    <mesh position={[1.0, 0.7, -1.45]} castShadow><boxGeometry args={[1.6, 0.17, 1.0]} /><meshStandardMaterial color={wood} /></mesh>
    {[-0.6, 0.6].map((x) => [-1.85, -1.05].map(z => <mesh key={`${x},${z}`} position={[1 + x, 0.35, z]}><boxGeometry args={[0.12, 0.7, 0.12]} /><meshStandardMaterial color={wood} /></mesh>))}
    <mesh position={[1, 1.02, -1.45]}><cylinderGeometry args={[0.18, 0.12, 0.5, 12]} /><meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={1} /></mesh>
    <pointLight position={[1, 1.4, -1.45]} color="#fbbf24" intensity={1.3} distance={4} castShadow={false} />
    {/* Style-specific centerpiece: a distinct feel for each home type */}
    {style === "treehouse" ? <group position={[0.7, 0, 0.9]}>
      <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.4, 0.28, 0.9, 10]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
      <mesh position={[0, 1.25, 0]}><icosahedronGeometry args={[0.62, 0]} /><meshStandardMaterial color="#4ade80" /></mesh>
    </group> : style === "dome" ? <group position={[0.7, 0, 0.8]}>
      <mesh position={[0, 0.8, 0]}><octahedronGeometry args={[0.72]} /><meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={1} /></mesh>
    </group> : style === "tower" ? <group position={[0.7, 0, 0.8]}>
      <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.45, 0.55, 1.8, 8]} /><meshStandardMaterial color="#334155" /></mesh>
      <mesh position={[0, 1.95, 0]}><sphereGeometry args={[0.35, 12, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1.2} /></mesh>
    </group> : <group position={[0.7, 0, 0.8]}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.43, 0.32, 0.7, 12]} /><meshStandardMaterial color="#e8ce91" /></mesh>
      <mesh position={[0, 0.9, 0]}><sphereGeometry args={[0.5, 10, 8]} /><meshStandardMaterial color="#f472b6" /></mesh>
    </group>}
  </group>;
}

/** Interior is a true navigable room; a cutaway front and high camera keep furnishings visible. */
export default function HomeInterior({ home }: { home: WorldHome }) {
  const pressed = useRef(new Set<Arrow>());
  useEffect(() => {
    const map: Record<string, Arrow> = {
      KeyW: "forward", ArrowUp: "forward", KeyS: "back", ArrowDown: "back",
      KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
    };
    const onDown = (e: KeyboardEvent) => { const a = map[e.code]; if (!a) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      pressed.current.add(a); e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => { if (map[e.code]) pressed.current.delete(map[e.code]); };
    const onBlur = () => pressed.current.clear();
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp); window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); window.removeEventListener("blur", onBlur); };
  }, []);
  return <div className="relative h-[440px] overflow-hidden rounded-xl border border-line bg-[#141a2f]">
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [7, 6, 8], fov: 49 }} gl={{ antialias: true }}>
      <color attach="background" args={["#141a2f"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 8, 5]} intensity={1.8} castShadow />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow><planeGeometry args={[7, 7]} /><meshStandardMaterial color="#b8a38e" /></mesh>
      {[-3.25, 3.25].map((x) => <mesh key={x} position={[x, 1.65, 0]} receiveShadow>
        <boxGeometry args={[0.15, 3.3, 6.65]} /><meshStandardMaterial color={home.color} transparent opacity={0.55} />
      </mesh>)}
      <mesh position={[0, 1.65, -3.25]} receiveShadow><boxGeometry args={[6.65, 3.3, 0.15]} /><meshStandardMaterial color={home.color} /></mesh>
      <Text position={[0, 2.55, -3.1]} fontSize={0.35} color="#fff">{home.name}</Text>
      <Furniture style={home.style} />
      <InteriorAvatar pressed={pressed} />
      <OrbitControls makeDefault enablePan={false} maxDistance={13} minDistance={5} maxPolarAngle={Math.PI / 2.1} target={[0, 1.3, 0]} />
    </Canvas>
    <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 px-3 py-2 font-mono text-[11px] text-white">
      HOME INTERIOR · WASD / arrows move · drag to look
    </div>
    <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 md:hidden">
      {([["", "", ""], ["", "forward", ""], ["left", "back", "right"]] as Arrow[][]).slice(1).map((row, i) =>
        row.map((a, j) => a ? <button key={`${i}-${j}`} type="button" onPointerDown={() => pressed.current.add(a)}
          onPointerUp={() => pressed.current.delete(a)} onPointerLeave={() => pressed.current.delete(a)}
          className="rounded-lg border border-white/40 bg-ink/75 px-3 py-2 text-white">{a === "forward" ? "↑" : a === "back" ? "↓" : a === "left" ? "←" : "→"}</button> :
          <span key={`${i}-${j}`} />)
      )}
    </div>
  </div>;
}
