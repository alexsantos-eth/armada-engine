import { useRef } from "preact/hooks";
import { GameInitializer } from "../core/manager";
import SingleMatch from "./components/single-match";
import { Match, type Shot } from "../core/engine";

const initializer = new GameInitializer({
  boardWidth: 5,
  boardHeight: 5,
});
const initialSetup = initializer.initializeGame("random");

const Playground = () => {
  const player1MatchRef = useRef<Match | null>(null);
  const player2MatchRef = useRef<Match | null>(null);

  const onPlayer1Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;
    player2MatchRef.current?.executeShot(shot.x, shot.y, false);
  };

  const onPlayer2Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;
    player1MatchRef.current?.executeShot(shot.x, shot.y, false);
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>🚀 Playground 🚀</h1>

      <SingleMatch
        onShot={onPlayer1Shot}
        initialSetup={initialSetup}
        matchRef={player1MatchRef}
      />

      <SingleMatch
        onShot={onPlayer2Shot}
        matchRef={player2MatchRef}
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
