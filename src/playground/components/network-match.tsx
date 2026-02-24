import { type GameSetup, type ShotPattern } from "../../core/engine";
import MatchArena from "../components/match-arena";
import { useNetworkRoom, useNetworkBoard } from "../../core-react/multiplayer";
import NetworkRoom from "../components/network-room";
import NetworkMatchStats from "../components/network-match-stats";

interface NetworkMatchProps {
  initialSetup?: GameSetup;
  selectedPattern?: ShotPattern;
  showStatus?: boolean;
}

const NetworkMatch: React.FC<NetworkMatchProps> = ({
  selectedPattern,
  initialSetup,
  showStatus,
}) => {
  const networkRoom = useNetworkRoom({ initialSetup, signInAnonymously: true });
  console.log("NetworkMatch render", { networkRoom }); 

  const { planAndAttack, useItem, gameState, playerBoard, enemyBoard } =
    useNetworkBoard({
      room: networkRoom.room,
      playerRole: networkRoom.playerRole,
    });

  const canFire =
    gameState?.isPlayerTurn &&
    !gameState?.isGameOver &&
    networkRoom.room?.currentTurn === networkRoom.playerRole;

  if (!networkRoom.room || networkRoom.room.status === "waiting") {
    return <NetworkRoom networkRoom={networkRoom} />;
  }

  return (
    <div className="select-none flex flex-col gap-4">
      <NetworkMatchStats networkRoom={networkRoom} />

      <MatchArena
        gameState={gameState}
        playerBoard={playerBoard}
        enemyBoard={enemyBoard}
        canFire={!!canFire}
        onCellClick={(x, y) => planAndAttack(x, y, selectedPattern)}
        onUseItem={(itemId) => useItem(itemId)}
        showStatus={showStatus}
      />
    </div>
  );
};

export default NetworkMatch;
