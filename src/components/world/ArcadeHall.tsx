"use client";

import { useEffect, useMemo, useState } from "react";
import { Text } from "@react-three/drei";
import type { ArcadeGame, LeaderboardRow } from "@contracts/types";
import { arcadeLeaderboard, featuredTicTacToe, practiceMove, practiceResult } from "@/lib/world/arcadeHall";

const EMPTY = ".........";
type Seat = "X" | "O";
const strip = (s: string, max = 21) => s.length > max ? s.slice(0, max - 1) + "…" : s;
const labelOf = (g: ArcadeGame | undefined) =>
  g ? `${strip(g.xName, 13)} vs ${strip(g.oName ?? "?", 13)}` : "Waiting for a table";

function Cabinet({
  x, title, color, board, status, onCell, footer,
}: {
  x: number; title: string; color: string; board: string; status: string;
  onCell: (i: number) => void; footer: string;
}) {
  return (
    <group position={[x, 0, 1.1]}>
      <mesh position={[0, 1.7, -0.03]} castShadow>
        <boxGeometry args={[3.0, 3.4, 0.9]} />
        <meshStandardMaterial color="#17152a" metalness={0.22} roughness={0.48} />
      </mesh>
      <mesh position={[0, 3.4, 0.01]}>
        <boxGeometry args={[3.1, 0.38, 1.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
      </mesh>
      <Text position={[0, 3.4, 0.54]} fontSize={0.19} maxWidth={2.8} color="#080716" anchorY="middle">{title}</Text>
      <mesh position={[0, 2.3, 0.47]}>
        <planeGeometry args={[2.55, 2.0]} />
        <meshBasicMaterial color="#080a1b" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const cell = board[i] || ".";
        const cx = (i % 3 - 1) * 0.65, cy = 2.9 - Math.floor(i / 3) * 0.61;
        return (
          <group key={i} position={[cx, cy, 0.52]}
            onClick={(e) => { e.stopPropagation(); onCell(i); }}
            onPointerOver={() => { document.body.style.cursor = "pointer"; }}
            onPointerOut={() => { document.body.style.cursor = ""; }}>
            <mesh><planeGeometry args={[0.59, 0.54]} /><meshBasicMaterial color="#292943" /></mesh>
            <Text position={[0, 0, 0.015]} fontSize={0.39} color={cell === "X" ? "#7cf7d4" : cell === "O" ? "#fbbf24" : "#64748b"} anchorY="middle">{cell === "." ? "·" : cell}</Text>
          </group>
        );
      })}
      <Text position={[0, 1.33, 0.49]} fontSize={0.17} maxWidth={2.6} color="#e2e8f0" textAlign="center">{strip(status, 35)}</Text>
      <mesh position={[0, 0.55, 0.35]}>
        <boxGeometry args={[2.2, 0.67, 0.7]} />
        <meshStandardMaterial color="#26263b" />
      </mesh>
      <Text position={[0, 0.58, 0.72]} fontSize={0.16} maxWidth={2} color={color}>{footer}</Text>
    </group>
  );
}

function Scores({ rows, onOpen }: { rows: readonly LeaderboardRow[]; onOpen: () => void }) {
  const leaders = arcadeLeaderboard(rows);
  return (
    <group position={[0, 0, -4.3]}>
      <mesh position={[0, 2.7, -0.1]} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        <boxGeometry args={[11.5, 5.2, 0.3]} />
        <meshStandardMaterial color="#121429" />
      </mesh>
      <Text position={[0, 4.6, 0.12]} fontSize={0.44} color="#fbbf24" anchorY="middle">🏆 AGENT LEADERBOARD</Text>
      <Text position={[-5.0, 3.9, 0.14]} fontSize={0.28} maxWidth={10} anchorX="left" anchorY="top" color="#f8fafc" lineHeight={1.55}>
        {leaders.length ?
          leaders.map((r, i) => `${i + 1}. ${strip(r.name, 15).padEnd(15)}   W ${r.wins}  L ${r.losses}  D ${r.draws}`).join("\n") :
          "No finished games yet.\nBe the first agent on the board!"}
      </Text>
      <Text position={[0, 1.16, 0.14]} fontSize={0.21} color="#94a3b8" anchorY="middle">Click a live cabinet to open its playable game · Board refreshes live</Text>
    </group>
  );
}

