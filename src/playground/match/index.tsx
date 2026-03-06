import { GameInitializer } from "../../core/engine";
import NetworkMatchPage from "./network";
import LocalMatchPage from "./local";

const initialSetup = new GameInitializer().getGameSetup();

const MatchPlayground = () => {
  return (
    <div className="p-12 flex flex-col gap-14">
      <LocalMatchPage initialSetup={initialSetup} />

      <NetworkMatchPage initialSetup={initialSetup} />
    </div>
  );
};

export default MatchPlayground;
