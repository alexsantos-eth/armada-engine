import { useEffect, useRef, useState } from "react";
import {
  GameInitializer,
  Match,
  type GameConfig,
  type GameEngine,
  type GameEngineState,
  type GameItem,
  type GameShip,
  type MatchCallbacks,
} from "../../core/engine";
import type {
  GAME_INITIAL_TURN,
  GameSetup,
} from "../../core/manager/initializer";

export interface UseMatchProps extends MatchCallbacks {
  config?: Partial<GameConfig>;
  startTurn?: GAME_INITIAL_TURN;
  ships?: {
    playerShips: GameShip[];
    enemyShips: GameShip[];
  };
  /** Override item placements (both boards). If omitted, items are auto-generated. */
  items?: {
    playerItems: GameItem[];
    enemyItems: GameItem[];
  };
  initialSetup?: GameSetup;
}

const useMatch = ({
  config,
  ships,
  items,
  startTurn,
  initialSetup,
  ...callbacks
}: UseMatchProps | undefined = {}) => {
  const [gameState, setGameState] = useState<GameEngineState | null>(null);
  const match = useRef<Match | null>(null);
  const engine = useRef<GameEngine | null>(null);

  useEffect(() => {
    initializeNewGame();
  }, []);

  const initializeNewGame = () => {
    const initializer = new GameInitializer(config);
    const setup =
      initialSetup ?? initializer.initializeGame(startTurn ?? "random", ships, items);

    const newMatch = new Match(setup.config, {
      ...callbacks,
      onStateChange: (state) => {
        setGameState(state);
        callbacks?.onStateChange?.(state);
      },
    });

    newMatch.initializeMatch(
      setup.playerShips,
      setup.enemyShips,
      setup.initialTurn,
      setup.playerItems,
      setup.enemyItems,
    );

    match.current = newMatch;
    setGameState(newMatch.getState());

    const engineInstance = newMatch.getEngine();
    engine.current = engineInstance;
  };

  const playerBoard = match.current?.getPlayerBoard();
  const enemyBoard =  match.current?.getEnemyBoard();

  return {
    gameState,
    playerBoard,
    enemyBoard,
    initializeNewGame,
    match: match.current,
    engine: engine.current,
  };
};

export default useMatch;
