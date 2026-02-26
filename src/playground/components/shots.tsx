import {
  ArrowRightToLine,
  ArrowUpToLine,
  CircleDot,
  CircleX,
  CornerDownRight,
  Crosshair,
  Square,
  SquaresIntersect,
  SquareX,
  TypeOutline,
} from "lucide-react";
import { type ShotPattern } from "../../core/engine";

const SHOT_PATTERNS_EMOJIS: Record<string, React.ReactNode> = {
  single: <CircleDot />,
  cross: <CircleX />,
  "large-cross": <SquareX />,
  "horizontal-line": <ArrowRightToLine />,
  "vertical-line": <ArrowUpToLine />,
  square: <Square />,
  "diagonal-x": <Crosshair />,
  "small-square": <SquaresIntersect />,
  "t-shape": <TypeOutline />,
  "l-shape": <CornerDownRight />,
};
interface ShotsProps {
  patterns?: ShotPattern[];
  selectedPattern?: number;
  onSetShotPattern: (pattern: ShotPattern) => void;
}

const Shots: React.FC<ShotsProps> = ({
  patterns,
  selectedPattern = 0,
  onSetShotPattern,
}) => {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg">Seleccionar tipo de tiro</h2>
        <p className="text-sm text-gray-500">
          Patrón seleccionado: {patterns?.[selectedPattern]?.name || "Ninguno"}
        </p>
      </div>

      <div className="grid grid-cols-5 max-w-max gap-4">
        {patterns?.map((pattern) => (
          <button
            key={pattern.id}
            className={`rounded-xl max-w-15 flex items-center text-center justify-center cursor-pointer px-4 py-2 ${selectedPattern === patterns?.indexOf(pattern) ? "bg-blue-700 text-white" : "bg-transparent text-black border-2"}`}
            onClick={() => onSetShotPattern(pattern)}
          >
            {SHOT_PATTERNS_EMOJIS[pattern.id] || ""}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Shots;
