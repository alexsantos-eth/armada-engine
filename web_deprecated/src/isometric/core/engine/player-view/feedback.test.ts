import { describe, expect, it } from "vitest";
import { TILE_METRICS } from "../constants";
import { PLAYER_JUMP_SPEED } from "../player";
import { createSeededRandom } from "../random";
import {
  BURST_DUST,
  JET_FIRE,
  JET_NOZZLE_BACK,
  JET_SMOKE,
  getJetNozzle,
  DUST_ALPHA,
  DUST_MS,
  getBodyScale,
  getDust,
  getDustColumn,
  getDustVoxelAt,
  getDustVoxels,
  getVoxelFaces,
  KICK_DUST,
  LANDING_SQUASH_MS,
  TAKEOFF_STRETCH_MS,
} from "./feedback";

describe("getBodyScale", () => {
  it("is the body's own scale when nothing happened", () => {
    expect(getBodyScale(Infinity, Infinity, 0)).toEqual({ x: 1, y: 1 });
    expect(getBodyScale(TAKEOFF_STRETCH_MS, LANDING_SQUASH_MS, PLAYER_JUMP_SPEED)).toEqual({ x: 1, y: 1 });
  });

  it("stretches up at a take-off and squashes at a landing, harder landings more", () => {
    const stretched = getBodyScale(0, Infinity, 0);
    expect(stretched.y).toBeGreaterThan(1);
    expect(stretched.x).toBeLessThan(1);

    const soft = getBodyScale(Infinity, 0, 0.02);
    const hard = getBodyScale(Infinity, 0, PLAYER_JUMP_SPEED);
    const harder = getBodyScale(Infinity, 0, 10);
    expect(soft.y).toBeLessThan(1);
    expect(hard.y).toBeLessThan(soft.y);
    expect(harder.y).toBeLessThan(hard.y);
    expect(harder).toEqual(getBodyScale(Infinity, 0, PLAYER_JUMP_SPEED * 1.5));
    expect(getBodyScale(Infinity, LANDING_SQUASH_MS / 2, PLAYER_JUMP_SPEED).y).toBeCloseTo(1 - 0.07);
  });
});

describe("getDust", () => {
  it("goes through its life and fades, and is gone after DUST_MS", () => {
    expect(getDust(0)).toEqual({ progress: 0, alpha: DUST_ALPHA });
    expect(getDust(DUST_MS / 2)).toEqual({ progress: expect.closeTo(0.5), alpha: expect.closeTo(DUST_ALPHA / 2) });
    expect(getDust(DUST_MS)).toBeUndefined();
  });

  it("lasts and fades as long as asked, from the opacity asked", () => {
    expect(getDust(0, JET_SMOKE.ms, JET_SMOKE.alpha)).toEqual({ progress: 0, alpha: JET_SMOKE.alpha });
    expect(getDust(DUST_MS, JET_SMOKE.ms, JET_SMOKE.alpha)?.progress).toBeCloseTo(DUST_MS / JET_SMOKE.ms);
    expect(getDust(JET_SMOKE.ms, JET_SMOKE.ms, JET_SMOKE.alpha)).toBeUndefined();
  });
});

