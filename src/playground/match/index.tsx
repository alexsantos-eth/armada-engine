import { useState } from "preact/hooks";
import {
  GameInitializer,
  SHOT_PATTERNS,
  type ShotPattern,
} from "../../core/engine";
import NetworkMatchPage from "./network";
import Shots from "../components/shots";
import LocalMatchPage from "./local";

const initializer = new GameInitializer({
  boardWidth: 7,
  boardHeight: 7,
});
const initialSetup = initializer.getGameSetup();

const MatchPlayground = () => {
  const [selectedPattern, setSelectedPattern] = useState<ShotPattern>(
    SHOT_PATTERNS["single"],
  );

  return (
    <div className="p-12 flex flex-col gap-14">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">🚀 Playground</h1>
        <Shots
          selectedPattern={selectedPattern}
          setSelectedPattern={setSelectedPattern}
        />
      </div>

      <LocalMatchPage
        initialSetup={initialSetup}
        selectedPattern={selectedPattern}
      />

      <NetworkMatchPage
        initialSetup={initialSetup}
        selectedPattern={selectedPattern}
      />
    </div>
  );
};

export default MatchPlayground;
