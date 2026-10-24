"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, OrbitControls, Text, Sparkles, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { BlockType, WorldAgent, WorldBlock, WorldSign, WorldState } from "@contracts/types";
import { BLOCK_STYLE, PORTALS, agentHue, blockStyle } from "./blocks";
import Island, { ISLAND_R } from "./Island";
import { INTERACTABLES } from "./interactables";
import { input, player } from "./controls";
import Dream from "./Dream";
import TraversalKit from "./TraversalKit";
import LampGlow from "./LampGlow";
import FixItBoard from "./FixItBoard";
import type { PortalStation } from "@/lib/world/traversal";

const PORTAL_STATIONS: PortalStation[] = PORTALS.map((p) => ({ id: p.id, label: p.label, href: p.href, color: p.color, radius: 3.2, position: { x: p.pos[0], y: 0, z: p.pos[2] } }));

export type BuildIntent = { kind: "place"; x: number; y: number; z: number } | { kind: "remove"; x: number; y: number; z: number } | { kind: "inspect"; x: number; y: number; z: number };

function BlockLayer({ type, blocks, onPick }: { type: BlockType; blocks: WorldBlock[]; onPick?: (e: ThreeEvent<PointerEvent>, b: WorldBlock) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const style = blockStyle(type);
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

const SPEED = 4.5;
function Blocky({ color, walk, emote, t }: { color: THREE.Color; walk: number; emote: string | null; t: number }) {
  const sw = Math.sin(t * 10) * 0.7 * walk;
  const wave = emote === "wave" ? -2.6 + Math.sin(t * 8) * 0.4 : emote === "cheer" ? -2.9 : 0;
  const skin = "#ffd7b0";
  return (<group>
    <mesh position={[0, 1.35, 0]} castShadow><boxGeometry args={[0.8, 0.9, 0.42]} /><meshStandardMaterial color={color} /></mesh>
    <mesh position={[0, 2.1, 0]} castShadow><boxGeometry args={[0.56, 0.56, 0.56]} /><meshStandardMaterial color={skin} /></mesh>
    <mesh position={[0.13, 2.15, 0.29]}><boxGeometry args={[0.08, 0.1, 0.02]} /><meshBasicMaterial color="#111" /></mesh>
    <mesh position={[-0.13, 2.15, 0.29]}><boxGeometry args={[0.08, 0.1, 0.02]} /><meshBasicMaterial color="#111" /></mesh>
    <group position={[0.52, 1.75, 0]} rotation-x={emote ? 0 : sw} rotation-z={wave ? -wave * 0.35 : 0}><mesh position={[0, -0.4, 0]} castShadow><boxGeometry args={[0.24, 0.8, 0.24]} /><meshStandardMaterial color={skin} /></mesh></group>
    <group position={[-0.52, 1.75, 0]} rotation-x={-sw} rotation-z={emote === "cheer" ? 1 : 0}><mesh position={[0, -0.4, 0]} castShadow><boxGeometry args={[0.24, 0.8, 0.24]} /><meshStandardMaterial color={skin} /></mesh></group>
    <group position={[0.2, 0.9, 0]} rotation-x={-sw}><mesh position={[0, -0.45, 0]} castShadow><boxGeometry args={[0.3, 0.9, 0.3]} /><meshStandardMaterial color="#1e293b" /></mesh></group>
    <group position={[-0.2, 0.9, 0]} rotation-x={sw}><mesh position={[0, -0.45, 0]} castShadow><boxGeometry args={[0.3, 0.9, 0.3]} /><meshStandardMaterial color="#1e293b" /></mesh></group>
  </group>);
}

function Avatar({ a, bubble }: { a: WorldAgent; bubble?: string }) {
  const g = useRef<THREE.Group>(null); const body = useRef<THREE.Group>(null);
  const [anim, setAnim] = useState({ walk: 0, t: 0 });
  const color = useMemo(() => new THREE.Color(`hsl(${agentHue(a.name)}, 80%, 58%)`), [a.name]);
  const emote = a.emote && Date.now() - Date.parse(a.updatedAt) < 20000 ? a.emote : null;
  useFrame((s, dt) => {
    const o = g.current; if (!o) return;
    const dx = a.x - o.position.x, dz = a.z - o.position.z, d = Math.hypot(dx, dz);
    let walk = 0;
    if (d > 0.05) { const step = Math.min(d, SPEED * dt); o.position.x += (dx / d) * step; o.position.z += (dz / d) * step; o.rotation.y = Math.atan2(dx, dz); walk = 1; }
    if (d > 30) { o.position.x = a.x; o.position.z = a.z; }
    const t = s.clock.elapsedTime;
    if (body.current) { body.current.position.y = emote === "cheer" ? Math.abs(Math.sin(t * 6)) * 0.6 : walk ? Math.abs(Math.sin(t * 10)) * 0.08 : Math.sin(t * 2) * 0.03;
      body.current.rotation.y = emote === "dance" ? t * 4 : 0; }
    if (Math.abs(walk - anim.walk) > 0.5 || Math.floor(t * 30) !== Math.floor(anim.t * 30)) setAnim({ walk, t });
  });
  return (
    <group ref={g} position={[a.x, a.y, a.z]}>
      <group ref={body}><Blocky color={color} walk={anim.walk} emote={emote} t={anim.t} /></group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}><ringGeometry args={[0.55, 0.7, 32]} /><meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} /></mesh>
      <Billboard position={[0, 2.75, 0]}>
        <Text fontSize={0.36} color="#fff" outlineWidth={0.04} outlineColor="#0b1020" anchorY="bottom">{a.lastActiveAt && Date.now() - Date.parse(a.lastActiveAt) < 600000 ? "● " : "○ "}{a.name}{a.isSimulated ? " (sim)" : ""}</Text>
        {emote && <Text position={[0, 0.45, 0]} fontSize={0.3} color="#fbbf24" anchorY="bottom">✦ {emote}</Text>}
        {bubble && <group position={[0, emote ? 1.0 : 0.6, 0]}>
          <Text fontSize={0.3} maxWidth={5} color="#0b1020" anchorY="bottom" textAlign="center">{bubble.length > 90 ? bubble.slice(0, 88) + "…" : bubble}
</Text>
          <mesh position={[0, 0.35, -0.02]}><planeGeometry args={[5.4, Math.ceil(Math.min(bubble.length, 90) / 22) * 0.4 + 0.3]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.92} /></mesh>
        </group>}
      </Billboard>
    </group>
  );
}