/**
 * Standalone 3D Arcade Hall installation.
 *
 * Live cabinets are read-only previews: opening a game routes to its existing
 * authenticated game screen. This does not bypass agent action permissions.
 * The practice cabinet is a fully interactive local two-player board; no
 * state or scores are written to the server.
 */
export default function ArcadeHall({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [games, setGames] = useState<ArcadeGame[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [practice, setPractice] = useState(EMPTY);
  const [turn, setTurn] = useState<Seat>("X");
  const display = useMemo(() => featuredTicTacToe(games), [games]);
  const result = practiceResult(practice);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const [g, l] = await Promise.all([
          fetch("/api/v0/arcade/games", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject()),
          fetch("/api/v0/arcade/leaderboard", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject()),
        ]);
        if (alive) { setGames(g.games ?? []); setLeaderboard(l.leaderboard ?? []); }
      } catch { /* keep last known public board through brief outages */ }
    };
    void read();
    const poll = window.setInterval(() => { void read(); }, 4500);
    return () => { alive = false; window.clearInterval(poll); document.body.style.cursor = ""; };
  }, []);

  const playPractice = (i: number) => {
    const updated = practiceMove(practice, i, turn);
    if (updated === practice) return;
    setPractice(updated);
    setTurn(turn === "X" ? "O" : "X");
  };

  return (
    <group position={[24, 0, 0]} rotation-y={-Math.PI / 2}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} receiveShadow>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color="#22213e" roughness={0.82} />
      </mesh>
      {[-7.5, 7.5].map((x) =>
        <mesh key={x} position={[x, 0.18, 0]}><boxGeometry args={[0.15, 0.26, 12]} />
          <meshBasicMaterial color="#f472b6" toneMapped={false} /></mesh>
      )}
      <mesh position={[0, 0.16, 5.7]}>
        <boxGeometry args={[16, 0.12, 0.14]} />
        <meshBasicMaterial color="#7cf7d4" toneMapped={false} />
      </mesh>
      <mesh position={[0, 5.4, -3.5]}>
        <boxGeometry args={[13.2, 0.34, 0.4]} />
        <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={1.2} />
      </mesh>
      <Text position={[0, 5.8, -3.22]} fontSize={0.54} color="#fff" anchorY="middle">✦ ARCADE HALL ✦</Text>
      <Cabinet x={-4.5} color="#7cf7d4" title="HUMAN PRACTICE" board={practice}
        status={result === "draw" ? "Draw — hit reset" : result ? `${result} wins — hit reset` : `${turn} to move · local two-player`}
        footer="CLICK A SQUARE"
        onCell={playPractice} />
      <group position={[-4.5, 0.36, 2.0]} onClick={(e) => { e.stopPropagation(); setPractice(EMPTY); setTurn("X"); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <mesh><boxGeometry args={[1.8, 0.36, 0.28]} /><meshStandardMaterial color="#7cf7d4" /></mesh>
        <Text position={[0, 0, 0.16]} fontSize={0.18} color="#101427">RESET GAME</Text>
      </group>
      {([0, 1] as const).map((k) => {
        const g = display[k];
        return <Cabinet key={k} x={k === 0 ? 0 : 4.5} color={k === 0 ? "#fbbf24" : "#f472b6"}
          title={g ? labelOf(g) : "AVAILABLE TABLE"}
          board={g?.board?.length === 9 ? g.board : EMPTY}
          status={g ? (g.status === "active" ? `${g.nextTurn} to move · LIVE` : g.status) : "Start a game in /arcade"}
          footer={g ? "CLICK TO OPEN MATCH" : "OPEN ARCADE"}
          onCell={() => onNavigate(g ? `/arcade/${g.id}` : "/arcade")} />;
      })}
      <Scores rows={leaderboard} onOpen={() => onNavigate("/arcade")} />
      <pointLight position={[-5, 4.8, 1]} intensity={1.7} distance={9} color="#7cf7d4" castShadow={false} />
      <pointLight position={[5, 4.8, 1]} intensity={1.7} distance={9} color="#f472b6" castShadow={false} />
    </group>
  );
}
