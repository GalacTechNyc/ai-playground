/** Camera-space tree detail selection. Squared distances avoid a sqrt per tree. */
export type TreeDetail = "near" | "far" | "hidden";
export type WorldQuality = "high" | "low";

/**
 * Instanced tree bands:
 *  - near = trunks and crowns with normal polygons / shadows
 *  - far = reduced geometry and no per-tree shadows
 *  - hidden = beyond the low-quality draw radius
 *
 * Keep thresholds independent of framerate and stable for mobile.
 */
export function treeDetail(distanceSquared: number, quality: WorldQuality): TreeDetail {
  if (!Number.isFinite(distanceSquared) || distanceSquared < 0) return "hidden";
  const near = quality === "low" ? 23 : 34;
  const far = quality === "low" ? 63 : 95;
  if (distanceSquared <= near * near) return "near";
  return distanceSquared <= far * far ? "far" : "hidden";
}

export function partitionTrees<T extends readonly [number, number, number]>(
  trees: readonly T[], cameraX: number, cameraZ: number, quality: WorldQuality,
): { near: T[]; far: T[] } {
  const near: T[] = [], far: T[] = [];
  for (const tree of trees) {
    const dx = tree[0] - cameraX, dz = tree[1] - cameraZ;
    const detail = treeDetail(dx * dx + dz * dz, quality);
    if (detail === "near") near.push(tree);
    else if (detail === "far") far.push(tree);
  }
  return { near, far };
}
