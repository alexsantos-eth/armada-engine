import { useEffect } from "react";
import useMatch, { type UseMatchProps } from "./useMatch";
import { SINGLE_SHOT, type Match, type ShotPattern } from "../../core/engine";

export interface UseBoardProps extends UseMatchProps {
  matchRef?: React.MutableRefObject<Match | null>;
}
const useBoard = ({ initialSetup, matchRef, ...callbacks }: UseBoardProps) => {
  const match = useMatch({ initialSetup, ...callbacks });

  const planAndAttack = (x: number, y: number, pattern: ShotPattern = SINGLE_SHOT, isPlayer: boolean = true) => {
    if(!match.gameState?.isPlayerTurn && isPlayer) return;
    if(match.gameState?.isGameOver) return;

    match?.match?.planAndAttack(x, y, isPlayer, pattern);
  };

  useEffect(() => {
    if (matchRef) matchRef!.current = match.match;
  }, [match, matchRef]);

  return {
    match,
    planAndAttack,
  };
};

export default useBoard;