describe("getDustVoxels", () => {
  /** The red, green and blue of `color`. */
  const channels = (color: number) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];

  it("shades a jetpack's flame yellow to orange and its smoke grey, sinking the flame and lifting the smoke", () => {
    for (const shape of [JET_FIRE, JET_SMOKE]) {
      const voxels = getDustVoxels(shape, createSeededRandom(3));
      expect(voxels).toHaveLength(shape.voxels);
      const [from, to] = shape.colors.map(channels);
      for (const voxel of voxels) {
        channels(voxel.shade).forEach((channel, index) => {
          expect(channel).toBeGreaterThanOrEqual(Math.min(from[index], to[index]));
          expect(channel).toBeLessThanOrEqual(Math.max(from[index], to[index]));
        });
        expect(Math.sign(voxel.rise)).toBe(shape === JET_FIRE ? -1 : 1);
      }
    }
    // The flame is small and short-lived, the smoke big and lasting.
    expect(JET_FIRE.size[1]).toBeLessThan(JET_SMOKE.size[0]);
    expect(JET_FIRE.ms).toBeLessThan(JET_SMOKE.ms);
  });

  it("scatters a ring of voxels round the feet, each sized, lifted and shaded on its own", () => {
    const voxels = getDustVoxels(BURST_DUST, createSeededRandom(1));
    expect(voxels).toHaveLength(BURST_DUST.voxels);
    for (const voxel of voxels) {
      const radius = Math.hypot(voxel.x, voxel.y);
      expect(radius).toBeGreaterThanOrEqual(BURST_DUST.radius[0] - 1e-9);
      expect(radius).toBeLessThanOrEqual(BURST_DUST.radius[1] + 1e-9);
      // It drifts outward, the way it already lies from the feet.
      expect(voxel.x * voxel.driftX + voxel.y * voxel.driftY).toBeGreaterThan(0);
      expect(voxel.size).toBeGreaterThanOrEqual(BURST_DUST.size[0]);
      expect(voxel.size).toBeLessThanOrEqual(BURST_DUST.size[1]);
      expect(voxel.lift).toBeLessThanOrEqual(BURST_DUST.lift);
      const grey = voxel.shade & 0xff;
      expect(voxel.shade).toBe(grey * 0x010101);
      expect(grey).toBeGreaterThan(0xff - 0x25);
    }
    // All round the feet: some behind and some in front, some on each side.
    expect(voxels.some(({ x, y }) => x + y > 0) && voxels.some(({ x, y }) => x + y < 0)).toBe(true);
    expect(voxels.some(({ x, y }) => x - y > 0) && voxels.some(({ x, y }) => x - y < 0)).toBe(true);
    expect(new Set(voxels.map(({ size }) => size)).size).toBe(voxels.length);
  });

  it("is the same for the same seed and different for another", () => {
    expect(getDustVoxels(BURST_DUST, createSeededRandom(7))).toEqual(getDustVoxels(BURST_DUST, createSeededRandom(7)));
    expect(getDustVoxels(BURST_DUST, createSeededRandom(7))).not.toEqual(
      getDustVoxels(BURST_DUST, createSeededRandom(8)),
    );
  });

  it("pushes a kicked puff the way of the kick", () => {
    const kicked = getDustVoxels(KICK_DUST, createSeededRandom(3), { x: -1, y: 0 });
    expect(kicked).toHaveLength(KICK_DUST.voxels);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(kicked.map(({ driftX }) => driftX))).toBeLessThan(-KICK_DUST.kick / 2);
    expect(mean(kicked.map(({ x }) => x))).toBeLessThan(0);
  });
});

describe("getDustVoxelAt", () => {
  const voxel = { x: 0.1, y: -0.1, driftX: 0.2, driftY: -0.2, lift: 0.05, rise: 0.1, size: 0.06, shade: 0xffffff };

  it("starts where the voxel lies and drifts, rises and shrinks, fast at first", () => {
    const out = { x: 0, y: 0, height: 0, size: 0 };
    expect(getDustVoxelAt(voxel, 0, out)).toBe(out);
    expect(out).toEqual({ x: 0.1, y: -0.1, height: 0.05, size: 0.06 });
    expect(getDustVoxelAt(voxel, 0.5, out)).toEqual({
      x: expect.closeTo(0.25),
      y: expect.closeTo(-0.25),
      height: expect.closeTo(0.125),
      size: expect.closeTo(0.048),
    });
    expect(getDustVoxelAt(voxel, 1, out)).toEqual({
      x: expect.closeTo(0.3),
      y: expect.closeTo(-0.3),
      height: expect.closeTo(0.15),
      size: expect.closeTo(0.036),
    });
  });
});

