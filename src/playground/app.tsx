import { useRef } from "preact/hooks";
import { GameInitializer } from "../core/manager";
import SingleMatch from "./components/single-match";
import { Match } from "../core/engine";

const initializer = new GameInitializer({
  boardWidth: 5,
  boardHeight: 5,
});
const initialSetup = initializer.initializeGame("random");

const Playground = () => {
  const matchPlayerRef = useRef<Match | null>(null);
  const enemyMatchRef = useRef<Match | null>(null);

  const onPlayerShot = (x: number, y: number) => {
    enemyMatchRef.current?.executeShot(x, y, false);
    console.log(`Player shot at (${x}, ${y})`);
  };

  const onEnemyShot = (x: number, y: number) => {
    matchPlayerRef.current?.executeShot(x, y, false);
    console.log(`Enemy shot at (${x}, ${y})`);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>🚀 Playground 🚀</h1>

      <SingleMatch
        onShot={onPlayerShot}
        initialSetup={initialSetup}
        matchRef={matchPlayerRef}
      />

      <SingleMatch
        onShot={onEnemyShot}
        matchRef={enemyMatchRef}
        initialSetup={{
          config: initialSetup.config,
          initialTurn:
            initialSetup.initialTurn === "PLAYER_TURN"
              ? "ENEMY_TURN"
              : "PLAYER_TURN",
          playerShips: initialSetup.enemyShips,
          enemyShips: initialSetup.playerShips,
        }}
      />
    </div>
  );
};

export default Playground;
