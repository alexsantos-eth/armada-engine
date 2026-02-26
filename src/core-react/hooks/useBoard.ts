import useMatch, { type UseMatchProps } from "./useMatch";
import type { Match } from "../../core/engine";

export interface UseBoardProps extends UseMatchProps {
  matchRef?: React.MutableRefObject<Match | null>;
}
const useBoard = ({ initialSetup, matchRef, ...callbacks }: UseBoardProps) => {
  const match = useMatch({ initialSetup, matchRef, ...callbacks });
  const cmd = match.match as Match | null;

  const planAndAttack = (
    x: number,
    y: number,
    patternIdx: number = 0,
    isPlayer: boolean = true,
  ) => {
    if (!match.gameState?.isPlayerTurn && isPlayer) return;
    if (match.gameState?.isGameOver) return;

    cmd?.planAndAttack(x, y, isPlayer, patternIdx);
  };

  const useItem = (itemId: number, isPlayerShot: boolean): boolean => {
    return cmd?.useItem(itemId, isPlayerShot) ?? false;
  };

  return {
    cmd,
    match,
    planAndAttack,
    useItem,
  };
};

export default useBoard;
