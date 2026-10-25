"use client";
import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";
import type { WorldHome } from "@contracts/types";
import HomeFurniture from "./HomeFurniture";
import { DEFAULT_FURNITURE, FURNITURE_KINDS, addFurniture, moveFurniture, encodeFurniture, decodeFurniture, furnitureStorageKey, type FurnitureKind, type FurniturePiece } from "@/lib/world/furniture";

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

/** A fixed wall accent preserves each home's personality without blocking movable furniture. */
function HomeAccent({ style }: { style: WorldHome["style"] }) {
  const color = style === "treehouse" ? "#4ade80" : style === "dome" ? "#a78bfa" :
    style === "tower" ? "#fbbf24" : style === "pagoda" ? "#f87171" : "#f472b6";
  return <group position={[0, 1.9, -3.1]}>
    <mesh>
      {style === "tower" ? <sphereGeometry args={[0.42, 12, 10]} /> :
        style === "dome" ? <octahedronGeometry args={[0.47]} /> :
        style === "treehouse" ? <icosahedronGeometry args={[0.45, 0]} /> :
        <coneGeometry args={[0.42, 0.8, style === "pagoda" ? 4 : 8]} />}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
    </mesh>
    <Text position={[0, -0.72, 0.06]} fontSize={0.18} color="#e2e8f0">
      {style === "treehouse" ? "GROVE" : style === "dome" ? "COSMOS" :
        style === "tower" ? "OBSERVATORY" : style === "pagoda" ? "SANCTUARY" : "WELCOME"}
    </Text>
  </group>;
}

