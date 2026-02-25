import type { IGameEngine } from "./logic";
import type { GameEngineState } from "./logic";
import type { GameShip, GameItem, Shot, GameObstacle } from "../types/common";

/**
 * A unified, perspective-aware view of a single game snapshot.
 *
 * "own" refers to the **active side** (collector / activator);
 * "opponent" refers to the **other side**.
 *
 * This abstraction is the single extension point for new player↔enemy data
 * pairs (OCP): adding a new game resource only requires updating
 * {@link resolvePerspective} and this interface — `buildContext` (item.ts)
 * and every other consumer remain unchanged.
 */
export interface SidePerspective {
  ownShips: GameShip[];
  opponentShips: GameShip[];
  ownItems: GameItem[];
  opponentItems: GameItem[];
  ownCollectedItems: number[];
  opponentCollectedItems: number[];
  ownShots: Shot[];
  opponentShots: Shot[];
  ownObstacles: GameObstacle[];
  opponentObstacles: GameObstacle[];

  setOwnShips: (ships: GameShip[]) => void;
  setOpponentShips: (ships: GameShip[]) => void;
  setOwnItems: (items: GameItem[]) => void;
  setOpponentItems: (items: GameItem[]) => void;
  setOwnShots: (shots: Shot[]) => void;
  setOpponentShots: (shots: Shot[]) => void;
  setOwnObstacles: (obstacles: GameObstacle[]) => void;
  setOpponentObstacles: (obstacles: GameObstacle[]) => void;
}

/**
 * Builds a {@link SidePerspective} from a state snapshot + a live engine reference.
 *
 * `swap = false` → own = player, opponent = enemy  (shooter's perspective in `onCollect`)
 * `swap = true`  → own = enemy,  opponent = player (activator's perspective in `onUse`)
 *
 * **To add a new player↔enemy data pair** (e.g. `specialZones`):
 * 1. Add `ownSpecialZones / opponentSpecialZones` and their setters to {@link SidePerspective}.
 * 2. Map them here — one arm for `swap`, one for straight.
 * 3. Done. No other file needs to change.
 */
export function resolvePerspective(
  state: GameEngineState,
  engine: IGameEngine,
  swap: boolean,
): SidePerspective {
  if (swap) {
    return {
      ownShips: state.enemyShips,
      opponentShips: state.playerShips,
      ownItems: state.enemyItems,
      opponentItems: state.playerItems,
      ownCollectedItems: state.enemyCollectedItems,
      opponentCollectedItems: state.playerCollectedItems,
      ownShots: state.enemyShots,
      opponentShots: state.playerShots,
      ownObstacles: state.enemyObstacles ?? [],
      opponentObstacles: state.playerObstacles ?? [],

      setOwnShips: (ships) => engine.setEnemyShips(ships),
      setOpponentShips: (ships) => engine.setPlayerShips(ships),
      setOwnItems: (items) => engine.setEnemyItems(items),
      setOpponentItems: (items) => engine.setPlayerItems(items),
      setOwnShots: (shots) => engine.setEnemyShots(shots),
      setOpponentShots: (shots) => engine.setPlayerShots(shots),
      setOwnObstacles: (obstacles) => engine.setEnemyObstacles(obstacles),
      setOpponentObstacles: (obstacles) => engine.setPlayerObstacles(obstacles),
    };
  }

  return {
    ownShips: state.playerShips,
    opponentShips: state.enemyShips,
    ownItems: state.playerItems,
    opponentItems: state.enemyItems,
    ownCollectedItems: state.playerCollectedItems,
    opponentCollectedItems: state.enemyCollectedItems,
    ownShots: state.playerShots,
    opponentShots: state.enemyShots,
    ownObstacles: state.playerObstacles ?? [],
    opponentObstacles: state.enemyObstacles ?? [],

    setOwnShips: (ships) => engine.setPlayerShips(ships),
    setOpponentShips: (ships) => engine.setEnemyShips(ships),
    setOwnItems: (items) => engine.setPlayerItems(items),
    setOpponentItems: (items) => engine.setEnemyItems(items),
    setOwnShots: (shots) => engine.setPlayerShots(shots),
    setOpponentShots: (shots) => engine.setEnemyShots(shots),
    setOwnObstacles: (obstacles) => engine.setPlayerObstacles(obstacles),
    setOpponentObstacles: (obstacles) => engine.setEnemyObstacles(obstacles),
  };
}
