import { useEffect } from "react";
import { SINGLE_SHOT, type Match, type ShotPattern } from "../../../../core/engine";
import useNetworkMatch, { type UseNetworkMatchProps } from "./useNetworkMatch";

export interface UseNetworkBoardProps extends UseNetworkMatchProps {
  matchRef?: React.MutableRefObject<Match | null>;
}

const useNetworkBoard = ({ matchRef, ...props }: UseNetworkBoardProps) => {
  const { gameState, playerBoard, enemyBoard, executeShot, useItem, match } =
    useNetworkMatch(props);

  const planAndAttack = (
    x: number,
    y: number,
    pattern: ShotPattern = SINGLE_SHOT,
  ) => {
    if (!gameState?.isPlayerTurn) return;
    if (gameState?.isGameOver) return;
    executeShot(x, y, pattern);
  };

  useEffect(() => {
    if (matchRef) matchRef.current = match as Match | null;
  }, [match, matchRef]);

  return {
    gameState,
    playerBoard,
    enemyBoard,
    planAndAttack,
    useItem,
    match,
  };
};

export default useNetworkBoard;
