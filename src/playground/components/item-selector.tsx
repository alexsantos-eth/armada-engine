import { Zap, CheckCheck, Package } from "lucide-react";
import { type GameEngineState } from "../../core/engine";
import { ITEM_TEMPLATES } from "../../core/constants/items";

interface ItemSelectorProps {
  gameState?: GameEngineState | null;
  /** Called when the player activates a collected item via onUse. */
  onUseItem?: (itemId: number) => void;
}

/**
 * Displays items the **player** has collected from the enemy board.
 *
 * - Items that had `onCollect` show a "Collected" badge (effect already applied).
 * - Items that have `onUse` and haven't been activated yet show a "Use" button.
 * - Items that have already been activated show a "Used" badge.
 */
export const ItemSelector = ({ gameState, onUseItem }: ItemSelectorProps) => {
  if (!gameState) return null;

  const {
    enemyItems,
    playerCollectedItems,
    playerUsedItems,
    isGameOver,
  } = gameState;

  if (playerCollectedItems.length === 0) return null;

 const collectedItems = playerCollectedItems.map((itemId) => ({
    itemId,
    item: enemyItems[itemId],
  })).filter(({ item }) => !!item);


  return (
    <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="flex items-center gap-2 mb-3 text-slate-700 font-semibold text-sm">
        <Package size={15} />
        Items recolectados
      </div>

      <div className="flex flex-wrap gap-2">
        {collectedItems.map(({ itemId, item }) => {
          const templateId = item.templateId ?? "";
          const template = ITEM_TEMPLATES[templateId];
          const title = template?.title ?? templateId ?? `Item #${itemId}`;
          const description = template?.description;

          const hasCollectEffect = typeof item.onCollect === "function";
          const hasUseEffect = typeof item.onUse === "function";
          const alreadyUsed = playerUsedItems.includes(itemId);
          const canUse = hasUseEffect && !alreadyUsed && !isGameOver;

          return (
            <div
              key={itemId}
              className="flex flex-col gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm min-w-36 max-w-48"
            >
              {/* Title */}
              <span className="text-xs font-semibold text-slate-800 leading-tight">
                {title}
              </span>

              {/* Description */}
              {description && (
                <span className="text-xs text-slate-500 leading-tight">
                  {description}
                </span>
              )}

              {/* Badges & action */}
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {hasCollectEffect && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    <CheckCheck size={10} />
                    Aplicado
                  </span>
                )}

                {hasUseEffect && alreadyUsed && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    <Zap size={10} />
                    Usado
                  </span>
                )}

                {canUse && (
                  <button
                    onClick={() => onUseItem?.(itemId)}
                    className="inline-flex items-center gap-0.5 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-600 active:scale-95 transition-all cursor-pointer"
                  >
                    <Zap size={10} />
                    Usar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ItemSelector;
