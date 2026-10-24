"use client";
// Crystal Lake (issue #10): swim, row a boat (B) and fish from the dock tip or the boat (F). Tap the signs on mobile.
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Text } from "@react-three/drei";
import * as THREE from "three";
import { player } from "./controls";
import { DOCK_TIP, LAKE, boat, canFish, inLake, pickCatch, type Fish } from "./lake";

type Cast = { phase: "waiting" | "bite"; at: number; x: number; z: number } | null;

export default function Lake({ enabled = true }: { enabled?: boolean }) {
  const hull = useRef<THREE.Group>(null); const follow = useRef<THREE.Group>(null); const bob = useRef<THREE.Mesh>(null);
  const [cast, setCast] = useState<Cast>(null); const castRef = useRef<Cast>(null); castRef.current = cast;
  const [catchMsg, setCatchMsg] = useState<{ fish: Fish; total: number } | null>(null);
  const [near, setNear] = useState({ boat: false, fish: false, swim: false });

  const toggleBoat = () => {
    if (boat.riding) { boat.riding = false; return; }
    if (Math.hypot(player.pos.x - boat.x, player.pos.z - boat.z) < 3.2) boat.riding = true;
  };
  const fish = () => {
    if (!canFish(player.pos.x, player.pos.z, boat.riding)) return;
    const c = castRef.current;
    if (c?.phase === "bite") {
      const f = pickCatch(Math.random());
      let total = 1; try { total = Number(localStorage.getItem("ap.fish") ?? 0) + 1; localStorage.setItem("ap.fish", String(total)); } catch { /* private mode */ }
      setCatchMsg({ fish: f, total }); setCast(null); setTimeout(() => setCatchMsg(null), 4500); return;
    }
    if (c) { setCast(null); return; } // reel in early
    const a = Math.random() * Math.PI - Math.PI / 2;
    const fx = player.pos.x + Math.sin(a) * 1.5, fz = player.pos.z + 2.5 + Math.abs(Math.cos(a));
    setCast({ phase: "waiting", at: performance.now() + 1500 + Math.random() * 2500, x: fx, z: fz }); setCatchMsg(null);
  };

  useEffect(() => {
    if (!enabled) return;
    const dn = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.repeat) return;
      if (e.code === "KeyB") toggleBoat(); else if (e.code === "KeyF") fish();
    };
    window.addEventListener("keydown", dn); return () => window.removeEventListener("keydown", dn);
  });

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (!boat.riding) { boat.rot += 0.0015; } // idle drift heading
    if (hull.current) { hull.current.position.set(boat.x, 0.12 + Math.sin(t * 1.6) * 0.05, boat.z); hull.current.rotation.set(Math.sin(t * 1.3) * 0.03, boat.rot, Math.sin(t * 1.1) * 0.04); }
    if (follow.current) follow.current.position.set(player.pos.x, player.pos.y, player.pos.z);
    const c = castRef.current;
    if (bob.current) { bob.current.visible = !!c; if (c) bob.current.position.set(c.x, 0.12 + (c.phase === "bite" ? Math.abs(Math.sin(t * 14)) * -0.12 : Math.sin(t * 3) * 0.03), c.z); }
    if (c?.phase === "waiting" && performance.now() > c.at) setCast({ ...c, phase: "bite", at: performance.now() + 2200 });
    else if (c?.phase === "bite" && performance.now() > c.at) setCast(null); // it got away
    {
      const n = { boat: boat.riding || Math.hypot(player.pos.x - boat.x, player.pos.z - boat.z) < 3.2, fish: canFish(player.pos.x, player.pos.z, boat.riding), swim: !boat.riding && inLake(player.pos.x, player.pos.z) };
      if (n.boat !== near.boat || n.fish !== near.fish || n.swim !== near.swim) setNear(n);
    }
  });

  const hintY = 2.9;
  return (
    <group>
      {/* rowboat */}
      <group ref={hull}>
        <mesh castShadow position={[0, 0.15, 0]}><boxGeometry args={[1.4, 0.4, 3]} /><meshStandardMaterial color="#b45309" /></mesh>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[1.1, 0.25, 2.6]} /><meshStandardMaterial color="#fde68a" /></mesh>
        <mesh position={[0, 0.42, 0.2]}><boxGeometry args={[1.2, 0.08, 0.35]} /><meshStandardMaterial color="#92400e" /></mesh>
        <mesh position={[0.85, 0.35, 0.2]} rotation-z={0.5}><boxGeometry args={[0.08, 0.08, 1.8]} /><meshStandardMaterial color="#78350f" /></mesh>
        <mesh position={[-0.85, 0.35, 0.2]} rotation-z={-0.5}><boxGeometry args={[0.08, 0.08, 1.8]} /><meshStandardMaterial color="#78350f" /></mesh>
      </group>
      {/* bobber */}
      <mesh ref={bob} visible={false}><sphereGeometry args={[0.12, 12, 12]} /><meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} /></mesh>
      {/* sparkle ring so the lake reads as a place at night */}
      <mesh rotation-x={-Math.PI / 2} position={[LAKE.x, 0.08, LAKE.z]}><ringGeometry args={[LAKE.r - 0.15, LAKE.r + 0.1, 64]} /><meshBasicMaterial color="#a5f3fc" toneMapped={false} transparent opacity={0.7} /></mesh>
      <Billboard position={[DOCK_TIP.x, 1.6, DOCK_TIP.z - 4.6]}>
        <Text fontSize={0.32} color="#e0f2fe" outlineWidth={0.03} outlineColor="#0b1020">{"Crystal Lake · swim in · F to fish at the dock tip · B to row"}</Text>
      </Billboard>
      <group ref={follow}>
      {enabled && (near.fish || near.boat) && (
        <Billboard position={[0, hintY, 0]}>
          {near.fish && <Text position={[0, 0.45, 0]} fontSize={0.3} color={cast?.phase === "bite" ? "#fbbf24" : "#7dd3fc"} outlineWidth={0.03} outlineColor="#0b1020" onClick={fish}>
            {cast?.phase === "bite" ? "BITE! Press F (or tap) to reel in!" : cast ? "Waiting for a bite… (F to reel in)" : "🎣 Press F (or tap) to fish"}</Text>}
          {near.boat && <Text fontSize={0.28} color="#fde68a" outlineWidth={0.03} outlineColor="#0b1020" onClick={toggleBoat}>{boat.riding ? "B (or tap) to hop out" : "B (or tap) to board the boat"}</Text>}
        </Billboard>
      )}
      {catchMsg && (
        <Billboard position={[0, hintY + 1.1, 0]}>
          <Text fontSize={0.42} color={catchMsg.fish.rarity === "legendary" ? "#f0abfc" : catchMsg.fish.rarity === "rare" ? "#fbbf24" : "#ffffff"} outlineWidth={0.04} outlineColor="#0b1020">
            {`Caught ${catchMsg.fish.name}!${catchMsg.fish.rarity !== "common" ? ` (${catchMsg.fish.rarity})` : ""} · ${catchMsg.total} total`}</Text>
        </Billboard>
      )}
      </group>
    </group>
  );
}
