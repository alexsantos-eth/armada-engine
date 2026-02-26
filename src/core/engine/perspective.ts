import type { IGameEngine, GameEngineState, SidePerspective } from "../types/engine";

export type { SidePerspective } from "../types/engine";

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
