import { type Cell, type MatchState } from "../../core/engine";
import { PlayerBoard, EnemyBoard } from "./boards";
import { GameOverBanner, GameStateArea } from "./game-status";
import { ItemSelector } from "./item-selector";

interface MatchArenaProps {
  gameState?: MatchState | null;
  playerBoard?: Cell[][];
  enemyBoard?: Cell[][];
  canFire: boolean;
  onCellClick: (x: number, y: number) => void;
  onUseItem: (itemId: number) => void;
  showStatus?: boolean;
}

const MatchArena = ({
  gameState,
  playerBoard,
  enemyBoard,
  canFire,
  onCellClick,
  onUseItem,
  showStatus = false,
}: MatchArenaProps) => (
  <div className="select-none flex flex-col gap-4">
    <GameOverBanner gameState={gameState} />

    <div className="flex gap-8 flex-wrap">
      <PlayerBoard board={playerBoard} />
      <EnemyBoard
        board={enemyBoard}
        canFire={canFire}
        onCellClick={onCellClick}
      />
    </div>

    <ItemSelector gameState={gameState} onUseItem={onUseItem} />

    {showStatus && <GameStateArea gameState={gameState} />}
  </div>
);

export default MatchArena;
