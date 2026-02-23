# Core v2 Architecture

A layered, turn-based game engine for Battleship-style games.  
Each layer has a single, explicit responsibility and depends only on the layers below it.

---

## Directory overview

```
src/core/
├── constants/          # Immutable game data (board, ships, items, shot patterns)
├── types/              # Shared TypeScript contracts (no runtime code)
├── tools/              # Pure utility functions (ship calculations, placement)
├── engine/             # Game logic, state machine, board builders, rulesets
│   ├── logic.ts        # GameEngine — pure state + computation
│   ├── board.ts        # Board projection functions (player board, enemy board)
│   ├── errors.ts       # Typed error constants
│   ├── item.ts         # ItemActionContext builders for onCollect / onUse
│   ├── rulesets.ts     # Turn & game-over rule strategies
│   ├── match.ts        # Match — public imperative API facade
│   └── machines/       # XState state machine (matchMachine)
│       ├── match.ts    # Machine definition, guards, actions, states
│       ├── types.ts    # Context, event, input, callback types
│       ├── callbacks.ts# CallbackCoordinator (single callback dispatch point)
│       └── index.ts    # Barrel + selectors
├── manager/            # GameInitializer — setup generation from config
│   ├── initializer.ts
│   └── index.ts
└── index.ts            # Public surface — re-exports everything consumers need
```

---

## Layer responsibilities

### 1. `constants/` — Foundation data

Read-only lookup tables. No business logic, no imports from other layers.

| File | Contents |
|---|---|
| `game.ts` | Board size limits, placement attempt caps, random thresholds |
| `ships.ts` | Ship templates (`SMALL_SHIP` … `XLARGE_SHIP`), `SHIP_TEMPLATES`, `createShip` |
| `items.ts` | Item templates and `ITEM_TEMPLATES` |
| `shots.ts` | Predefined hit patterns (`SINGLE_SHOT`, `CROSS_SHOT`, `DIAGONAL_X_SHOT`, …) |

---

### 2. `types/` — Shared contracts

Pure type declarations. Imported by every other layer — no circular dependencies possible.

| File | Key types |
|---|---|
| `common.ts` | `GameShip`, `GameItem`, `Shot`, `Board`, `Cell`, `CellState`, `Winner`, `GameTurn`, `ItemActionContext` |
| `config.ts` | `GameConfig` (board dimensions, ship/item counts, initial turn, ruleset) |

---

### 3. `tools/ship/calculations.ts` — Pure utilities

Stateless functions for ship geometry and random placement.

- `getShipCellsFromShip` / `getShip2DCells` — derive occupied cells from a `GameShip`
- `isValidShipPlacement` — collision and boundary checks
- `generateShip` / `generateShips` — random placement with retry logic
- `generateItems` / `equalizeItemCounts` — random item placement

No engine or machine imports. Safe to test and reuse in isolation.

---

### 4. `engine/logic.ts` — GameEngine (pure state + computation)

The lowest runtime layer. Holds all mutable game state and exposes deterministic methods.

**Owns:**
- Ship arrays + position hash-maps (O(1) hit detection)
- Shot maps for both sides
- Item arrays, position maps, hit counters, collected-item sets, used-item sets
- `isGameOver`, `winner`, `boardWidth`, `boardHeight`, `shotCount`, `_version`

**Exposes:**
- `initializeGame(playerShips, enemyShips, playerItems?, enemyItems?)` — boot the game
- `executeShotPattern(x, y, pattern, isPlayerShot)` → `ShotPatternResult` — **only public mutation path for shots**
- `setPlayerShips / setEnemyShips / setPlayerItems / setEnemyItems` — direct state overrides (used by item handlers)
- `setPlayerShots / setEnemyShots` — atomic shot history replacement (replay / multiplayer sync)
- `markItemUsed / isItemUsed` — activation guard for `onUse` handlers
- `setGameOver(winner)` — called by `matchMachine` after the ruleset decides
- `getState()` → `GameEngineState` — immutable snapshot (turn-agnostic)
- `getVersion()` — monotonic counter for cheap change detection

**Does NOT own:**
- Whose turn it is — that belongs to `matchMachine`
- Ruleset decisions — that belongs to `rulesets.ts`
- Callbacks — that belongs to `machines/callbacks.ts`
- Board rendering — that belongs to `board.ts`

---

### 5. `engine/board.ts` — Board projection

Two pure functions that convert a `GameEngineState` snapshot into a 2-D `Board` for rendering. No engine reference held.

| Function | Purpose |
|---|---|
| `buildPlayerBoard(state)` | Player's own board — ships visible, enemy shots marked HIT/MISS |
| `buildEnemyBoard(state)` | Enemy board the player attacks — ships hidden, items and player shots shown |

---

### 6. `engine/errors.ts` — Typed error constants

Three namespaced constant objects. Each value is also a type via `as const` + type alias.

| Constant | Layer |
|---|---|
| `ShotError` | `GameEngine.executeShot` (internal) |
| `PlanError` | `matchMachine` guard / `setPlanError` action |
| `AttackError` | `Match.confirmAttack` |

---

