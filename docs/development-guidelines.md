# Development Guidelines & Best Practices

Strict rules, patterns, and conventions for the RebelCoderz Game Engine. Every line of code should follow these principles.

---

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Type System Rules](#type-system-rules)
3. [Code Organization](#code-organization)
4. [Naming Conventions](#naming-conventions)
5. [Documentation Standards](#documentation-standards)
6. [Testing Standards](#testing-standards)
7. [State Management](#state-management)
8. [Error Handling](#error-handling)
9. [Layer Boundaries](#layer-boundaries)
10. [Extension Points](#extension-points)

---

## Architecture Principles

### 1. **Layered Architecture (No Circular Dependencies)**

The engine follows a strict layered architecture:

```
constants/ ← types/ ← tools/ ← engine/ ← machines/ ← manager/
```

- **constants/** imports only itself
- **types/** imports only constants/
- **tools/** imports constants/ and types/
- **engine/** imports constants/, types/, and tools/
- **machines/** imports all other layers
- **manager/** imports all other layers

**Rule:** If your import would create a backwards dependency, refactor. Circular dependencies are forbidden.

### 2. **Single Responsibility Principle (SRP)**

Each file has exactly one primary responsibility:

- `constants/ships.ts` → define ship templates
- `types/entities.ts` → export entity types
- `tools/ships.ts` → ship utility functions
- `engine/logic.ts` → GameEngine class (mutable state)
- `engine/board.ts` → board projections (pure functions)
- `machines/match.ts` → state machine definition

**Rule:** If a file is doing 2+ unrelated things, split it.

### 3. **Immutability by Default**

Data in constants/ is immutable. All templates (ShipTemplate, ItemTemplate, etc.) must be declared as `const` and never modified at runtime.

**Rule:** Use `Object.freeze()` in constants to prevent accidental mutations:

```typescript
export const MY_SHIP: ShipTemplate = Object.freeze({
  id: "my-ship",
  width: 3,
  height: 1,
  defaultCount: 1,
  title: "My Ship",
  description: "A custom ship",
}) as const;
```

### 4. **Type-Driven Design**

Types are the contract. Implementation follows the contract, not the other way around.

**Rule:** Define types/interfaces first. Keep them in `types/`. Test against them. The implementation is secondary.

---

## Type System Rules

### 1. **Use Strict TypeScript**

TypeScript is configured with strict mode. All code must:
- Have explicit type annotations (no implicit `any`)
- Use `unknown` instead of `any`
- Handle `null` and `undefined` explicitly

**Rule:** If TypeScript complains, fix the code, not the compiler settings.

### 2. **Extend `GameEntity` for Identifiable Objects**

Any object that needs an `id`, `title`, or `description` should implement or extend `GameEntity`:

```typescript
export interface MyThing extends GameEntity {
  // your specific fields
}
```

This ensures consistency across the codebase and makes serialization easier.

**Rule:** All rulesets, items, ships, and obstacles must extend `GameEntity` via their template type.

### 3. **Use `GameObject` for Template Types**

Template types (ShipTemplate, ItemTemplate, ObstacleTemplate) must extend both their entity type and `GameObject`:

```typescript
export interface MyTemplate extends MyEntity, GameObject {
  defaultCount: number; // inherited from GameObject
}
```

**Rule:** Never create a template without `defaultCount`.

### 4. **Type Namespacing with `export type`**

Group related types in namespaces when there are multiple variants:

```typescript
export namespace ItemActionResults {
  export interface Success {
    collected: boolean;
    reason: string;
  }
  export interface Failed {
    error: ItemActionError;
  }
}
```

**Rule:** Use namespaces to prevent naming conflicts and clarify relationships.

### 5. **Avoid Generic Catch-All Types**

Instead of:
```typescript
const data: Record<string, unknown> = {};
```

Define the exact shape:
```typescript
interface GameConfig {
  boardWidth: number;
  boardHeight: number;
  shipCounts: Record<string, number>;
}
```

**Rule:** `Record<string, unknown>` is a last resort. Be explicit about what fields exist.

---

## Code Organization

### 1. **File Naming**

- **exports/** files: `index.ts` barrels
- **type files:** `[name].ts` (e.g., `entities.ts`, `shots.ts`)
- **constant files:** `[pluralName].ts` (e.g., `ships.ts`, `items.ts`)
- **class files:** `[ClassName].ts` (e.g., `GameEngine.ts`, but typically `logic.ts` by convention)
- **function files:** `[functionName].ts` or grouped by domain (e.g., `calculations.ts`)

### 2. **File Size Limits**

- **types/ files:** Keep under 500 lines. Split by domain (entities, shots, config, etc.).
- **constants/ files:** Keep under 300 lines. One template type per file.
- **engine/ files:** Keep under 400 lines. Complex logic splits into sub-files.

**Rule:** If a file is over the limit, refactor into smaller, focused files.

### 3. **Import Organization**

Always organize imports in this order:

```typescript
// 1. External libraries
import type { XStateType } from "xstate";

// 2. Type imports from other layers (alphabetical)
import type { GameConfig } from "../types/config";
import type { GameEntity } from "../types/entities";

// 3. Value imports from other layers (alphabetical)
import { GameEngine } from "./logic";
import { SHIP_TEMPLATES } from "../constants/ships";

// 4. Local imports
import { createBoard } from "./board";
```

**Rule:** Separate type imports from value imports. Always sort alphabetically within each section.

### 4. **Barrel Files (index.ts)**

Each directory should have an `index.ts` that re-exports the public API:

```typescript
export * from "./entities";
export * from "./config";
export { GameEngine } from "../engine/logic";
export { createMatch } from "../engine/match";
```

**Rule:** Never import directly from a nested file (e.g., `../engine/logic.ts`). Always use `../engine/` (index).

---

## Naming Conventions

### 1. **PascalCase for Types, Interfaces, Classes**

```typescript
interface GameEntity { }
interface MatchRuleSet { }
class GameEngine { }
const MY_CONSTANT = 5;
```

### 2. **camelCase for Functions, Variables, Methods**

```typescript
function createShip() { }
const myVariable = 42;
const doSomething = () => { };
```

### 3. **UPPER_SNAKE_CASE for Constants**

```typescript
export const MAX_BOARD_WIDTH = 20;
export const MIN_BOARD_HEIGHT = 10;
export const DEFAULT_SHIP_COUNT = { small: 2, large: 1 };
```

### 4. **Suffix Types Descriptively**

- `*Template` for template objects (ShipTemplate, ItemTemplate)
- `*Context` for context/config objects (ItemActionContext)
- `*Type` for TypeScript types that describe shapes
- `*Decision` for decision/result objects (TurnDecision, GameOverDecision)
- `*Result` for operation results (ShotPatternResult, PlanAndAttackResult)
- `*State` for state snapshots (GameEngineState)

**Rule:** A type's suffix should immediately tell you its purpose.

### 5. **Avoid Ambiguous Names**

Instead of:
```typescript
const data = {};
const value = 10;
const process = () => { };
```

Use:
```typescript
const gameSetup: GameSetup = {};
const boardWidth = 10;
const executeAttack = () => { };
```

**Rule:** Every name should be self-documenting.

---

## Documentation Standards

### 1. **JSDoc for All Public APIs**

Every exported function, class, interface, and constant should have a JSDoc comment:

```typescript
/**
 * Creates a new ship instance from a template.
 *
 * @param template - The ship template to use
 * @param position - Starting board position { x, y }
 * @returns A new GameShip instance with the template's properties
 *
 * @example
 * const ship = createShip(SHIP_TEMPLATES.destroyer, { x: 0, y: 0 });
 */
export function createShip(template: ShipTemplate, position: BoardPosition): GameShip { }
```

### 2. **Parameter & Return Type Documentation**

Always document what parameters do and what return values mean:

```typescript
/**
 * @param attackResult - The result of the shot pattern (shots fired, hits, etc.)
 * @param currentState - Snapshot of the game state **after** item handlers run
 * @returns Decision object with shouldEndTurn, shouldToggleTurn, canShootAgain, reason
 */
decideTurn(attackResult: ShotPatternResult, currentState: GameEngineState): TurnDecision { }
```

### 3. **Edge Cases & Rules**

Document the rules your code enforces:

```typescript
/**
 * Resolves a single turn in the match.
 *
 * **Important Rules:**
 * - All item `onCollect` handlers run before this method is called
 * - The ruleset has final say on turn progression
 * - If `shouldToggleTurn` is true, the active side switches
 * - If `canShootAgain` is true, the same player fires another shot
 *
 * @param attackResult - Result of the shot pattern
 * @returns TurnDecision
 */
```

### 4. **README per Complex Subdirectory**

Complex subdirectories (like `machines/`) should have a README:

```markdown
# State Machine Docs

This directory contains the XState state machine for match orchestration.

- **match.ts** — Machine definition
- **types.ts** — Context, event, and callback types
- **callbacks.ts** — CallbackCoordinator for single-dispatch callbacks
- **logger.ts** — Machine action logger for debugging

See [../../../docs/core-v3-arch.md](../../../docs/core-v3-arch.md) for architecture overview.
```

### 5. **Inline Comments for Non-Obvious Logic**

```typescript
// Only count shots that actually executed (defensive programming)
const hitCount = shots.filter(s => s.executed && s.hit).length;

// Perspective swap: enemy items on enemy board appear in enemyItems array
// but from the collector's perspective, they are "on the opponent's board"
const opponentItemsCollected = enemyCollectedItems.map(idx => enemyItems[idx]);
```

**Rule:** If the "why" isn't clear, add a comment. Avoid explaining "what" — code should be clear enough.

---

## Testing Standards

### 1. **Vitest for All Tests**

All tests use **Vitest**. Configuration is in `vitest.config.ts`.

```bash
npm run test          # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage
```

### 2. **Test File Naming & Placement**

- Test files live in `src/core/tests/`
- Mirror the source directory structure
- Naming: `[filename].test.ts`

```
src/core/engine/logic.ts         →  src/core/tests/engine/logic.test.ts
src/core/tools/ships.ts          →  src/core/tests/tools/ships.test.ts
src/core/constants/rulesets.ts   →  src/core/tests/constants/rulesets.test.ts
```

### 3. **Test Structure (AAA Pattern)**

Every test follows Arrange-Act-Assert:

```typescript
describe("GameEngine", () => {
  it("should apply hit damage to a ship", () => {
    // Arrange
    const engine = createTestEngine();
    const ship = engine.playerShips[0];
    const initialHealth = ship.health;

    // Act
    engine.applyHitDamage(ship, 1);

    // Assert
    expect(engine.playerShips[0].health).toBe(initialHealth - 1);
    expect(engine.playerShips[0].isDestroyed).toBe(false);
  });
});
```

### 4. **Mock Only External Dependencies**

- Mock Firebase, XState, or external APIs
- Never mock the engine's own classes or functions
- Test the real logic

**Rule:** Mocks are last resort. Test real behavior when possible.

### 5. **Coverage Targets**

- **Statements:** 85%+
- **Branches:** 80%+
- **Functions:** 90%+
- **Lines:** 85%+

Run `npm run test:coverage` to check coverage.

### 6. **Snapshot Tests Sparingly**

Snapshots can hide bugs. Use them only for:
- Deeply nested object structures
- Generated JSON output

Avoid snapshots for:
- Simple values (use direct assertions)
- Logic paths (snapshots hide intent)

---

## State Management

### 1. **GameEngine Owns Mutable State**

All game state lives in **GameEngine**. Never duplicate state elsewhere.

```typescript
// ✅ Good: Ask the engine for the truth
const ships = engine.playerShips;

// ❌ Bad: Cache state locally
const cachedShips = engine.playerShips;
// ... later, ships change but cachedShips doesn't
```

### 2. **Read State via IGameEngineReader**

When you only need to read state, use the reader interface:

```typescript
interface IGameEngineReader {
  readonly playerShips: readonly GameShip[];
  readonly enemyShips: readonly GameShip[];
  isValidPosition(x: number, y: number): boolean;
  // ... read-only methods
}
```

**Rule:** Expose only what's necessary. Hide write operations.

### 3. **State Snapshots with `GameEngineState`**

When passing state to item handlers or rulesets, always use `GameEngineState`:

```typescript
const state: GameEngineState = {
  playerShips: engine.playerShips,
  enemyShips: engine.enemyShips,
  playerItems: engine.playerItems,
  // ... all read-only fields
};
```

**Rule:** Never pass the engine itself to handlers. Always create a snapshot.

### 4. **XState Machines Orchestrate, Don't Store**

The match machine (XState) orchestrates flow but doesn't own data:

```typescript
// Machine context
{
  engine: IGameEngine;        // The engine owns state
  ruleset: MatchRuleSet;      // Rules (immutable)
  turn: GameTurn;             // Current turn (read from engine)
  plan: ShotPlan | null;      // Planning state (temporary)
}
```

**Rule:** State belongs in the engine, not the machine.

### 5. **Zustand for UI State Only**

If using Zustand (for React components), it manages **UI state only**:

```typescript
const useGameUI = create((set) => ({
  selectedTargets: [] as BoardPosition[],
  setSelectedTargets: (targets) => set({ selectedTargets: targets }),
}));
```

**Rule:** Game logic state goes in GameEngine. UI state goes in Zustand.

---

## Error Handling

### 1. **Typed Error Constants**

All errors are defined in `engine/errors.ts` with namespaces:

```typescript
export const ShotErrors = {
  OUT_OF_BOUNDS: { code: "SHOT_OUT_OF_BOUNDS", message: "Shot is outside the board" },
  DUPLICATE: { code: "SHOT_DUPLICATE", message: "Position already targeted" },
  INVALID_PATTERN: { code: "SHOT_INVALID_PATTERN", message: "Invalid shot pattern" },
} as const;

export const PlanErrors = {
  INVALID_POSITION: { code: "PLAN_INVALID_POSITION", message: "Invalid ship position" },
} as const;
```

### 2. **Return Result Objects Instead of Throwing**

For recoverable errors, return a result object:

```typescript
export interface ShotResult {
  success: boolean;
  executed: boolean;
  hit: boolean;
  shipDestroyed?: boolean;
  error?: (typeof ShotErrors)[keyof typeof ShotErrors];
  reason: string;
}

// Usage
const result = planShot(x, y);
if (!result.success) {
  console.warn(result.error?.message, result.reason);
}
```

**Rule:** Throw only for truly exceptional cases (programmer errors, invalid configuration).

### 3. **Use Discriminated Unions for Results**

```typescript
type AttackResult =
  | { status: "success"; result: ShotPatternResult }
  | { status: "error"; error: GameError; reason: string };

function attack(plan: ShotPlan): AttackResult {
  if (!isValidPlan(plan)) {
    return { status: "error", error: PlanErrors.INVALID, reason: "..." };
  }
  return { status: "success", result: executeShots(plan) };
}

// Usage
const result = attack(plan);
if (result.status === "success") {
  // TypeScript narrows to success case
  console.log(result.result);
} else {
  // TypeScript narrows to error case
  console.error(result.error);
}
```

### 4. **Reason Strings for Debugging**

Every decision, error, or branch should include a human-readable `reason`:

```typescript
return {
  shouldEndTurn: true,
  shouldToggleTurn: true,
  canShootAgain: false,
  reason: "Ship destroyed during attack - turn ends and switches",
};
```

**Rule:** `reason` fields are for developers debugging, not end users.

---

## Layer Boundaries

### 1. **constants/ — Read-Only Lookup Tables**

**What lives here:**
- Template definitions (ships, items, obstacles, rulesets)
- Game balance constants (board sizes, health, etc.)
- Shot patterns, ruleset presets

**What doesn't:**
- Business logic
- Runtime state
- Anything that changes

**Rule:** Constants are frozen. Never import something from constants/ that you plan to modify.

### 2. **types/ — Type Definitions**

**What lives here:**
- Interfaces and types (GameEntity, MatchRuleSet, GameConfig, etc.)
- Enums for fixed sets (Winner, GamePhase, etc.)

**What doesn't:**
- Implementation
- Default values
- Logic

**Rule:** Types can only import from constants/ (for default values). No circular imports.

### 3. **tools/ — Pure Utility Functions**

**What lives here:**
- Ship calculations (placement validation, geometry)
- Array/object utilities
- Coordinate transformations
- Item validators

**What doesn't:**
- Mutable state
- Engine imports
- Machine imports

**Rule:** Tools must be pure functions (no side effects).

### 4. **engine/ — Game Logic & State**

**What lives here:**
- GameEngine class (all mutable state)
- Board projection functions
- Item lifecycle coordination
- Error types

**What doesn't:**
- Turn orchestration (that's the machine)
- UI state
- Firebase/networking logic

**Rule:** The engine is the single source of truth for game state.

### 5. **machines/ — State Orchestration**

**What lives here:**
- XState machine definition
- Event types and context types
- Transition guards and actions
- Callback coordination

**What doesn't:**
- Business logic (that's the engine)
- State ownership (the engine owns it)
- UI rendering

**Rule:** The machine coordinates flow, the engine executes logic.

### 6. **manager/ — Setup & Initialization**

**What lives here:**
- GameInitializer (config → GameSetup)
- Default configurations
- Validation & normalization

**What doesn't:**
- Runtime state changes
- Rule enforcement

**Rule:** Use the manager once at setup. Then let the engine and machine take over.

---

## Extension Points

### 1. **Adding a New RuleSet**

1. **Create the type** (extends `MatchRuleSet`):
   ```typescript
   export interface MyRuleSet extends MatchRuleSet {
     // any custom non-game-logic fields (rarely needed)
   }
   ```

2. **Implement it** in `constants/rulesets.ts`:
   ```typescript
   export const MyRuleSet: MatchRuleSet = {
     id: "my-custom",
     title: "My Custom RuleSet",
     description: "Custom turn and game-over logic",
     decideTurn(attackResult, state) { /* ... */ },
     checkGameOver(state) { /* ... */ },
     decideTurnOnItemUse(isPlayerUse, state) { /* ... */ },
   };
   ```

3. **Register it** with `registerRuleSet` so it's discoverable.

**Rule:** RuleSets are immutable. Create a new one, don't modify existing ones.

### 2. **Adding a New Ship Type**

1. **Create the template** in `constants/ships.ts`:
   ```typescript
   export const MY_SHIP: ShipTemplate = Object.freeze({
     id: "my-ship",
     width: 2,
     height: 1,
     defaultCount: 2,
     title: "My Ship",
     description: "A custom ship",
   }) as const;
   ```

2. **Register in `SHIP_TEMPLATES`**.

3. **Use in GameConfig**:
   ```typescript
   const setup = new GameInitializer({
     shipCounts: { "my-ship": 3 },
   }).generate();
   ```

**Rule:** Ship properties (width, height) never change after creation.

### 3. **Adding a New Item Type**

1. **Create the template** in `constants/items.ts` with handlers:
   ```typescript
   export const MY_ITEM: ItemTemplate = Object.freeze({
     id: "my-item",
     defaultCount: 1,
     title: "My Item",
     description: "Does something cool",
     onCollect(ctx) {
       // Custom behavior when collected
     },
     onUse(ctx) {
       // Custom behavior when used
     },
   }) as const;
   ```

2. **Register in `ITEM_TEMPLATES`**.

3. **Place at match start** via config or at runtime via `engine.setPlayerItems()`.

**Rule:** Handlers receive `ItemActionContext`. Access game state as read-only.

### 4. **Custom Item Behavior (onCollect, onUse)**

All item handlers receive `ItemActionContext` and can:
- Read all game state (ships, items, shots)
- Modify their own side's ships/items
- Request turn toggles
- Request ruleset changes

**Rule:** Handlers must return `void`. Side effects go through `ItemActionContext` methods.

---

## Summary: Development Checklist

Before submitting code:

- [ ] **No circular dependencies** — Run `tsc -b` with no errors
- [ ] **TypeScript strict mode** — No `any`, all types explicit
- [ ] **Immutability** — Constants are frozen, state is captured in snapshots
- [ ] **SRP** — Each file has one responsibility
- [ ] **Layering** — Imports only go downward (constants → types → tools → engine → machines → manager)
- [ ] **Naming** — PascalCase types, camelCase functions, SNAKE_CASE constants
- [ ] **JSDoc** — All public APIs documented
- [ ] **Tests** — AAA pattern, mirrors source structure, meets coverage targets
- [ ] **Error handling** — Typed errors, result objects, reason strings
- [ ] **Code style** — Import organization, 80-char lines where practical, consistent formatting

This is the contract. Follow it strictly.
