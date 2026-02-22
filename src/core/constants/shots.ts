import type { ShotPattern } from "../types/common";

/**
 * Single shot pattern (default battleship behavior)
 */
export const SINGLE_SHOT: ShotPattern = {
  id: "single",
  name: "Single Shot",
  description: "Standard single shot at target position",
  offsets: [{ dx: 0, dy: 0 }],
};

/**
 * Cross pattern - 5 shots in a cross/plus shape
 * Pattern:
 *     X
 *   X X X
 *     X
 */
export const CROSS_SHOT: ShotPattern = {
  id: "cross",
  name: "Cross Shot",
  description: "Fires 5 shots in a cross pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Center
    { dx: -1, dy: 0 },  // Left
    { dx: 1, dy: 0 },   // Right
    { dx: 0, dy: -1 },  // Up
    { dx: 0, dy: 1 },   // Down
  ],
};

/**
 * Large cross pattern - 9 shots in an extended cross
 * Pattern:
 *       X
 *       X
 *   X X X X X
 *       X
 *       X
 */
export const LARGE_CROSS_SHOT: ShotPattern = {
  id: "large-cross",
  name: "Large Cross Shot",
  description: "Fires 9 shots in a large cross pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Center
    { dx: -1, dy: 0 },  // Left 1
    { dx: -2, dy: 0 },  // Left 2
    { dx: 1, dy: 0 },   // Right 1
    { dx: 2, dy: 0 },   // Right 2
    { dx: 0, dy: -1 },  // Up 1
    { dx: 0, dy: -2 },  // Up 2
    { dx: 0, dy: 1 },   // Down 1
    { dx: 0, dy: 2 },   // Down 2
  ],
};

/**
 * Horizontal line - 3 shots in a horizontal line
 * Pattern: X X X
 */
export const HORIZONTAL_LINE_SHOT: ShotPattern = {
  id: "horizontal-line",
  name: "Horizontal Line",
  description: "Fires 3 shots in a horizontal line",
  offsets: [
    { dx: -1, dy: 0 },  // Left
    { dx: 0, dy: 0 },   // Center
    { dx: 1, dy: 0 },   // Right
  ],
};

/**
 * Vertical line - 3 shots in a vertical line
 * Pattern:
 *   X
 *   X
 *   X
 */
export const VERTICAL_LINE_SHOT: ShotPattern = {
  id: "vertical-line",
  name: "Vertical Line",
  description: "Fires 3 shots in a vertical line",
  offsets: [
    { dx: 0, dy: -1 },  // Up
    { dx: 0, dy: 0 },   // Center
    { dx: 0, dy: 1 },   // Down
  ],
};

/**
 * Square pattern - 9 shots in a 3x3 square
 * Pattern:
 *   X X X
 *   X X X
 *   X X X
 */
export const SQUARE_SHOT: ShotPattern = {
  id: "square",
  name: "Square Shot",
  description: "Fires 9 shots in a 3x3 square pattern",
  offsets: [
    { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
  ],
};

/**
 * Diagonal X pattern - 5 shots in an X shape
 * Pattern:
 *   X   X
 *     X
 *   X   X
 */
export const DIAGONAL_X_SHOT: ShotPattern = {
  id: "diagonal-x",
  name: "Diagonal X Shot",
  description: "Fires 5 shots in a diagonal X pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Center
    { dx: -1, dy: -1 }, // Top-left
    { dx: 1, dy: -1 },  // Top-right
    { dx: -1, dy: 1 },  // Bottom-left
    { dx: 1, dy: 1 },   // Bottom-right
  ],
};

/**
 * Small square pattern - 4 shots in a 2x2 square
 * Pattern:
 *   X X
 *   X X
 */
export const SMALL_SQUARE_SHOT: ShotPattern = {
  id: "small-square",
  name: "Small Square Shot",
  description: "Fires 4 shots in a 2x2 square pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Top-left
    { dx: 1, dy: 0 },   // Top-right
    { dx: 0, dy: 1 },   // Bottom-left
    { dx: 1, dy: 1 },   // Bottom-right
  ],
};

/**
 * T-shape pattern - 5 shots in a T shape
 * Pattern:
 *   X X X
 *     X
 *     X
 */
export const T_SHAPE_SHOT: ShotPattern = {
  id: "t-shape",
  name: "T-Shape Shot",
  description: "Fires 5 shots in a T pattern",
  offsets: [
    { dx: -1, dy: 0 },  // Top-left
    { dx: 0, dy: 0 },   // Top-center
    { dx: 1, dy: 0 },   // Top-right
    { dx: 0, dy: 1 },   // Middle
    { dx: 0, dy: 2 },   // Bottom
  ],
};

/**
 * L-shape pattern - 5 shots in an L shape
 * Pattern:
 *   X
 *   X
 *   X X
 */
export const L_SHAPE_SHOT: ShotPattern = {
  id: "l-shape",
  name: "L-Shape Shot",
  description: "Fires 5 shots in an L pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Top
    { dx: 0, dy: 1 },   // Middle
    { dx: 0, dy: 2 },   // Bottom-left
    { dx: 1, dy: 2 },   // Bottom-middle
  ],
};

/**
 * All predefined shot patterns
 */
export const SHOT_PATTERNS: Record<string, ShotPattern> = {
  single: SINGLE_SHOT,
  cross: CROSS_SHOT,
  "large-cross": LARGE_CROSS_SHOT,
  "horizontal-line": HORIZONTAL_LINE_SHOT,
  "vertical-line": VERTICAL_LINE_SHOT,
  square: SQUARE_SHOT,
  "diagonal-x": DIAGONAL_X_SHOT,
  "small-square": SMALL_SQUARE_SHOT,
  "t-shape": T_SHAPE_SHOT,
  "l-shape": L_SHAPE_SHOT,
};

/**
 * Get a shot pattern by ID
 * @param id - The pattern ID
 * @returns The shot pattern, or SINGLE_SHOT if not found
 */
export function getShotPattern(id: string): ShotPattern {
  return SHOT_PATTERNS[id] || SINGLE_SHOT;
}

/**
 * Create a custom shot pattern
 * @param id - Unique identifier
 * @param name - Human-readable name
 * @param offsets - Array of coordinate offsets
 * @param description - Optional description
 * @returns A new ShotPattern
 */
export function createCustomPattern(
  id: string,
  name: string,
  offsets: Array<{ dx: number; dy: number }>,
  description?: string,
): ShotPattern {
  return {
    id,
    name,
    description,
    offsets,
  };
}
