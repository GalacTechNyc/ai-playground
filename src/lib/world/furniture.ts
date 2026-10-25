/** Local-only room remix model. Deliberately separate from server-owned home state. */
export const FURNITURE_KINDS = ["sofa", "table", "shelf", "chair", "lamp", "plant", "rug"] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];
export type FurniturePiece = { id: string; kind: FurnitureKind; x: number; z: number; rotation: 0 | 1 | 2 | 3 };

export const MAX_FURNITURE = 12;
const RADIUS: Record<FurnitureKind, number> = {
  sofa: 0.85, table: 0.56, shelf: 0.46, chair: 0.44, lamp: 0.32, plant: 0.38, rug: 0,
};
const kindSet = new Set<string>(FURNITURE_KINDS);

export const DEFAULT_FURNITURE: FurniturePiece[] = [
  { id: "sofa-0", kind: "sofa", x: -1.5, z: -2, rotation: 0 },
  { id: "table-0", kind: "table", x: -1.5, z: -0.5, rotation: 0 },
  { id: "shelf-0", kind: "shelf", x: 2.5, z: -2.5, rotation: 0 },
  { id: "lamp-0", kind: "lamp", x: 2, z: 0, rotation: 0 },
  { id: "plant-0", kind: "plant", x: -2.5, z: 1.5, rotation: 0 },
  { id: "rug-0", kind: "rug", x: 0, z: 0, rotation: 0 },
];

export function snapFurniture(v: number): number {
  return Math.round(v * 2) / 2;
}

/** Floor is 7x7. Leave the south entry (near z=+3) clear for visitors. */
export function canPlaceFurniture(pieces: readonly FurniturePiece[], candidate: Pick<FurniturePiece, "kind" | "x" | "z">, excludingId?: string): boolean {
  const { kind, x, z } = candidate;
  if (!kindSet.has(kind) || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (Math.abs(x) > 2.5 || Math.abs(z) > 2.5 || x !== snapFurniture(x) || z !== snapFurniture(z)) return false;
  if (kind !== "rug" && Math.abs(x) < 0.8 && z > 1.5) return false;
  if (kind === "rug") return true; // Rugs layer beneath furniture and do not block a doorway.
  return pieces.every((piece) => piece.id === excludingId || piece.kind === "rug" ||
    Math.hypot(piece.x - x, piece.z - z) >= RADIUS[piece.kind] + RADIUS[kind] + 0.08);
}

export function addFurniture(pieces: readonly FurniturePiece[], kind: FurnitureKind, x: number, z: number): FurniturePiece[] | null {
  if (pieces.length >= MAX_FURNITURE) return null;
  const candidate = { kind, x: snapFurniture(x), z: snapFurniture(z) };
  if (!canPlaceFurniture(pieces, candidate)) return null;
  const ids = new Set(pieces.map((p) => p.id));
  let n = 0;
  while (ids.has("piece-" + n)) n++;
  return [...pieces, { ...candidate, id: "piece-" + n, rotation: 0 }];
}

export function moveFurniture(pieces: readonly FurniturePiece[], id: string, x: number, z: number): FurniturePiece[] | null {
  const piece = pieces.find((p) => p.id === id);
  if (!piece) return null;
  const candidate = { kind: piece.kind, x: snapFurniture(x), z: snapFurniture(z) };
  if (!canPlaceFurniture(pieces, candidate, id)) return null;
  return pieces.map((p) => p.id === id ? { ...p, ...candidate } : p);
}

/** Compact permalink, no user-supplied HTML, IDs, or arbitrary models. */
export function encodeFurniture(pieces: readonly FurniturePiece[]): string {
  return pieces.map((p) => [p.kind, p.x * 2, p.z * 2, p.rotation].join(":")).join(";");
}
export function decodeFurniture(code: string): FurniturePiece[] | null {
  if (typeof code !== "string" || code.length > 800) return null;
  if (code === "") return [];
  const chunks = code.split(";");
  if (chunks.length > MAX_FURNITURE) return null;
  const parsed: FurniturePiece[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const parts = chunks[i].split(":");
    if (parts.length !== 4 || !kindSet.has(parts[0]) ||
        !/^-?\d{1,2}$/.test(parts[1]) || !/^-?\d{1,2}$/.test(parts[2]) || !/^[0-3]$/.test(parts[3])) return null;
    const piece: FurniturePiece = {
      id: "piece-" + i, kind: parts[0] as FurnitureKind,
      x: Number(parts[1]) / 2, z: Number(parts[2]) / 2,
      rotation: Number(parts[3]) as 0 | 1 | 2 | 3,
    };
    if (!canPlaceFurniture(parsed, piece)) return null;
    parsed.push(piece);
  }
  return parsed;
}

export const furnitureStorageKey = (agentId: string) => "ap.home.remix.v1." + agentId;
