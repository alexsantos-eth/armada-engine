import { GAME_CONSTANTS } from "../constants/game";
import { SHOT_PATTERNS } from "../constants/shots";
import type { ShotPattern } from "../types/shots";
import type { GameConfig } from "../types/config";

export function generateShotPatterns(config: Partial<GameConfig>): ShotPattern[] {
  const ids = config.shotPatternIds ?? GAME_CONSTANTS.SHOTS.DEFAULT_PATTERN_IDS;
  const seen = new Set<string>();
  const patterns: ShotPattern[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const pattern = SHOT_PATTERNS[id];
    if (pattern) {
      patterns.push({
        id,
        offsets: pattern.offsets,
      });
    }
  }

  return patterns;
}
