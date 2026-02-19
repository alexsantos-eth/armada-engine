import { useCallback, useEffect, useState } from "react";
import { roomService } from "../../../services/room/realtime";
import type { GameRoom, RoomPlayer } from "../../../types/game/room";
import { useAuth } from "./useAuth";

export const useRoom = (roomId?: string) => {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      return;
    }

    const unsubscribe = roomService.subscribeToRoom(roomId, (roomData) => {
      setRoom(roomData);
      setError(null);
    });

    return unsubscribe;
  }, [roomId]);

  const createRoom = useCallback(
    async (displayName: string): Promise<GameRoom> => {
      if (!user) {
        throw new Error("User not authenticated");
      }

      setLoading(true);
      setError(null);

      try {
        const hostPlayer: Omit<RoomPlayer, "joinedAt" | "isReady"> = {
          uid: user.uid,
          displayName,
          role: "host",
        };

        const newRoom = await roomService.createRoom(hostPlayer);
        setRoom(newRoom);
        return newRoom;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Error creating room";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const joinRoom = useCallback(
    async (roomCode: string, displayName: string): Promise<GameRoom> => {
      if (!user) {
        throw new Error("User not authenticated");
      }

      setLoading(true);
      setError(null);

      try {
        const guestPlayer: Omit<RoomPlayer, "joinedAt" | "isReady"> = {
          uid: user.uid,
          displayName,
          role: "guest",
        };

        const joinedRoom = await roomService.joinRoom(roomCode, guestPlayer);
        setRoom(joinedRoom);
        return joinedRoom;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Error joining room";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  const setPlayerReady = useCallback(
    async (isReady: boolean): Promise<void> => {
      if (!room || !user) {
        throw new Error("Room or user not available");
      }

      setLoading(true);
      setError(null);

      try {
        await roomService.updatePlayerReady(room.id, user.uid, isReady);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Error updating player ready status";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [room, user]
  );

  const startGame = useCallback(async (): Promise<void> => {
    if (!room || !user) {
      throw new Error("Room or user not available");
    }

    if (room.host.uid !== user.uid) {
      throw new Error("Only the host can start the game");
    }

    setLoading(true);
    setError(null);

    try {
      await roomService.startGame(room.id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error starting game";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [room, user]);

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!room || !user) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await roomService.leaveRoom(room.id, user.uid);
      setRoom(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error leaving room";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [room, user]);

  const isHost = room?.host.uid === user?.uid;
  const isGuest = room?.guest?.uid === user?.uid;
  const currentPlayer = isHost ? room?.host : isGuest ? room?.guest : null;
  const otherPlayer = isHost ? room?.guest : isGuest ? room?.host : null;

  return {
    room,
    loading,
    error,
    createRoom,
    joinRoom,
    setPlayerReady,
    startGame,
    leaveRoom,
    isHost,
    isGuest,
    currentPlayer,
    otherPlayer,
  };
};
