import { Wifi } from "lucide-react";
import type { UseNetworkRoomReturn } from "../../core-react/multiplayer/core/hooks/useNetworkRoom";

interface NetworkMatchStatsProps {
  networkRoom: UseNetworkRoomReturn;
}
const NetworkMatchStats: React.FC<NetworkMatchStatsProps> = ({
  networkRoom,
}) => {
  const { roomCode, isHost, playerRole, room } = networkRoom;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-slate-700 font-bold text-lg">
        <Wifi size={18} className="text-indigo-500" />
        Network Match —{" "}
        <span className="font-mono tracking-widest text-indigo-600">
          {roomCode}
        </span>
      </div>
      <span className="text-sm text-slate-500">
        {isHost ? "Host" : "Guest"} ·{" "}
        {room?.currentTurn === playerRole ? (
          <span className="text-emerald-600 font-semibold">Tu turno</span>
        ) : (
          <span className="text-slate-400">Turno del oponente</span>
        )}
      </span>
    </div>
  );
};

export default NetworkMatchStats;
