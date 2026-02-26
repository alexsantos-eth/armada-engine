import type { GameTurn, Winner } from "./game";
import type { BoardLayer } from "./board";
import type { Shot, ShotRecord } from "./shots";

/**
 * Context passed to item event handlers (`onCollect` and `onUse`).
 * Provides read access to the current game state and write access to the
 * most common mutation surfaces (ships, items, turn).
 *
 * `setRuleSet` is typed as `unknown` here to avoid a circular dependency
 * with the engine layer. Import and cast to `MatchRuleSet` in your handler:
 *
 * ```typescript
 * import type { MatchItemActionContext } from '../engine/match';
 * // MatchItemActionContext extends ItemActionContext with setRuleSet: (ruleSet: MatchRuleSet) => void
 * ```
 */
export interface ItemActionContext {
  /** The item that triggered the event. */
  item: GameItem;
  /** `true` = player fired the shot that collected this item; `false` = enemy did. */
  isPlayerShot: boolean;
  /**
   * The shot that caused the collect event.
   * `undefined` when the context is built for an `onUse` event that was
   * triggered manually (not from a shot).
   */
  shot?: Shot;
  /** Snapshot of the current turn at the moment the event fires. */
  currentTurn: GameTurn;
  /** Player ships at the moment of the event. */
  playerShips: GameShip[];
  /** Enemy ships at the moment of the event. */
  enemyShips: GameShip[];
  /** Items placed on the player board at the moment of the event. */
  playerItems: GameItem[];
  /** Items placed on the enemy board at the moment of the event. */
  enemyItems: GameItem[];
  /**
   * Indices (into `playerItems`) of items **you** have collected.
   *
   * In `GameEngineState` (fixed perspective): items the player collected
   * from the enemy board (indices into `enemyItems`).
   *
   * In `ItemActionContext` (collector's perspective): items you collected
   * from the opponent's board (indices into `enemyItems`).
   */
  playerCollectedItems: number[];
  /**
   * Indices (into `enemyItems`) of items your **opponent** has collected.
   *
   * In `GameEngineState` (fixed perspective): items the enemy collected
   * from the player board (indices into `playerItems`).
   *
   * In `ItemActionContext` (collector's perspective): items the opponent
   * collected from your board (indices into `playerItems`).
   */
  enemyCollectedItems: number[];
  /** All shots fired by the player at the moment of the event. */
  playerShots: Shot[];
  /** All shots fired by the enemy at the moment of the event. */
  enemyShots: Shot[];
  /** Width of the game board in cells. */
  boardWidth: number;
  /** Height of the game board in cells. */
  boardHeight: number;
  /**
   * Place a new ship on the **player's** board at the first free position
   * that is neither occupied by an existing ship nor already shot.
   *
   * @param width       Ship width in cells (default 1).
   * @param height      Ship height in cells (default 1).
   * @param preferred   Optional preferred top-left corner; tried before scanning.
   * @param onDestroy   Optional callback fired once when all cells of this ship are hit.
   * @returns `true` if placed, `false` if no free slot was found.
   */
  addPlayerShip: (
    width?: number,
    height?: number,
    preferred?: [number, number],
    onDestroy?: (ctx: ShipActionContext) => void,
  ) => boolean;
  /**
   * Remove the player ship with the given `shipId`.
   * @returns `true` if found and removed, `false` if not found.
   */
  deletePlayerShip: (shipId: number) => boolean;
  /** Remove all ships from the player's board. */
  deleteAllPlayerShips: () => void;
  /**
   * Place a new ship on the **enemy's** board at the first free position
   * that is neither occupied by an existing ship nor already shot.
   *
   * @param width       Ship width in cells (default 1).
   * @param height      Ship height in cells (default 1).
   * @param preferred   Optional preferred top-left corner; tried before scanning.
   * @param onDestroy   Optional callback fired once when all cells of this ship are hit.
   * @returns `true` if placed, `false` if no free slot was found.
   */
  addEnemyShip: (
    width?: number,
    height?: number,
    preferred?: [number, number],
    onDestroy?: (ctx: ShipActionContext) => void,
  ) => boolean;
  /**
   * Remove the enemy ship with the given `shipId`.
   * @returns `true` if found and removed, `false` if not found.
   */
  deleteEnemyShip: (shipId: number) => boolean;
  /** Remove all ships from the enemy's board. */
  deleteAllEnemyShips: () => void;
  /**
   * Place a new item on the **player's** board at an auto-calculated position
   * that does not overlap existing ships or items.
   *
   * @param template - Source item providing `part`, `templateId`, and optional callbacks.
   * @returns `true` if placed, `false` if no free slot was found.
   */
  addPlayerItem: (template: GameItem) => boolean;
  /**
   * Remove the player item with the given `itemId`.
   * @returns `true` if found and removed, `false` if not found.
   */
  deletePlayerItem: (itemId: number) => boolean;
  /** Remove all items from the player's board. */
  deleteAllPlayerItems: () => void;
  /**
   * Place a new item on the **enemy's** board at an auto-calculated position
   * that does not overlap existing ships or items.
   *
   * @param template - Source item providing `part`, `templateId`, and optional callbacks.
   * @returns `true` if placed, `false` if no free slot was found.
   */
  addEnemyItem: (template: GameItem) => boolean;
  /**
   * Remove the enemy item with the given `itemId`.
   * @returns `true` if found and removed, `false` if not found.
   */
  deleteEnemyItem: (itemId: number) => boolean;
  /** Remove all items from the enemy's board. */
  deleteAllEnemyItems: () => void;
  /** Append a shot record to the player's shot history. */
  addPlayerShot: (shot: Shot) => void;
  /**
   * Remove the player shot at the given coordinates.
   * @returns `true` if found and removed, `false` if not found.
   */
  deletePlayerShot: (x: number, y: number) => boolean;
  /** Remove all shots from the player's shot history. */
  deleteAllPlayerShots: () => void;
  /** Append a shot record to the enemy's shot history. */
  addEnemyShot: (shot: Shot) => void;
  /**
   * Remove the enemy shot at the given coordinates.
   * @returns `true` if found and removed, `false` if not found.
   */
  deleteEnemyShot: (x: number, y: number) => boolean;
  /** Remove all shots from the enemy's shot history. */
  deleteAllEnemyShots: () => void;
  /** Player obstacles at the moment of the event. */
  playerObstacles: GameObstacle[];
  /** Enemy obstacles at the moment of the event. */
  enemyObstacles: GameObstacle[];
  /**
   * Place a new obstacle on the **player's** board at an auto-calculated position
   * that does not overlap existing ships, items, or obstacles.
   *
   * @param template - Source obstacle providing `width` and `height`.
   * @returns `true` if placed, `false` if no free slot was found.
   */
  addPlayerObstacle: (template: GameObstacle) => boolean;
  /**
   * Remove the player obstacle with the given `obstacleId`.
   * @returns `true` if found and removed, `false` if not found.
   */
  deletePlayerObstacle: (obstacleId: number) => boolean;
  /** Remove all obstacles from the player's board. */
  deleteAllPlayerObstacles: () => void;
  /**
   * Place a new obstacle on the **enemy's** board at an auto-calculated position
   * that does not overlap existing ships, items, or obstacles.
   *
   * @param template - Source obstacle providing `width` and `height`.
   * @returns `true` if placed, `false` if no free slot was found.
   */
  addEnemyObstacle: (template: GameObstacle) => boolean;
  /**
   * Remove the enemy obstacle with the given `obstacleId`.
   * @returns `true` if found and removed, `false` if not found.
   */
  deleteEnemyObstacle: (obstacleId: number) => boolean;
  /** Remove all obstacles from the enemy's board. */
  deleteAllEnemyObstacles: () => void;
  /**
   * Replace the **player-side** layer list in the current board view.
   * Only the visible layers change — width and height are left untouched.
   */
  setBoardViewPlayerSide: (layers: BoardLayer[]) => void;
  /**
   * Replace the **enemy-side** layer list in the current board view.
   * Only the visible layers change — width and height are left untouched.
   */
  setBoardViewEnemySide: (layers: BoardLayer[]) => void;
  /** Immediately toggles the active turn (player↔enemy). */
  toggleTurn: () => void;
  /**
   * Swap the active ruleset.
   * Typed as `unknown` to avoid a circular import from the engine layer.
   * Use `MatchItemActionContext` (from `engine/match`) for full typing.
   */
  setRuleSet: (ruleSet: unknown) => void;
}

