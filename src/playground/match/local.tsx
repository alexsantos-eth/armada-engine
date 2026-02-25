import { useRef } from "preact/hooks";
import LocalMatch from "../components/local-match";
import {
  getShotPattern,
  Match,
  type GameSetup,
  type Shot,
  type ShotPattern,
} from "../../core/engine";

interface LocalMatchProps {
  selectedPattern: ShotPattern;
  initialSetup: GameSetup;
}

const LocalMatchPage = ({ selectedPattern, initialSetup }: LocalMatchProps) => {
  const player1MatchRef = useRef<Match | null>(null);
  const player2MatchRef = useRef<Match | null>(null);

  const onPlayer1Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;

    player2MatchRef.current?.planAndAttack(
      shot.x,
      shot.y,
      false,
      getShotPattern(shot.patternId || "single"),
    );
  };

  const onPlayer2Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;
    player1MatchRef.current?.planAndAttack(
      shot.x,
      shot.y,
      false,
      getShotPattern(shot.patternId || "single"),
    );
  };

  const onPlayer1ItemUsed = (itemId: number) => {
    player2MatchRef.current?.useItem(itemId, false);
  };

  const onPlayer2ItemUsed = (itemId: number) => {
    player1MatchRef.current?.useItem(itemId, false);
  };

  return (
    <div className="flex gap-36">
      <div className="flex flex-col gap-2 uppercase font-semibold">
        <h3>Jugador 1</h3>
        <LocalMatch
          onShot={onPlayer1Shot}
          initialSetup={initialSetup}
          matchRef={player1MatchRef}
          onItemUse={onPlayer1ItemUsed}
          selectedPattern={selectedPattern}
          showStatus
        />
      </div>

      <div className="flex flex-col gap-2 uppercase font-semibold">
        <h3>Jugador 2</h3>
        <LocalMatch
          showStatus
          onShot={onPlayer2Shot}
          matchRef={player2MatchRef}
          selectedPattern={selectedPattern}
          initialSetup={{
            config: initialSetup.config,
            initialTurn:
              initialSetup.initialTurn === "PLAYER_TURN"
                ? "ENEMY_TURN"
                : "PLAYER_TURN",
            playerShips: initialSetup.enemyShips,
            enemyShips: initialSetup.playerShips,
            playerItems: initialSetup.enemyItems,
            enemyItems: initialSetup.playerItems,
            playerObstacles: initialSetup.enemyObstacles,
            enemyObstacles: initialSetup.playerObstacles,
          }}
          onItemUse={onPlayer2ItemUsed}
        />
      </div>
    </div>
  );
};

export default LocalMatchPage;
