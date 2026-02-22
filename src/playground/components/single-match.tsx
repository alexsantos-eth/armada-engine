import { useBoard, type UseBoardProps } from "../../core-react/hooks";
import { type ShotPattern } from "../../core/engine";
import { PlayerBoard, EnemyBoard } from "./boards";
import { GameOverBanner, GameStateArea } from "./game-status";

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
    match: { playerBoard, enemyBoard, gameState },
  } = useBoard({ initialSetup, matchRef, ...callbacks });

  const canFire = gameState?.isPlayerTurn && !gameState?.isGameOver;
  const items = gameState?.playerItems || [];

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

      {showStatus && <GameStateArea gameState={gameState} />}
    </div>
  );
};

export default SingleMatch;