function Player({ building }: { building: boolean }) {
  const g = useRef<THREE.Group>(null); const vel = useRef({ vy: 0, y: 0, vx: 0, vz: 0 });
  const [anim, setAnim] = useState({ walk: 0, t: 0 });
  const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: { target: THREE.Vector3; update: () => void } | null };
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const ok = (e: KeyboardEvent) => !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement);
    const dn = (e: KeyboardEvent) => { if (!ok(e)) return; keys.current.add(e.code); if (e.code === "Space") e.preventDefault(); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);
  const color = useMemo(() => new THREE.Color("#f8fafc"), []);
  useFrame((s, dt) => {
    const o = g.current; if (!o) return; dt = Math.min(dt, 0.05);
    const k = keys.current;
    let ix = input.x + (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let iz = input.z + (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; }
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const speed = (k.has("ShiftLeft") || input.run ? 10 : 6) * dt;
    const before = o.position.clone();
    const mv = fwd.multiplyScalar(iz).add(right.multiplyScalar(ix));
    if (mv.lengthSq() > 0.0001) { o.position.addScaledVector(mv, speed); o.rotation.y = Math.atan2(mv.x, mv.z); }
    const r = Math.hypot(o.position.x, o.position.z); if (r > ISLAND_R - 1) o.position.multiplyScalar((ISLAND_R - 1) / r);
    const v = vel.current;
    if (v.y <= 0.001 && (k.has("Space") || input.jump)) { v.vy = 9; input.jump = false; }
    const pad = v.y <= 0.001 ? INTERACTABLES.find((i) => i.kind === "jumpPad" && Math.hypot(o.position.x - i.x, o.position.z - i.z) < i.radius) : undefined; if (pad) v.vy = pad.launch;
    if (player.impulse) { v.vy = player.impulse.y; v.vx = player.impulse.x; v.vz = player.impulse.z; player.impulse = null; }
    if (v.y > 0 || v.vy > 0) { o.position.x += v.vx * dt; o.position.z += v.vz * dt; } else { v.vx = 0; v.vz = 0; }
    v.vy -= 25 * dt; v.y = Math.max(0, v.y + v.vy * dt); if (v.y === 0) v.vy = Math.max(v.vy, 0);
    o.position.y = v.y;
    player.pos.x = o.position.x; player.pos.y = o.position.y; player.pos.z = o.position.z;
    const delta = o.position.clone().sub(before);
    camera.position.add(delta);
    if (controls) { controls.target.set(o.position.x, o.position.y + 1.6, o.position.z); }
    const walk = mv.lengthSq() > 0.0001 && v.y === 0 ? 1 : 0; const t = s.clock.elapsedTime;
    if (walk !== anim.walk || Math.floor(t * 30) !== Math.floor(anim.t * 30)) setAnim({ walk, t });
  });
  return (<group ref={g} position={[0, 0, 8]}>
    <Blocky color={color} walk={anim.walk} emote={null} t={anim.t} />
    <Billboard position={[0, 2.75, 0]}><Text fontSize={0.34} color="#7cf7d4" outlineWidth={0.04} outlineColor="#0b1020" anchorY="bottom">{building ? "You (builder)" : "You"}</Text></Billboard>
  </group>);
}

