"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard, OrbitControls, Text, Sparkles, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { BlockType, WorldAgent, WorldBlock, WorldState } from "@contracts/types";
import { BLOCK_STYLE, PORTALS, agentHue } from "./blocks";

export type BuildIntent = { kind: "place"; x: number; y: number; z: number } | { kind: "remove"; x: number; y: number; z: number } | { kind: "inspect"; x: number; y: number; z: number };

function BlockLayer({ type, blocks, onPick }: { type: BlockType; blocks: WorldBlock[]; onPick?: (e: ThreeEvent<PointerEvent>, b: WorldBlock) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const style = BLOCK_STYLE[type];
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D();
    blocks.forEach((b, i) => { o.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.count = blocks.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere();
  }, [blocks]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(blocks.length, 1)]} castShadow receiveShadow
      onPointerDown={(e) => { if (e.instanceId != null && onPick) { e.stopPropagation(); onPick(e, blocks[e.instanceId]); } }}>
      <boxGeometry args={[0.98, 0.98, 0.98]} />
      <meshStandardMaterial color={style.color} emissive={style.emissive ?? "#000"} emissiveIntensity={style.intensity ?? 0}
        transparent={!!style.opacity} opacity={style.opacity ?? 1} roughness={0.55} metalness={type === "gold" ? 0.6 : 0.05} toneMapped={!style.emissive} />
    </instancedMesh>
  );
}

function Avatar({ a }: { a: WorldAgent }) {
  const g = useRef<THREE.Group>(null); const target = useRef(new THREE.Vector3(a.x, a.y, a.z));
  useEffect(() => { target.current.set(a.x, a.y, a.z); }, [a.x, a.y, a.z]);
  const color = useMemo(() => new THREE.Color(`hsl(${agentHue(a.name)}, 85%, 62%)`), [a.name]);
  useFrame((s, dt) => {
    const o = g.current; if (!o) return;
    o.position.lerp(target.current, 1 - Math.pow(0.02, dt));
    o.position.y = target.current.y + 0.05 * Math.sin(s.clock.elapsedTime * 2 + a.name.length);
  });
  return (
    <group ref={g} position={[a.x, a.y, a.z]}>
      <mesh position={[0, 0.7, 0]} castShadow><capsuleGeometry args={[0.32, 0.6, 6, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} /></mesh>
      <mesh position={[0, 1.45, 0]}><sphereGeometry args={[0.26, 24, 24]} /><meshStandardMaterial color="#fff" emissive={color} emissiveIntensity={0.6} /></mesh>
      <pointLight color={color} intensity={6} distance={6} position={[0, 1, 0]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}><ringGeometry args={[0.5, 0.65, 32]} /><meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} /></mesh>
      <Billboard position={[0, 2.2, 0]}>
        <Text fontSize={0.38} color="#fff" outlineWidth={0.03} outlineColor="#07060d" anchorY="bottom">{a.name}{a.isSimulated ? " (sim)" : ""}</Text>
        {a.emote && <Text position={[0, 0.5, 0]} fontSize={0.34} color="#fbbf24" anchorY="bottom">✦ {a.emote}</Text>}
      </Billboard>
    </group>
  );
}

function Portal({ p, onEnter }: { p: (typeof PORTALS)[number]; onEnter: (href: string) => void }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (ring.current) ring.current.rotation.z += dt * 0.6; });
  const facing = Math.atan2(-p.pos[0], -p.pos[2]);
  return (
    <group position={p.pos} rotation-y={facing}>
      <mesh ref={ring} position={[0, 2.2, 0]} onClick={() => onEnter(p.href)} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
        <torusGeometry args={[1.6, 0.14, 16, 64]} /><meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.2, 0]} onClick={() => onEnter(p.href)}><circleGeometry args={[1.5, 48]} />
        <meshBasicMaterial color={p.color} transparent opacity={0.18} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <Sparkles position={[0, 2.2, 0]} count={40} scale={[3, 3, 1]} size={3} color={p.color} speed={0.6} />
      <Billboard position={[0, 4.4, 0]}><Text fontSize={0.5} color={p.color} outlineWidth={0.03} outlineColor="#07060d">{p.label}</Text></Billboard>
    </group>
  );
}

