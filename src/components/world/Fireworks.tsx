"use client";
// A short fireworks show (Claude). Mounted only while it plays: one THREE.Points cloud,
// a few staggered bursts with gravity, fading out with additive blending so bloom picks it up.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COLORS = ["#fbbf24", "#fb923c", "#7cf7d4", "#f472b6", "#a78bfa", "#fde68a"];
const BURSTS = 6, PER_BURST = 70, LIFE = 2.4, GRAVITY = -3.2;

/** Soft round spark sprite, so points read as glowing dots instead of squares. */
function sparkTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d")!; const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.8)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export default function Fireworks({ position = [0, 0, 0], spread = 3, duration = 8, onDone }: {
  position?: [number, number, number]; spread?: number; duration?: number; onDone?: () => void;
}) {
  const n = BURSTS * PER_BURST;
  const sim = useMemo(() => {
    const vel = new Float32Array(n * 3), base = new Float32Array(n * 3);
    const origin: [number, number, number][] = [], start: number[] = [];
    const c = new THREE.Color();
    for (let b = 0; b < BURSTS; b++) {
      origin.push([(Math.random() * 2 - 1) * spread, 6 + Math.random() * 2, (Math.random() * 2 - 1) * 0.8]);
      start.push((b / BURSTS) * (duration - LIFE));
      c.set(COLORS[b % COLORS.length]);
      const speed = 2.2 + Math.random() * 1.2;
      for (let p = 0; p < PER_BURST; p++) {
        const i = (b * PER_BURST + p) * 3;
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        vel[i] = s * Math.cos(th) * speed; vel[i + 1] = u * speed; vel[i + 2] = s * Math.sin(th) * speed;
        base[i] = c.r; base[i + 1] = c.g; base[i + 2] = c.b;
      }
    }
    return { vel, base, origin, start, pos: new Float32Array(n * 3), col: new Float32Array(n * 3) };
  }, [n, spread, duration]);
  const spark = useMemo(sparkTexture, []);
  useEffect(() => () => spark.dispose(), [spark]);
  const geo = useRef<THREE.BufferGeometry>(null);
  const t = useRef(0), done = useRef(false);

  useFrame((_, dt) => {
    const g = geo.current; if (!g || done.current) return;
    t.current += Math.min(dt, 0.05);
    const { vel, base, origin, start, pos, col } = sim;
    for (let b = 0; b < BURSTS; b++) {
      const life = t.current - start[b], alive = life >= 0 && life <= LIFE;
      const fade = alive ? Math.pow(1 - life / LIFE, 1.5) : 0;
      for (let p = 0; p < PER_BURST; p++) {
        const i = (b * PER_BURST + p) * 3, l = alive ? life : 0;
        pos[i] = origin[b][0] + vel[i] * l;
        pos[i + 1] = origin[b][1] + vel[i + 1] * l + 0.5 * GRAVITY * l * l;
        pos[i + 2] = origin[b][2] + vel[i + 2] * l;
        col[i] = base[i] * fade; col[i + 1] = base[i + 1] * fade; col[i + 2] = base[i + 2] * fade;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    if (t.current > duration) { done.current = true; onDone?.(); }
  });

  return (
    <points position={position} frustumCulled={false}>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[sim.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[sim.col, 3]} />
      </bufferGeometry>
      <pointsMaterial map={spark} size={0.55} vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} sizeAttenuation />
    </points>
  );
}
