# Core v3 Architecture

A modular, extensible, and type-driven engine for turn-based, Battleship-inspired games. This version builds on v2, emphasizing clearer separation of concerns, improved extension points, and richer type documentation.

---

## Directory Overview

```
src/core/
├── modes/              # Game mode definitions (entities and rules)
│   ├── classic/        # Classic battleship mode
│   │   └── entities/   # Ships, items, obstacles, shots, views, rulesets, game constants
│   ├── test/           # Test mode for unit tests
│   │   └── entities/   # Simplified entities for testing
│   └── index.ts        # Default game mode export
├── types/              # TypeScript contracts (pure types, no runtime code)
├── tools/              # Pure utility functions (ship calculations, placement, entity helpers)
├── engine/             # Game logic, board builders, error handling
│   ├── logic.ts        # IGameEngineReader + IGameEngine; GameEngine class (mutable state)
│   ├── board.ts        # Board projection functions (player/enemy views)
│   ├── errors.ts       # Typed error constants (shot, plan, attack errors)
│   ├── item.ts         # ItemActionContext builders for onCollect/onUse
│   ├── perspective.ts  # SidePerspective: player↔enemy field mapping
│   ├── match.ts        # Match class + createMatch factory (public API)
│   └── machines/       # XState state machine (matchMachine)
│       ├── match.ts    # Machine definition, guards, actions, states
│       ├── types.ts    # Context, event, input, callback types
│       ├── callbacks.ts# CallbackCoordinator (single callback dispatch)
│       ├── logger.ts   # Machine action logger for debugging
│       └── index.ts    # Barrel + selectors
├── manager/            # GameInitializer: setup generation from config
│   ├── initializer.ts
│   └── index.ts
├── tests/              # Test suite (mirrors src/core structure)
│   ├── engine/
│   ├── tools/
│   └── ...
└── index.ts            # Public surface: re-exports for consumers
```

---

## Layer Responsibilities

### 1. `modes/` — Game Mode Definitions
Defines complete game modes with all entities, rules, and defaults. Each mode is self-contained.

**Structure:**
- `modes/classic/` — Traditional battleship gameplay with full entity set
- `modes/test/` — Simplified mode for unit testing with minimal defaults
- Each mode contains `entities/` folder with:
  - `ships.ts`: Ship templates extending `ShipTemplate` interface
  - `items.ts`: Item templates extending `ItemTemplate` interface with handlers
  - `obstacles.ts`: Obstacle templates extending `ObstacleTemplate` interface
  - `shots.ts`: Predefined hit patterns implementing `ShotPattern`
  - `views.ts`: Board dimensions and layer visibility constraints
  - `rulesets.ts`: Immutable objects implementing `MatchRuleSet` (turn flow, game-over)
  - `game.ts`: Game constants (placement rules, thresholds, default counts)
  - `index.ts`: Exports complete `GameMode` object

**Benefits:**
- **Isolation:** Each mode defines its own entities without affecting others
- **Testability:** `TEST_MODE` provides predictable defaults for unit tests
- **Extensibility:** Add new modes without modifying existing ones
- **Reusability:** Share types and tools across all modes

**Pattern:** All templates extend `GameObject` (adds `defaultCount` to `GameEntity`). Game modes use `buildDefaultCounts()` helper to construct default entity counts from templates.

### 2. `types/` — Shared Contracts
Pure type declarations. Used by all layers, preventing circular dependencies. Key files:
- `entities.ts`: `GameEntity` (base interface with id, title, description), item/ship/obstacle contracts, `ItemActionContext`
- `constants.ts`: Template interfaces (`ShipTemplate`, `ItemTemplate`, `ObstacleTemplate`, `GameObject`)
- `modes.ts`: `GameMode`, `GameModeConstants`, `buildDefaultCounts()` helper
- `config.ts`: `GameConfig`, configuration types
- `engine.ts`: `GameEngineState`, `IGameEngine`, `IGameEngineReader` interfaces
- `shots.ts`: `Shot`, `ShotPattern`, `ShotPatternResult` types
- `rulesets.ts`: `MatchRuleSet`, `TurnDecision`, `GameOverDecision`, `ItemUseTurnDecision`
- `board.ts`: `BoardLayer`, `BoardView`, `BoardViewConfig`
- `machines.ts`: Machine context, event, and state types
- `callbacks.ts`: Callback type definitions for item handlers