/**
 * Context passed to ship event handlers (`onDestroy`).
 * Identical to {@link ItemActionContext} except it carries the destroyed
 * `ship` instead of an `item`, reflecting which ship triggered the event.
 *
 * `setRuleSet` is typed as `unknown` here to avoid a circular dependency
 * with the engine layer. Import and cast to `MatchRuleSet` in your handler:
 *
 * ```typescript
 * import type { MatchShipActionContext } from '../engine/match';
 * // MatchShipActionContext extends ShipActionContext with setRuleSet: (ruleSet: MatchRuleSet) => void
 * ```
 */
export type ShipActionContext = Omit<ItemActionContext, "item"> & {
  /** The ship that was fully destroyed, triggering this event. */
  ship: GameShip;
};

/**
 * A collectible item placed on the board.
 * It occupies `part` cells in a horizontal row starting at `coords`.
 * When all cells are shot, the item is fully collected.
 */
export interface GameItem {
  /** Top-left corner of the item's horizontal footprint as `[col, row]` (0-based). */
  coords: [number, number];
  /** Number of cells (parts) that must be shot to fully collect this item. */
  part: number;
  itemId?: number;
  /** Template identifier (matches ItemTemplate.id), used for cross-board equalization. */
  templateId?: string;
  /**
   * Called once when all parts of this item have been fully collected.
   * Use this to apply immediate effects (repeat the turn, alter ships, change ruleset…).
   *
   * For full type safety on `ctx.setRuleSet`, use `MatchItemActionContext`
   * from `src/core/engine/match` in your handler implementation.
   */
  onCollect?: (ctx: ItemActionContext) => void;
  /**
   * An optional stored effect that can be triggered by the UI via
   * `match.useItem(itemId, isPlayerShot)` at any point after collection.
   *
   * The engine does **not** call this automatically — it is a manual,
   * UI-driven action (e.g. "activate shield", "deploy radar scan").
   */
  onUse?: (ctx: ItemActionContext) => void;
}

