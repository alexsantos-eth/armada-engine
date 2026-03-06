# Extension Guide v3 — How to Add & Modify Engine Pieces

This guide provides clear, step-by-step instructions for extending or modifying the engine. Each section answers: _"How do I change X? What files and types are involved? What are the rules?"_

---

## Table of Contents

1. [Board — Size & Constraints](#1-board--size--constraints)
2. [Ship Types — Adding & Modifying Variants](#2-ship-types--adding--modifying-variants)
3. [Shot Patterns — Adding & Modifying Patterns](#3-shot-patterns--adding--modifying-patterns)
4. [Game Rules — Adding & Modifying RuleSets](#4-game-rules--adding--modifying-rulesets)
5. [Items — Adding & Modifying GameItems](#5-items--adding--modifying-gameitems)

---

## 1. Board — Size & Constraints

### What controls the board?
- **Default size:** `src/core/constants/views.ts` (`BOARD_DEFAULT_WIDTH`, `BOARD_DEFAULT_HEIGHT`)
- **Size limits:** `src/core/constants/game.ts` (`MIN_SIZE`, `MAX_SIZE`)
- **Configurable per match:** `src/core/types/config.ts` (`GameConfig.boardView`)

To change the default board size, edit the constants in `views.ts`. To change the allowed range, update `game.ts`.

To override board size at runtime, pass a custom `boardView` to `GameInitializer` or `createMatch`.

### Rules enforced by the engine
- Out-of-bounds shots are skipped, not errors.
- Use `GameEngine.isValidPosition(x, y)` to check bounds before planning a shot.

---

## 2. Ship Types — Adding & Modifying Variants

- **Single source of truth:** `src/core/constants/ships.ts` (`ShipTemplate`, `SHIP_TEMPLATES`)
- **Type:** `ShipTemplate` in `src/core/types/constants.ts`

**To add a new ship:**
1. Define a new constant in `ships.ts` (see `ShipTemplate` type for required fields).
2. Register it in `SHIP_TEMPLATES`.

**To modify a ship:**
- Edit the constant directly (change `width`, `height`, or `defaultCount`).

**To override ship counts at runtime:**
- Pass a `shipCounts` map to `GameInitializer` or `GameConfig`.

---

## 3. Shot Patterns — Adding & Modifying Patterns

- **Type:** `ShotPattern` in `src/core/types/shots.ts`
- **Constants:** `src/core/constants/shotPatterns.ts` (`SHOT_PATTERNS`)

**To add a new pattern:**
1. Define a new constant in `shotPatterns.ts`.
2. Register it in `SHOT_PATTERNS`.

**To use a custom pattern for a match:**
- Pass the pattern directly to `planAndAttack` or include it in the setup.

---

## 4. Game Rules — Adding & Modifying RuleSets

- **Type:** `MatchRuleSet` in `src/core/types/rulesets.ts`
- **Built-in rulesets:** `src/core/constants/rulesets.ts`

**To add a new ruleset:**
1. Implement the `MatchRuleSet` interface.
2. Export and register it in `rulesets.ts` if you want it discoverable by name.

**To activate a ruleset:**
- Pass it in `GameConfig` at match creation, or call `match.setRuleSet()` at runtime.

---

## 5. Items — Adding & Modifying GameItems

- **Type:** `ItemTemplate` in `src/core/types/constants.ts`
- **Constants:** `src/core/constants/items.ts` (`ITEM_TEMPLATES`)

**To add a new item:**
1. Define a new constant in `items.ts` (see `ItemTemplate` type for required fields).
2. Register it in `ITEM_TEMPLATES`.

**To add custom behavior:**
- Implement `onCollect(ctx)` and/or `onUse(ctx)` handlers on the item. Use the `ItemActionContext` API for state changes.

**To place items at match start:**
- Add them to the `playerItems` or `enemyItems` arrays in the match setup.

**To place items at runtime:**
- Use `engine.setPlayerItems()` or `engine.setEnemyItems()`.

---

---

## 6. Custom Perspectives — Adding New Resource Types

If you want to track a new resource (e.g., "shields", "special items"), update `perspective.ts`:

1. **Add to GameEngineState** (in `types/engine.ts`):
   ```typescript
   export interface GameEngineState {
     playerShips: GameShip[];
     enemyShips: GameShip[];
     playerShields: Shield[];  // New field
     enemyShields: Shield[];   // New field
     // ... other fields
   }
   ```

2. **Update SidePerspective** (in `engine/perspective.ts`):
   ```typescript
   export const SidePerspective = {
     shield: (isPlayer: boolean, state: GameEngineState) => 
       isPlayer ? state.playerShields : state.enemyShields,
     // This ensures all handlers automatically get the correct perspective
   };
   ```

3. **Update ItemActionContext** (in `types/entities.ts`):
   ```typescript
   export interface ItemActionContext {
     playerShields: Shield[];
     enemyShields: Shield[];
     // ... existing fields
   }
   ```

**Rule:** Only `perspective.ts` should know about player/enemy field pairs. This is the extension point for new resources.

---

## 7. Custom Callbacks — Adding New Event Hooks

Register custom match callbacks via the machine context:

```typescript
// In your setup/initialization
const match = createMatch({
  // ... rest of config
  callbacks: {
    onBeforeAttack: (ctx) => {
      console.log("About to attack");
    },
    onAfterAttack: (result) => {
      console.log("Attack resolved", result);
    },
    onGameOver: (winner) => {
      console.log("Game over! Winner:", winner);
    },
  },
});

// Callbacks must match types in machines/types.ts
```

**Rule:** Callbacks are fire-and-forget events. They cannot modify game state; use item handlers for that.

---

## 8. Custom Board Layers — Showing/Hiding Game State

Control what gets rendered via `BoardViewConfig`:

```typescript
const boardView: BoardViewConfig = {
  ships: true,           // Show ship cells
  items: true,           // Show item cells
  shots: "hits-only",    // Show only hits, not misses
  obstacles: true,       // Show obstacles
  highlights: ["planning"],  // Show planning highlights
};

// Get the projected board
const playerBoard = getPlayerBoard(engine, boardView);
// Only cells matching config are visible
```

**Extension:** Add new `BoardLayer` types in `types/board.ts` to expose custom cell types.

---

## Design Rules & Best Practices

### Immutability
- **Never mutate templates** — They're frozen constants. Create new instances instead.
- **Snapshot state for handlers** — ItemActionContext receives a snapshot, not the engine itself.
- **Validate before applying changes** — Use tools (e.g., `isValidShipPosition`) before mutations.

### Type Safety
- **Extend GameEntity for all identifiable objects** — Including custom templates.
- **Use discriminated unions for result types** — Always distinguish success from failure.
- **Keep templateDefaults in constants** — Never scatter defaults throughout the code.

### Composition & Reuse
- **Compose handlers instead of monolithic implementations** — Small, focused handlers are easier to test and combine.
- **Use tools/ utilities for geometry and validation** — Don't repeat calculations in handlers.
- **Register rulesets and templates for discoverability** — Makes them available via `getRuleSetByName()`, etc.

### Error Handling
- **Return result objects, don't throw** — Game logic is not exceptional; errors are expected and handled.
- **Include reason strings** — Always explain why something failed or succeeded for debugging.
- **Fail gracefully** — Out-of-bounds shots are skipped, not errors.

### Testing
- **Test handlers in isolation** — Create mock contexts with known state.
- **Test rulesets with realistic game states** — Use integration tests with full engine.
- **Mirror source structure in test files** — `src/core/tools/ships.ts` → `src/core/tests/tools/ships.test.ts`.

---

## Common Patterns

### Pattern 1: Item that Gives a Bonus

```typescript
export const BonusItem: ItemTemplate = {
  id: "bonus",
  title: "Bonus",
  description: "Awards extra hit chance",
  defaultCount: 1,

  onCollect(ctx) {
    // Give the collector +10% hit chance in UI state
    // This would be stored in React state, not game state
    console.log("Player collected bonus!");
  },

  onUse(ctx) {
    // Re-target an earlier shot? Heal a ship? Up to you.
    console.log("Bonus activated");
  },
};
```

### Pattern 2: RuleSet with Special Win Condition

```typescript
export const FirstBloodRuleSet: MatchRuleSet = {
  id: "first-blood",
  title: "First Blood",
  description: "First player to hit wins (for quick games)",

  decideTurn(attackResult, state): TurnDecision {
    const anyHit = attackResult.shots.some(s => s.hit && s.executed);
    if (anyHit) {
      return {
        shouldEndTurn: true,
        shouldToggleTurn: true,
        canShootAgain: false,
        reason: "First hit achieved",
      };
    }
    return {
      shouldEndTurn: true,
      shouldToggleTurn: true,
      canShootAgain: false,
      reason: "Turn ends",
    };
  },

  checkGameOver(state): GameOverDecision {
    // Game ends as soon as anyone lands a hit
    // This is the job decidedin decideTurn, so here we just check final condition
    return {
      isGameOver: false,
      winner: null,
    };
  },
};
```

### Pattern 3: Item with Turn Cost

```typescript
export const PowerUpItem: ItemTemplate = {
  id: "power-up",
  title: "Power Up",
  description: "Powerful effect but costs your turn",
  defaultCount: 1,

  onUse(ctx) {
    // Do something powerful
    console.log("Power up activated!");
  },
};

// Then implement decideTurnOnItemUse in your ruleset:
export const PowerRuleSet: MatchRuleSet = {
  // ... other methods ...

  decideTurnOnItemUse(isPlayerUse: boolean, state: GameEngineState): ItemUseTurnDecision {
    return {
      shouldToggleTurn: true,  // Cost: forfeit the rest of your turn
      reason: "Power-up item forfeit turn",
    };
  },
};
```

---

## Troubleshooting

### Issue: My custom RuleSet isn't working

- **Check:** Is it registered via `registerRuleSet()`?
- **Check:** Are all interface methods implemented?
- **Check:** Do `decideTurn` and `checkGameOver` handle all cases?
- **Hint:** Turn on machine logger (`machines/logger.ts`) to trace state transitions.

### Issue: Item handlers never fire

- **Check:** Are items placed on the board? (`engine.setPlayerItems()`)
- **Check:** Is the correct item template being used (not a copy)?
- **Check:** Do your shots hit the item cells?

### Issue: Perspective mismatch in ItemActionContext

- **Check:** `isPlayerShot` tells you whose perspective this is.
- **Check:** Use `SidePerspective` in `engine/perspective.ts` to get the right array.
- **Hint:** When `isPlayerShot=true`, the "player" side is the actor; flip indices accordingly.

---

## See Also
- [Development Guidelines](development-guidelines.md) \u2014 Strict code rules and patterns
- [Core v3 Architecture](core-v3-arch.md) \u2014 Architecture overview
- [Type Documentation](../src/core/types/) \u2014 Full type definitions
