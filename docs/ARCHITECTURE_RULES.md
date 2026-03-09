# Strict Architecture Rules

**This document defines the absolute rules that must never be broken. Violations cause architectural debt and make multiplayer/testing harder.**

---

## FORBIDDEN PATTERNS (Never Do These)

### Coordinate Convention (Must Always Hold)

All gameplay coordinates in core must follow:

- Origin `(0, 0)` at bottom-left.
- `x+` to the right.
- `y+` upward.

If a layer uses top-row-first matrix indexing (UI/render), it must convert row index to logical `y` before calling core APIs.

### 1. ❌ Circular Dependencies

**Forbidden:**
```typescript
// types/entities.ts
import { GameEngine } from '../engine/logic';  // ❌ FORBIDDEN

// engine/logic.ts
import type { GameEntity } from '../types/entities';  // This causes a circle
```

**How to fix:**
- Types must only import from constants
- If you need to reference a class in a type, use `type import`
- Refactor to break the cycle

**How to check:**
```bash
tsc -b  # TypeScript's project references will catch this
```

---

### 2. ❌ Mutable Game State Outside GameEngine

**Forbidden:**
```typescript
// ❌ BAD: Duplicating engine state in external storage
const localState = {
  ships: [],  // This duplicates engine state
  addShip: (ship) => { localState.ships.push(ship); }
};
```

**How to fix:**
```typescript
// ✅ GOOD: Only read from engine; let engine own state
const ships = engine.playerShips;  // Always read fresh

// ✅ GOOD: Call engine methods directly
engine.planShot(x, y);
engine.setPlayerItems(items);
```

**Why:** Multiple sources of truth cause desync, especially in multiplayer.

---

### 3. ❌ Throwing Errors for Game Logic

**Forbidden:**
```typescript
// ❌ BAD: Throwing for expected game events
function moveShip(ship: GameShip, pos: BoardPosition) {
  if (!isValidPosition(pos)) {
    throw new Error("Invalid position");  // This is expected, not exceptional
  }
}

// Usage: Must wrap in try/catch
try {
  moveShip(ship, pos);
} catch (e) {
  console.log("Invalid position");
}
```

**How to fix:**
```typescript
// ✅ GOOD: Return result objects
function moveShip(ship: GameShip, pos: BoardPosition): MoveResult {
  if (!isValidPosition(pos)) {
    return {
      success: false,
      error: PlanErrors.INVALID_POSITION,
      reason: "Position already occupied",
    };
  }
  return { success: true, movedShip: { ...ship, position: pos }, reason: "Moved" };
}

// Usage: Type-safe
const result = moveShip(ship, pos);
if (result.success) {
  // TypeScript narrows to success case
  console.log(result.movedShip);
} else {
  // Error case
  console.warn(result.error, result.reason);
}
```

**Why:** Game events (invalid moves, out-of-bounds) are not exceptional. Throwing breaks flow and adds coupling.

---

### 4. ❌ Modifying Constants at Runtime

**Forbidden:**
```typescript
// ❌ BAD: Mutating a template
SHIP_TEMPLATES.destroyer.width = 5;
SHIP_TEMPLATES.destroyer.defaultCount = 100;

const shipArray = [SHIP_TEMPLATES.destroyer, SHIP_TEMPLATES.destroyer];
// Are these the same after mutation? Which one changed?

// ❌ BAD: Mutating game mode constants
const mode = CLASSIC_MODE;
mode.constants.SHIPS.MIN_DISTANCE = 5;  // Runtime mutation
```

