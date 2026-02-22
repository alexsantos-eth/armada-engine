import { ItemHitRuleSet, AlternatingTurnsRuleSet, ClassicRuleSet } from "../engine/rulesets";
import type { GameItem } from "../types/common";

/**
 * An item template — extends GameItem with metadata and a `defaultCount`
 * for how many of this variant appear in a default game.
 * Add new variants here and the rest of the engine picks them up automatically.
 */
export interface ItemTemplate extends GameItem {
  /** Unique string identifier for the item variant. */
  id: string;
  /** Human-readable name. */
  title: string;
  /** Description of the item and any effect it grants when collected. */
  description?: string;
  /** How many of this item variant are placed in a default game. */
  defaultCount: number;
}

/**
 * Health Kit — a single-cell healing supply.
 *
 * Layout:
 *   [H]
 *
 * onCollect: switches the active ruleset to {@link ItemHitRuleSet} so the
 *   collector continues shooting on every hit (ammunition payoff).
 * onUse (UI-triggered): toggles the turn back, effectively skipping the
 *   opponent's next planned shot.
 */
export const HEALTH_KIT: ItemTemplate = {
  id: "health_kit",
  title: "Health Kit",
  description: "Switches to hit-continuation rules on collect. Use to skip the opponent\'s next turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,
  onCollect(ctx) {
    ctx.setRuleSet(ItemHitRuleSet);
  },
  onUse(ctx) {
    ctx.toggleTurn();
  },
};

/**
 * Ammo Cache — a single-cell ammunition supply.
 *
 * Layout:
 *   [A]
 *
 * onCollect: switches the active ruleset to {@link ItemHitRuleSet} so the
 *   collector can chain shots on every hit for the rest of the match.
 */
export const AMMO_CACHE: ItemTemplate = {
  id: "ammo_cache",
  title: "Ammo Cache",
  description: "Grants hit-continuation shooting rules when collected.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,
  onCollect(ctx) {
    ctx.setRuleSet(ClassicRuleSet);
  },
};

/**
 * Shield Module — a single-cell defensive upgrade.
 *
 * Layout:
 *   [S]
 *
 * onCollect: switches to {@link AlternatingTurnsRuleSet} so the opponent loses
 *   any hit-continuation advantage they might have had.
 * onUse (UI-triggered): toggles the turn immediately, cancelling the
 *   opponent's current attack window.
 */
export const SHIELD_MODULE: ItemTemplate = {
  id: "shield_module",
  title: "Shield Module",
  description: "Removes opponent hit-continuation on collect. Use to cancel the opponent\'s turn.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,
  onCollect(ctx) {
    // Neutalise any shoot-again ruleset that the opponent may have activated.
    ctx.setRuleSet(AlternatingTurnsRuleSet);
  },
  onUse(ctx) {
    // Flip the turn so the collector's side acts again (blocks one enemy attack).
    ctx.toggleTurn();
  },
};

/**
 * Radar Device — a three-cell reconnaissance tool.
 *
 * Layout (horizontal):
 *   [R][R][R]
 *
 * onCollect: removes all enemy items from the board (they have been "scanned"
 *   and neutralised), denying the opponent future power-ups.
 * onUse (UI-triggered): toggles the turn, letting the collector fire again
 *   with the intelligence advantage just gained.
 */
export const RADAR_DEVICE: ItemTemplate = {
  id: "radar_device",
  title: "Radar Device",
  description: "Removes opponent items on collect. Use to fire an extra shot with the gained intel.",
  coords: [0, 0],
  part: 3,
  defaultCount: 1,
  onCollect(ctx) {
    // Wipe remaining (uncollected) items from the opponent's board so they
    // cannot pick them up later.
    if (ctx.isPlayerShot) {
      // Player collected the radar → clear player-side items (opponent board)
      ctx.setPlayerItems([]);
    } else {
      // Enemy collected the radar → clear enemy-side items (player board)
      ctx.setEnemyItems([]);
    }
  },
  onUse(ctx) {
    // Fire again: flip the turn so the scanning side gets an extra shot,
    // representing acting immediately on the new intelligence.
    ctx.toggleTurn();
  },
};

/**
 * All predefined item templates, keyed by variant name.
 */
export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  health_kit: HEALTH_KIT,
  ammo_cache: AMMO_CACHE,
  shield_module: SHIELD_MODULE,
  radar_device: RADAR_DEVICE,
};

/**
 * Get an item template by name.
 * @returns The matching ItemTemplate, or HEALTH_KIT if not found.
 */
export function getItemTemplate(name: string): ItemTemplate {
  return ITEM_TEMPLATES[name] ?? HEALTH_KIT;
}