describe("getDustColumn", () => {
  const flat = () => 1;

  it("is the feet's column, behind or in front of the feet", () => {
    const feet = { x: 2.2, y: 2.1 };
    expect(getDustColumn({ x: 2.3, y: 2.1 }, feet, 1, flat)).toEqual({ x: 2, y: 2, elevation: 1, behind: true });
    expect(getDustColumn({ x: 2.1, y: 2.1 }, feet, 1, flat)).toEqual({ x: 2, y: 2, elevation: 1, behind: false });
  });

  it("is the column it drifts over, behind or in front of that column's centre", () => {
    const feet = { x: 2.4, y: 2 };
    expect(getDustColumn({ x: 2.7, y: 2.1 }, feet, 1, flat)).toEqual({ x: 3, y: 2, elevation: 1, behind: false });
    expect(getDustColumn({ x: 2.7, y: 2.4 }, feet, 1, flat)).toEqual({ x: 3, y: 2, elevation: 1, behind: true });
  });

  it("is a lower column's top, and a wall's block level with the feet, so the blocks above hide it", () => {
    const feet = { x: 2.4, y: 2 };
    const ledge = (x: number) => (x === 3 ? 0 : 4);
    expect(getDustColumn({ x: 2.7, y: 2.1 }, feet, 2, ledge)).toMatchObject({ x: 3, y: 2, elevation: 0 });
    expect(getDustColumn({ x: 2.2, y: 2.1 }, feet, 2, ledge)).toMatchObject({ x: 2, y: 2, elevation: 2 });
    // Feet on a sunk sand top, or in the air, are level with the block they are nearest.
    expect(getDustColumn({ x: 2.2, y: 2.1 }, feet, 1.75, ledge)).toMatchObject({ elevation: 2 });
    expect(getDustColumn({ x: 2.2, y: 2.1 }, feet, 2.4, ledge)).toMatchObject({ elevation: 2 });
  });

  it("stays in the feet's column where there is no column", () => {
    const feet = { x: 2.4, y: 2 };
    const own = (x: number) => (x === 2 ? 1 : undefined);
    expect(getDustColumn({ x: 2.7, y: 1.9 }, feet, 1, own)).toEqual({ x: 2, y: 2, elevation: 1, behind: true });
    expect(getDustColumn({ x: 2.7, y: 1.9 }, feet, 1.75, () => undefined)).toMatchObject({ x: 2, elevation: 2 });
  });
});

describe("getVoxelFaces", () => {
  it("draws a voxel standing on the point, with the proportions of a terrain block", () => {
    const { tileWidth, tileHeight, boxHeight } = TILE_METRICS;
    const faces = getVoxelFaces(0, 0, 1, TILE_METRICS);
    expect(faces.top).toEqual([
      0,
      -boxHeight - tileHeight / 2,
      tileWidth / 2,
      -boxHeight,
      0,
      -boxHeight + tileHeight / 2,
      -tileWidth / 2,
      -boxHeight,
    ]);
    expect(faces.left).toEqual([
      -tileWidth / 2,
      -boxHeight,
      0,
      -boxHeight + tileHeight / 2,
      0,
      tileHeight / 2,
      -tileWidth / 2,
      0,
    ]);
    expect(faces.right).toEqual([
      0,
      -boxHeight + tileHeight / 2,
      tileWidth / 2,
      -boxHeight,
      tileWidth / 2,
      0,
      0,
      tileHeight / 2,
    ]);
  });

  it("is placed by tiles from the point and scaled by its size", () => {
    const small = getVoxelFaces(0.5, 0.25, 0.1, TILE_METRICS);
    expect(small.left.slice(4, 6)).toEqual([
      0.5 * TILE_METRICS.tileWidth,
      0.25 * TILE_METRICS.tileWidth + (0.1 * TILE_METRICS.tileHeight) / 2,
    ]);
  });
});

describe("getDustVoxels origin", () => {
  it("raises a puff from its origin instead of the feet, the same puff shifted", () => {
    const at = getDustVoxels(JET_FIRE, createSeededRandom(5), undefined, { x: 0.1, y: -0.2 });
    const feet = getDustVoxels(JET_FIRE, createSeededRandom(5));
    at.forEach((voxel, index) => {
      expect(voxel.x).toBeCloseTo(feet[index].x + 0.1);
      expect(voxel.y).toBeCloseTo(feet[index].y - 0.2);
      expect({ ...voxel, x: 0, y: 0 }).toEqual({ ...feet[index], x: 0, y: 0 });
    });
  });
});

describe("getJetNozzle", () => {
  it("puts the nozzles JET_NOZZLE_BACK columns behind the feet, the other way from where it faces", () => {
    const facings = 8;
    const south = getJetNozzle(6, facings);
    // Facing south (down the screen, −x −y), its back is to the north, +x +y.
    expect(south.x).toBeCloseTo(JET_NOZZLE_BACK / Math.SQRT2);
    expect(south.y).toBeCloseTo(JET_NOZZLE_BACK / Math.SQRT2);
    // Facing east (right, +x −y), its back is to the west.
    const east = getJetNozzle(0, facings);
    expect(east.x).toBeCloseTo(-JET_NOZZLE_BACK / Math.SQRT2);
    expect(east.y).toBeCloseTo(JET_NOZZLE_BACK / Math.SQRT2);
    for (let facing = 0; facing < facings; facing += 1) {
      const { x, y } = getJetNozzle(facing, facings);
      expect(Math.hypot(x, y)).toBeCloseTo(JET_NOZZLE_BACK);
    }
  });
});