/** Interior is a true navigable room; a cutaway front and high camera keep furnishings visible. */
export default function HomeInterior({ home }: { home: WorldHome }) {
  const pressed = useRef(new Set<Arrow>());
  // A personal browser remix, not an authoritative mutation of another agent's home.
  const [pieces, setPieces] = useState<FurniturePiece[]>(DEFAULT_FURNITURE);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<FurnitureKind>("chair");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => {
    try {
      const shared = new URL(window.location.href).searchParams.get("layout");
      const saved = window.localStorage.getItem(furnitureStorageKey(home.agentId));
      const parsed = shared === null ? (saved === null ? null : decodeFurniture(saved)) : decodeFurniture(shared);
      setPieces(parsed ?? DEFAULT_FURNITURE);
      if (shared !== null && !parsed) setStatus("Invalid shared layout; showing the default furniture.");
      else setStatus(shared === null ? "" : "Shared room remix loaded. Changes save only in your browser.");
    } catch { setPieces(DEFAULT_FURNITURE); }
    setSelectedId(null); setEditing(false);
  }, [home.agentId]);

  function commit(next: FurniturePiece[]) {
    setPieces(next);
    try {
      window.localStorage.setItem(furnitureStorageKey(home.agentId), encodeFurniture(next));
      // The old share URL would now show stale furniture. Remove only that parameter.
      const url = new URL(window.location.href);
      if (url.searchParams.has("layout")) {
        url.searchParams.delete("layout");
        window.history.replaceState(null, "", url.toString());
      }
    } catch { setStatus("Browser storage is unavailable; the remix will last until refresh."); }
  }

  function onFloor(e: ThreeEvent<MouseEvent>) {
    if (!editing) return;
    e.stopPropagation();
    const x = e.point.x, z = e.point.z;
    const next = selectedId ? moveFurniture(pieces, selectedId, x, z) : addFurniture(pieces, kind, x, z);
    if (!next) { setStatus("That spot is blocked, outside the room, or the room is full."); return; }
    commit(next);
    if (!selectedId) setSelectedId(next[next.length - 1].id);
    setStatus("Furniture placed. Select a piece, then tap the floor to move it.");
  }

  function rotateSelected() {
    if (!selectedId) return;
    commit(pieces.map(p => p.id === selectedId ? { ...p, rotation: ((p.rotation + 1) % 4) as 0 | 1 | 2 | 3 } : p));
  }
  function removeSelected() {
    if (!selectedId) return;
    commit(pieces.filter(p => p.id !== selectedId)); setSelectedId(null);
  }
  async function shareRemix() {
    const url = new URL(window.location.href);
    url.searchParams.set("layout", encodeFurniture(pieces));
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Share link copied! Anyone opening it can view this layout.");
    } catch {
      window.history.replaceState(null, "", url.toString());
      setStatus("Share URL is in the address bar. Copy it to send the layout.");
    }
  }

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
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow onClick={onFloor}><planeGeometry args={[7, 7]} /><meshStandardMaterial color="#b8a38e" /></mesh>
      {[-3.25, 3.25].map((x) => <mesh key={x} position={[x, 1.65, 0]} receiveShadow>
        <boxGeometry args={[0.15, 3.3, 6.65]} /><meshStandardMaterial color={home.color} transparent opacity={0.55} />
      </mesh>)}
      <mesh position={[0, 1.65, -3.25]} receiveShadow><boxGeometry args={[6.65, 3.3, 0.15]} /><meshStandardMaterial color={home.color} /></mesh>
      <Text position={[0, 2.55, -3.1]} fontSize={0.35} color="#fff">{home.name}</Text>
      <HomeAccent style={home.style} />
      <HomeFurniture pieces={pieces} editing={editing} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setStatus("Tap the floor to move this piece."); }} />
      <InteriorAvatar pressed={pressed} />
      <OrbitControls makeDefault enablePan={false} maxDistance={13} minDistance={5} maxPolarAngle={Math.PI / 2.1} target={[0, 1.3, 0]} />
    </Canvas>
    <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 px-3 py-2 font-mono text-[11px] text-white">
      HOME INTERIOR · WASD / arrows move · drag to look
    </div>
    {!editing && <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-1 md:hidden">
      {([["", "", ""], ["", "forward", ""], ["left", "back", "right"]] as Arrow[][]).slice(1).map((row, i) =>
        row.map((a, j) => a ? <button key={`${i}-${j}`} type="button" onPointerDown={() => pressed.current.add(a)}
          onPointerUp={() => pressed.current.delete(a)} onPointerLeave={() => pressed.current.delete(a)}
          className="rounded-lg border border-white/40 bg-ink/75 px-3 py-2 text-white">{a === "forward" ? "↑" : a === "back" ? "↓" : a === "left" ? "←" : "→"}</button> :
          <span key={`${i}-${j}`} />)
      )}
    </div>}
    <div className="absolute bottom-3 left-3 right-3 flex flex-col items-start gap-1 pointer-events-none">
      {editing && <div className="pointer-events-auto max-w-full rounded-xl border border-neon/40 bg-[#11182d]/95 p-2 text-xs text-white shadow-xl">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-neon">Room remix</span>
          <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => { setSelectedId(null); setStatus("Pick a furniture type, then tap the floor."); }}>+ Add</button>
          <button type="button" className="btn-ghost !px-2 !py-1" disabled={!selectedId} onClick={rotateSelected}>Rotate ↻</button>
          <button type="button" className="btn-ghost !px-2 !py-1" disabled={!selectedId} onClick={removeSelected}>Remove</button>
          <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => { commit(DEFAULT_FURNITURE); setSelectedId(null); setStatus("Default furnishings restored."); }}>Reset</button>
        </div>
        <div className="flex max-w-[530px] flex-wrap gap-1.5">
          {FURNITURE_KINDS.map(k => <button key={k} type="button"
            className={"rounded-md border px-2 py-1 capitalize " + (kind === k && !selectedId ? "border-neon bg-neon/25" : "border-white/30")}
            onClick={() => { setKind(k); setSelectedId(null); }}>{k}</button>)}
          <button type="button" className="rounded-md border border-neon px-2 py-1 font-semibold text-neon"
            onClick={shareRemix}>Share layout</button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-400">Tap floor to place · tap furniture then floor to move · {pieces.length}/12 pieces · saved in this browser, not to the shared world</p>
      </div>}
      <div className="pointer-events-auto flex max-w-full items-center gap-2">
        <button type="button" className="rounded-lg border border-neon/60 bg-[#141a2f]/95 px-3 py-2 text-xs font-semibold text-neon"
          onClick={() => { setEditing(v => !v); setSelectedId(null); }}> {editing ? "✓ Done decorating" : "🛋 Decorate room"}</button>
        {status && <span role="status" className="max-w-[380px] rounded bg-black/85 px-2 py-1.5 text-[10px] text-white">{status}</span>}
      </div>
    </div>
  </div>;
}
