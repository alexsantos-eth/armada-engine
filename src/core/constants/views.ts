import type { BoardViewConfig } from "../types/config";

/**
 * Standard gameplay view.
 *
 * - **Player side** — the player can see their own ships, items and obstacles
 *   plus every shot the enemy has fired against them.
 * - **Enemy side** — the player can see the shots they have fired, publicly
 *   visible enemy items and obstacles, and items they have fully collected.
 *   Enemy ships remain hidden.
 */
/** Default board width used by all presets. Override via {@link withView}: `withView(StandardBoardView, { width: 10 })`. */
export const BOARD_DEFAULT_WIDTH = 5;
/** Default board height used by all presets. Override via {@link withView}: `withView(StandardBoardView, { height: 10 })`. */
export const BOARD_DEFAULT_HEIGHT = 5;

export const StandardBoardView: BoardViewConfig = {
  name: "StandardBoardView",
  description: "Normal gameplay: own board fully visible, enemy ships hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["playerShips", "playerObstacles", "enemyShots"],
  enemySide: ["enemyItems", "enemyObstacles", "playerShots", "collectedItems"],
};

/**
 * Fog-of-war view.
 *
 * Hides all ships, items and obstacles; only shot outcomes are rendered.
 * Useful for strict competitive modes where no positional information leaks.
 */
export const FogOfWarBoardView: BoardViewConfig = {
  name: "FogOfWarBoardView",
  description: "Only shot outcomes visible — ships, items and obstacles are hidden",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: ["enemyShots"],
  enemySide: ["playerShots"],
};

/**
 * Debug / development view.
 *
 * All layers are rendered on both sides, including enemy ships.
 * Intended for testing and tooling — never use in production matches.
 */
export const DebugBoardView: BoardViewConfig = {
  name: "DebugBoardView",
  description: "All layers visible on both sides, including enemy ships (dev/test only)",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
  enemySide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
};

/**
 * Spectator view.
 *
 * Full visibility of both boards — ships, items, obstacles, shots and
 * collected items — on both sides.
 * Designed for replay viewers, observers and admin tools.
 */
export const SpectatorBoardView: BoardViewConfig = {
  name: "SpectatorBoardView",
  description: "Full visibility of all layers on both sides (replay / observer mode)",
  width: BOARD_DEFAULT_WIDTH,
  height: BOARD_DEFAULT_HEIGHT,
  playerSide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
  enemySide: [
    "playerShips",
    "playerItems",
    "playerObstacles",
    "enemyShips",
    "enemyItems",
    "enemyObstacles",
    "playerShots",
    "enemyShots",
    "collectedItems",
  ],
};

/**
 * Return a board-view preset by its `name` field.
 *
 * @throws {Error} When the name does not match any registered preset.
 *
 * @example
 * const view = getBoardViewByName("FogOfWarBoardView");
 */
export const getBoardViewByName = (name: string): BoardViewConfig => {
  switch (name) {
    case StandardBoardView.name:
      return StandardBoardView;
    case FogOfWarBoardView.name:
      return FogOfWarBoardView;
    case DebugBoardView.name:
      return DebugBoardView;
    case SpectatorBoardView.name:
      return SpectatorBoardView;
    default:
      throw new Error(`Unknown board view name: "${name}"`);
  }
};

/** Default board view applied when no explicit view config is provided. */
export const DefaultBoardView = StandardBoardView;

/**
 * Return a new {@link BoardViewConfig} derived from `base` with the given
 * `overrides` merged in.  Prefer this over inline spread syntax.
 *
 * @example
 * withView({ width: 10, height: 10 })
 */
export const withView = (
  overrides: Partial<BoardViewConfig>,
  base: BoardViewConfig = DefaultBoardView,
): BoardViewConfig => ({ ...base, ...overrides });
