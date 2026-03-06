# Core v3 Architecture

A modular, extensible, and type-driven engine for turn-based, Battleship-inspired games. This version builds on v2, emphasizing clearer separation of concerns, improved extension points, and richer type documentation.

---

## Directory Overview

```
src/core/
├── constants/          # Immutable game data (board, ships, items, shot patterns, rulesets)
├── types/              # TypeScript contracts (pure types, no runtime code)
├── tools/              # Pure utility functions (ship calculations, placement, entity helpers)
├── engine/             # Game logic, board builders, error handling
│   ├── logic.ts        # IGameEngineReader + IGameEngine; GameEngine class (mutable state)
│   ├── board.ts        # Board projection functions (player/enemy views)
│   ├── errors.ts       # Typed error constants (shot, plan, attack errors)
│   ├── item.ts         # ItemActionContext builders for onCollect/onUse
│   ├── perspective.ts  # SidePerspective: player↔enemy field mapping
│   ├── match.ts        # Match class + createMatch factory (public API)
│   ├── rulesets.ts     # RuleSet registration & utilities
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

### 1. `constants/` — Foundation Data
Read-only lookup tables. No business logic, no imports from other layers.
- `game.ts`: Board size limits, placement caps, thresholds
- `ships.ts`: Ship templates extending `ShipTemplate` interface
- `items.ts`: Item templates extending `ItemTemplate` interface with handlers
- `obstacles.ts`: Obstacle templates extending `ObstacleTemplate` interface
- `shots.ts`: Predefined hit patterns implementing `ShotPattern`
- `views.ts`: Default board dimensions and constraints
- `rulesets.ts`: Immutable objects implementing `MatchRuleSet`. Decide turn flow, game-over, and (optionally) item-use penalties. Swappable at runtime.
- **Pattern:** All templates extend `GameObject` (adds `defaultCount` to `GameEntity`)

### 2. `types/` — Shared Contracts
Pure type declarations. Used by all layers, preventing circular dependencies. Key files:
- `entities.ts`: `GameEntity` (base interface with id, title, description), item/ship/obstacle contracts, `ItemActionContext`
- `constants.ts`: Template interfaces (`ShipTemplate`, `ItemTemplate`, `ObstacleTemplate`, `GameObject`)
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
Generates a ready-to-use `GameSetup` from partial config. Handles defaults, validation, and random placement.
- **Method:** `generate()` → `GameSetup`
- **Defaults:** Uses constants like `BOARD_DEFAULT_WIDTH`, `SHIP_TEMPLATES`, `ITEM_TEMPLATES`
- **Validation:** Checks board sizes, ship counts, item placement
- **Random placement:** Surfaces `randomSeed` for deterministic testing

---

## Data Flow

```
GameConfig
   ↓
GameInitializer → GameSetup
   ↓                ↓
   └────────────→ Match (creates matchMachine)
                        ↓
                 matchMachine
                        ↓
                 GameEngine.initializeGame()
                        ↓
                 planShot() / confirmAttack()
                        ↓
                 executeAttack / runCollectHandlers
                        ↓
                 resolveTurn (ruleset, callbacks)
                        ↓
                 MatchState (consumers)
```

---

## Extension Points

| What to extend           | Where to add it                                  |
|-------------------------|--------------------------------------------------|
| New shot pattern        | `constants/shots.ts` — add to `SHOT_PATTERNS`    |
| New ship template       | `constants/ships.ts` — add to `SHIP_TEMPLATES`   |
| New item template       | `constants/items.ts` — add to `ITEM_TEMPLATES`   |
| New ruleset             | `constants/rulesets.ts` — implement & export        |
| New item behaviour      | `GameItem.onCollect` / `onUse` handlers          |
| New player↔enemy ctx    | `engine/perspective.ts` — add to `SidePerspective`|
| New match callback      | `machines/types.ts` + `machines/callbacks.ts`    |
| New machine event       | `machines/types.ts` + `machines/match.ts`        |
| Custom setup generation | Implement `IGameSetupProvider`                   |

---

## Design Principles

- **Type-driven from the ground up:** Types define the contract; implementation follows.
- **GameEntity + GameObject pattern:** All identifiable objects extend `GameEntity`; templates extend `GameObject` (adds `defaultCount`).
- **Layered with no circular dependencies:** constants → types → tools → engine → machines → manager.
- **Turn state is machine-owned:** Engine is turn-agnostic for testability and multiplayer support.
- **Single callback dispatch:** All callbacks fire from `CallbackCoordinator` for deterministic ordering.
- **Engine owns all mutable state:** Match and machine read state via snapshots (`GameEngineState`).
- **Read/write separation:** `IGameEngineReader` vs `IGameEngine` for explicit intent.
- **OCP for player↔enemy fields:** Only `perspective.ts` changes when adding new resources.
- **Immutability by default:** Constants frozen; state captured in snapshots; no mutation after creation.
- **Deterministic result objects:** No thrown errors in game logic; errors returned with `reason` strings.
- **Logger for debugging:** Machine actions logged by `machines/logger.ts` for state transition tracing.

---

## Recent Changes (v3.1+)

- **GameEntity & GameObject:** Unified metadata pattern for all templates (ships, items, obstacles, rulesets)
- **Machine Logger:** Added `machines/logger.ts` for debugging state transitions
- **Standard RuleSet Methods:** All rulesets now follow consistent interface
- **Improved Error Handling:** Typed error constants with `reason` strings
- **Game Entity Tools:** New `tools/constants.ts` for entity set creation and validation

---

## See Also
- [Development Guidelines](development-guidelines.md) — Strict coding rules and patterns
- [Extension Guide v3](extension-guide-v3.md) — How to extend the engine
- [Test Coverage](../src/core/tests/) — Unit tests mirroring src structure
