import { describe, expect, it } from "vitest";
import { generateShotPatterns } from "./shots";
import type { GameMode } from "../types/modes";

describe("generateShotPatterns", () => {
  const mockGameMode = {
    shotPatterns: [
      { id: "pattern1", offsets: [[0, 0]] },
      { id: "pattern2", offsets: [[0, 0], [1, 0]] },
      { offsets: [[1, 1]] }, // Missing ID
    ]
  } as unknown as GameMode;

  it("should generate patterns from gameMode when config has no shotPatternIds", () => {
    const patterns = generateShotPatterns({}, mockGameMode);
    
    // It creates 3 IDs: 'pattern1', 'pattern2', ''
    // The map maps 'pattern1' -> pattern1, 'pattern2' -> pattern2, undefined -> pattern3
    // The map maps 'pattern1' -> pattern1, 'pattern2' -> pattern2, undefined -> pattern3
    // 'id' of the missing ID is undefined in map creation `pattern.id`
    expect(patterns.length).toBe(2);
    expect(patterns[0].id).toBe("pattern1");
    expect(patterns[1].id).toBe("pattern2");
  });

  it("should generate only requested patterns from config.shotPatternIds", () => {
    const patterns = generateShotPatterns({ shotPatternIds: ["pattern2", "pattern2", "unknown"] }, mockGameMode);
    
    // Should filter out unknown and deduplicate
    expect(patterns.length).toBe(1);
    expect(patterns[0].id).toBe("pattern2");
    expect(patterns[0].offsets).toEqual([[0, 0], [1, 0]]);
  });
});