**How to fix:**
```typescript
// ✅ GOOD: Templates are frozen with Object.freeze()
const MY_SHIP: ShipTemplate = Object.freeze({
  id: "custom",
  width: 2,
  height: 1,
  defaultCount: 3,
  title: "Custom Ship",
  description: "Always the same",
}) as const;

// ✅ GOOD: Game mode constants are frozen
export const GAME_CONSTANTS = Object.freeze({
  SHIPS: {
    MIN_DISTANCE: 2,
    MAX_PLACEMENT_ATTEMPTS: 200,
    DEFAULT_COUNTS: { ... },
  },
  // ... rest of constants
}) as const;

// ✅ GOOD: Create a new mode with different constants
export const CUSTOM_MODE: GameMode = {
  id: "custom",
  // ...
  constants: Object.freeze({
    ...GAME_CONSTANTS,
    SHIPS: { ...GAME_CONSTANTS.SHIPS, MIN_DISTANCE: 5 }
  }) as const,
};

// If you need a variation:
const largerShip: ShipTemplate = Object.freeze({
  ...MY_SHIP,
  width: 3,  // Override one field
}) as const;
```

**Why:** Frozen constants ensure identity and prevent bugs in multiplayer serialization. Constants can vary per game mode, but each mode's constants must be immutable.

---

### 5. ❌ Storing Engine Instances in Handlers

**Forbidden:**
```typescript
// ❌ BAD: Handler stores engine reference
let cachedEngine: IGameEngine;

export const MyItem: ItemTemplate = {
  onCollect(ctx) {
    cachedEngine = ???;  // Where would it come from?
    // Later, engine state changes but we don't see it
  },
};
```

**How to fix:**
```typescript
// ✅ GOOD: Handlers use ItemActionContext (a snapshot)
export const MyItem: ItemTemplate = {
  onCollect(ctx) {
    // ctx is a snapshot; it's the source of truth for this moment
    const currentShips = ctx.playerShips;
    const canPlace = anyFreePosition(currentShips, ctx.boardWidth, ctx.boardHeight);
  },
};
```

**Why:** Snapshots prevent stale data. The handler runs synchronously; context is fresh.

---

### 6. ❌ Placing Logic in Type Files

**Forbidden:**
```typescript
// types/entities.ts — WRONG FILE
export interface GameShip {
  // ...
  validate(): boolean {  // ❌ LOGIC IN TYPES FILE
    return this.health > 0;
  }
}
```

**How to fix:**
```typescript
// types/entities.ts
export interface GameShip {
  id: string;
  health: number;
  // ... pure data
}

// tools/ships.ts
export function isShipAlive(ship: GameShip): boolean {
  return ship.health > 0;
}
```

**Why:** Types are contracts; logic belongs in tools/ or engine/. Separation makes refactoring easier.

---

### 7. ❌ Exposing Internal State Directly

**Forbidden:**
```typescript
// engine/logic.ts
export class GameEngine {
  // ❌ BAD: Direct access to internal array
  ships: GameShip[] = [];

  // This means callers can do:
  // engine.ships.push(newShip);  // Bypassing all validations!
}
```

**How to fix:**
```typescript
// engine/logic.ts
export class GameEngine {
  // ✅ GOOD: Expose via IGameEngineReader
  get playerShips(): readonly GameShip[] {
    return this._playerShips;  // Readonly prevents mutations
  }

  // Only engine can mutate
  private addPlayerShip(ship: GameShip) {
    this._playerShips.push(ship);
  }
}
```

**Why:** Encapsulation ensures all mutations go through validation.

---

### 8. ❌ Importing from Types in Constants

**Forbidden:**
```typescript
// constants/ships.ts
import { ShipTemplate } from '../types/constants';  // ❌ Circular if done wrong

export const DESTROYER: ShipTemplate = {
  // ...
};
```

**How to fix:**
```typescript
// constants/ships.ts
// Don't import ShipTemplate here; use as const for type inference
export const DESTROYER = {
  id: "destroyer",
  width: 3,
  height: 1,
  defaultCount: 2,
  title: "Destroyer",
  description: "...",
} as const satisfies ShipTemplate;
```

**Why:** Cleaner imports. `as const` gives you the same inference.

---

### 9. ❌ Non-Deterministic Behavior

