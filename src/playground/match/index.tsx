import { GameInitializer, withView } from "../../core/engine";
import NetworkMatchPage from "./network";
import LocalMatchPage from "./local";

const initialSetup = new GameInitializer({
  boardView: withView({ width: 7, height: 7 }),
}).getGameSetup();

const MatchPlayground = () => {
  return (
    <div className="p-12 flex flex-col gap-14">
      <LocalMatchPage initialSetup={initialSetup} />

      <NetworkMatchPage initialSetup={initialSetup} />
    </div>
  );
};

export default MatchPlayground;
