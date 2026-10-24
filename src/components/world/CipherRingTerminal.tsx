"use client";

import { useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Public world gateway. Private fragments exist ONLY in authenticated relay/API reads. */
export default function CipherRingTerminal({ onNavigate }: { onNavigate: (path: string) => void }) {
  const halo = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (halo.current) {
      halo.current.rotation.y += dt * 0.2;
      halo.current.position.y = 2.5 + Math.sin(state.clock.elapsedTime * 1.4) * 0.14;
    }
  });
  const open = () => onNavigate("/puzzles");
  return (
    <group position={[10, 0, 12]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} receiveShadow
        onClick={(e) => { e.stopPropagation(); open(); }}>
        <circleGeometry args={[3.9, 48]} />
        <meshStandardMaterial color="#172c3a" metalness={0.45} roughness={0.42} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
        <ringGeometry args={[3.15, 3.55, 48]} />
        <meshBasicMaterial color="#7cf7d4" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const angle = (i / 4) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(angle) * 2.5, 0, Math.sin(angle) * 2.5]}>
            <mesh position={[0, 1.0, 0]} castShadow><cylinderGeometry args={[0.28, 0.36, 2, 8]} />
              <meshStandardMaterial color="#334155" /></mesh>
            <mesh position={[0, 2.1, 0]}>
              <octahedronGeometry args={[0.48]} />
              <meshStandardMaterial color={i % 2 ? "#fbbf24" : "#7cf7d4"} emissive={i % 2 ? "#f59e0b" : "#7cf7d4"} emissiveIntensity={0.7} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      <group ref={halo} position={[0, 2.5, 0]}>
        <mesh rotation-x={-Math.PI / 2}>
          <torusGeometry args={[1.05, 0.12, 12, 36]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} rotation-y={Math.PI / 4}>
          <torusGeometry args={[0.75, 0.05, 8, 36]} />
          <meshBasicMaterial color="#7cf7d4" toneMapped={false} />
        </mesh>
      </group>
      <group position={[0, 1.75, 3.0]}
        onClick={(e) => { e.stopPropagation(); open(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[4.2, 2.6, 0.22]} />
          <meshStandardMaterial color="#151528" /></mesh>
        <Text position={[0, 0.65, 0.15]} fontSize={0.44} color="#7cf7d4" anchorY="middle">🔐 CIPHER RING</Text>
        <Text position={[0, -0.1, 0.15]} fontSize={0.23} maxWidth={3.8} textAlign="center" color="#e2e8f0">
          Four keepers. Private clues. One shared answer.
        </Text>
        <Text position={[0, -0.7, 0.15]} fontSize={0.22} color="#fbbf24">CLICK FOR CO-OP PUZZLES</Text>
      </group>
      <Billboard position={[0, 5.6, 0]}>
        <Text fontSize={0.49} color="#7cf7d4" outlineWidth={0.04} outlineColor="#0b1020">CIPHER RING</Text>
      </Billboard>
    </group>
  );
}
