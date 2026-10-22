import { describe, expect, it } from "vitest";
import { Box } from "./box";
import { buildFilledElevationLevels, fillElevations, removeHiddenBlocks } from "./columns";

describe("column filling", () => {
  it("fills levels below the requested minimum", () => {
    expect(buildFilledElevationLevels(3, -2)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(buildFilledElevationLevels(-4, -2)).toEqual([-4, -3]);
  });

  it("creates independent boxes for every filled level", () => {
    const source = new Box(4, 5, {
      elevation: 2,
      metadata: { kind: "hill" },
    });
    const filled = fillElevations([source], 0);

    expect(filled.map((box) => box.elevation)).toEqual([0, 1, 2]);
    expect(filled.every((box) => box !== source)).toBe(true);
    expect(filled.every((box) => box.metadata.kind === "hill")).toBe(true);
  });

  it("gives every filled level its material once: water below zero, ground under the top", () => {
    const filled = fillElevations([new Box(0, 0, { elevation: 2, type: "grass" })], -2);

    expect(filled.map(({ elevation, type }) => [elevation, type])).toEqual([
      [-2, "water"],
      [-1, "water"],
      [0, "ground"],
      [1, "ground"],
      [2, "grass"],
    ]);
  });

  it("keeps the column's own material on its top (a sand shore, a water column)", () => {
    expect(fillElevations([new Box(0, 0, { elevation: 0, type: "sand" })], -1).map(({ type }) => type)).toEqual([
      "water",
      "sand",
    ]);
    expect(fillElevations([new Box(0, 0, { elevation: -1 })], -2).map(({ type }) => type)).toEqual(["water", "water"]);
  });
});

describe("hidden blocks", () => {
  type Block = { x: number; y: number; elevation: number };
  /** Every block of a `size`×`size` patch of columns `levels` blocks tall (elevations 0…). */
  const solid = (size: number, levels: number): Block[] =>
    Array.from({ length: size * size * levels }, (_, index) => ({
      x: index % size,
      y: Math.floor(index / size) % size,
      elevation: Math.floor(index / (size * size)),
    }));
  const key = ({ x, y, elevation }: Block) => `${x},${y},${elevation}`;

  it("keeps a lone column: nothing stands in front of it", () => {
    const column = [0, 1, 2].map((elevation) => ({ x: 0, y: 0, elevation }));

    expect(removeHiddenBlocks(column)).toEqual(column);
  });

  it("removes the blocks buried under and behind others, keeping the outer shell", () => {
    const visible = removeHiddenBlocks(solid(3, 3));

    // The 8 blocks with a block on top and the camera side (−x, −y) covered two levels high.
    expect(27 - visible.length).toBe(8);
    expect(visible.every((block) => block.elevation === 2 || block.x === 0 || block.y === 0)).toBe(true);
  });

  it("keeps every top: nothing covers it from above", () => {
    const blocks = solid(3, 3);
    const tops = blocks.filter(({ elevation }) => elevation === 2);

    expect(removeHiddenBlocks(blocks)).toEqual(expect.arrayContaining(tops));
  });

  it("keeps the block at the foot of a step: the seam under the higher block shows it", () => {
    // Column (1, 1) is two blocks tall; its neighbours towards the camera, one.
    const blocks = [...solid(2, 1), { x: 1, y: 1, elevation: 1 }];

    expect(removeHiddenBlocks(blocks)).toContainEqual({ x: 1, y: 1, elevation: 0 });
  });

  it("needs the diagonal neighbour towards the camera one level up to hide a block", () => {
    const blocks = solid(2, 2).filter(({ x, y, elevation }) => !(x === 0 && y === 0 && elevation === 1));

    expect(removeHiddenBlocks(blocks)).toContainEqual({ x: 1, y: 1, elevation: 0 });
  });

  it("ignores the neighbours behind (+x, +y): they are drawn under it", () => {
    const blocks = solid(3, 3);
    const back = removeHiddenBlocks(blocks).filter(({ x, y }) => x === 2 || y === 2);

    expect(back.map(key)).not.toContain("2,2,1");
    expect(back.some(({ x, y, elevation }) => x === 2 && y === 2 && elevation === 2)).toBe(true);
  });

  it("does not let a block that does not fill its cell (a lowered sand top) hide others", () => {
    const blocks = solid(2, 2);
    const isSand = (block: Block) => block.x === 0 && block.y === 1 && block.elevation === 1;

    expect(removeHiddenBlocks(blocks)).not.toContainEqual({ x: 1, y: 1, elevation: 0 });
    expect(removeHiddenBlocks(blocks, (block) => !isSand(block))).toContainEqual({ x: 1, y: 1, elevation: 0 });
  });

  it("keeps the input order and instances, whatever order the blocks come in", () => {
    const blocks = solid(3, 3);
    const reversed = [...blocks].reverse();
    const visible = removeHiddenBlocks(reversed);

    expect(
      visible.every((block, index) => index === 0 || reversed.indexOf(block) > reversed.indexOf(visible[index - 1])),
    ).toBe(true);
    expect(visible.map(key).sort()).toEqual(removeHiddenBlocks(blocks).map(key).sort());
  });
});
