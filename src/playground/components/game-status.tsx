import { CheckCircle2 } from "lucide-react";
import { type GameEngineState } from "../../core/engine";


interface GameOverBannerProps {
  gameState?: GameEngineState | null;
}

export const GameOverBanner = ({ gameState }: GameOverBannerProps) => {
  if (!gameState?.isGameOver) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-amber-700 font-semibold text-sm">
      <CheckCircle2 size={16} />
      {gameState.winner === "player" ? "¡Ganaste! 🎉" : "Derrota 😞"}
    </div>
  );
};

interface GameStateAreaProps {
  gameState?: GameEngineState | null;
}

export const GameStateArea = ({ gameState }: GameStateAreaProps) => (
  <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
    <textarea
      value={JSON.stringify(gameState, null, 2)}
      readOnly
      className="w-full h-48 p-2 font-mono text-xs bg-gray-100 border border-gray-300 rounded-md resize-none"
    />
  </div>
);
