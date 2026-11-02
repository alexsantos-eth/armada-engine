import { describe, expect, it } from "vitest";
import fixtures from "./contracts.v1.json";
import {
  findPath,
  CellMap,
  createPlayer,
  getInterpolationAlpha,
  consumeFrame,
  createFixedStepper,
  projectBoxesToIsometric,
  toChunkCoord,
  toLocalCoord,
  toWorldCoord,
  transitionPlayerMotion,
  setPlayerWalk,
  jumpPlayer,
  stepPlayer,
  compareDrawKeys,
  getDrawDepth,
  getClimbPose,
  getIdlePose,
  getJumpPose,
  getWalkPose,
} from "../domain";
import type { PlayerMotionType } from "../../types";
import type { PlayerMotionEvent } from "../player/motion";

describe("versioned migration contracts", () => {
  it("keeps signed chunk and local coordinates", () => {
    for (const { world, chunk, local } of fixtures.coordinates) {
      expect(toChunkCoord(world)).toEqual(chunk);
      expect(toLocalCoord(world)).toEqual(local);
      expect(toWorldCoord(chunk, local)).toEqual(world);
    }
  });

  it("keeps isometric projection and elevation independent of the terrain generator", () => {
    const projected = projectBoxesToIsometric(
      fixtures.projection.blocks.map((box) => ({ ...box, metadata: {} })),
      fixtures.projection.config,
    );
    expect(projected.map(({ screenX, baseScreenY, screenY }) => ({ screenX, baseScreenY, screenY }))).toEqual(
      fixtures.projection.blocks.map(({ screenX, baseScreenY, screenY }) => ({ screenX, baseScreenY, screenY })),
    );
  });

  it("keeps the path tie break order", () => {
    const path = findPath({
      area: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      starts: [{ x: 0, y: 0 }],
      isGoal: (x, y) => x === 1 && y === 1,
      cost: () => 1,
    });
    expect(path).toEqual(fixtures.path);
  });

  it("keeps scene depth, layer order and stable ties", () => {
    const { tileHeight, entries, expected } = fixtures.drawOrder;
    const ordered = entries
      .map(({ id, x, baseScreenY, elevation, tile, axis, layer }) => ({
        id,
        depth: getDrawDepth({ x, baseScreenY, elevation }, tileHeight, tile, axis as "x" | "y"),
        layer,
      }))
      .sort(compareDrawKeys)
      .map(({ id }) => id);
    expect(ordered).toEqual(expected);
  });

  it("keeps player pose columns independent of sprites", () => {
    const { walk, idle, climb, jump } = fixtures.framePoses;
    expect(walk.distances.map((distance) => getWalkPose(distance, walk))).toEqual(walk.expected);
    expect(idle.milliseconds.map((ms) => getIdlePose(ms, idle))).toEqual(idle.expected);
    expect(climb.progress.map((progress) => getClimbPose(progress, climb))).toEqual(climb.expected);
    expect(jump.phases.map((phase) => getJumpPose(phase as keyof typeof jump.poses | "ground", jump))).toEqual(
      jump.expected.map((pose) => pose ?? undefined),
    );
  });

  it("keeps representative player motion transitions, including an invalid event", () => {
    for (const { state, event, next } of fixtures.motion) {
      expect(transitionPlayerMotion(state as PlayerMotionType, { type: event } as PlayerMotionEvent)).toBe(next);
    }
  });

  it("keeps fixed step accumulation and interpolation", () => {
    const stepper = createFixedStepper({ stepMs: fixtures.stepper.stepMs });
    const steps = fixtures.stepper.framesMs.map((ms) => {
      const count = consumeFrame(stepper, ms);
      return { count, alpha: getInterpolationAlpha(stepper) };
    });
    expect(steps.map(({ count }) => count)).toEqual(fixtures.stepper.steps);
    steps.forEach(({ alpha }, index) => expect(alpha).toBeCloseTo(fixtures.stepper.alpha[index]));
  });

  it("keeps a short walk and jump trajectory on controlled terrain", () => {
    const columns = [];
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) columns.push({ x, y, elevation: 0, type: "grass" as const, metadata: {} });
    }
    const ground = {
      columnIndex: CellMap.from(columns, (column) => column),
      occupancy: { at: () => [] },
    };
    const player = createPlayer(ground, { x: 2, y: 2 });
    setPlayerWalk(player, { up: true, down: false, left: false, right: false });
    const actual = [];
    for (let tick = 0; tick < 6; tick += 1) {
      if (tick === 3) jumpPlayer(player);
      stepPlayer(player, ground);
      actual.push({
        x: Number(player.x.toFixed(6)),
        y: Number(player.y.toFixed(6)),
        height: Number(player.height.toFixed(6)),
        motion: player.motion.type,
        jumps: player.feedback.jumps,
      });
    }
    expect(actual).toEqual(fixtures.player);
  });
});
