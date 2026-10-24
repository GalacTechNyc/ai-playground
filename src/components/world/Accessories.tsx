"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Outfit } from "./outfits";

/**
 * Signature accessories for blocky avatars (issue #5). Plain meshes only.
 * Coordinates are in Blocky's frame: head centre y=2.1 (0.56 cube), face toward +z.
 * In low quality, glow is toned down and animated extras (orb, orbiting star) are skipped.
 */
export default function Accessory({ outfit, low = false }: { outfit: Outfit; low?: boolean }) {
  const spin = useRef<THREE.Group>(null);
  const blink = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (spin.current) spin.current.rotation.y = t * 1.6;
    if (blink.current) blink.current.emissiveIntensity = 1 + (Math.sin(t * 5) > 0.6 ? 2.5 : 0);
  });
  const glow = low ? 0.6 : 2.2;
  const { primary: p, accent: c } = outfit;
  switch (outfit.kind) {
    case "halo":
      return (<group>
        <mesh position={[0, 2.62, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.3, 0.045, 8, 28]} />
          <meshStandardMaterial color={p} emissive={p} emissiveIntensity={glow} toneMapped={low} /></mesh>
        {!low && <group ref={spin} position={[0, 2.1, 0]}>
          <mesh position={[0.55, 0.25, 0]}><sphereGeometry args={[0.09, 12, 10]} />
            <meshStandardMaterial color={c} emissive={c} emissiveIntensity={3} toneMapped={false} /></mesh>
        </group>}
      </group>);
    case "visor":
      return (<group>
        <mesh position={[0, 2.16, 0.29]}><boxGeometry args={[0.62, 0.15, 0.06]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={glow} toneMapped={low} transparent opacity={0.9} /></mesh>
        <mesh position={[0, 2.16, 0]}><boxGeometry args={[0.6, 0.06, 0.6]} /><meshStandardMaterial color={p} /></mesh>
        <mesh position={[0.18, 2.55, 0]}><cylinderGeometry args={[0.02, 0.02, 0.34, 6]} /><meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[0.18, 2.74, 0]}><sphereGeometry args={[0.06, 10, 8]} />
          <meshStandardMaterial ref={low ? undefined : blink} color={c} emissive={c} emissiveIntensity={glow} toneMapped={low} /></mesh>
      </group>);
    case "cosmic":
      return (<group>
        <mesh position={[0, 2.14, 0]}><sphereGeometry args={[0.44, 20, 14]} />
          <meshStandardMaterial color={p} transparent opacity={0.22} roughness={0.05} metalness={0.2} depthWrite={false} /></mesh>
        <mesh position={[0, 1.82, 0]}><cylinderGeometry args={[0.36, 0.36, 0.08, 16]} /><meshStandardMaterial color="#4c1d95" metalness={0.4} roughness={0.4} /></mesh>
        {low
          ? <mesh position={[0.4, 2.55, 0]}><octahedronGeometry args={[0.08]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={glow} /></mesh>
          : <group ref={spin} position={[0, 2.45, 0]} rotation-z={0.3}>
              <mesh position={[0.6, 0, 0]}><octahedronGeometry args={[0.1]} />
                <meshStandardMaterial color={c} emissive={c} emissiveIntensity={3} toneMapped={false} /></mesh>
            </group>}
      </group>);
    case "scarf":
      return (<group>
        <mesh position={[0, 1.8, 0]}><boxGeometry args={[0.7, 0.16, 0.5]} /><meshStandardMaterial color={p} /></mesh>
        <mesh position={[0.22, 1.55, 0.25]} rotation-z={0.12}><boxGeometry args={[0.16, 0.42, 0.06]} /><meshStandardMaterial color={p} /></mesh>
        <mesh position={[0.22, 1.36, 0.25]} rotation-z={0.12}><boxGeometry args={[0.17, 0.05, 0.065]} /><meshStandardMaterial color={c} /></mesh>
        {/* notebook backpack */}
        <mesh position={[0, 1.38, -0.33]}><boxGeometry args={[0.56, 0.66, 0.22]} /><meshStandardMaterial color="#7c2d12" /></mesh>
        <mesh position={[0, 1.38, -0.445]}><boxGeometry args={[0.46, 0.56, 0.01]} /><meshStandardMaterial color={c} /></mesh>
        <mesh position={[0.17, 1.38, -0.452]}><boxGeometry args={[0.05, 0.56, 0.01]} /><meshStandardMaterial color={p} /></mesh>
      </group>);
    case "cap":
      return (<group>
        <mesh position={[0, 2.43, 0]}><boxGeometry args={[0.6, 0.14, 0.6]} /><meshStandardMaterial color={p} /></mesh>
        <mesh position={[0, 2.38, 0.38]}><boxGeometry args={[0.5, 0.04, 0.24]} /><meshStandardMaterial color={c} /></mesh>
      </group>);
    case "tophat":
      return (<group>
        <mesh position={[0, 2.4, 0]}><cylinderGeometry args={[0.42, 0.42, 0.04, 20]} /><meshStandardMaterial color="#111827" /></mesh>
        <mesh position={[0, 2.6, 0]}><cylinderGeometry args={[0.26, 0.26, 0.4, 20]} /><meshStandardMaterial color="#111827" /></mesh>
        <mesh position={[0, 2.46, 0]}><cylinderGeometry args={[0.265, 0.265, 0.08, 20]} /><meshStandardMaterial color={p} /></mesh>
      </group>);
    case "crown":
      return (<group position={[0, 2.46, 0]}>
        <mesh><cylinderGeometry args={[0.3, 0.3, 0.14, 12, 1, true]} /><meshStandardMaterial color="#facc15" metalness={0.7} roughness={0.3} side={THREE.DoubleSide} /></mesh>
        {[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return (
          <mesh key={i} position={[Math.sin(a) * 0.28, 0.12, Math.cos(a) * 0.28]}><coneGeometry args={[0.06, 0.14, 4]} /><meshStandardMaterial color="#facc15" metalness={0.7} roughness={0.3} /></mesh>); })}
        <mesh position={[0, 0, 0.3]}><octahedronGeometry args={[0.05]} /><meshStandardMaterial color={p} /></mesh>
      </group>);
    case "headphones":
      return (<group>
        <mesh position={[0, 2.42, 0]}><boxGeometry args={[0.68, 0.06, 0.1]} /><meshStandardMaterial color="#1f2937" /></mesh>
        <mesh position={[0.32, 2.12, 0]}><boxGeometry args={[0.1, 0.24, 0.24]} /><meshStandardMaterial color={p} /></mesh>
        <mesh position={[-0.32, 2.12, 0]}><boxGeometry args={[0.1, 0.24, 0.24]} /><meshStandardMaterial color={p} /></mesh>
      </group>);
    case "beanie":
      return (<group>
        <mesh position={[0, 2.42, 0]}><boxGeometry args={[0.6, 0.2, 0.6]} /><meshStandardMaterial color={p} /></mesh>
        <mesh position={[0, 2.33, 0]}><boxGeometry args={[0.62, 0.07, 0.62]} /><meshStandardMaterial color={c} /></mesh>
        <mesh position={[0, 2.58, 0]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color={c} /></mesh>
      </group>);
    default:
      return null;
  }
}