### 7. `engine/rulesets.ts` — Rule strategies

Stateless objects implementing `MatchRuleSet`. They decide:

- **`decideTurn(attackResult, state)`** → `TurnDecision` — should the turn end? switch players? allow another shot?
- **`checkGameOver(state)`** → `GameOverDecision` — is the match over and who won?
- **`decideTurnOnItemUse?(isPlayerUse, state)`** → `ItemUseTurnDecision` — (optional) should activating an item cost the current player their turn?

**Built-in rulesets:**

| Name | Behaviour |
|---|---|
| `ClassicRuleSet` | Hit → shoot again; sunk or miss → turn switches |
| `AlternatingTurnsRuleSet` | Every shot ends the turn |
| `ItemHitRuleSet` | Item collected → shoot again; hit → shoot again; sunk or miss → turn switches |
| `LoseTurnOnUseRuleSet` | Classic rules + activating an item forfeits your turn |

`DefaultRuleSet` is aliased to `LoseTurnOnUseRuleSet`.

Rulesets are swappable at runtime via `Match.setRuleSet()` or from inside an item handler via `ctx.setRuleSet()`.

---

### 8. `engine/item.ts` — Item context builders

Two builder functions that construct an `ItemActionContext` for item lifecycle hooks:

| Function | Used in | Perspective |
|---|---|---|
| `buildCollectContext(engine, item, isPlayerShot, shot, …)` | `runCollectHandlers` action | Shooter's perspective (`ctx.playerShips` = shooter's ships) |
| `buildUseContext(engine, item, isPlayerShot, …)` | `useItem` action | Activator's perspective (swapped when enemy uses their item) |

The context provides read-only state snapshots and controlled write surfaces (`setPlayerShips`, `toggleTurn`, `setRuleSet`). Direct engine reference is never handed to item handlers.

---

### 9. `engine/machines/` — matchMachine (XState v5)

The game-flow orchestrator. Wraps `GameEngine` and drives all state transitions.

#### States

```
idle
  └─ INITIALIZE ──► active
                      ├─ planning          ← waiting for PLAN_SHOT or USE_ITEM
                      │    ├─ PLAN_SHOT (valid)  ──► planned
                      │    ├─ PLAN_SHOT (invalid) → stays in planning (sets planError)
                      │    └─ USE_ITEM ──► resolvingItemUse
                      ├─ planned           ← plan stored, awaiting confirmation
                      │    ├─ CONFIRM_ATTACK ──► attacking
                      │    ├─ CANCEL_PLAN ──► planning
                      │    └─ PLAN_SHOT ──► replaces plan
                      ├─ attacking         ← transient: executeAttack → runCollectHandlers
                      │    └─ (always) ──► resolvingTurn
                      ├─ resolvingTurn     ← transient: resolveTurn
                      │    ├─ (game over) ──► #match.gameOver
                      │    └─ (otherwise) ──► planning
                      └─ resolvingItemUse  ← transient: resolveItemUse
                           ├─ (game over) ──► #match.gameOver
                           └─ (otherwise) ──► planning
gameOver  (final)
```

#### Context (key fields)

| Field | Type | Owner |
|---|---|---|
| `engine` | `GameEngine` | Machine creates and holds reference |
| `ruleSet` | `MatchRuleSet` | Swappable via `SET_RULESET` or item handler |
| `currentTurn` | `GameTurn` | Machine — never stored in engine |
| `pendingPlan` | `PendingPlan \| null` | Set by `storePlan`, cleared by `executeAttack` |
| `lastAttackResult` | `ShotPatternResult \| null` | Populated by `executeAttack` |
| `lastTurnDecision` | `TurnDecision \| null` | Populated by `resolveTurn` |
| `planError` | `PlanError \| null` | Set by `setPlanError`, cleared on valid plan |
| `collectToggleCount` | `number` | Accumulated by `runCollectHandlers`, consumed by `resolveTurn` |
| `pendingRuleSet` | `MatchRuleSet \| null` | Captured from `ctx.setRuleSet()` inside handlers |

#### Turn cycle (attack path)

```
PLAN_SHOT
  └─ guard isValidPlan
       ├─ true  → storePlan → planned
       └─ false → setPlanError → stays in planning

CONFIRM_ATTACK
  └─ attacking
       ├─ entry: executeAttack       (step 1a — fires shots, stores lastAttackResult)
       ├─ entry: runCollectHandlers  (step 1b — runs onCollect, accumulates toggles)
       └─ always ──► resolvingTurn
            └─ entry: resolveTurn   (step 2 — applies toggles, asks ruleset, fires callbacks)
```

#### Item-use cycle

```
USE_ITEM (from planning)
  └─ useItem action
       └─ resolvingItemUse
            └─ entry: resolveItemUse  (applies toggles, checks game-over, fires callbacks)
```

---

### 10. `engine/machines/callbacks.ts` — CallbackCoordinator

Single function `fireMatchCallbacks(callbacks, engine, payload)` — the **only** place all match callbacks are fired.

Called once at the end of each game cycle:

