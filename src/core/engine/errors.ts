/**
 * Errors produced by the low-level shot-execution layer (GameEngine).
 */
export const ShotError = {
  CellAlreadyShot: "Cell already shot",
  GameAlreadyOver: "Game is already over",
} as const;
export type ShotError = (typeof ShotError)[keyof typeof ShotError];

/**
 * Errors produced when validating or storing a planned shot (matchMachine).
 */
export const PlanError = {
  InvalidPlan: "Invalid plan",
  InvalidPosition: "Invalid position",
  CellAlreadyShot: "Cell already shot",
} as const;
export type PlanError = (typeof PlanError)[keyof typeof PlanError];

/**
 * Errors produced when confirming or executing an attack (Match).
 */
export const AttackError = {
  NoAttackPlanned: "No attack planned. Call planShot() first.",
  AttackFailed: "Attack failed",
} as const;
export type AttackError = (typeof AttackError)[keyof typeof AttackError];
