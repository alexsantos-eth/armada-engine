import { useEffect, useState } from "preact/hooks";
import {
  type Cell,
  type ShotPattern,
  SHOT_PATTERNS,
} from "../../core/engine";
import {
  useAuth,
  useRoom,
  useNetworkMatch,
} from "../../core-react/multiplayer";

const NetworkMatch = () => {
  const { signInAnonymously } = useAuth();
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const { room, createRoom, joinRoom, setPlayerReady, isHost, isGuest } =
    useRoom(roomId);

  const [roomCode, setRoomCode] = useState("");
  const [selectedPattern, setSelectedPattern] = useState<ShotPattern>(
    SHOT_PATTERNS.single,
  );

  const playerRole = isHost ? "host" : isGuest ? "guest" : "host";

  const { executeShot, gameState, playerBoard, enemyBoard } = useNetworkMatch({
    room,
    playerRole,
  });

  const onRoomCodeChange = (
    e: preact.JSX.TargetedEvent<HTMLInputElement, Event>,
  ) => {
    setRoomCode(e.currentTarget.value.toUpperCase());
  };

  const handleCreateRoom = async () => {
    const newRoom = await createRoom("Player Host");
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

  const getCellContent = (cell: Cell) => {
    switch (cell.state) {
      case "SHIP":
        return "🚢";
      case "HIT":
        return "💥";
      case "MISS":
        return "💧";
      default:
        return "";
    }
  };

  useEffect(() => {
    signInAnonymously();
  }, []);

  // Si no hay room, mostrar controles de sala
  if (!room || room.status === "waiting") {
    return (
      <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
        <h1>Network Match</h1>
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={handleCreateRoom}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              marginRight: "10px",
              cursor: "pointer",
            }}
          >
            Crear sala
          </button>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder="Código de sala"
            value={roomCode}
            onInput={onRoomCodeChange}
            style={{
              padding: "10px",
              fontSize: "16px",
              marginRight: "10px",
              textTransform: "uppercase",
            }}
          />
          <button
            onClick={handleJoinRoom}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              cursor: "pointer",
            }}
          >
            Unirse a sala
          </button>
        </div>
        {room && (
          <div>
            <p>Sala: {room.roomCode}</p>
            <p>
              Jugadores: {room.host.displayName}
              {room.guest && `, ${room.guest.displayName}`}
            </p>
            <p>
              Estado: {room.host.isReady ? "✅" : "❌"} Host |{" "}
              {room.guest?.isReady ? "✅" : "❌"} Guest
            </p>
            <button
              onClick={handleReady}
              style={{
                padding: "10px 20px",
                fontSize: "16px",
                cursor: "pointer",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "5px",
              }}
            >
              Listo
            </button>
          </div>
        )}
      </div>
    );
  }

  // Si el juego está en curso, mostrar tableros
  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Network Match - {room.roomCode}</h1>
      <div style={{ marginBottom: "20px" }}>
        <p>
          Eres: {isHost ? "Host" : "Guest"} | Turno:{" "}
          {room.currentTurn === playerRole ? "Tu turno" : "Turno del oponente"}
        </p>
        {gameState && (
          <p>
            Estado: {gameState.isGameOver ? "Juego terminado" : "En juego"}
            {gameState.isGameOver && ` - Ganador: ${gameState.winner}`}
          </p>
        )}
      </div>

      {/* Tableros */}
      <div style={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
        {/* Tablero del Jugador */}
        <div>
          <h2>Tu Tablero</h2>

          <p>Seleccionar patrón de tiro</p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "10px",
              maxWidth: "400px",
            }}
          >
            {Object.values(SHOT_PATTERNS).map((pattern) => (
              <button
                key={pattern.id}
                onClick={() => setSelectedPattern(pattern)}
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  backgroundColor:
                    selectedPattern.id === pattern.id ? "#4CAF50" : "#f0f0f0",
                  color: selectedPattern.id === pattern.id ? "white" : "#333",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight:
                    selectedPattern.id === pattern.id ? "bold" : "normal",
                }}
                title={pattern.description}
              >
                {pattern.name}
              </button>
            ))}
          </div>

          <div
            style={{
              fontSize: "13px",
              color: "#666",
              marginBottom: "15px",
              fontStyle: "italic",
            }}
          >
            Patrón actual: <strong>{selectedPattern.name}</strong>
            {selectedPattern.description && ` - ${selectedPattern.description}`}
          </div>

          <div style={{ display: "inline-block", border: "2px solid #333" }}>
            {playerBoard?.map((row, y) => (
              <div key={y} style={{ display: "flex" }}>
                {row.map((cell, x) => (
                  <div
                    key={`${x}-${y}`}
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "1px solid #ccc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      backgroundColor: "#e3f2fd",
                      cursor: "default",
                    }}
                  >
                    {getCellContent(cell)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            🚢 Barco | 💥 Impacto enemigo | 💧 Agua
          </div>
        </div>

        {/* Tablero del Enemigo */}
        <div>
          <h2>Tablero Enemigo</h2>
          <div style={{ display: "inline-block", border: "2px solid #333" }}>
            {enemyBoard?.map((row, y) => (
              <div key={y} style={{ display: "flex" }}>
                {row.map((cell, x) => (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => executeShot(x, y, selectedPattern)}
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "1px solid #ccc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      backgroundColor: "#fce4ec",
                      cursor:
                        gameState?.isPlayerTurn &&
                        !gameState?.isGameOver &&
                        room.currentTurn === playerRole
                          ? "pointer"
                          : "not-allowed",
                    }}
                  >
                    {getCellContent(cell)}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: "10px", fontSize: "14px" }}>
            💥 Impacto | 💧 Agua | Haz clic para disparar
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkMatch;
