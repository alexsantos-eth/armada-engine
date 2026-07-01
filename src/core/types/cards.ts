import type { GameEntity, ItemActionContext } from "./entities";
import type { GameObject } from "./constants";

/** Available card types in the TCG system */
export type CardType = "attack" | "skill" | "defense" | "trap" | "creature";

/**
 * A game card.
 *
 * Cards are the primary action mechanism in TCG mode. Each card has an
 * energy cost and a type that determines when it can be played within
 * the turn structure (Main Phase vs Attack Phase).
 *
 * - `attack`: triggers a `ShotPattern` on the enemy board. Played during Attack Phase.
 * - `skill`: executes an `onPlay` effect (heal, reveal, draw, etc.). Played during Main Phase.
 * - `defense`: places obstacles or modifies the player's board. Played during Main Phase.
 * - `trap`: places a hidden item with an `onCollect` trigger. Played during Main Phase.
 * - `creature`: places a unit on the bench. Played during Main Phase.
 */
export interface Card extends GameEntity {
  /** Determines when and how this card can be played */
  cardType: CardType;
  /** Energy cost to play this card. Must be ≥ 0. */
  energyCost: number;
  /** Health Points (HP) for creature cards. */
  hp?: number;
  /** Attack Power (ATK) for creature cards. */
  atk?: number;
  /**
   * ID of the `ShotPattern` this card triggers (attack cards only).
   * Must reference a valid pattern ID from the mode's `shotPatterns` array.
   * Ignored for non-attack cards.
   */
  shotPatternId?: string;
  /**
   * Effect executed when the card is played.
   * For attack cards, this runs BEFORE the shot pattern is applied.
   * For skill/defense/trap cards, this IS the card's entire effect.
   */
  onPlay?: (ctx: CardActionContext) => void;
  /**
   * Guard: returns `true` if this card can be played given the current state.
   * When absent, the card is always playable (if energy allows).
   * The engine checks this BEFORE deducting energy.
   */
  canPlay?: (ctx: CardActionContext) => boolean;
}

/**
 * Template for defining cards within a game mode's card catalog.
 * `defaultCount` controls how many copies of this card are included
 * when building a default deck.
 */
export interface CardTemplate extends Card, GameObject {}

/**
 * Context injected into card `onPlay` and `canPlay` handlers.
 *
 * Extends `ItemActionContext` to inherit all 30+ board mutation methods
 * (addPlayerShip, deleteEnemyItem, setBoardViewEnemySide, toggleTurn,
 * setRuleSet, etc.) without duplication. Adds card-specific operations.
 */
export interface CardActionContext extends ItemActionContext {
  /** The card being played */
  card: Card;
  /** Draw N cards from the active player's deck to their hand. Returns the drawn cards. Empty array if deck is empty. */
  drawCards: (count: number) => Card[];
  /** Discard cards from the active player's hand by their IDs */
  discardCards: (cardIds: string[]) => void;
  /** Current energy of the active player */
  currentEnergy: number;
  /** Maximum energy of the active player */
  maxEnergy: number;
}
