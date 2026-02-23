import { useEffect } from "react";
import useMatch, { type UseMatchProps } from "./useMatch";
import { SINGLE_SHOT, type Match, type ShotPattern } from "../../core/engine";

export interface UseBoardProps extends UseMatchProps {
  matchRef?: React.MutableRefObject<Match | null>;
}
const useBoard = ({ initialSetup, matchRef, ...callbacks }: UseBoardProps) => {
  const match = useMatch({ initialSetup, ...callbacks });
  // useMatch exposes a MatchQueryAPI for external consumers; internally we need
  // the full Match instance to dispatch commands.
  const cmd = match.match as Match | null;

  const planAndAttack = (x: number, y: number, pattern: ShotPattern = SINGLE_SHOT, isPlayer: boolean = true) => {
    if(!match.gameState?.isPlayerTurn && isPlayer) return;
    if(match.gameState?.isGameOver) return;

    cmd?.planAndAttack(x, y, isPlayer, pattern);
  };

  const useItem = (itemId: number, isPlayerShot: boolean): boolean => {
    return cmd?.useItem(itemId, isPlayerShot) ?? false;
  };

  useEffect(() => {
    if (matchRef) matchRef!.current = cmd;
  }, [match, matchRef]);

  return {
    match,
    planAndAttack,
    useItem,
  };
};

export default useBoard;
