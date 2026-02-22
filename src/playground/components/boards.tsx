import {
  Anchor,
  CheckCircle2,
  Crosshair,
  Droplets,
  Gift,
  Shield,
  Swords,
} from "lucide-react";
import { type Cell } from "../../core/engine";


export const getCellIcon = (cell: Cell) => {
  if (cell.shot?.itemFullyCollected && cell.state === "COLLECTED") {
    return <CheckCircle2 className="text-emerald-500" size={18} />;
  }
  switch (cell.state) {
    case "SHIP":
      return <Anchor className="text-blue-600" size={18} />;
    case "HIT":
      return <Crosshair className="text-rose-500" size={18} />;
    case "MISS":
      return <Droplets className="text-sky-400" size={16} />;
    case "COLLECTED":
      return <Gift className="text-amber-500" size={18} />;
    default:
      return null;
  }
};

export const getCellBg = (cell: Cell, isEnemy: boolean) => {
  if (cell.shot?.itemFullyCollected && cell.state === "COLLECTED")
    return "bg-emerald-100";
  switch (cell.state) {
    case "HIT":
      return "bg-rose-200";
    case "MISS":
      return "bg-sky-100";
    case "COLLECTED":
      return "bg-amber-100";
    case "SHIP":
      return isEnemy ? "" : "bg-blue-100";
    default:
      return isEnemy ? "hover:bg-rose-100" : "";
  }
};

interface PlayerBoardProps {
  board?: Cell[][];
}

export const PlayerBoard = ({ board }: PlayerBoardProps) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 text-blue-700 font-bold text-sm uppercase tracking-wide">
      <Shield size={15} />
      Tu Tablero
    </div>
    <div className="rounded-xl overflow-hidden border-2 border-blue-200 shadow-md shadow-blue-100">
      {board?.map((row, y) => (
        <div key={y} className="flex">
          {row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              className={`w-9 h-9 flex items-center justify-center border border-blue-100 bg-blue-50 transition-colors ${getCellBg(cell, false)}`}
            >
              {getCellIcon(cell)}
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
      <span className="flex items-center gap-1">
        <Anchor size={11} className="text-blue-600" /> Barco
      </span>
      <span className="flex items-center gap-1">
        <Crosshair size={11} className="text-rose-500" /> Impacto
      </span>
      <span className="flex items-center gap-1">
        <Droplets size={11} className="text-sky-400" /> Agua
      </span>
    </div>
  </div>
);

interface EnemyBoardProps {
  board?: Cell[][];
  canFire: boolean;
  onCellClick: (x: number, y: number) => void;
}

export const EnemyBoard = ({ board, canFire, onCellClick }: EnemyBoardProps) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 text-rose-700 font-bold text-sm uppercase">
      <Swords size={15} />
      Tablero Enemigo
    </div>
    <div className="max-w-max rounded-xl overflow-hidden border-2 border-rose-200 shadow-md shadow-rose-100">
      {board?.map((row, y) => (
        <div key={y} className="flex">
          {row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              onClick={() => onCellClick(x, y)}
              className={`w-9 h-9 flex items-center justify-center border border-rose-100 bg-rose-50 transition-colors ${getCellBg(cell, true)} ${canFire ? "cursor-crosshair" : "cursor-not-allowed opacity-80"}`}
            >
              {getCellIcon(cell)}
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
      <span className="flex items-center gap-1">
        <Crosshair size={11} className="text-rose-500" /> Impacto
      </span>
      <span className="flex items-center gap-1">
        <Droplets size={11} className="text-sky-400" /> Agua
      </span>
      <span className="text-slate-400">{canFire ? "Tu turno" : "Esperando..."}</span>
    </div>
  </div>
);
