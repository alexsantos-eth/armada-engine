import { useRef, useState } from "preact/hooks";
import LocalMatch from "../components/local-match";
import {
  Match,
  type GameSetup,
  type Shot,
  type ShotPattern,
} from "../../core/engine";
import Shots from "../components/shots";

interface LocalMatchProps {
  initialSetup: GameSetup;
}

const LocalMatchPage = ({ initialSetup }: LocalMatchProps) => {
  const [_, setStartGame] = useState<number>(0);
  const [selectedShotPattern1, setSelectedShotPattern1] = useState<number>(0);
  const [selectedShotPattern2, setSelectedShotPattern2] = useState<number>(0);

  const player1MatchRef = useRef<Match | null>(null);
  const player2MatchRef = useRef<Match | null>(null);

  const onPlayer1Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;

    const pattern = shot.patternId ?? 0;
    player2MatchRef.current?.planAndAttack(shot.x, shot.y, false, pattern);
  };

  const onPlayer2Shot = (shot: Shot, isPlayerShot: boolean) => {
    if (!isPlayerShot) return;
    const pattern = shot.patternId ?? 0;
    player1MatchRef.current?.planAndAttack(shot.x, shot.y, false, pattern);
  };

  const onPlayer1ItemUsed = (itemId: number) => {
    player2MatchRef.current?.useItem(itemId, false);
  };

  const onPlayer2ItemUsed = (itemId: number) => {
    player1MatchRef.current?.useItem(itemId, false);
  };

  const player1ShotPatterns =
    player1MatchRef.current?.getState().playerShotPatterns;
  const player2ShotPatterns =
    player2MatchRef.current?.getState().playerShotPatterns;

  const onSetPlayer1ShotPattern = (pattern: ShotPattern) => {
    const patternIdx =
      player1ShotPatterns?.findIndex((p) => p.id === pattern.id) ?? 0;
    setSelectedShotPattern1(patternIdx);
  };

  const onSetPlayer2ShotPattern = (pattern: ShotPattern) => {
    const patternIdx =
      player2ShotPatterns?.findIndex((p) => p.id === pattern.id) ?? 0;
    setSelectedShotPattern2(patternIdx);
  };

  return (
    <div className="flex gap-36">
      <div className="flex flex-col gap-8 uppercase font-semibold">
        <h3>Jugador 1</h3>

        <Shots
          patterns={player1ShotPatterns}
          selectedPattern={selectedShotPattern1}
          onSetShotPattern={onSetPlayer1ShotPattern}
        />

        <LocalMatch
          onShot={onPlayer1Shot}
          initialSetup={initialSetup}
          matchRef={player1MatchRef}
          onItemUse={onPlayer1ItemUsed}
          selectedPattern={selectedShotPattern1}
          onMatchStart={() => {
            setStartGame((prev) => prev + 1);
          }}
          showStatus
        />
      </div>

      <div className="flex flex-col gap-8 uppercase font-semibold">
        <h3>Jugador 2</h3>
        <Shots
          patterns={player2ShotPatterns}
          selectedPattern={selectedShotPattern2}
          onSetShotPattern={onSetPlayer2ShotPattern}
        />

        <LocalMatch
          showStatus
          onShot={onPlayer2Shot}
          matchRef={player2MatchRef}
          selectedPattern={selectedShotPattern2}
          onMatchStart={() => {
            setStartGame((prev) => prev + 1);
          }}
          initialSetup={{
            enemyShotPatterns: initialSetup.playerShotPatterns,
            playerShotPatterns: initialSetup.enemyShotPatterns,
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