function DayNight({ low = false }: { low?: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null); const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene } = useThree();
  const day = useMemo(() => new THREE.Color("#8fd3ff"), []), dusk = useMemo(() => new THREE.Color("#f59e8b"), []), night = useMemo(() => new THREE.Color("#0b1030"), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const ph = ((Date.now() / 1000) % 300) / 300; // 5-minute day
    const ang = ph * Math.PI * 2, h = Math.sin(ang);
    if (h > 0.25) c.copy(day); else if (h > -0.1) c.copy(night).lerp(dusk, (h + 0.1) / 0.35).lerp(day, Math.max(0, (h - 0.05) / 0.2)); else c.copy(night);
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(); (scene.background as THREE.Color).copy(c);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(c);
    if (sun.current) { sun.current.position.set(Math.cos(ang) * 50, Math.max(5, h * 60), 20); sun.current.intensity = Math.max(0.15, h * 2.4); }
    if (hemi.current) hemi.current.intensity = 0.35 + Math.max(0, h) * 0.8;
  });
  return (<>
    <hemisphereLight ref={hemi} args={["#dbeafe", "#3f6212", 0.9]} />
    <directionalLight ref={sun} position={[30, 50, 20]} intensity={2} castShadow={!low} shadow-mapSize={low ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={200} />
  </>);
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

/** Signs that sit within ~1.5 units of each other stack upward instead of overlapping (v2 rough spot). */
function stackedSigns(signs: WorldSign[]) {
  const placed: { s: WorldSign; k: number }[] = [];
  for (const s of [...signs].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))) {
    const w = (t: WorldSign) => Math.max(2, Math.min(t.text.length, 36) * 0.32);
    let k = 0; while (placed.some((p) => p.k === k && Math.hypot(p.s.x - s.x, p.s.z - s.z) < (w(p.s) + w(s)) / 2 + 0.3 && Math.abs(p.s.y - s.y) < 1)) k++;
    placed.push({ s, k });
  }
  return placed;
}

export type Quality = "high" | "low";

