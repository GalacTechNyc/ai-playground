"use client";

import { useMemo, useRef, useState } from "react";
import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { WorldSign } from "@contracts/types";
import { nearbySignLabels, signDimensions, stackedSigns, type StackedSign, type SignQuality } from "./signLod";

/**
 * One instanced mesh for the dark sign backplates, instead of one mesh/material
 * per sign. Expensive SDF Text geometry is mounted only for nearby signs:
 * max 24 on high quality or 10 on low, with distance-based culling.
 *
 * Sign orientations follow the camera (same behavior as drei Billboard).
 * No hooks/state updates occur per sign per frame. Text list changes only when
 * the camera travels enough that a different set is nearest.
 */
export default function SignLayer({ signs, quality }: { signs: readonly WorldSign[]; quality: SignQuality }) {
  const stacked = useMemo(() => stackedSigns(signs), [signs]);
  const plates = useRef<THREE.InstancedMesh>(null);
  const pose = useMemo(() => new THREE.Object3D(), []);
  const [labels, setLabels] = useState<StackedSign[]>([]);
  const currentLabelKeys = useRef("");
  const last = useRef(-Infinity);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    if (elapsed - last.current < 0.4) return;
    last.current = elapsed;

    const x = state.camera.position.x;
    const z = state.camera.position.z;
    const visible = nearbySignLabels(stacked, x, z, quality);
    const ids = visible.map(({ s, k }) => `${s.id}:${k}:${s.text}`).join("|");
    if (ids !== currentLabelKeys.current) {
      currentLabelKeys.current = ids;
      setLabels(visible);
    }

    const mesh = plates.current;
    if (!mesh) return;
    const maxDistance = quality === "low" ? 56 : 96;
    let count = 0;
    for (const { s, k } of stacked) {
      const dx = s.x - x, dz = s.z - z;
      if (dx * dx + dz * dz > maxDistance * maxDistance) continue;
      const { width, height } = signDimensions(s);
      pose.position.set(s.x, s.y + 0.6 + k * 1.0, s.z);
      pose.quaternion.copy(state.camera.quaternion);
      pose.scale.set(width, height, 1);
      pose.updateMatrix();
      mesh.setMatrixAt(count++, pose.matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (count) mesh.computeBoundingSphere();
  });

  return (
    <group>
      <instancedMesh ref={plates} args={[undefined, undefined, Math.max(1, stacked.length)]}
        castShadow={false} receiveShadow={false} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#0f0d1a" transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
      {labels.map(({ s, k }) => (
        <Billboard key={s.id} position={[s.x, s.y + 0.6 + k * 1.0, s.z]}>
          <Text fontSize={0.38} color="#7cf7d4" maxWidth={11.5}
            textAlign="center" anchorX="center" anchorY="middle">{s.text}</Text>
        </Billboard>
      ))}
    </group>
  );
}