### 3. `tools/` — Pure Utilities
Stateless, pure functions safe for isolated testing and reuse. No engine or machine imports.
- `ships.ts`: Ship placement, rotation, collision validation
- `items.ts`: Item positioning and collection checking
- `obstacles.ts`: Obstacle placement and blocking logic
- `shots.ts`: Shot pattern expansion and hit detection
- `constants.ts`: Entity set creation and template utilities
- `ship/calculations.ts`: Advanced ship geometry and boundary calculations

### 4. `engine/logic.ts` — GameEngine (State & Computation)
Owns all mutable game state and exposes deterministic methods. Exports `IGameEngineReader` (read-only) and `IGameEngine` (read/write). Does not manage turn state or rulesets.

### 5. `engine/board.ts` — Board Projection
Pure functions to convert engine state into 2D board representations for rendering. Supports custom `BoardViewConfig` for flexible layer visibility.

### 6. `engine/errors.ts` — Typed Error Constants
Namespaced error objects for deterministic error handling. Never throw; return errors in result objects.
- `ShotErrors`: Out-of-bounds, duplicate, invalid pattern
- `PlanErrors`: Invalid position, orientation, collision, out-of-bounds
- `AttackErrors`: Invalid state, missing plan
- **Pattern:** Used in result objects with `reason: string` for debugging

### 7. `engine/item.ts` — Item Context Builders
Constructs `ItemActionContext` for item lifecycle hooks. All player/enemy field mapping is delegated to `perspective.ts` for OCP compliance.

### 8. `engine/perspective.ts` — SidePerspective
Single definition point for all player↔enemy data pairs. Adding new resources only requires updating this file.

### 9. `engine/machines/` — matchMachine (XState)
Orchestrates game flow, state transitions, and event handling. XState v5 implementation.
- **match.ts**: Machine definition with guards, actions, and states
- **types.ts**: Typed machine context, events, and input
- **callbacks.ts**: `CallbackCoordinator` ensures single, deterministic callback dispatch
- **logger.ts**: Action logger for debugging machine transitions and state changes
- **Context:** Holds engine, ruleset, current turn, shot plan, and callbacks
- **States:** lobby, planning, attacking, resolving, game-over
- **Events:** planShot, confirmAttack, cancelPlan, toggleTurn, endGame

### 10. `engine/match.ts` — Match + createMatch (Public API)
Imperative API for consumers. Hides XState, manages match lifecycle, and exposes key types and callbacks.

### 11. `manager/initializer.ts` — GameInitializer
Generates a ready-to-use `GameSetup` from partial config and a game mode. Handles defaults, validation, and random placement.
- **Constructor:** `new GameInitializer(config?, initialTurn?, gameMode?)`
- **Method:** `getGameSetup()` → `GameSetup`
- **Defaults:** Uses values from the provided `GameMode` (defaults to `DEFAULT_GAME_MODE`)
- **Validation:** Checks board sizes, ship counts, item placement using mode's constants
- **Random placement:** Generates different layouts on each call for replayability
- **Game Mode Aware:** All entity IDs, counts, and rules come from the active game mode

---

## Data Flow

```
GameMode (classic/test/custom)
   ↓
GameConfig + GameMode
   ↓
GameInitializer → GameSetup (with mode's entities)
   ↓                ↓
   └────────────→ Match (creates matchMachine)
                        ↓
                 matchMachine (mode's ruleset)
                        ↓
                 GameEngine.initializeGame()
                        ↓
                 planShot() / confirmAttack()
                        ↓
                 executeAttack / runCollectHandlers
                        ↓
                 resolveTurn (mode's ruleset, callbacks)
                        ↓
                 MatchState (consumers)
```

