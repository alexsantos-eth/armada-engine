import type { GameEntity } from "./entities";
import type { Winner, GameTurn } from "./game";

/**
 * Immutable record of a single shot fired during a match.
 *
 * Created by `GameEngine.executeShotPattern` for every cell in the applied
 * pattern and stored in `SideState.shotsMap`. The same object is surfaced
 * through `GameEngineState.playerShots` / `enemyShots` and embedded in
 * each {@link Cell} of the rendered {@link Board}.
 *
 * @example
 * // A player shot that hit a ship and sank it as part of a cross pattern:
 * const shot: Shot = {
 *   x: 4, y: 2, hit: true, shipId: 1,
 *   patternId: 1, patternCenterX: 4, patternCenterY: 2,
 * };
 */
export interface Shot {
  /** Board column (0-based, left → right) where the shot landed. */
  x: number;
  /** Board y coordinate (0-based, bottom → top) where the shot landed. */
  y: number;
  /** `true` when the shot struck a ship cell; `false` for water, obstacle, or item. */
  hit: boolean;
  /** `shipId` of the ship occupying this cell, when `hit` is `true`. */
  shipId?: number;
  /**
   * Index of the pattern in the attacker's `playerShotPatterns` / `enemyShotPatterns`
   * array at the time the shot was fired. `0` for the first (default) pattern.
   */
  patternId?: number;
  /** Board column of the pattern's centre cell (the coordinate passed to `planShot`). */
  patternCenterX?: number;
  /** Board row of the pattern's centre cell (the coordinate passed to `planShot`). */
  patternCenterY?: number;
  /** True when this shot collected a part of an item instead of being a plain miss. */
  collected?: boolean;
  /** The index-based id of the collected item (when collected is true). */
  itemId?: number;
  /** True when this shot caused the item to be fully collected. */
  itemFullyCollected?: boolean;
  /**
   * True when this shot landed on an obstacle cell.
   * The shot is still recorded as a miss (`hit: false`) — obstacles are indestructible —
   * but this flag lets the UI distinguish an obstacle bounce from a plain water miss.
   */
  obstacleHit?: boolean;
  /** The 0-based index of the obstacle that was hit (when obstacleHit is true). */
  obstacleId?: number;
}

/**
 * A single cell offset relative to the pattern's centre coordinate.
 *
 * Positive `dx` moves right; negative moves left.
 * Positive `dy` moves up; negative moves down.
 * The origin offset `{ dx: 0, dy: 0 }` targets the centre cell itself.
 */
export interface ShotOffset {
  /** Horizontal displacement from the pattern centre (positive = right, negative = left). */
  dx: number;
  /** Vertical displacement from the pattern centre (positive = up, negative = down). */
  dy: number;
}

/**
 * A named, reusable multi-cell attack template.
 *
 * Registered in `SHOT_PATTERNS` and referenced by string `id` in
 * `GameConfig.shotPatternIds`. The engine resolves each offset against
 * the chosen centre coordinate and fires one {@link Shot} per cell.
 *
 * @example
 * // A cross pattern that hits the centre plus the four cardinal neighbours:
 * const cross: ShotPattern = {
 *   id: "cross",
 *   name: "Cross",
 *   offsets: [
 *     { dx: 0, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
 *     { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
 *   ],
 * };
 */
export interface ShotPattern extends GameEntity {
  /** Ordered list of cell offsets that define the pattern's footprint. */
  offsets: ShotOffset[];
}

/**
 * Extended shot record with per-pattern execution metadata.
 *
 * Created internally by `GameEngine.executeShotPattern` for each cell in the
 * applied pattern and returned as part of the aggregate {@link ShotPatternResult}.
 * The `executed` field distinguishes shots that were successfully applied from
 * those that were skipped due to being out of bounds or already fired upon.
 */
export interface ShotPatternShot extends Shot {
  /** `true` when this shot was the killing blow that destroyed the targeted ship. */
  shipDestroyed?: boolean;
  /** `false` if the shot was out of bounds or the cell had already been fired upon. */
  executed: boolean;
}

/**
 * Consolidated outcome of firing all cells in one shot pattern.
 *
 * Returned by `IGameEngine.executeShotPattern` and propagated through
 * `PlanAndAttackResult`. The `shots` array has one entry per offset in the
 * pattern; the aggregate `isGameOver` / `winner` fields reflect the state
 * after all individual shots have been applied.
 */
export interface ShotPatternResult {
  /** `true` when every offset in the pattern was processed without an engine error. */
  success: boolean;
  /** Engine-level error message when `success` is `false`. */
  error?: string;
  /**
   * Per-cell shot results, one entry per pattern offset.
   * `executed: false` means the cell was out of bounds or had already been shot.
   * `shipDestroyed: true` means this individual shot sank the associated ship.
   */
  shots: Array<ShotPatternShot>;
  /** `true` if the game ended as a result of any shot in this pattern. */
  isGameOver: boolean;
  /** The winning side once `isGameOver` is `true`; `null` while in progress. */
  winner: Winner;
}

/**
 * Archived shot used by the battle-history log and multiplayer replay.
 *
 * Unlike {@link Shot}, which is the live engine record, `ShotRecord` adds
 * turn attribution and a wall-clock timestamp for ordering and auditing.
 */
export interface ShotRecord {
  /** Board column (0-based) where the shot was fired. */
  x: number;
  /** Board y coordinate (0-based, bottom → top) where the shot was fired. */
  y: number;
  /** `true` when the shot struck a ship cell. */
  hit: boolean;
  /** String identifier of the ship struck, when `hit` is `true`. */
  shipId?: string;
  /** The active game turn at the moment the shot was fired. */
  turn: GameTurn;
  /** Unix-epoch millisecond timestamp of when the shot was recorded. */
  timestamp: number;
}
