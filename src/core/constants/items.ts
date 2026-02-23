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
 * EMP Grenade — a single-cell electromagnetic pulse device.
 *
 * Layout:
 *   [⚡]
 *
 * onCollect: Scrambles enemy intelligence — erases every shot the opponent
 *   has fired so far, forcing them to rediscover ship positions from scratch.
 *   Also activates {@link ItemHitRuleSet} so the collector chains shots on hits.
 * onUse (UI-triggered): toggles the turn, granting a surprise bonus attack
 *   while the opponent's systems are still rebooting.
 */
export const EMP_GRENADE: ItemTemplate = {
  id: "emp_grenade",
  title: "EMP Grenade",
  description: "Erases all opponent shots on collect, resetting their intel. Use for a bonus attack.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,
  onUse(ctx) {
ctx.setEnemyShots([]);

  },
};

/**
 * Phantom Decoy — a two-cell holographic projector.
 *
 * Layout (horizontal):
 *   [👻][👻]
 *
 * onCollect: Projects a fake 1×1 ghost ship onto the collector's own board,
 *   forcing the opponent to waste a shot destroying the decoy before they
 *   can finish off your real fleet. Switches to {@link ClassicRuleSet}.
 * onUse (UI-triggered): Strips all uncollected items from the opponent's
 *   board — the holographic interference jams their power-ups.
 */
export const PHANTOM_DECOY: ItemTemplate = {
  id: "phantom_decoy",
  title: "Phantom Decoy",
  description: "Spawns a decoy ship on your board on collect. Use to jam opponent items.",
  coords: [0, 0],
  part: 2,
  defaultCount: 1,

  onUse(ctx) {
    // Jam player items — this will remove the items in player board so the enemy cant collect them
    ctx.setPlayerItems([]);
  },
};

/**
 * Kraken Tentacle — a three-cell ancient sea-monster relic.
 *
 * Layout (horizontal):
 *   [🐙][🐙][🐙]
 *
 * onCollect: The kraken rises — wipes ALL of the opponent's recorded shots
 *   (full intelligence reset) AND slows the pace by switching to
 *   {@link AlternatingTurnsRuleSet}. The opponent loses every advantage at once.
 * onUse (UI-triggered): toggles the turn, unleashing a devastating bonus
 *   strike from the deep.
 */
export const KRAKEN_TENTACLE: ItemTemplate = {
  id: "kraken_tentacle",
  title: "Kraken Tentacle",
  description: "Resets opponent shots & forces alternating turns on collect. Use for a deep-sea strike.",
  coords: [0, 0],
  part: 3,
  defaultCount: 1,

  onUse(ctx) {
    ctx.toggleTurn();
  },
};

/**
 * Solar Flare — a single-cell burst of cosmic energy.
 *
 * Layout:
 *   [☀️]
 *
 * onCollect: Incinerates every uncollected item on the opponent's board AND
 *   switches to {@link ItemHitRuleSet}, giving the collector rapid-fire
 *   capability while denying the opponent any future power-ups.
 * onUse (UI-triggered): toggles the turn — one last pulse of solar energy
 *   lets the collector fire again immediately.
 */
export const SOLAR_FLARE: ItemTemplate = {
  id: "solar_flare",
  title: "Solar Flare",
  description: "Burns opponent items & grants rapid fire on collect. Use for an extra shot.",
  coords: [0, 0],
  part: 1,
  defaultCount: 1,

  onUse(ctx) {
    ctx.setEnemyItems([]);
  },
};

/**
 * All predefined item templates, keyed by variant name.
 */
export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  emp_grenade: EMP_GRENADE,
  phantom_decoy: PHANTOM_DECOY,
  kraken_tentacle: KRAKEN_TENTACLE,
  solar_flare: SOLAR_FLARE,
};

/**
 * Get an item template by name.
 * @returns The matching ItemTemplate, or EMP_GRENADE if not found.
 */
export function getItemTemplate(name: string): ItemTemplate {
  return ITEM_TEMPLATES[name] ?? EMP_GRENADE;
}
