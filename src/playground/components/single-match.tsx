import { useEffect } from "preact/hooks";
import useMatch from "../../core-react/hooks/useMatch";
import { type GameSetup } from "../../core/manager";
import type { Match } from "../../core/engine";

interface SingleMatchProps {
  initialSetup: GameSetup;
  onShot?: (x: number, y: number) => void;
  matchRef?: React.MutableRefObject<Match | null>;
}

const SingleMatch = ({ initialSetup, onShot, matchRef }: SingleMatchProps) => {
  const { initializeNewGame, gameState, playerBoard, enemyBoard, match } =
    useMatch({ initialSetup });

  const boardSize = match?.getBoardDimensions();

  const executeShot = (x: number, y: number) => {
    if (!match || !gameState) return;
    if (gameState.isGameOver || !gameState.isPlayerTurn) return;
    match.executeShot(x, y, true);
    onShot?.(x, y);
  };

  const getCellContent = (x: number, y: number, isPlayerBoard: boolean) => {
    const currentBoard = isPlayerBoard ? playerBoard : enemyBoard;
    const cell = currentBoard?.[y]?.[x];
    switch (cell) {
      case "SHIP":
        return isPlayerBoard ? "🚢" : "";
      case "HIT":
        return "💥";
      case "MISS":
        return "💧";
      default:
        return "";
    }
  };

  useEffect(() => {
    if (matchRef) matchRef!.current = match;
  }, [match, matchRef]);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      {/* Tableros */}
      <div style={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
        {/* Tablero del Jugador */}
        <div>
          <h2>Tu Tablero</h2>
          <div style={{ display: "inline-block", border: "2px solid #333" }}>
            {Array.from({ length: boardSize?.height ?? 0 }).map((_, y) => (
              <div key={y} style={{ display: "flex" }}>
                {Array.from({ length: boardSize?.width ?? 0 }).map((_, x) => (
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
                    {getCellContent(x, y, true)}
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
            {Array.from({ length: boardSize?.height ?? 0 }).map((_, y) => (
              <div key={y} style={{ display: "flex" }}>
                {Array.from({ length: boardSize?.width ?? 0 }).map((_, x) => (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => executeShot(x, y)}
                    style={{
                      width: "40px",
                      height: "40px",
                      border: "1px solid #ccc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      cursor:
                        gameState?.isGameOver || !gameState?.isPlayerTurn
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        gameState?.isGameOver || !gameState?.isPlayerTurn
                          ? 0.6
                          : 1,
                    }}
                  >
                    {getCellContent(x, y, false)}
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

      {/* Botón de reinicio */}
      <button
        onClick={initializeNewGame}
        style={{
          marginTop: "30px",
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#2196F3",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        🔄 Nueva Partida
      </button>
    </div>
  );
};

export default SingleMatch;
