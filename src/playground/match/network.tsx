import type { ShotPattern } from "../../core/engine";
import type { GameSetup } from "../../core/manager";
import NetworkMatch from "../components/network-match";

interface NetworkMatchPageProps {
  initialSetup?: GameSetup;
  selectedPattern?: ShotPattern;
}

const NetworkMatchPage = ({
  initialSetup,
  selectedPattern,
}: NetworkMatchPageProps) => {
  return (
    <NetworkMatch
      initialSetup={initialSetup}
      selectedPattern={selectedPattern}
    />
  );
};

export default NetworkMatchPage;