---

## Extension Points

| What to extend           | Where to add it                                  |
|-------------------------|--------------------------------------------------|
| New game mode           | Create `modes/yourmode/` with `entities/` folder |
| New shot pattern (in mode) | `modes/yourmode/entities/shots.ts`            |
| New ship template (in mode) | `modes/yourmode/entities/ships.ts`           |
| New item template (in mode) | `modes/yourmode/entities/items.ts`           |
| New ruleset (in mode)   | `modes/yourmode/entities/rulesets.ts`            |
| New item behaviour      | `GameItem.onCollect` / `onUse` handlers in item template |
| New player↔enemy ctx    | `engine/perspective.ts` — add to `SidePerspective`|
| New match callback      | `machines/types.ts` + `machines/callbacks.ts`    |
| New machine event       | `machines/types.ts` + `machines/match.ts`        |
| Custom setup generation | Implement `IGameSetupProvider`                   |

**Creating a Custom Game Mode:**
1. Create `modes/mymode/entities/` folder
2. Define ships, items, obstacles, shots, views, rulesets, game constants
3. Export a `GameMode` object in `modes/mymode/index.ts`
4. Pass it to `GameInitializer` constructor

---

## Design Principles

- **Type-driven from the ground up:** Types define the contract; implementation follows.
- **Game Mode Architecture:** All entities (ships, items, obstacles, shots, views, rulesets) are scoped to game modes. No global constants.
- **GameEntity + GameObject pattern:** All identifiable objects extend `GameEntity`; templates extend `GameObject` (adds `defaultCount`).
- **Layered with no circular dependencies:** modes → types → tools → engine → machines → manager.
- **Mode isolation:** Each game mode is self-contained and can define different entities, rules, and defaults.
- **Turn state is machine-owned:** Engine is turn-agnostic for testability and multiplayer support.
- **Single callback dispatch:** All callbacks fire from `CallbackCoordinator` for deterministic ordering.
- **Engine owns all mutable state:** Match and machine read state via snapshots (`GameEngineState`).
- **Read/write separation:** `IGameEngineReader` vs `IGameEngine` for explicit intent.
- **OCP for player↔enemy fields:** Only `perspective.ts` changes when adding new resources.
- **Immutability by default:** All mode entities frozen; state captured in snapshots; no mutation after creation.
- **Deterministic result objects:** No thrown errors in game logic; errors returned with `reason` strings.
- **Logger for debugging:** Machine actions logged by `machines/logger.ts` for state transition tracing.

---

## Recent Changes (v3.2+)

- **Game Mode Architecture:** Replaced global `constants/` with mode-based entity system (`modes/classic/`, `modes/test/`)
- **GameMode Interface:** New `GameMode` type defines ships, items, obstacles, shots, views, rulesets, and constants
- **Mode-Aware Initializer:** `GameInitializer` now accepts a `GameMode` parameter for flexible configuration
- **Test Mode:** Dedicated `TEST_MODE` for unit tests with simplified entities and zero defaults
- **buildDefaultCounts():** Helper function to generate default counts from template arrays
- **GameEntity & GameObject:** Unified metadata pattern for all templates (ships, items, obstacles, rulesets)
- **Machine Logger:** Added `machines/logger.ts` for debugging state transitions
- **Standard RuleSet Methods:** All rulesets now follow consistent interface (`decideTurn`, `checkGameOver`)
- **Improved Error Handling:** Typed error constants with `reason` strings
- **Game Entity Tools:** New `tools/constants.ts` for entity set creation and validation

---

## See Also
- [Development Guidelines](development-guidelines.md) — Strict coding rules and patterns
- [Extension Guide v3](extension-guide-v3.md) — How to extend the engine
- [Test Coverage](../src/core/tests/) — Unit tests mirroring src structure
