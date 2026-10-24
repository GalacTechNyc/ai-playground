import test from "node:test";
import assert from "node:assert/strict";
import { partitionTrees, treeDetail } from "./treeLod";

test("camera-distance LOD chooses near, far and hidden bands per quality", () => {
  assert.equal(treeDetail(0, "high"), "near");
  assert.equal(treeDetail(33 ** 2, "high"), "near");
  assert.equal(treeDetail(35 ** 2, "high"), "far");
  assert.equal(treeDetail(96 ** 2, "high"), "hidden");
  assert.equal(treeDetail(23 ** 2, "low"), "near");
  assert.equal(treeDetail(24 ** 2, "low"), "far");
  assert.equal(treeDetail(64 ** 2, "low"), "hidden");
  assert.equal(treeDetail(-3, "high"), "hidden");
  assert.equal(treeDetail(Number.NaN, "low"), "hidden");
});

test("tree partition preserves original coordinates and excludes distant trees", () => {
  const trees = [[0, 0, 1], [30, 0, 1.3], [90, 0, 0.9], [130, 0, 1]] as const;
  const high = partitionTrees(trees, 0, 0, "high");
  assert.deepEqual(high.near, [trees[0], trees[1]]);
  assert.deepEqual(high.far, [trees[2]]);
  assert.equal(high.near.length + high.far.length, 3);

  const low = partitionTrees(trees, 0, 0, "low");
  assert.deepEqual(low.near, [trees[0]]);
  assert.deepEqual(low.far, [trees[1]]);
  assert.equal(trees.length, 4, "input is not mutated");
});

test("LOD transitions as the camera approaches without touching tree state", () => {
  const trees = [[0, 0, 1], [80, 0, 1]] as const;
  const farCamera = partitionTrees(trees, -20, 0, "low");
  assert.equal(farCamera.near.length, 1);
  assert.equal(farCamera.far.length, 0);
  const nearCamera = partitionTrees(trees, 80, 0, "low");
  assert.deepEqual(nearCamera.near, [trees[1]]);
});
