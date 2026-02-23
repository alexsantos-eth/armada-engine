import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { useRoom } from "./useRoom";
import type { PlayerRole } from "../../../../core/engine";
import type { GameSetup } from "../../../../core/manager";
import type { GameRoom } from "../types/game/room";

export interface UseNetworkRoomProps {
  initialSetup?: GameSetup;
  signInAnonymously?: boolean;
}

export interface UseNetworkRoomReturn {
  room: ReturnType<typeof useRoom>["room"];
  roomCode: string;
  playerRole: PlayerRole;
  isHost: boolean;
  isGuest: boolean;
  loading: boolean;
  error: string | null;
  onRoomCodeChange: (code: string) => void;
  handleCreateRoom: (displayName?: string) => Promise<GameRoom>;
  handleJoinRoom: (displayName?: string) => Promise<GameRoom>;
  handleReady: () => void;
}

const useNetworkRoom = ({ initialSetup , signInAnonymously = false}: UseNetworkRoomProps = {}):UseNetworkRoomReturn => {
  const { signInAnonymously: authSignInAnonymously } = useAuth();
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [roomCode, setRoomCode] = useState("");

  const { room, loading, error, createRoom, joinRoom, setPlayerReady, isHost, isGuest } =
    useRoom(roomId);

  useEffect(() => {
    if (signInAnonymously) {
      authSignInAnonymously();
    }
  }, [signInAnonymously]);

  const playerRole: PlayerRole = isHost ? "host" : "guest";

  const onRoomCodeChange = (code: string) => {
    setRoomCode(code.toUpperCase());
  };

  const handleCreateRoom = async (displayName = "Player Host") => {
    const newRoom = await createRoom(displayName, initialSetup);
    setRoomCode(newRoom.roomCode);
    setRoomId(newRoom.id);
    return newRoom;
  };

  const handleJoinRoom = async (displayName = "Player Guest") => {
    const joinedRoom = await joinRoom(roomCode, displayName);
    setRoomId(joinedRoom.id);
    return joinedRoom;
  };

  const handleReady = () => setPlayerReady(true);

  return {
    room,
    roomCode,
    playerRole,
    isHost,
    isGuest,
    loading,
    error,
    onRoomCodeChange,
    handleCreateRoom,
    handleJoinRoom,
    handleReady,
  };
};

export default useNetworkRoom;
