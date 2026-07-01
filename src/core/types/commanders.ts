import type { GameEntity } from "./entities";
import type { GameEngineState } from "./engine";
import type { GameTurn } from "./game";

/**
 * The phase of a TCG turn where a commander passive can trigger.
 *
 * - `"draw"`: at the start of the turn, before the player draws.
 * - `"main"`: at the start of the main phase, before any cards are played.
 * - `"attack"`: at the start of the attack phase, before any attack card is played.
 * - `"end"`: at the end of the turn, after all actions are resolved.
 * - `"always"`: a persistent passive that modifies constants (e.g., card cost reduction).
 */
export type CommanderPassiveTrigger = "draw" | "main" | "attack" | "end" | "always";

/**
 * Context passed to a commander's passive ability callback.
 */
export interface CommanderPassiveContext {
  /** Current engine state snapshot */
  state: GameEngineState;
  /** Which side this commander belongs to */
  isPlayer: boolean;
  /** Current turn */
  currentTurn: GameTurn;
  /** Current energy of this commander's player */
  currentEnergy: number;
  /** Maximum energy of this commander's player */
  maxEnergy: number;
  /** Mutator: set the player's energy */
  setEnergy: (amount: number) => void;
  /** Mutator: set the player's max energy */
  setMaxEnergy: (amount: number) => void;
  /** Mutator: draw cards for this commander's player */
  drawCards: (count: number) => void;
}

/**
 * A commander (hero) that each player selects before the match.
 * Each commander has a unique passive ability that triggers at
 * a specific turn phase.
 *
 * For v1, there are exactly 2 commanders.
 */
export interface Commander extends GameEntity {
  /** Required. Unique string identifier. */
  id: string;
  /** Required. Display name. */
  title: string;
  /** Required. Flavor text or ability description. */
  description: string;
  /** When this passive triggers during the turn */
  passiveTrigger: CommanderPassiveTrigger;
  /** The passive ability effect */
  passiveAbility: (ctx: CommanderPassiveContext) => void;
}