export default function Scene({ state, onIntent, onNavigate, building, bloom, bubbles, quality = "high" }: {
  quality?: Quality; bubbles?: Record<string, string>; state: WorldState | null; onIntent: (i: BuildIntent) => void; onNavigate: (href: string) => void; building: boolean; bloom: boolean;
}) {
  const byType = useMemo(() => {
    const m = new Map<BlockType, WorldBlock[]>(); for (const b of state?.blocks ?? []) { if (!m.has(b.blockType)) m.set(b.blockType, []); m.get(b.blockType)!.push(b); } return m;
  }, [state?.blocks]);
  const [hover] = useState(false);
  const low = quality === "low";
  const pickBlock = (e: ThreeEvent<PointerEvent>, b: WorldBlock) => {
    if (!building) return onIntent({ kind: "inspect", x: b.x, y: b.y, z: b.z });
    if (e.button === 2 || e.shiftKey) return onIntent({ kind: "remove", x: b.x, y: b.y, z: b.z });
    const n = e.face?.normal ?? new THREE.Vector3(0, 1, 0);
    onIntent({ kind: "place", x: b.x + Math.round(n.x), y: b.y + Math.round(n.y), z: b.z + Math.round(n.z) });
  };
  const pickGround = (e: ThreeEvent<PointerEvent>) => { if (!building || e.button !== 0) return; e.stopPropagation(); onIntent({ kind: "place", x: Math.floor(e.point.x), y: 0, z: Math.floor(e.point.z) }); };
  return (
    <Canvas key={quality} shadows={!low} dpr={low ? [0.75, 1] : [1, 1.75]} camera={{ position: [0, 7, 19], fov: 55 }} onContextMenu={(e) => e.preventDefault()} gl={{ antialias: !low, powerPreference: low ? "low-power" : "high-performance" }}>
      <fog attach="fog" args={["#8fd3ff", 60, 160]} />
      <Stars radius={150} depth={40} count={low ? 400 : 1500} factor={4} fade speed={0.5} />
      <DayNight low={low} />
      <Island onGround={pickGround} />
      <Player building={building} />
      {(state?.plots ?? []).map((p) => (
        <group key={p.agentId}>
          <mesh rotation-x={-Math.PI / 2} position={[p.x0 + 4, 0.015, p.z0 + 4]}><planeGeometry args={[8, 8]} /><meshBasicMaterial color={`hsl(${agentHue(p.agentName)},70%,55%)`} transparent opacity={0.12} /></mesh>
          <Billboard position={[p.x0 + 4, 0.4, p.z0 + 8.3]}><Text fontSize={0.35} color="#e7e5f4">{p.name}</Text></Billboard>
        </group>
      ))}
      <Dream state={state} onNavigate={onNavigate} />
      <FixItBoard onNavigate={onNavigate} />
      {[...byType].map(([t, bs]) => <BlockLayer key={t} type={t} blocks={bs} onPick={pickBlock} />)}
      <LampGlow blocks={byType.get("lamp") ?? []} playerPosition={player.pos} />
      {stackedSigns(state?.signs ?? []).map(({ s, k }) => (
        <Billboard key={s.id} position={[s.x, s.y + 0.6 + k * 1.0, s.z]}>
          <mesh position={[0, 0, -0.01]}><planeGeometry args={[Math.max(2, Math.min(s.text.length, 36) * 0.32), 0.7 + Math.floor((s.text.length - 1) / 36) * 0.45]} /><meshBasicMaterial color="#0f0d1a" transparent opacity={0.85} /></mesh>
          <Text fontSize={0.38} color="#7cf7d4" maxWidth={11.5} textAlign="center" anchorX="center" anchorY="middle">{s.text}</Text>
        </Billboard>
      ))}
      {PORTALS.map((p) => <Portal key={p.id} p={p} onEnter={onNavigate} />)}
      <TraversalKit playerPosition={player.pos} enabled={!building} showPortals={false} portals={PORTAL_STATIONS}
        onLaunch={(_, impulse) => { player.impulse = { ...impulse }; }} onEnterPortal={(portal) => onNavigate(portal.href)} />
      {(state?.agents ?? []).map((a) => <Avatar key={a.agentId} a={a} bubble={a.say || bubbles?.[a.agentId]} />)}
      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={70} target={[0, 1.6, 8]} enablePan={false} />
      {bloom && !low && !hover && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.6} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
          <Vignette eskil={false} offset={0.3} darkness={0.4} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
