import { useRef } from "preact/hooks";
import { GameInitializer } from "../core/manager";
import SingleMatch from "./components/single-match";
import { Match, type Shot } from "../core/engine";
import NetworkMatch from "./components/network-match";

const initializer = new GameInitializer({
  boardWidth: 20,
  boardHeight: 20,
});
const initialSetup = initializer.initializeGame("random");

const Playground = () => {
  const player1MatchRef = useRef<Match | null>(null);
  const player2MatchRef = useRef<Match | null>(null);

  const onPlayer1Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;
    player2MatchRef.current?.planAndAttack(shot.x, shot.y, false);
  };

  const onPlayer2Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;
    player1MatchRef.current?.planAndAttack(shot.x, shot.y, false);
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

      <h2>Network</h2>
      <NetworkMatch />
    </div>
  );
};

export default Playground;
