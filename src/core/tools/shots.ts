import type { ShotPattern } from "../types/shots";
import type { GameConfig } from "../types/config";
import type { GameMode } from "../types/modes";

export function generateShotPatterns(config: Partial<GameConfig>, gameMode: GameMode): ShotPattern[] {
  const ids = config.shotPatternIds ?? gameMode.constants.SHOTS.DEFAULT_PATTERN_IDS;
  const seen = new Set<string>();
  const patterns: ShotPattern[] = [];
  const shotPatterns = Object.fromEntries(
    gameMode.shotPatterns.map(pattern => [pattern.id, pattern])
  );

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const pattern = shotPatterns[id];
    if (pattern) {
      patterns.push({
        id,
        offsets: pattern.offsets,
      });
    }
  }

  return patterns;
}
