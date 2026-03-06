import {
  type Cell,
  type MatchMachineLogEvent,
  type MatchState,
} from "../../core/engine";
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
  logs: MatchMachineLogEvent[];
}

const MatchArena = ({
  gameState,
  playerBoard,
  enemyBoard,
  canFire,
  onCellClick,
  onUseItem,
  showStatus = false,
  logs,
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

    {showStatus && (
      <>
        <GameStateArea gameState={gameState} />

        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
          <textarea
            value={JSON.stringify(logs, null, 2)}
            readOnly
            className="w-full h-48 p-2 font-mono text-xs bg-gray-100 border border-gray-300 rounded-md resize-none"
          />
        </div>
      </>
    )}
  </div>
);

export default MatchArena;