**Forbidden:**
```typescript
// ❌ BAD: Random behavior in rulesets
export const MyRuleSet: MatchRuleSet = {
  decideTurn(result, state): TurnDecision {
    const rand = Math.random();
    if (rand > 0.5) {
      return { shouldToggleTurn: true, // ... };
    }
    // Non-deterministic! Same input → different output
  },
};
```

**How to fix:**
```typescript
// ✅ GOOD: All logic is deterministic
export const MyRuleSet: MatchRuleSet = {
  decideTurn(result, state): TurnDecision {
    const anyHit = result.shots.some(s => s.hit && s.executed);
    if (anyHit) {
      return { shouldToggleTurn: false, // ... };  // Always the same
    }
    return { shouldToggleTurn: true, // ... };
  },
};

// Randomness (if needed) happens in GameInitializer with randomSeed
```

**Why:** Deterministic logic is testable, replayable, and safe for multiplayer.

---

### 10. ❌ Implicit Null/Undefined Handling

**Forbidden:**
```typescript
// ❌ BAD: What if ships is undefined?
const firstShip = ships[0].health;  // Crash if ships is null

// ❌ BAD: Implicit boolean coercion
if (result) {  // What does truthy mean here?
  console.log("Success");
}
```

**How to fix:**
```typescript
// ✅ GOOD: Explicit checks
const firstShip = ships ? ships[0]?.health : 0;

// ✅ GOOD: Explicit fields
if (result.success === true) {
  console.log("Success");
}

// ✅ GOOD: Use type guards
if (result.status === "success") {
  // TypeScript narrows to success type
  console.log(result.data);
}
```

**Why:** Explicit code prevents silent bugs, especially in distributed/multiplayer scenarios.

---

## REQUIRED PATTERNS (Always Do These)

### 1. ✅ Layer Boundaries

**Required:**
```
constants/  (can only import: itself)
  ↓
types/      (can only import: constants)
  ↓
tools/      (can only import: constants, types)
  ↓
engine/     (can only import: constants, types, tools)
  ↓
machines/   (can only import: constants, types, tools, engine)
  ↓
manager/    (can only import: all lower layers)
```

**Check:**
```bash
# Print all imports
grep -r "^import" src/core/ | grep -v node_modules

# Verify no backwards dependencies
```

---

### 2. ✅ Type Documentation

**Required:** Every public type must have a JSDoc block:

```typescript
/**
 * Represents a single shot on the board.
 *
 * @property x - Column (0-indexed)
 * @property y - Row (0-indexed)
 * @property hit - Whether this shot hit a ship or item
 * @property executed - Whether the shot was actually fired (not skipped)
 */
export interface Shot {
  x: number;
  y: number;
  hit: boolean;
  executed: boolean;
}
```

---

### 3. ✅ Test Coverage

**Required:** All public functions and classes must be tested:

```bash
npm run test:coverage

# MUST achieve:
# - Statements: 85%+
# - Branches: 80%+
# - Functions: 90%+
# - Lines: 85%+
```

---

### 4. ✅ Immutable by Default

**Required:** All state must be immutable unless explicitly mutable:

```typescript
// ✅ GOOD: Readonly arrays in interfaces
export interface GameEngineState {
  readonly playerShips: readonly GameShip[];
  readonly enemyShips: readonly GameShip[];
}

// ✅ GOOD: Frozen constants
export const MY_CONSTANT = Object.freeze({ /* ... */ }) as const;

// ✅ GOOD: One place holds mutable state
export class GameEngine {
  private _playerShips: GameShip[] = [];  // Only private, mutable copy
  get playerShips(): readonly GameShip[] { return this._playerShips; }
}
```

---

### 5. ✅ Error Result Objects

**Required:** Game logic errors must return result objects:

```typescript
interface Result<T> {
  success: boolean;
  data?: T;
  error?: GameError;
  reason: string;
}

function doSomething(): Result<Data> {
  if (invalid) {
    return {
      success: false,
      error: SomeErrors.INVALID,
      reason: "Detailed explanation for debugging",
    };
  }
  return {
    success: true,
    data: { /* ... */ },
    reason: "Success explanation",
  };
}
```

