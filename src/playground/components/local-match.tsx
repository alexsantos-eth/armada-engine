import { useBoard, type UseBoardProps } from "../../core-react/hooks";

import MatchArena from "./match-arena";

interface LocalMatchProps extends UseBoardProps {
  selectedPattern?: number;
  showStatus?: boolean;
}

const LocalMatch = ({
  initialSetup,
  matchRef,
  selectedPattern = 0,
  showStatus = false,
  ...callbacks
}: LocalMatchProps) => {
  const {
    useItem,
    cmd,
    match: { playerBoard, enemyBoard, gameState },
  } = useBoard({ initialSetup, matchRef, ...callbacks });

  const canFire = gameState?.isPlayerTurn && !gameState?.isGameOver;

  const handleUseItem = (itemId: number) => {
    useItem(itemId, true);
  };

  const logs = matchRef?.current?.getEventLog() ?? [];

  return (
    <>
      <MatchArena
        gameState={gameState}
        playerBoard={playerBoard}
        enemyBoard={enemyBoard}
        canFire={!!canFire}
        onCellClick={(x, y) => {
          const ready = cmd?.planShot(x, y, selectedPattern, true);
          if (ready?.ready) {
            cmd?.confirmAttack();
          }
        }}
        onUseItem={handleUseItem}
        showStatus={showStatus}
        logs={logs} 
      />
    </>
  );
};

export default LocalMatch;
