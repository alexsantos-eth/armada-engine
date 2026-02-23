import { CheckCircle2, LogIn, PlusCircle, Users, Wifi } from "lucide-react";
import type { UseNetworkRoomReturn } from "../../core-react/multiplayer/core/hooks/useNetworkRoom";

interface NetworkMatchProps {
  networkRoom: UseNetworkRoomReturn;
}

const NetworkRoom: React.FC<NetworkMatchProps> = ({ networkRoom }) => {
  const {
    room,
    roomCode,
    handleReady,
    handleJoinRoom,
    handleCreateRoom,
    onRoomCodeChange: onCodeChange,
  } = networkRoom;

  const onRoomCodeChange = (
    e: preact.JSX.TargetedEvent<HTMLInputElement, Event>,
  ) => {
    onCodeChange(e.currentTarget.value);
  };

  return (
    <div className="select-none flex flex-col gap-6">
      <div className="flex items-center gap-2 text-slate-700 font-bold text-lg">
        <Wifi size={20} className="text-indigo-500" />
        Network Match
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleCreateRoom()}
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
            onClick={() => handleJoinRoom()}
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
};

export default NetworkRoom;
