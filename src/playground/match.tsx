import { useRef, useState } from "preact/hooks";
import { GameInitializer } from "../core/manager";
import SingleMatch from "./components/single-match";
import {
  getShotPattern,
  Match,
  SHOT_PATTERNS,
  type Shot,
  type ShotPattern,
} from "../core/engine";
import Shots from "./components/shots";
import NetworkMatch from "./components/network-match";

const initializer = new GameInitializer({
  boardWidth: 7,
  boardHeight: 7,
});
const initialSetup = initializer.getGameSetup();

const PlaygroundMatchs = () => {
  const [selecetedPattern, setSelectedPattern] = useState<ShotPattern>(
    SHOT_PATTERNS["single"],
  );

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
    console.log("Player 1 used item", itemId);
    player2MatchRef.current?.useItem(itemId, false);
  };

  const onPlayer2ItemUsed = (itemId: number) => {
    console.log("Player 2 used item", itemId);
    player1MatchRef.current?.useItem(itemId, false);
  };

  return (
    <div className="p-12 flex flex-col gap-14">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">🚀 Playground</h1>

        <Shots
          selectedPattern={selecetedPattern}
          setSelectedPattern={setSelectedPattern}
        />
      </div>

      <div className="flex gap-36">
        <div className="flex flex-col gap-2 uppercase font-semibold">
          <h3>Jugador 1</h3>
          <SingleMatch
            onShot={onPlayer1Shot}
            initialSetup={initialSetup}
            matchRef={player1MatchRef}
            onItemUse={onPlayer1ItemUsed }
            selectedPattern={selecetedPattern}
            showStatus
          />
        </div>

        <div className="flex flex-col gap-2 uppercase font-semibold">
          <h3>Jugador 2</h3>
          <SingleMatch
            showStatus
            onShot={onPlayer2Shot}
            matchRef={player2MatchRef}
            selectedPattern={selecetedPattern}
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
            }}
            onItemUse={onPlayer2ItemUsed}
          />
        </div>
      </div>

      <NetworkMatch
        showStatus
        initialSetup={initialSetup}
        selectedPattern={selecetedPattern}
      />
    </div>
  );
};

export default PlaygroundMatchs;
