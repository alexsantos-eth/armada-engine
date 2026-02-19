import { useEffect } from "react";
import useMatch, { type UseMatchProps } from "./useMatch";
import type { Match } from "../../core/engine";

export interface UseBoardProps extends UseMatchProps {
  matchRef?: React.MutableRefObject<Match | null>;
}
const useBoard = ({ initialSetup, matchRef, ...callbacks }: UseBoardProps) => {
  const match = useMatch({ initialSetup, ...callbacks });

  const executeShot = (x: number, y: number) => {
    if(!match.gameState?.isPlayerTurn) return;
    if(match.gameState.isGameOver) return;

    match?.match?.executeShot(x, y, true);
  };

  useEffect(() => {
    if (matchRef) matchRef!.current = match.match;
  }, [match, matchRef]);

  return {
    match,
    executeShot,
  };
};

export default useBoard;
