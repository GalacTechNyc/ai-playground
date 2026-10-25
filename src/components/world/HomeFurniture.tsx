"use client";
import type { ThreeEvent } from "@react-three/fiber";
import type { FurniturePiece } from "@/lib/world/furniture";

/** Lightweight voxel furniture; only the selected item needs extra draw calls. */
export default function HomeFurniture({ pieces, editing, selectedId, onSelect }: {
  pieces: readonly FurniturePiece[]; editing: boolean; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const wood = "#936340";
  return <group>
    {pieces.map((p) => {
      const select = (e: ThreeEvent<MouseEvent>) => { if (!editing) return; e.stopPropagation(); onSelect(p.id); };
      return <group key={p.id} position={[p.x, 0, p.z]} rotation-y={p.rotation * Math.PI / 2}
        onClick={select}
        onPointerOver={() => { if (editing) document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { if (editing) document.body.style.cursor = ""; }}>
        {editing && selectedId === p.id && <mesh position={[0, 0.055, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.57, 0.68, 24]} />
          <meshBasicMaterial color="#fbbf24" depthWrite={false} />
        </mesh>}
        {p.kind === "rug" && <mesh rotation-x={-Math.PI / 2} position={[0, 0.065, 0]}>
          <planeGeometry args={[1.9, 1.35]} /><meshStandardMaterial color="#a78bfa" />
        </mesh>}
        {p.kind === "sofa" && <group>
          <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[1.65, 0.62, 0.85]} /><meshStandardMaterial color="#384f83" /></mesh>
          <mesh position={[0, 0.78, -0.39]} castShadow><boxGeometry args={[1.72, 0.8, 0.22]} /><meshStandardMaterial color="#2b3963" /></mesh>
          {[-0.75, 0.75].map((x) => <mesh key={x} position={[x, 0.69, 0.0]} castShadow>
            <boxGeometry args={[0.16, 0.5, 0.94]} /><meshStandardMaterial color="#2b3963" /></mesh>)}
        </group>}
        {p.kind === "table" && <group>
          <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[1.1, 0.13, 0.75]} /><meshStandardMaterial color={wood} /></mesh>
          {[-0.42, 0.42].flatMap((x) => [-0.27, 0.27].map((z) =>
            <mesh key={x + "," + z} position={[x, 0.26, z]}><boxGeometry args={[0.12, 0.52, 0.12]} />
              <meshStandardMaterial color="#654328" /></mesh>))}
        </group>}
        {p.kind === "shelf" && <group>
          <mesh position={[0, 1.1, 0]} castShadow><boxGeometry args={[0.34, 2.15, 1.2]} /><meshStandardMaterial color="#653d27" /></mesh>
          {[0.45, 0.9, 1.35, 1.8].map((y, i) => <mesh key={i} position={[-0.22, y, 0]}>
            <boxGeometry args={[0.14, 0.12, 1.19]} /><meshStandardMaterial color="#bb895a" /></mesh>)}
          {[-0.3, 0.0, 0.3].map((z, i) => <mesh key={i} position={[-0.28, 0.65, z]}>
            <boxGeometry args={[0.15, 0.33, 0.17]} /><meshStandardMaterial color={["#7cf7d4", "#fbbf24", "#f472b6"][i]} /></mesh>)}
        </group>}
        {p.kind === "chair" && <group>
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.7, 0.16, 0.7]} /><meshStandardMaterial color="#a16207" /></mesh>
          <mesh position={[0, 0.9, -0.29]} castShadow><boxGeometry args={[0.7, 0.85, 0.14]} /><meshStandardMaterial color="#92400e" /></mesh>
          {[-0.25, 0.25].flatMap((x) => [-0.25, 0.25].map((z) =>
            <mesh key={x + "," + z} position={[x, 0.25, z]}><boxGeometry args={[0.1, 0.5, 0.1]} />
              <meshStandardMaterial color="#7c2d12" /></mesh>))}
        </group>}
        {p.kind === "lamp" && <group>
          <mesh position={[0, 0.22, 0]}><cylinderGeometry args={[0.2, 0.25, 0.44, 10]} /><meshStandardMaterial color="#334155" /></mesh>
          <mesh position={[0, 0.88, 0]}><cylinderGeometry args={[0.31, 0.18, 0.75, 12]} />
            <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={0.7} /></mesh>
          <pointLight position={[0, 1.1, 0]} color="#fbbf24" intensity={0.75} distance={3} />
        </group>}
        {p.kind === "plant" && <group>
          <mesh position={[0, 0.27, 0]}><cylinderGeometry args={[0.3, 0.23, 0.54, 10]} /><meshStandardMaterial color="#a16207" /></mesh>
          <mesh position={[0, 0.75, 0]}><cylinderGeometry args={[0.06, 0.08, 0.65, 8]} /><meshStandardMaterial color="#14532d" /></mesh>
          <mesh position={[0, 1.21, 0]}><icosahedronGeometry args={[0.5, 0]} /><meshStandardMaterial color="#4ade80" /></mesh>
        </group>}
      </group>;
    })}
  </group>;
}
