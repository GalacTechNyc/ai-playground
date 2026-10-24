"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { partitionTrees, type WorldQuality } from "./treeLod";

/**
 * Scene-scale tree LOD: all trunks/crowns remain shared instanced meshes.
 * Rebuild instance matrices only when the camera has moved meaningfully or
 * every 0.4s, NOT on every render frame or world-state refresh.
 */
export default function TreeLOD({ trees, quality }: {
  trees: readonly [number, number, number][]; quality: WorldQuality;
}) {
  const nearTrunks = useRef<THREE.InstancedMesh>(null);
  const nearCrowns = useRef<THREE.InstancedMesh>(null);
  const farTrunks = useRef<THREE.InstancedMesh>(null);
  const farCrowns = useRef<THREE.InstancedMesh>(null);
  const last = useRef({ x: Infinity, z: Infinity, at: -Infinity });

  const nearTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.25, 0.35, 2, 6), []);
  const nearCrownGeometry = useMemo(() => new THREE.ConeGeometry(1.4, 3, 7), []);
  const farTrunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.25, 0.35, 2, 3), []);
  const farCrownGeometry = useMemo(() => new THREE.ConeGeometry(1.4, 3, 4), []);
  useEffect(() => () => {
    nearTrunkGeometry.dispose(); nearCrownGeometry.dispose();
    farTrunkGeometry.dispose(); farCrownGeometry.dispose();
  }, [nearTrunkGeometry, nearCrownGeometry, farTrunkGeometry, farCrownGeometry]);

  useFrame((state) => {
    const x = state.camera.position.x, z = state.camera.position.z;
    const now = state.clock.elapsedTime, l = last.current;
    if (now - l.at < 0.4 && Math.hypot(x - l.x, z - l.z) < 2) return;
    l.x = x; l.z = z; l.at = now;

    const near = nearTrunks.current, crown = nearCrowns.current;
    const far = farTrunks.current, farCrown = farCrowns.current;
    if (!near || !crown || !far || !farCrown) return;
    const groups = partitionTrees(trees, x, z, quality);
    const matrix = new THREE.Object3D();
    const write = (mesh: THREE.InstancedMesh, items: readonly [number, number, number][], y: (s: number) => number) => {
      items.forEach(([tx, tz, scale], i) => {
        matrix.position.set(tx, y(scale), tz);
        matrix.scale.setScalar(scale);
        matrix.rotation.y = ((i * 37) % 100) * Math.PI / 50;
        matrix.updateMatrix();
        mesh.setMatrixAt(i, matrix.matrix);
      });
      mesh.count = items.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (items.length) mesh.computeBoundingSphere();
    };
    write(near, groups.near, (s) => s);
    write(crown, groups.near, (s) => 3.3 * s);
    write(far, groups.far, (s) => s);
    write(farCrown, groups.far, (s) => 3.3 * s);
  });

  const n = Math.max(1, trees.length);
  return <group>
    <instancedMesh ref={nearTrunks} args={[nearTrunkGeometry, undefined, n]} castShadow receiveShadow>
      <meshStandardMaterial color="#8b5a2b" flatShading roughness={0.8} />
    </instancedMesh>
    <instancedMesh ref={nearCrowns} args={[nearCrownGeometry, undefined, n]} castShadow receiveShadow>
      <meshStandardMaterial color="#22a34a" flatShading roughness={0.8} />
    </instancedMesh>
    <instancedMesh ref={farTrunks} args={[farTrunkGeometry, undefined, n]} castShadow={false} receiveShadow={false}>
      <meshStandardMaterial color="#8b5a2b" flatShading roughness={1} />
    </instancedMesh>
    <instancedMesh ref={farCrowns} args={[farCrownGeometry, undefined, n]} castShadow={false} receiveShadow={false}>
      <meshStandardMaterial color="#22a34a" flatShading roughness={1} />
    </instancedMesh>
  </group>;
}
