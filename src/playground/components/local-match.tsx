import { useBoard, type UseBoardProps } from "../../core-react/hooks";
import { type ShotPattern } from "../../core/engine";
import MatchArena from "./match-arena";

interface LocalMatchProps extends UseBoardProps {
  selectedPattern?: ShotPattern;
  showStatus?: boolean;
}

const LocalMatch = ({
  initialSetup,
  matchRef,
  selectedPattern,
  showStatus = false,
  ...callbacks
}: LocalMatchProps) => {
  const {
    planAndAttack,
    useItem,
    match: { playerBoard, enemyBoard, gameState },
  } = useBoard({ initialSetup, matchRef, ...callbacks });

  const canFire = gameState?.isPlayerTurn && !gameState?.isGameOver;

  const handleUseItem = (itemId: number) => {
    useItem(itemId, true);
  };

  return (
    <MatchArena
      gameState={gameState}
      playerBoard={playerBoard}
      enemyBoard={enemyBoard}
      canFire={!!canFire}
      onCellClick={(x, y) => planAndAttack(x, y, selectedPattern)}
      onUseItem={handleUseItem}
      showStatus={showStatus}
    />
  );
};

export default LocalMatch;