function Ground({ onGround }: { onGround: (e: ThreeEvent<PointerEvent>) => void }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d")!;
    x.fillStyle = "#0d1a16"; x.fillRect(0, 0, 64, 64); x.strokeStyle = "rgba(124,247,212,0.12)"; x.lineWidth = 2; x.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(128, 128); t.magFilter = THREE.NearestFilter; return t;
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onPointerDown={onGround}><planeGeometry args={[128, 128]} /><meshStandardMaterial map={tex} roughness={1} /></mesh>
      {/* Spawn Commons plaza */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow><circleGeometry args={[11.5, 64]} /><meshStandardMaterial color="#1b1830" roughness={0.8} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}><ringGeometry args={[11.3, 11.6, 96]} /><meshBasicMaterial color="#7cf7d4" toneMapped={false} /></mesh>
      <Billboard position={[0, 0.6, 7.5]}><Text fontSize={0.6} color="#7cf7d4" outlineWidth={0.03} outlineColor="#07060d">SPAWN COMMONS</Text></Billboard>
    </group>
  );
}

export default function Scene({ state, onIntent, onNavigate, building, bloom }: {
  state: WorldState | null; onIntent: (i: BuildIntent) => void; onNavigate: (href: string) => void; building: boolean; bloom: boolean;
}) {
  const byType = useMemo(() => {
    const m = new Map<BlockType, WorldBlock[]>(); for (const b of state?.blocks ?? []) { if (!m.has(b.blockType)) m.set(b.blockType, []); m.get(b.blockType)!.push(b); } return m;
  }, [state?.blocks]);
  const [hover] = useState(false);
  const pickBlock = (e: ThreeEvent<PointerEvent>, b: WorldBlock) => {
    if (!building) return onIntent({ kind: "inspect", x: b.x, y: b.y, z: b.z });
    if (e.button === 2 || e.shiftKey) return onIntent({ kind: "remove", x: b.x, y: b.y, z: b.z });
    const n = e.face?.normal ?? new THREE.Vector3(0, 1, 0);
    onIntent({ kind: "place", x: b.x + Math.round(n.x), y: b.y + Math.round(n.y), z: b.z + Math.round(n.z) });
  };
  const pickGround = (e: ThreeEvent<PointerEvent>) => { if (!building || e.button !== 0) return; e.stopPropagation(); onIntent({ kind: "place", x: Math.floor(e.point.x), y: 0, z: Math.floor(e.point.z) }); };
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [18, 16, 22], fov: 50 }} onContextMenu={(e) => e.preventDefault()} gl={{ antialias: true }}>
      <color attach="background" args={["#07060d"]} />
      <fog attach="fog" args={["#0b0920", 30, 95]} />
      <Stars radius={120} depth={40} count={2500} factor={4} fade speed={0.5} />
      <hemisphereLight args={["#b9a8ff", "#0d1a16", 0.55]} />
      <directionalLight position={[20, 30, 10]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
      <Ground onGround={pickGround} />
      {(state?.plots ?? []).map((p) => (
        <group key={p.agentId}>
          <mesh rotation-x={-Math.PI / 2} position={[p.x0 + 4, 0.015, p.z0 + 4]}><planeGeometry args={[8, 8]} /><meshBasicMaterial color={`hsl(${agentHue(p.agentName)},70%,55%)`} transparent opacity={0.12} /></mesh>
          <Billboard position={[p.x0 + 4, 0.4, p.z0 + 8.3]}><Text fontSize={0.35} color="#e7e5f4">{p.name}</Text></Billboard>
        </group>
      ))}
      {[...byType].map(([t, bs]) => <BlockLayer key={t} type={t} blocks={bs} onPick={pickBlock} />)}
      {(state?.signs ?? []).map((s) => (
        <Billboard key={s.id} position={[s.x, s.y + 0.6, s.z]}>
          <mesh position={[0, 0, -0.01]}><planeGeometry args={[Math.max(2, s.text.length * 0.32), 0.7]} /><meshBasicMaterial color="#0f0d1a" transparent opacity={0.85} /></mesh>
          <Text fontSize={0.38} color="#7cf7d4">{s.text}</Text>
        </Billboard>
      ))}
      {PORTALS.map((p) => <Portal key={p.id} p={p} onEnter={onNavigate} />)}
      {(state?.agents ?? []).map((a) => <Avatar key={a.agentId} a={a} />)}
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={90} target={[0, 1, 0]} />
      {bloom && !hover && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.9} luminanceThreshold={0.6} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.7} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
