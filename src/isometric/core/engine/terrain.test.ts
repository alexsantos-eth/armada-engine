import { describe, expect, it } from "vitest";

import { buildFilledElevationLevels } from "./terrain";

describe("buildFilledElevationLevels", () => {
  it("marks lower blocks as ground support when the column elevation is greater than 2", () => {
    expect(buildFilledElevationLevels(3, -1)).toEqual([
      { elevation: -1, useGroundTexture: true },
      { elevation: 0, useGroundTexture: true },
      { elevation: 1, useGroundTexture: true },
      { elevation: 2, useGroundTexture: true },
      { elevation: 3, useGroundTexture: false },
    ]);
  });

  it("keeps default textures for shorter columns", () => {
    expect(buildFilledElevationLevels(2, -1)).toEqual([
      { elevation: -1, useGroundTexture: false },
      { elevation: 0, useGroundTexture: false },
      { elevation: 1, useGroundTexture: false },
      { elevation: 2, useGroundTexture: false },
    ]);
  });
});