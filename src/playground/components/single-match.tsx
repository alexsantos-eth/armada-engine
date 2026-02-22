import { useBoard, type UseBoardProps } from "../../core-react/hooks";
import { type ShotPattern } from "../../core/engine";
import { PlayerBoard, EnemyBoard } from "./boards";
import { GameOverBanner, GameStateArea } from "./game-status";
import { ItemSelector } from "./item-selector";

interface SingleMatchProps extends UseBoardProps {
  selectedPattern?: ShotPattern;
  showStatus?: boolean;
}

const SingleMatch = ({
  initialSetup,
  matchRef,
  selectedPattern,
  showStatus = false,
  ...callbacks
}: SingleMatchProps) => {
  const {
    planAndAttack,
    match: { playerBoard, enemyBoard, gameState, match },
  } = useBoard({ initialSetup, matchRef, ...callbacks });

  const canFire = gameState?.isPlayerTurn && !gameState?.isGameOver;

  const handleUseItem = (itemId: number) => {
    match?.useItem(itemId, true);
  };

  return (
    <div className="select-none">
      <GameOverBanner gameState={gameState} />

      <div className="flex gap-8 flex-wrap mt-4">
        <PlayerBoard board={playerBoard} />
        <EnemyBoard
          board={enemyBoard}
          canFire={!!canFire}
          onCellClick={(x, y) => planAndAttack(x, y, selectedPattern)}
        />
      </div>

      <ItemSelector gameState={gameState} onUseItem={handleUseItem} />

      {showStatus && <GameStateArea gameState={gameState} />}
    </div>
  );
};

export default SingleMatch;
