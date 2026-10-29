import { describe, expect, it } from "vitest";
import { PLAYER_FACINGS } from "../core/engine/player";
import { PLAYER_APPEARANCE, PLAYER_DANCE, PLAYER_SCALE, PLAYER_WALK } from "./player";

const ASSET_SOURCES = import.meta.glob<string>("/public/assets/player/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("PLAYER_APPEARANCE", () => {
  it("points to a one-tile, one-block asset in the two-diamond template", () => {
    const svg = ASSET_SOURCES[`/public${PLAYER_APPEARANCE.textureSource}`];

    expect(svg).toBeDefined();
    expect(svg).toContain('viewBox="0 -341 1024 853"');
    expect(svg).not.toContain("data-tiles");
    expect(PLAYER_APPEARANCE.height).toBe(1);
  });

  it("is drawn smaller than its tile, so it stands shorter than a one-block house", () => {
    expect(PLAYER_APPEARANCE.scale).toBe(PLAYER_SCALE);
    expect(PLAYER_SCALE).toBeGreaterThan(0);
    expect(PLAYER_SCALE).toBeLessThan(1);
  });

  it("casts no shadow of its own: the engine owns shadows", () => {
    expect(ASSET_SOURCES[`/public${PLAYER_APPEARANCE.textureSource}`]?.toLowerCase()).not.toContain("#1e2a10");
  });

  it("dances while it stands still: a gentle lean and a dip on a beat a bit faster than two a second", () => {
    expect(PLAYER_APPEARANCE.dance).toBe(PLAYER_DANCE);
    expect(PLAYER_DANCE.beat).toBeGreaterThan(300);
    expect(PLAYER_DANCE.beat).toBeLessThan(600);
    expect(PLAYER_DANCE.lean).toBeGreaterThan(0.05);
    expect(PLAYER_DANCE.lean).toBeLessThan(0.15);
    expect(PLAYER_DANCE.bounce).toBeGreaterThan(0);
    expect(PLAYER_DANCE.bounce).toBeLessThan(0.1);
    // Its idle sheet dances in step: a cycle every two beats.
    expect(PLAYER_WALK.idle?.period).toBe(2 * PLAYER_DANCE.beat);
  });

  it("walks with a sheet laid out as the generator says: its facings, cell, gap and poses", () => {
    const svg = ASSET_SOURCES[`/public${PLAYER_WALK.source}`] ?? "";
    const { cell, gap, frames } = PLAYER_WALK;

    expect(PLAYER_APPEARANCE.walk).toBe(PLAYER_WALK);
    expect(svg).toContain(`data-facings="${PLAYER_FACINGS.join(" ")}"`);
    expect(svg).toContain(`data-cell="${cell.x} ${cell.y} ${cell.width} ${cell.height}"`);
    expect(svg).toContain(`data-gap="${gap}"`);
    expect(svg).toContain(`data-frames="${frames + 1}"`);
    const width = (frames + 1) * (cell.width + gap) - gap;
    const height = PLAYER_FACINGS.length * (cell.height + gap) - gap;
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    // The window lies inside the still figure's canvas.
    expect(cell.x + cell.width).toBeLessThanOrEqual(PLAYER_WALK.canvas.width);
    expect(cell.y + cell.height).toBeLessThanOrEqual(PLAYER_WALK.canvas.height);
    expect(svg.toLowerCase()).not.toContain("#1e2a10");
  });

  it("dances standing still with a sheet in the walk sheet's window, starting from its standing pose", () => {
    const svg = ASSET_SOURCES[`/public${PLAYER_WALK.idle?.source}`] ?? "";
    const walk = ASSET_SOURCES[`/public${PLAYER_WALK.source}`] ?? "";
    const { cell, gap, idle } = PLAYER_WALK;
    const frames = idle?.frames ?? 0;

    expect(frames).toBeGreaterThan(1);
    expect(idle?.period).toBeGreaterThan(0);
    expect(svg).toContain(`data-facings="${PLAYER_FACINGS.join(" ")}"`);
    expect(svg).toContain(`data-cell="${cell.x} ${cell.y} ${cell.width} ${cell.height}"`);
    expect(svg).toContain(`data-gap="${gap}"`);
    expect(svg).toContain(`data-frames="${frames}"`);
    const width = frames * (cell.width + gap) - gap;
    const height = PLAYER_FACINGS.length * (cell.height + gap) - gap;
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    // Column 0 is the walk sheet's standing pose, so standing still starts without a jump.
    const standingPose = (sheet: string, facing: string) =>
      sheet
        .match(new RegExp(`<g id="${facing}-0"[^>]*>[^]*?</g>`))?.[0]
        // Idle and walk sheets may use different lighting palettes; compare the pose geometry.
        ?.replace(/\s(?:fill|stroke)="[^"]*"/g, "");
    PLAYER_FACINGS.forEach((facing) => expect(standingPose(svg, facing)).toBe(standingPose(walk, facing)));
    expect(svg.toLowerCase()).not.toContain("#1e2a10");
  });

  it("climbs with a sheet in the walk sheet's window, a column per pose of a climb", () => {
    const svg = ASSET_SOURCES[`/public${PLAYER_WALK.climb?.source}`] ?? "";
    const { cell, gap, climb } = PLAYER_WALK;
    const frames = climb?.frames ?? 0;

    expect(frames).toBeGreaterThan(1);
    expect(svg).toContain(`data-facings="${PLAYER_FACINGS.join(" ")}"`);
    expect(svg).toContain(`data-cell="${cell.x} ${cell.y} ${cell.width} ${cell.height}"`);
    expect(svg).toContain(`data-gap="${gap}"`);
    expect(svg).toContain(`data-frames="${frames}"`);
    const width = frames * (cell.width + gap) - gap;
    const height = PLAYER_FACINGS.length * (cell.height + gap) - gap;
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    // Under the 4 096 px a GPU texture may measure at resolution 1 (#105).
    expect(Math.max(width, height)).toBeLessThan(4096);
    expect(svg.toLowerCase()).not.toContain("#1e2a10");
  });

  it("jumps with a sheet in the walk sheet's window, a named column per part of a jump", () => {
    const svg = ASSET_SOURCES[`/public${PLAYER_WALK.jump?.source}`] ?? "";
    const { cell, gap, jump } = PLAYER_WALK;
    const poses = Object.entries(jump?.poses ?? {}).sort(([, a], [, b]) => a - b);
    const frames = poses.length;

    expect(poses.map(([, column]) => column)).toEqual([0, 1, 2, 3, 4]);
    expect(svg).toContain(`data-poses="${poses.map(([name]) => name).join(" ")}"`);
    expect(svg).toContain(`data-facings="${PLAYER_FACINGS.join(" ")}"`);
    expect(svg).toContain(`data-cell="${cell.x} ${cell.y} ${cell.width} ${cell.height}"`);
    expect(svg).toContain(`data-gap="${gap}"`);
    expect(svg).toContain(`data-frames="${frames}"`);
    const width = frames * (cell.width + gap) - gap;
    const height = PLAYER_FACINGS.length * (cell.height + gap) - gap;
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    expect(Math.max(width, height)).toBeLessThan(4096);
    expect(svg.toLowerCase()).not.toContain("#1e2a10");
  });
});
