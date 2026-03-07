import type { ShotPattern } from "../../../types/shots";
import { createEntitySet } from "../../../tools/constants";

export const SINGLE_SHOT = Object.freeze({
  id: "single",
  title: "Single Shot",
  description: "Standard single shot at target position",
  offsets: [{ dx: 0, dy: 0 }],
} satisfies ShotPattern);

export const CROSS_SHOT = Object.freeze({
  id: "cross",
  title: "Cross Shot",
  description: "Fires 5 shots in a cross pattern",
  offsets: [
    { dx: 0, dy: 0 },   
    { dx: -1, dy: 0 },  
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },   
  ],
} satisfies ShotPattern);

export const LARGE_CROSS_SHOT = Object.freeze({
  id: "large-cross",
  title: "Large Cross Shot",
  description: "Fires 9 shots in a large cross pattern",
  offsets: [
    { dx: 0, dy: 0 },   
    { dx: -1, dy: 0 },  
    { dx: -2, dy: 0 },  
    { dx: 1, dy: 0 },   
    { dx: 2, dy: 0 },   
    { dx: 0, dy: -1 }, 
    { dx: 0, dy: -2 },
    { dx: 0, dy: 1 },  
    { dx: 0, dy: 2 },   
  ],
} satisfies ShotPattern);

export const HORIZONTAL_LINE_SHOT = Object.freeze({
  id: "horizontal-line",
  title: "Horizontal Line",
  description: "Fires 3 shots in a horizontal line",
  offsets: [
    { dx: -1, dy: 0 },  
    { dx: 0, dy: 0 },  
    { dx: 1, dy: 0 },   
  ],
} satisfies ShotPattern);

export const VERTICAL_LINE_SHOT = Object.freeze({
  id: "vertical-line",
  title: "Vertical Line",
  description: "Fires 3 shots in a vertical line",
  offsets: [
    { dx: 0, dy: -1 }, 
    { dx: 0, dy: 0 },   
    { dx: 0, dy: 1 },  
  ],
} satisfies ShotPattern);

export const SQUARE_SHOT = Object.freeze({
  id: "square",
  title: "Square Shot",
  description: "Fires 9 shots in a 3x3 square pattern",
  offsets: [
    { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
    { dx: -1, dy: 0 },  { dx: 0, dy: 0 },  { dx: 1, dy: 0 },
    { dx: -1, dy: 1 },  { dx: 0, dy: 1 },  { dx: 1, dy: 1 },
  ],
} satisfies ShotPattern);

export const DIAGONAL_X_SHOT = Object.freeze({
  id: "diagonal-x",
  title: "Diagonal X Shot",
  description: "Fires 5 shots in a diagonal X pattern",
  offsets: [
    { dx: 0, dy: 0 },   
    { dx: -1, dy: -1 }, 
    { dx: 1, dy: -1 }, 
    { dx: -1, dy: 1 },  
    { dx: 1, dy: 1 },   
  ],
} satisfies ShotPattern);

export const SMALL_SQUARE_SHOT = Object.freeze({
  id: "small-square",
  title: "Small Square Shot",
  description: "Fires 4 shots in a 2x2 square pattern",
  offsets: [
    { dx: 0, dy: 0 },   
    { dx: 1, dy: 0 },   
    { dx: 0, dy: 1 },   
    { dx: 1, dy: 1 },   
  ],
} satisfies ShotPattern);

export const T_SHAPE_SHOT = Object.freeze({
  id: "t-shape",
  title: "T-Shape Shot",
  description: "Fires 5 shots in a T pattern",
  offsets: [
    { dx: -1, dy: 0 }, 
    { dx: 0, dy: 0 },   
    { dx: 1, dy: 0 },  
    { dx: 0, dy: 1 },   
    { dx: 0, dy: 2 },  
  ],
} satisfies ShotPattern);

export const L_SHAPE_SHOT = Object.freeze({
  id: "l-shape",
  title: "L-Shape Shot",
  description: "Fires 5 shots in an L pattern",
  offsets: [
    { dx: 0, dy: 0 },   
    { dx: 0, dy: 1 },  
    { dx: 0, dy: 2 },   
    { dx: 1, dy: 2 },  
  ],
} satisfies ShotPattern);

export const ShotPatternSet = createEntitySet<ShotPattern>([
  SINGLE_SHOT,
  CROSS_SHOT,
  LARGE_CROSS_SHOT,
  HORIZONTAL_LINE_SHOT,
  VERTICAL_LINE_SHOT,
  SQUARE_SHOT,
  DIAGONAL_X_SHOT,
  SMALL_SQUARE_SHOT,
  T_SHAPE_SHOT,
  L_SHAPE_SHOT,
], SINGLE_SHOT.id);

export const SHOT_PATTERNS = ShotPatternSet.map;
export const getShotPattern = ShotPatternSet.getById;
export const DEFAULT_SHOT_PATTERN = ShotPatternSet.default;