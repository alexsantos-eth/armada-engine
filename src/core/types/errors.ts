/**
 * Errors produced by the low-level shot-execution layer (`GameEngine`).
 *
 * These strings are set on `ShotPatternResult.error` and `ShotResult.error`
 * when the engine rejects a shot before it can be applied to the board.
 */
export const ShotError = {
  /** The target cell has already been fired upon in a previous turn. */
  CellAlreadyShot: "Cell already shot",
  /** A shot was attempted after `setGameOver` has been called. */
  GameAlreadyOver: "Game is already over",
  /** The requested pattern index does not exist in the attacker's `shotPatterns` array. */
  PatternNotAvailable: "Shot pattern is not available",
} as const;

export type ShotError = (typeof ShotError)[keyof typeof ShotError];

/**
 * Errors produced when validating or storing a planned shot (`matchMachine`).
 *
 * Surfaced through `PlanShotResult.error` and stored in
 * `MatchMachineContext.planError` between `PLAN_SHOT` and `CONFIRM_ATTACK`.
 */
export const PlanError = {
  /** The submitted plan object is structurally malformed. */
  InvalidPlan: "Invalid plan",
  /** The target coordinates fall outside the board boundaries. */
  InvalidPosition: "Invalid position",
  /** The target cell has already been fired upon. */
  CellAlreadyShot: "Cell already shot",
  /** The requested pattern index does not exist in the attacker's `shotPatterns` array. */
  PatternNotAvailable: "Shot pattern is not available",
  /** `isPlayerShot` does not match the current active turn. */
  NotYourTurn: "Not your turn",
} as const;

export type PlanError = (typeof PlanError)[keyof typeof PlanError];

/**
 * Errors produced when confirming or executing an attack (`Match`).
 *
 * Returned inside `PlanAndAttackResult.error` when `confirmAttack` or
 * `planAndAttack` is called in an invalid machine state.
 */
export const AttackError = {
  /** `confirmAttack` was called before a valid `planShot` succeeded. */
  NoAttackPlanned: "No attack planned. Call planShot() first.",
  /** The underlying engine rejected the shot after planning had succeeded. */
  AttackFailed: "Attack failed",
} as const;

export type AttackError = (typeof AttackError)[keyof typeof AttackError];