/**
 * A 2D rectangular obstacle placed on the board at game start.
 * Its footprint is a `width × height` rectangle with top-left corner at `coords`.
 * Unlike ships, obstacles are indestructible — shots that land on obstacle cells
 * are recorded as misses and the obstacle persists for the whole match.
 */
export interface GameObstacle {
  /** Top-left corner of the obstacle's rectangular footprint as `[col, row]` (0-based). */
  coords: [number, number];
  /** Number of columns occupied (≥ 1). */
  width: number;
  /** Number of rows occupied (≥ 1). */
  height: number;
  obstacleId?: number;
}

/**
 * A 2D rectangular ship on the board.
 * Its footprint is a `width × height` rectangle with top-left corner at `coords`.
 */
export interface GameShip {
  /** Top-left corner of the ship's rectangular footprint as `[col, row]` (0-based). */
  coords: [number, number];
  /** Number of columns occupied (≥ 1). */
  width: number;
  /** Number of rows occupied (≥ 1). */
  height: number;
  shipId?: number;
  /**
   * Called once when this ship is fully destroyed (all cells hit).
   * Use this to apply immediate effects (repeat the turn, alter ships, change ruleset…).
   *
   * The context perspective is the **shooter's**: `ctx.playerShips` refers to
   * the side that fired the killing shot, `ctx.enemyShips` is the opponent.
   *
   * For full type safety on `ctx.setRuleSet`, use `MatchShipActionContext`
   * from `src/core/engine/match` in your handler implementation.
   */
  onDestroy?: (ctx: ShipActionContext) => void;
}

/**
 * Associates a placed ship with the exact board cells it occupies.
 * Used in `BattleResult.shipPlacements` to reconstruct the full board
 * layout after a match for replays and post-game analysis.
 */
export interface ShipPlacement {
  /** The ship whose footprint is described by `cells`. */
  ship: GameShip;
  /** All `[col, row]` coordinates covered by this ship's rectangular footprint. */
  cells: [number, number][];
}

/**
 * End-of-match summary produced by the battle simulator.
 *
 * Aggregates the outcome, shot counts, hit rates, and the complete placement
 * and shot history for both sides. Intended for post-game statistics and replay.
 */
export interface BattleResult {
  /** The winning side, or `null` if the match ended without a victor. */
  winner: Winner;
  /** Total number of turns taken across both sides during the match. */
  totalTurns: number;
  /** Number of shots fired by the player. */
  playerShots: number;
  /** Number of shots fired by the enemy. */
  enemyShots: number;
  /** Number of the player's shots that struck an enemy ship cell. */
  playerHits: number;
  /** Number of the enemy's shots that struck a player ship cell. */
  enemyHits: number;
  /** Full ship placements for both sides as they were at game start. */
  shipPlacements: { player: ShipPlacement[]; enemy: ShipPlacement[] };
  /** Chronologically ordered shot log for the entire match. */
  shotHistory: ShotRecord[];
}

/**
 * Base interface for game entities with optional metadata fields.
 */
export interface GameEntity {
  /**  Unique identifier for the entity, used for tracking and referencing. */
  id?: string;
  /** Human-readable name for display purposes. */
  title?: string;
  /** Optional description providing additional details about the entity. */
  description?: string;
}
