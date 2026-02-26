import { useEffect } from "react";
import { type Match } from "../../../../core/engine";
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
    patternIdx: number = 0,
  ) => {
    if (!gameState?.isPlayerTurn) return;
    if (gameState?.isGameOver) return;
    executeShot(x, y, patternIdx);
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