| Cycle | Firing order |
|---|---|
| `attack` | `onItemCollected*` → `onShot` → `onTurnChange?` → `onGameOver?` → `onStateChange` |
| `itemUse` | `onItemUse?` → `onTurnChange?` → `onGameOver?` → `onStateChange` |
| `matchStart` | `onMatchStart` → `onStateChange` |
| `reset` | `onStateChange` |

Centralising dispatch here means adding a callback requires editing one function, not hunting across XState actions.

---

### 11. `engine/match.ts` — Match (public API facade)

The only class consumers should instantiate. Hides XState behind a simple imperative API.

**Responsibilities (only these):**
- Create and start the `matchMachine` actor
- Forward commands as events (`INITIALIZE`, `PLAN_SHOT`, `CONFIRM_ATTACK`, …)
- Read results from the latest machine snapshot

**Does NOT own:**
- Game logic — that lives in `GameEngine`
- Flow decisions — that lives in `matchMachine` + rulesets
- Turn decisions — that lives in `matchMachine` and rulesets
- Callbacks — that lives in `machines/callbacks.ts`

**Typical usage:**

```typescript
const match = new Match({
  setup: initializer.getGameSetup(),
  onStateChange: (state) => renderUI(state),
  onGameOver: (winner) => showEndScreen(winner),
});

match.initializeMatch();

// Single-step (plan + confirm in one call):
const result = match.planAndAttack(3, 4, true, CROSS_SHOT);

// Two-step (useful when the UI confirms before attacking):
const plan = match.planShot(3, 4, CROSS_SHOT, true);
if (plan.ready) {
  const result = match.confirmAttack();
}
```

Key exported types from this module: `MatchCallbacks`, `MatchQueryAPI`, `CellInfo`, `PlanShotResult`, `PlanAndAttackResult`, `MatchItemActionContext`.

---

### 12. `manager/initializer.ts` — GameInitializer

Generates a ready-to-use `GameSetup` from a `Partial<GameConfig>`. Handles:

- Default config values (board size, ship/item counts, initial turn)
- Config validation (board size bounds, ship density limits)
- Random ship placement via `generateShips`
- Random item placement via `generateItems` + `equalizeItemCounts`
- Random first-turn selection when `initialTurn === "random"`

```typescript
const setup = new GameInitializer({ boardWidth: 10, boardHeight: 10 }).getGameSetup();
// → { playerShips, enemyShips, playerItems, enemyItems, initialTurn, config }
```

---

## Data flow

```
GameConfig
    │
    ▼
GameInitializer ──► GameSetup
    │                    │
    │                    ▼
    └──────────► Match (creates matchMachine actor)
                    │
                    │  INITIALIZE ──► matchMachine
                    │                    │
                    │                    ▼
                    │              GameEngine.initializeGame()
                    │
                    │  planShot()  ──► PLAN_SHOT event
                    │                    │
                    │                    ▼ (if valid)
                    │              pendingPlan stored in context
                    │
                    │  confirmAttack() ──► CONFIRM_ATTACK event
                    │                         │
                    │               ┌──────────┴──────────┐
                    │               │                     │
                    │       executeAttack           runCollectHandlers
                    │    (engine.executeShotPattern)  (item.onCollect)
                    │               │                     │
                    │               └──────────┬──────────┘
                    │                          │
                    │                     resolveTurn
                    │              (ruleset.decideTurn,
                    │               ruleset.checkGameOver,
                    │               fireMatchCallbacks)
                    │
                    ▼
              MatchState (via getState() or onStateChange callback)
```

---

## Extension points

| What to extend | Where to add it |
|---|---|
| New shot pattern | `constants/shots.ts` — add to `SHOT_PATTERNS` |
| New ship template | `constants/ships.ts` — add to `SHIP_TEMPLATES` |
| New item template | `constants/items.ts` — add to `ITEM_TEMPLATES` |
| New ruleset | `engine/rulesets.ts` — implement `MatchRuleSet`, export, add to `getRuleSetByName` |
| New item behaviour | `GameItem.onCollect` / `GameItem.onUse` handlers — use `ItemActionContext` API |
| New match callback | `machines/types.ts` `MatchCallbacks` + `machines/callbacks.ts` `fireMatchCallbacks` |
| New machine event | `machines/types.ts` `MatchMachineEvent` + `machines/match.ts` state transitions |

---

## Design decisions

**Turn is owned by the machine, not the engine.**  
`GameEngine` is turn-agnostic on purpose — it only models positions and hits. Separating turn state from game state makes the engine trivially testable and reusable for gamemodes where turns are managed externally (e.g. multiplayer server).

**Single callback dispatch point.**  
`fireMatchCallbacks` is the only place callbacks fire. This makes callback ordering deterministic and auditable without tracing through multiple XState actions.

**Pending ruleset flows through machine context.**  
When an item handler calls `ctx.setRuleSet()`, the new ruleset is captured in `pendingRuleSet` on the machine context rather than in the engine. This keeps `GameEngine` free of flow-coordination state and respects the single-responsibility of each layer.

**`Match` never holds engine state directly.**  
All reads go through `this.actor.getSnapshot()`. This guarantees `Match` always reflects the machine's latest committed state rather than a stale local copy.
