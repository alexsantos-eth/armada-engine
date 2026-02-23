import { useEffect, useState } from "preact/hooks";
import {
  CheckCircle2,
  LogIn,
  PlusCircle,
  Users,
  Wifi,
} from "lucide-react";
import { type GameSetup, type ShotPattern } from "../../core/engine";
import { PlayerBoard, EnemyBoard } from "./boards";
import { GameOverBanner, GameStateArea } from "./game-status";
import { ItemSelector } from "./item-selector";
import {
  useAuth,
  useRoom,
  useNetworkMatch,
} from "../../core-react/multiplayer";

interface NetworkMatchProps {
  initialSetup?: GameSetup;
  selectedPattern?: ShotPattern;
  showStatus?: boolean;
}

const NetworkMatch: React.FC<NetworkMatchProps> = ({ selectedPattern, initialSetup , showStatus}) => {
  const { signInAnonymously } = useAuth();
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const { room, createRoom, joinRoom, setPlayerReady, isHost, isGuest } =
    useRoom(roomId);

  const [roomCode, setRoomCode] = useState("");

  const playerRole = isHost ? "host" : isGuest ? "guest" : "host";

  const { executeShot, useItem, gameState, playerBoard, enemyBoard } = useNetworkMatch({
    room,
    playerRole,
  });

  const onRoomCodeChange = (
    e: preact.JSX.TargetedEvent<HTMLInputElement, Event>,
  ) => {
    setRoomCode(e.currentTarget.value.toUpperCase());
  };

  const handleCreateRoom = async () => {
    const newRoom = await createRoom("Player Host", initialSetup);
    setRoomCode(newRoom.roomCode);
    setRoomId(newRoom.id);
  };

  const handleJoinRoom = async () => {
    try {
      const joinedRoom = await joinRoom(roomCode, "Player Guest");
      setRoomId(joinedRoom.id);
    } catch (error) {
      console.warn("Error joining room:", error);
    }
  };

  const handleReady = () => {
    setPlayerReady(true);
  };

  useEffect(() => {
    signInAnonymously();
  }, []);

  const canFire =
    gameState?.isPlayerTurn &&
    !gameState?.isGameOver &&
    room?.currentTurn === playerRole;

  if (!room || room.status === "waiting") {
    return (
      <div className="select-none flex flex-col gap-6">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-lg">
          <Wifi size={20} className="text-indigo-500" />
          Network Match
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleCreateRoom}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            <PlusCircle size={15} />
            Crear sala
          </button>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Código de sala"
              value={roomCode}
              onInput={onRoomCodeChange}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono uppercase tracking-widest w-36 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={handleJoinRoom}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <LogIn size={15} />
              Unirse
            </button>
          </div>
        </div>

        {room && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 flex flex-col gap-3 max-w-xs">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
              <Users size={15} />
              Sala{" "}
              <span className="font-mono tracking-widest">{room.roomCode}</span>
            </div>

            <div className="flex flex-col gap-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span
                  className={
                    room.host.isReady ? "text-emerald-500" : "text-slate-400"
                  }
                >
                  {room.host.isReady ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <span className="inline-block w-3 h-3 rounded-full border border-slate-300" />
                  )}
                </span>
                <span>{room.host.displayName}</span>
                <span className="text-xs text-slate-400">(host)</span>
              </div>
              {room.guest && (
                <div className="flex items-center gap-2">
                  <span
                    className={
                      room.guest.isReady ? "text-emerald-500" : "text-slate-400"
                    }
                  >
                    {room.guest.isReady ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <span className="inline-block w-3 h-3 rounded-full border border-slate-300" />
                    )}
                  </span>
                  <span>{room.guest.displayName}</span>
                  <span className="text-xs text-slate-400">(guest)</span>
                </div>
              )}
            </div>

            <button
              onClick={handleReady}
              className="flex items-center justify-center gap-2 mt-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              <CheckCircle2 size={14} />
              Listo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="select-none flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-lg">
          <Wifi size={18} className="text-indigo-500" />
          Network Match —{" "}
          <span className="font-mono tracking-widest text-indigo-600">
            {room.roomCode}
          </span>
        </div>
        <span className="text-sm text-slate-500">
          {isHost ? "Host" : "Guest"} ·{" "}
          {room.currentTurn === playerRole ? (
            <span className="text-emerald-600 font-semibold">Tu turno</span>
          ) : (
            <span className="text-slate-400">Turno del oponente</span>
          )}
        </span>
      </div>

      <GameOverBanner gameState={gameState} />

      <div className="flex gap-8 flex-wrap">
        <PlayerBoard board={playerBoard} />
        <EnemyBoard
          board={enemyBoard}
          canFire={!!canFire}
          onCellClick={(x, y) => executeShot(x, y, selectedPattern)}
        />
      </div>

      <ItemSelector gameState={gameState} onUseItem={(itemId) => useItem(itemId)} />

      {showStatus && <GameStateArea gameState={gameState} />}
    </div>
  );
};

export default NetworkMatch;
