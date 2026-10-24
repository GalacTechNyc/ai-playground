"use client";
import { Billboard, Text } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** A walk-up classroom on the island that navigates to public blind exams.
 * All sealed answers stay in the backend, never in world-state geometry. */
export default function ExamHall({ onNavigate }: { onNavigate: (href: string) => void }) {
  const marker = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (marker.current) marker.current.rotation.y = state.clock.elapsedTime * 0.45;
  });
  const open = () => onNavigate("/exams");
  return <group position={[-21, 0, 21]}>
    <mesh position={[0, 0.08, 0]} receiveShadow rotation-x={-Math.PI / 2}
      onClick={e => { e.stopPropagation(); open(); }}>
      <planeGeometry args={[8, 8]} />
      <meshStandardMaterial color="#25324d" />
    </mesh>
    <mesh position={[0, 2.1, -3.8]} castShadow>
      <boxGeometry args={[8.1, 4.2, 0.25]} />
      <meshStandardMaterial color="#30345f" />
    </mesh>
    <mesh position={[-3.9, 2.0, 0]} castShadow>
      <boxGeometry args={[0.25, 4, 7.8]} />
      <meshStandardMaterial color="#313f60" transparent opacity={0.8} />
    </mesh>
    <mesh position={[3.9, 2.0, 0]} castShadow>
      <boxGeometry args={[0.25, 4, 7.8]} />
      <meshStandardMaterial color="#313f60" transparent opacity={0.8} />
    </mesh>
    <mesh position={[0, 2.35, -3.57]} onClick={e => { e.stopPropagation(); open(); }}>
      <boxGeometry args={[5.65, 2.05, 0.18]} />
      <meshStandardMaterial color="#131827" />
    </mesh>
    <group position={[0, 2.35, -3.45]} onClick={e => { e.stopPropagation(); open(); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      <Text fontSize={0.55} color="#7cf7d4" anchorY="middle" position={[0, 0.48, 0.1]}>EXAM HALL</Text>
      <Text fontSize={0.25} color="#fbbf24" anchorY="middle" position={[0, -0.1, 0.1]}>BLIND TESTS · LOCKED ANSWERS</Text>
      <Text fontSize={0.25} color="#e2e8f0" anchorY="middle" position={[0, -0.62, 0.1]}>CLICK TO ENTER</Text>
    </group>
    {[-2.35, 0, 2.35].map((x,i) => <group key={i} position={[x, 0, i===1 ? 0.7 : 1.6]}>
      <mesh position={[0, 0.68, 0]} castShadow><boxGeometry args={[1.65, 0.13, 0.9]} />
        <meshStandardMaterial color="#986d42" /></mesh>
      {[-0.65, 0.65].map((dx) => <mesh key={dx} position={[dx, 0.34, 0]}>
        <boxGeometry args={[0.12, 0.68, 0.12]} /><meshStandardMaterial color="#654326" />
      </mesh>)}
      <mesh position={[0, 0.82, -0.1]}>
        <boxGeometry args={[0.45, 0.08, 0.3]} />
        <meshStandardMaterial color="#f8e9ac" />
      </mesh>
    </group>)}
    <mesh ref={marker} position={[0, 4.65, 0]} castShadow>
      <octahedronGeometry args={[0.52]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.8} toneMapped={false} />
    </mesh>
    <Billboard position={[0, 5.55, 0]}>
      <Text fontSize={0.5} color="#7cf7d4" outlineWidth={0.04} outlineColor="#0b1020">EXAM HALL</Text>
    </Billboard>
    <pointLight position={[0, 3.25, -0.8]} color="#fbbf24" intensity={0.8} distance={9} />
  </group>;
}
