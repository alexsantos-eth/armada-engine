import type { ShotPattern } from "../types/shots";

export const SINGLE_SHOT: ShotPattern = {
  id: "single",
  title: "Single Shot",
  description: "Standard single shot at target position",
  offsets: [{ dx: 0, dy: 0 }],
};

export const CROSS_SHOT: ShotPattern = {
  id: "cross",
  title: "Cross Shot",
  description: "Fires 5 shots in a cross pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Center
    { dx: -1, dy: 0 },  // Left
    { dx: 1, dy: 0 },   // Right
    { dx: 0, dy: -1 },  // Up
    { dx: 0, dy: 1 },   // Down
  ],
};

export const LARGE_CROSS_SHOT: ShotPattern = {
  id: "large-cross",
  title: "Large Cross Shot",
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

export const HORIZONTAL_LINE_SHOT: ShotPattern = {
  id: "horizontal-line",
  title: "Horizontal Line",
  description: "Fires 3 shots in a horizontal line",
  offsets: [
    { dx: -1, dy: 0 },  // Left
    { dx: 0, dy: 0 },   // Center
    { dx: 1, dy: 0 },   // Right
  ],
};

export const VERTICAL_LINE_SHOT: ShotPattern = {
  id: "vertical-line",
  title: "Vertical Line",
  description: "Fires 3 shots in a vertical line",
  offsets: [
    { dx: 0, dy: -1 },  // Up
    { dx: 0, dy: 0 },   // Center
    { dx: 0, dy: 1 },   // Down
  ],
};

export const SQUARE_SHOT: ShotPattern = {
  id: "square",
  title: "Square Shot",
  description: "Fires 9 shots in a 3x3 square pattern",
  offsets: [
    { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
  ],
};

export const DIAGONAL_X_SHOT: ShotPattern = {
  id: "diagonal-x",
  title: "Diagonal X Shot",
  description: "Fires 5 shots in a diagonal X pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Center
    { dx: -1, dy: -1 }, // Top-left
    { dx: 1, dy: -1 },  // Top-right
    { dx: -1, dy: 1 },  // Bottom-left
    { dx: 1, dy: 1 },   // Bottom-right
  ],
};

export const SMALL_SQUARE_SHOT: ShotPattern = {
  id: "small-square",
  title: "Small Square Shot",
  description: "Fires 4 shots in a 2x2 square pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Top-left
    { dx: 1, dy: 0 },   // Top-right
    { dx: 0, dy: 1 },   // Bottom-left
    { dx: 1, dy: 1 },   // Bottom-right
  ],
};

export const T_SHAPE_SHOT: ShotPattern = {
  id: "t-shape",
  title: "T-Shape Shot",
  description: "Fires 5 shots in a T pattern",
  offsets: [
    { dx: -1, dy: 0 },  // Top-left
    { dx: 0, dy: 0 },   // Top-center
    { dx: 1, dy: 0 },   // Top-right
    { dx: 0, dy: 1 },   // Middle
    { dx: 0, dy: 2 },   // Bottom
  ],
};

export const L_SHAPE_SHOT: ShotPattern = {
  id: "l-shape",
  title: "L-Shape Shot",
  description: "Fires 5 shots in an L pattern",
  offsets: [
    { dx: 0, dy: 0 },   // Top
    { dx: 0, dy: 1 },   // Middle
    { dx: 0, dy: 2 },   // Bottom-left
    { dx: 1, dy: 2 },   // Bottom-middle
  ],
};

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

export function getShotPattern(id: string): ShotPattern {
  return SHOT_PATTERNS[id] || SINGLE_SHOT;
}

export function createCustomPattern(
  id: string,
  title: string,
  offsets: Array<{ dx: number; dy: number }>,
  description?: string,
): ShotPattern {
  return {
    id,
    title,
    description,
    offsets,
  };
}

export const DEFAULT_SHOT_PATTERN: ShotPattern =  SINGLE_SHOT