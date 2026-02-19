import { useBoard, type UseBoardProps } from "../../core-react/hooks";
import type { CellState } from "../../core/types/common";

interface SingleMatchProps extends UseBoardProps {}

const SingleMatch = ({
  initialSetup,
  matchRef,
  ...callbacks
}: SingleMatchProps) => {
  const {
    executeShot,
    match: { playerBoard, enemyBoard, gameState, initializeNewGame },
  } = useBoard({ initialSetup, matchRef, ...callbacks });

  const getCellContent = (cell: CellState) => {
    switch (cell) {
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

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      {/* Tableros */}
      <div style={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
        {/* Tablero del Jugador */}
        <div>
          <h2>Tu Tablero</h2>
          <p>Fase: {matchRef?.current?.getPhase()}</p>

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
                    onClick={() => executeShot(x, y)}
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
                        gameState?.isPlayerTurn && !gameState?.isGameOver
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
