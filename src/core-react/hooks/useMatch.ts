import { useEffect, useRef, useState } from "react";
import {
  GameInitializer,
  Match,
  type GameConfig,
  type GameEngineState,
  type MatchCallbacks,
} from "../../core/engine";
import type {
  GAME_INITIAL_TURN,
  GameSetup,
} from "../../core/manager/initializer";

export interface UseMatchProps extends MatchCallbacks {
  config?: Partial<GameConfig>;
  startTurn?: GAME_INITIAL_TURN;
  initialSetup?: GameSetup;
}

const useMatch = ({
  config,
  startTurn,
  initialSetup,
  ...callbacks
}: UseMatchProps | undefined = {}) => {
  const [gameState, setGameState] = useState<GameEngineState | null>(null);
  const match = useRef<Match | null>(null);

  useEffect(() => {
    initializeNewGame();
  }, []);

  const initializeNewGame = () => {
    const initializer = new GameInitializer(config);
    const setup = initialSetup ?? initializer.getGameSetup();

    const newMatch = new Match({
      setup,
      ...callbacks,
      onStateChange: (state) => {
        setGameState(state);
        callbacks?.onStateChange?.(state);
      },
    });

    newMatch.initializeMatch();

    match.current = newMatch;
    setGameState(newMatch.getState());
  };

  const playerBoard = match.current?.getPlayerBoard();
  const enemyBoard = match.current?.getEnemyBoard();

  return {
    gameState,
    playerBoard,
    enemyBoard,
    initializeNewGame,
    match: match.current,
  };
};

export default useMatch;
