"use client";

import { useEffect, useRef } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  ISLAND_JUMP_PADS, ISLAND_PORTALS, INITIAL_PAD_STATE,
  nearestPortal, stepJumpPads,
  type JumpPad, type JumpPadTriggerState, type PortalStation, type WorldPoint,
} from "@/lib/world/traversal";

export interface TraversalKitProps {
  /** Current LOCAL human avatar position. Do not use a remote agent's coordinates. */
  playerPosition: WorldPoint | null;
  /** The player controller owns physics; apply this impulse to the human avatar. */
  onLaunch: (pad: JumpPad, impulse: WorldPoint) => void;
  /** Explicit interaction (E or click/tap) with a nearby portal. */
  onEnterPortal: (portal: PortalStation) => void;
  /** Disable during building, modals or non-walk modes. */
  enabled?: boolean;
  showPortals?: boolean;
  pads?: readonly JumpPad[];
  portals?: readonly PortalStation[];
}

function JumpPadVisual({ pad }: { pad: JumpPad }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ring.current) return;
    const pulse = (Math.sin(state.clock.elapsedTime * 3 + pad.position.x) + 1) * 0.5;
    ring.current.scale.setScalar(0.9 + pulse * 0.18);
  });
  return (
    <group position={[pad.position.x, pad.position.y, pad.position.z]}>
      <mesh position={[0, 0.13, 0]} receiveShadow>
        <cylinderGeometry args={[pad.radius, pad.radius, 0.26, 32]} />
        <meshStandardMaterial color="#152a30" metalness={0.45} roughness={0.3} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.28, 0]}>
        <torusGeometry args={[pad.radius * 0.76, 0.08, 12, 40]} />
        <meshBasicMaterial color={pad.color} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.5, 0]} color={pad.color} intensity={2} distance={5} />
      <Billboard position={[0, 1.05, 0]}>
        <Text fontSize={0.28} color="#fff" outlineWidth={0.025} outlineColor="#07060d">
          {pad.label} · STEP ON
        </Text>
      </Billboard>
    </group>
  );
}

function PortalVisual({ portal, onEnter }: { portal: PortalStation; onEnter: (p: PortalStation) => void }) {
  return (
    <group position={[portal.position.x, portal.position.y, portal.position.z]}>
      <mesh position={[0, 2, 0]} onClick={(event) => { event.stopPropagation(); onEnter(portal); }}>
        <torusGeometry args={[1.35, 0.14, 12, 48]} />
        <meshStandardMaterial color={portal.color} emissive={portal.color} emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2, -0.02]} onClick={(event) => { event.stopPropagation(); onEnter(portal); }}>
        <circleGeometry args={[1.2, 40]} />
        <meshBasicMaterial color={portal.color} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <Billboard position={[0, 3.85, 0]}>
        <Text fontSize={0.33} color="#fff" outlineWidth={0.025} outlineColor="#07060d">
          {portal.label} · E / CLICK
        </Text>
      </Billboard>
    </group>
  );
}

/**
 * Additive sidecar for the v2 island R3F Canvas.
 *
 * Integration:
 * <TraversalKit playerPosition={humanPosition} onLaunch={(pad, impulse) => physics.launch(impulse)}
 *   onEnterPortal={(portal) => router.push(portal.href)} enabled={walkMode && !building}
 *   showPortals={!legacyPortalsEnabled} />
 *
 * No writes or teleports happen implicitly. Pads supply a velocity impulse; the
 * host player controller owns movement, collisions, safe spawn and reconciliation.
 */
export default function TraversalKit({
  playerPosition, onLaunch, onEnterPortal, enabled = true, showPortals = true,
  pads = ISLAND_JUMP_PADS, portals = ISLAND_PORTALS,
}: TraversalKitProps) {
  const positionRef = useRef(playerPosition);
  const launchRef = useRef(onLaunch);
  const enterRef = useRef(onEnterPortal);
  const padState = useRef<JumpPadTriggerState>({ ...INITIAL_PAD_STATE });

  positionRef.current = playerPosition;
  launchRef.current = onLaunch;
  enterRef.current = onEnterPortal;

  useFrame(() => {
    if (!enabled || !positionRef.current) {
      padState.current = { ...INITIAL_PAD_STATE };
      return;
    }
    const result = stepJumpPads(positionRef.current, padState.current, performance.now(), pads);
    padState.current = result.nextState;
    if (result.pad) launchRef.current(result.pad, result.pad.impulse);
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== "e") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (!positionRef.current) return;
      const portal = nearestPortal(positionRef.current, portals);
      if (portal) { event.preventDefault(); enterRef.current(portal); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, portals]);

  return (
    <group>
      {pads.map((pad) => <JumpPadVisual key={pad.id} pad={pad} />)}
      {showPortals && portals.map((portal) => (
        <PortalVisual key={portal.id} portal={portal} onEnter={(p) => { if (enabled) enterRef.current(p); }} />
      ))}
    </group>
  );
}
