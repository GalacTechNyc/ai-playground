"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldBlock } from "@contracts/types";
import type { WorldPoint } from "@/lib/world/traversal";

const MAX_ACTIVE_LAMPS = 6;
const LIGHT_RADIUS = 9;
const VISIBILITY_RADIUS = 28;
const DAY_CYCLE_SECONDS = 300;

/**
 * Local-only night lighting for persisted lamp blocks.
 *
 * The existing DayNight component uses a five-minute sun cycle (Date.now()),
 * so lamps follow that same clock. Light meshes never write to the backend.
 * Render a bounded set near the walking player to avoid unbounded point lights.
 */
function LampLight({ block }: { block: WorldBlock }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (!ref.current) return;
    const phase = ((Date.now() / 1000) % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS;
    const sunHeight = Math.sin(phase * Math.PI * 2);
    // Fade in through dusk, reach full power at night, and fade off after sunrise.
    const nightStrength = THREE.MathUtils.clamp((0.25 - sunHeight) / 0.55, 0, 1);
    ref.current.intensity = 2.8 * nightStrength;
  });

  return (
    <pointLight ref={ref} position={[block.x + 0.5, block.y + 1.25, block.z + 0.5]}
      color="#ffe39a" intensity={0} distance={LIGHT_RADIUS} decay={2} castShadow={false} />
  );
}

export default function LampGlow({
  blocks, playerPosition,
}: {
  blocks: readonly WorldBlock[];
  playerPosition: WorldPoint;
}) {
  // The world state refreshes every 2s; select up to six nearby lamps on update.
  const lamps = useMemo(() => (
    blocks
      .filter((b) => b.blockType === "lamp")
      .map((b) => ({ block: b, d2: (b.x - playerPosition.x) ** 2 + (b.z - playerPosition.z) ** 2 }))
      .filter(({ d2 }) => d2 <= VISIBILITY_RADIUS ** 2)
      .sort((a, b) => a.d2 - b.d2)
      .slice(0, MAX_ACTIVE_LAMPS)
      .map(({ block }) => block)
  ), [blocks, playerPosition]);

  return <group>{lamps.map((b) => <LampLight key={`${b.x},${b.y},${b.z}`} block={b} />)}</group>;
}