---

### 6. ✅ Named Templates in Constants

**Required:** Every template must be a named export:

```typescript
// ✅ GOOD
export const DESTROYER: ShipTemplate = { /* ... */ };
export const SHIELD_ITEM: ItemTemplate = { /* ... */ };
export const CLASSIC_RULESET: MatchRuleSet = { /* ... */ };
```

**Not:**
```typescript
// ❌ BAD
export const TEMPLATES = {
  ships: [{ /* destroyer */ }, { /* ...  */ }],
  items: [{ /* ...  */ }],
};
```

**Why:** Named exports are easier to audit, tree-shake, and refactor.

---

### 7. ✅ Mode-Based Constants (Per-Mode Configuration)

**Required:** Game mode constants must be defined per-mode and frozen:

```typescript
/**
 * Classic mode with specific constants for placement rules,
 * thresholds, and board configuration.
 * 
 * Each game mode can define its own GameModeConstants to allow
 * different gameplay styles while keeping all values immutable.
 */
export const CLASSIC_MODE: GameMode = {
  id: "classic",
  title: "Classic Mode",
  // ... ships, items, obstacles, shotPatterns
  
  // ✅ GOOD: Mode-specific constants are frozen
  constants: Object.freeze({
    SHIPS: {
      MIN_DISTANCE: 2,
      MAX_PLACEMENT_ATTEMPTS: 200,
      DEFAULT_COUNTS: { /* ... */ },
    },
    ITEMS: {
      MIN_DISTANCE_FROM_SHIPS: 1,
      MAX_PLACEMENT_ATTEMPTS: 200,
      DEFAULT_COUNTS: { /* ... */ },
    },
    // ... other constants
  }) as const,
  
  ruleSet: ClassicRuleSet,
};
```

**Not:**
```typescript
// ❌ BAD: Direct mutation of mode constants
const mode = CLASSIC_MODE;
mode.constants.SHIPS.MIN_DISTANCE = 5;  // Runtime mutation!

// ❌ BAD: Unfrozen constants
export const GAME_CONSTANTS = {
  SHIPS: { MIN_DISTANCE: 2 },  // Not frozen
};
```

**Why:**
- Each mode can customize gameplay (difficulty, entity counts, placement rules)
- All constants remain immutable once the mode is created
- Multiplayer stays deterministic (same mode = same rules)
- Easy to add new modes without affecting existing ones

---

### 8. ✅ Deterministic Game Loop

**Required:** Turn resolution must be deterministic:

```
1. Execute shot pattern (deterministic)
2. Collect items (deterministic, order matters — use index-based access)
3. Run item handlers (deterministic — same input → same output)
4. Ruleset decides turn (deterministic — based only on state)
5. Callbacks fire (deterministic order from CallbackCoordinator)
6. Machine transitions (deterministic — based on decision)
```

**No:** Time-based state, random behavior, or side effects should influence flow.

---

## Checklist Before Push

- [ ] `tsc -b` passes (no type errors, no circular deps)
- [ ] `npm run test:run` passes (100% test pass)
- [ ] `npm run test:coverage` achieves targets (85%+ statements, etc.)
- [ ] No `any` in code (only `unknown` if necessary)
- [ ] No `throw` for game logic (only results or machine transitions)
- [ ] All public APIs have JSDoc
- [ ] No mutations to constants
- [ ] No state duplication (single source of truth)
- [ ] All handlers use `ItemActionContext`, not engine
- [ ] Machine logger can trace the entire flow

---

## Breaking These Rules

If you break these rules, you will:
1. Make multiplayer support harder
2. Introduce non-deterministic behavior
3. Create circular dependencies
4. Enable silent bugs and data desync
5. Make testing and debugging harder

**Don't. Break. These. Rules.**

The rules exist because they've been learned the hard way. Trust them.
