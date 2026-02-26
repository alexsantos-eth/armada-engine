# Core v3 Architecture

A modular, extensible, and type-driven engine for turn-based, Battleship-inspired games. This version builds on v2, emphasizing clearer separation of concerns, improved extension points, and richer type documentation.

---

## Directory Overview

```
src/core/
├── constants/          # Immutable game data (board, ships, items, shot patterns)
├── types/              # TypeScript contracts (pure types, no runtime code)
├── tools/              # Pure utility functions (ship calculations, placement)
├── engine/             # Game logic, state machine, board builders, rulesets
│   ├── logic.ts        # IGameEngineReader + IGameEngine interfaces; GameEngine class
│   ├── board.ts        # Board projection functions (player/enemy views)
│   ├── errors.ts       # Typed error constants
│   ├── item.ts         # ItemActionContext builders for onCollect/onUse
│   ├── perspective.ts  # SidePerspective: player↔enemy field mapping
│   ├── match.ts        # Match class + createMatch factory (public API)
│   └── machines/       # XState state machine (matchMachine)
│       ├── match.ts    # Machine definition, guards, actions, states
│       ├── types.ts    # Context, event, input, callback types
│       ├── callbacks.ts# CallbackCoordinator (single callback dispatch)
│       └── index.ts    # Barrel + selectors
├── manager/            # GameInitializer: setup generation from config
│   ├── initializer.ts
│   └── index.ts
└── index.ts            # Public surface: re-exports for consumers
```

---

## Layer Responsibilities

### 1. `constants/` — Foundation Data
Read-only lookup tables. No business logic, no imports from other layers.
- `game.ts`: Board size limits, placement caps, thresholds
- `ships.ts`: Ship templates, `SHIP_TEMPLATES`, `createShip`
- `items.ts`: Item templates, `ITEM_TEMPLATES`
- `shots.ts`: Predefined hit patterns
- `rulesets.ts` Stateless objects implementing `MatchRuleSet`. Decide turn flow, game-over, and (optionally) item-use penalties. Swappable at runtime.

### 2. `types/` — Shared Contracts
Pure type declarations. Used by all layers, preventing circular dependencies. See each file for detailed type docs (e.g., `GameConfig`, `GameShip`, `Shot`, `BoardLayer`, `MatchRuleSet`).

### 3. `tools/` — Pure Utilities
Stateless functions for ship geometry, placement, and validation. No engine or machine imports. Safe for isolated testing and reuse.

### 4. `engine/logic.ts` — GameEngine (State & Computation)
Owns all mutable game state and exposes deterministic methods. Exports `IGameEngineReader` (read-only) and `IGameEngine` (read/write). Does not manage turn state or rulesets.

### 5. `engine/board.ts` — Board Projection
Pure functions to convert engine state into 2D board representations for rendering. Supports custom `BoardViewConfig` for flexible layer visibility.

### 6. `engine/errors.ts` — Typed Error Constants
Namespaced error objects for shot, plan, and attack errors. Used throughout the engine and state machine.

### 7. `engine/item.ts` — Item Context Builders
Constructs `ItemActionContext` for item lifecycle hooks. All player/enemy field mapping is delegated to `perspective.ts` for OCP compliance.

### 8. `engine/perspective.ts` — SidePerspective
Single definition point for all player↔enemy data pairs. Adding new resources only requires updating this file.

### 9. `engine/machines/` — matchMachine (XState)
Orchestrates game flow, state transitions, and event handling. Context holds engine, ruleset, turn, plan, and callback state.

### 10. `engine/match.ts` — Match + createMatch (Public API)
Imperative API for consumers. Hides XState, manages match lifecycle, and exposes key types and callbacks.

### 11. `manager/initializer.ts` — GameInitializer
Generates a ready-to-use `GameSetup` from partial config. Handles defaults, validation, and random placement.

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
                 MatchState (UI, consumers)
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

- **Turn state is machine-owned:** The engine is turn-agnostic for testability and multiplayer support.
- **Single callback dispatch:** All callbacks fire from one coordinator for deterministic ordering.
- **Pending ruleset flows through machine context:** Ensures engine remains stateless regarding flow control.
- **Match never holds engine state directly:** All reads go through the machine snapshot.
- **Read/write separation:** `IGameEngineReader` vs `IGameEngine` for explicit intent.
- **OCP for player↔enemy fields:** Only `perspective.ts` changes when adding new resources.

---

## See Also
- [Extension Guide v3](extension-guide-v3.md)
- [Type Documentation](../src/core/types/)
