import { useEffect, useRef, useState } from "react";
import {
  GameInitializer,
  Match,
  type GameConfig,
  type MatchState,
  type MatchCallbacks,
  type MatchQueryAPI,
} from "../../core/engine";
import type {
  GAME_INITIAL_TURN,
  GameSetup,
} from "../../core/manager/initializer";

export interface UseMatchProps extends MatchCallbacks {
  config?: Partial<GameConfig>;
  startTurn?: GAME_INITIAL_TURN;
  initialSetup?: GameSetup;
  matchRef?: React.MutableRefObject<Match | null>;
}

const useMatch = ({
  config,
  startTurn,
  initialSetup,
  matchRef,
  ...callbacks
}: UseMatchProps | undefined = {}) => {
  const [gameState, setGameState] = useState<MatchState | null>(null);
  const match = matchRef ?? useRef<Match | null>(null);

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
    match: match.current as MatchQueryAPI | null,
  };
};

export default useMatch;
