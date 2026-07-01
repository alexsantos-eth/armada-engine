# Armada Engine → TCG (Trading Card Game) Transformation

> [!IMPORTANT]
> **This document is the single source of truth for the TCG transformation.**
> Every phase is self-contained and ordered by dependency. An AI agent must execute phases **sequentially** (Phase 1 before Phase 2, etc.). Each phase lists every file to create, modify, or delete, the exact code to write, and the test commands to run before proceeding to the next phase.

---

## Design Decisions (Locked)

These decisions were approved by the project owner and must not be changed without explicit approval.

| # | Decision | Resolution |
|---|---|---|
| **D1** | Classic mode | **Replace** — TCG becomes the only mode. Delete `modes/classic/` entirely. |
| **D2** | Card complexity | **Simple** — cards have `cardType` + `energyCost` + optional `hp`/`atk` for creatures. No rarities. No synergies. |
| **D3** | Trading / Collection | **No** — gameplay mechanics only. Deferred to a future iteration. |
| **D4** | State architecture | **Extend `GameEngineState` directly** — deck/hand/discard/energy fields added inline. |
| **D5** | Base card count | **~15–20 cards** split across attack, skill, defense, trap types. |
| **D6** | Board size | **7×7** — used to represent 1 active unit (Commander) and up to 3 benched creatures. |
| **D7** | Commander system | **Yes** — each player picks a commander with a unique passive. 2 commanders for v1. |
| **D8** | Attack cards vs `planShot` | **Replace** — `planShot` is not exposed in TCG mode. Attacks only through cards. |
| **D9** | Deck composition | **Customizable** — players choose cards from the mode's catalog before the match (deck-building). |
| **D10** | Energy system | **Start at 3**, +1 max per turn, refill to max each turn. |
| **D11** | Initial hand size | **5 cards**. |
| **D12** | Bench Limit | **Max 3 creatures** — players can have up to 3 creatures on the bench. |
| **D13** | Cards per turn (Main Phase) | **Unlimited** — as many skill/defense/trap cards as energy allows. |
| **D14** | Attack cards per turn | **Unlimited** — as many attack cards as energy allows. |
| **D15** | Empty deck | **No penalty** — just stop drawing, play with remaining hand. |
| **D16** | Commander passives | Bonus energy, extra draw, attack boost, defense boost, card discount. |
| **D17** | Rarity type | **Removed entirely** — `CardRarity` does not exist. |

---

## Current Architecture Reference

### Core Layers

| Layer | Path | Responsibility |
|---|---|---|
| **types/** | [types/](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types) (15 files) | All interfaces, type aliases, and error constants. Zero runtime logic. |
| **engine/** | [engine/](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/engine) | Stateless compute (board, logic, perspective) + XState state machine (machines/) + high-level `Match` API. |
| **manager/** | [manager/](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/manager) | `GameInitializer` — generates a `GameSetup` from config + mode. |
| **tools/** | [tools/](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/tools) | Pure-function utilities for ships, items, obstacles, shots, constants, modes, and views. |
| **modes/** | [modes/](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/modes) | Mode definitions. Currently only `classic/`. |

### Key Interfaces (with file locations)

| Interface | File | Line Range | Purpose |
|---|---|---|---|
| `GameEntity` | [entities.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/entities.ts#L344-L352) | 344–352 | Base type with `id?`, `title?`, `description?`. |
| `GameObject` | [constants.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/constants.ts#L33-L36) | 33–36 | Extends `GameEntity` + `defaultCount: number`. |
| `GameShip` | [entities.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/entities.ts#L284-L303) | 284–303 | `coords`, `width × height`, `onDestroy?`. |
| `GameItem` | [entities.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/entities.ts#L238-L262) | 238–262 | `coords`, `part`, `onCollect?`, `onUse?`. |
| `GameObstacle` | [entities.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/entities.ts#L270-L278) | 270–278 | `coords`, `width`, `height`. Indestructible. |
| `ShotPattern` | [shots.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/shots.ts#L85-L88) | 85–88 | `offsets: ShotOffset[]`. Reusable multi-cell template. |
| `ItemActionContext` | [entities.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/entities.ts#L18-L213) | 18–213 | 30+ mutation methods (`addPlayerShip`, `toggleTurn`, `setRuleSet`, etc.). |
| `MatchRuleSet` | [rulesets.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/rulesets.ts#L55-L88) | 55–88 | `decideTurn()`, `checkGameOver()`, `decideTurnOnItemUse?()`. |
| `GameMode` | [modes.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/modes.ts#L44-L89) | 44–89 | Ships, items, obstacles, shotPatterns, boardView, constants, ruleSet, defaultCounts. |
| `GameEngineState` | [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts#L222-L286) | 222–286 | Immutable snapshot of the entire engine state. |
| `SideState` | [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts#L27-L54) | 27–54 | Internal mutable state per side (ships, items, obstacles, maps). |
| `IGameEngine` | [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts#L127-L210) | 127–210 | Write interface for the engine (initializeGame, executeShotPattern, etc.). |
| `IGameEngineReader` | [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts#L62-L114) | 62–114 | Read-only interface (getState, isCellShot, etc.). |
| `MatchMachineContext` | [machines.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/machines.ts#L196-L322) | 196–322 | XState actor context (engine, ruleSet, boardView, currentTurn, pendingPlan, etc.). |
| `MatchMachineEvent` | [machines.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/machines.ts#L482-L491) | 482–491 | Union of all 9 machine events. |
| `IMatch` | [match.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/match.ts#L242-L367) | 242–367 | Full read-write match API. |
| `MatchQueryAPI` | [match.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/match.ts#L88-L223) | 88–223 | Read-only match API. |
| `GameSetup` | [manager.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/manager.ts#L26-L49) | 26–49 | All initial values to start a game. |
| `GameConfig` | [config.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/config.ts#L35-L80) | 35–80 | Board view, ship/item/obstacle counts, shot pattern IDs, ruleSet. |
| `GameModeConstants` | [modes.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/modes.ts#L9-L35) | 9–35 | SHIPS, ITEMS, OBSTACLES, GAME_LOGIC, BOARD constants. |

### Test Coverage Baseline

- **352 tests** across **16 test files**, all passing.
- **100% coverage** on statements, branches, functions, and lines.
- Command: `npm run test:coverage`

---

## Phase 1: New Card & Commander Types

**Goal:** Create the foundational type interfaces for cards and commanders. Zero runtime logic. Types only.

**Dependency:** None. This is the first phase.

**Validation:** `npx tsc --noEmit` must pass. No tests needed yet (no runtime code).

### Step 1.1: Create `src/core/types/cards.ts`

**File:** [NEW] `src/core/types/cards.ts`

**What to write — the complete file contents:**

```typescript
import type { GameEntity, ItemActionContext } from "./entities";
import type { GameObject } from "./constants";

/** Available card types in the TCG system */
export type CardType = "attack" | "skill" | "defense" | "trap" | "creature";

/**
 * A game card.
 *
 * Cards are the primary action mechanism in TCG mode. Each card has an
 * energy cost and a type that determines when it can be played within
 * the turn structure (Main Phase vs Attack Phase).
 *
 * - `attack`: triggers a `ShotPattern` on the enemy board. Played during Attack Phase.
 * - `skill`: executes an `onPlay` effect (heal, reveal, draw, etc.). Played during Main Phase.
 * - `defense`: places obstacles or modifies the player's board. Played during Main Phase.
 * - `trap`: places a hidden item with an `onCollect` trigger. Played during Main Phase.
 */
export interface Card extends GameEntity {
  /** Determines when and how this card can be played */
  cardType: CardType;
  /** Energy cost to play this card. Must be ≥ 0. */
  energyCost: number;
  /** Health Points (HP) for creature cards. */
  hp?: number;
  /** Attack Power (ATK) for creature cards. */
  atk?: number;
  /**
   * ID of the `ShotPattern` this card triggers (attack cards only).
   * Must reference a valid pattern ID from the mode's `shotPatterns` array.
   * Ignored for non-attack cards.
   */
  shotPatternId?: string;
  /**
   * Effect executed when the card is played.
   * For attack cards, this runs BEFORE the shot pattern is applied.
   * For skill/defense/trap cards, this IS the card's entire effect.
   */
  onPlay?: (ctx: CardActionContext) => void;
  /**
   * Guard: returns `true` if this card can be played given the current state.
   * When absent, the card is always playable (if energy allows).
   * The engine checks this BEFORE deducting energy.
   */
  canPlay?: (ctx: CardActionContext) => boolean;
}

/**
 * Template for defining cards within a game mode's card catalog.
 * `defaultCount` controls how many copies of this card are included
 * when building a default deck.
 */
export interface CardTemplate extends Card, GameObject {}

/**
 * Context injected into card `onPlay` and `canPlay` handlers.
 *
 * Extends `ItemActionContext` to inherit all 30+ board mutation methods
 * (addPlayerShip, deleteEnemyItem, setBoardViewEnemySide, toggleTurn,
 * setRuleSet, etc.) without duplication. Adds card-specific operations.
 */
export interface CardActionContext extends ItemActionContext {
  /** The card being played */
  card: Card;
  /** Draw N cards from the active player's deck to their hand. Returns the drawn cards. Empty array if deck is empty. */
  drawCards: (count: number) => Card[];
  /** Discard cards from the active player's hand by their IDs */
  discardCards: (cardIds: string[]) => void;
  /** Current energy of the active player */
  currentEnergy: number;
  /** Maximum energy of the active player */
  maxEnergy: number;
}
```

### Step 1.2: Create `src/core/types/commanders.ts`

**File:** [NEW] `src/core/types/commanders.ts`

**What to write — the complete file contents:**

```typescript
import type { GameEntity } from "./entities";
import type { GameEngineState } from "./engine";
import type { GameTurn } from "./game";

/**
 * The phase of a TCG turn where a commander passive can trigger.
 *
 * - `"draw"`: at the start of the turn, before the player draws.
 * - `"main"`: at the start of the main phase, before any cards are played.
 * - `"attack"`: at the start of the attack phase, before any attack card is played.
 * - `"end"`: at the end of the turn, after all actions are resolved.
 * - `"always"`: a persistent passive that modifies constants (e.g., card cost reduction).
 */
export type CommanderPassiveTrigger = "draw" | "main" | "attack" | "end" | "always";

/**
 * Context passed to a commander's passive ability callback.
 */
export interface CommanderPassiveContext {
  /** Current engine state snapshot */
  state: GameEngineState;
  /** Which side this commander belongs to */
  isPlayer: boolean;
  /** Current turn */
  currentTurn: GameTurn;
  /** Current energy of this commander's player */
  currentEnergy: number;
  /** Maximum energy of this commander's player */
  maxEnergy: number;
  /** Mutator: set the player's energy */
  setEnergy: (amount: number) => void;
  /** Mutator: set the player's max energy */
  setMaxEnergy: (amount: number) => void;
  /** Mutator: draw cards for this commander's player */
  drawCards: (count: number) => void;
}

/**
 * A commander (hero) that each player selects before the match.
 * Each commander has a unique passive ability that triggers at
 * a specific turn phase.
 *
 * For v1, there are exactly 2 commanders.
 */
export interface Commander extends GameEntity {
  /** Required. Unique string identifier. */
  id: string;
  /** Required. Display name. */
  title: string;
  /** Required. Flavor text or ability description. */
  description: string;
  /** When this passive triggers during the turn */
  passiveTrigger: CommanderPassiveTrigger;
  /** The passive ability effect */
  passiveAbility: (ctx: CommanderPassiveContext) => void;
}
```

### Step 1.3: Update `src/core/types/index.ts`

**Modification:** Add barrel exports for the two new type files. Append these lines:

```typescript
export * from "./cards";
export * from "./commanders";
```

### Step 1.4: Validate

Run: `npx tsc --noEmit`

**Expected:** No errors. All new types are structurally compatible with existing ones.

---

## Phase 2: Extend Engine State for Cards & Energy

**Goal:** Add deck, hand, discard, energy, and commander fields to the internal engine state (`SideState`), the public snapshot (`GameEngineState`), and the engine interfaces (`IGameEngine`, `IGameEngineReader`).

**Dependency:** Phase 1 (card and commander types must exist).

**Validation:** `npx tsc --noEmit` must pass. Then write and run tests for the new engine methods.

### Step 2.1: Modify `SideState` in [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts)

**File:** [MODIFY] `src/core/types/engine.ts`

**Where:** Inside the `SideState` interface (after line 53, before the closing `}`).

**Append these fields:**

```typescript
  /** Cards remaining in the deck (draw pile), ordered top-to-bottom. */
  deck: Card[];
  /** Cards currently in the player's hand. */
  hand: Card[];
  /** Cards that have been played or discarded (graveyard). */
  discard: Card[];
  /** Current energy available to spend this turn. */
  energy: number;
  /** Maximum energy. Increases by 1 each turn. Starts at 3. */
  maxEnergy: number;
```

**Also add the import at the top of the file:**

```typescript
import type { Card } from "./cards";
```

### Step 2.2: Modify `GameEngineState` in [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts)

**Where:** Inside the `GameEngineState` interface (after line 285, before the closing `}`).

**Append these fields:**

```typescript
  /** Cards remaining in the player's deck. */
  readonly playerDeck: readonly Card[];
  /** Cards currently in the player's hand. */
  readonly playerHand: readonly Card[];
  /** Cards the player has played or discarded. */
  readonly playerDiscard: readonly Card[];
  /** Player's current energy. */
  readonly playerEnergy: number;
  /** Player's max energy. */
  readonly playerMaxEnergy: number;

  /** Cards remaining in the enemy's deck. */
  readonly enemyDeck: readonly Card[];
  /** Cards currently in the enemy's hand. */
  readonly enemyHand: readonly Card[];
  /** Cards the enemy has played or discarded. */
  readonly enemyDiscard: readonly Card[];
  /** Enemy's current energy. */
  readonly enemyEnergy: number;
  /** Enemy's max energy. */
  readonly enemyMaxEnergy: number;
```

### Step 2.3: Modify `IGameEngineReader` in [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts)

**Where:** Inside the `IGameEngineReader` interface (after line 113, before the closing `}`).

**Append these methods:**

```typescript
  /** Returns the cards in the specified player's hand. */
  getHand(isPlayer: boolean): readonly Card[];
  /** Returns the cards remaining in the specified player's deck. */
  getDeck(isPlayer: boolean): readonly Card[];
  /** Returns the cards in the specified player's discard pile. */
  getDiscard(isPlayer: boolean): readonly Card[];
  /** Returns the current and max energy for the specified player. */
  getEnergy(isPlayer: boolean): { current: number; max: number };
```

### Step 2.4: Modify `IGameEngine` in [engine.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/engine.ts)

**Where:** Inside the `IGameEngine` interface (after line 209, before the closing `}`).

**Append these methods:**

```typescript
  /**
   * Move N cards from the top of the deck to the hand.
   * If the deck has fewer than N cards, draw all remaining (Decision D15: no penalty).
   * Returns the cards that were drawn (may be fewer than `count`).
   */
  drawCards(count: number, isPlayer: boolean): Card[];
  /**
   * Remove a card from the hand by its `id` and move it to the discard pile.
   * Returns the card if found, `undefined` if the card ID is not in the hand.
   */
  playCard(cardId: string, isPlayer: boolean): Card | undefined;
  /** Move specific cards from the hand to the discard pile by their IDs. */
  discardCards(cardIds: string[], isPlayer: boolean): void;
  /** Set the current energy for a player. */
  setEnergy(amount: number, isPlayer: boolean): void;
  /** Set the max energy for a player. */
  setMaxEnergy(amount: number, isPlayer: boolean): void;
  /** Replace the entire deck for a player. */
  setDeck(cards: Card[], isPlayer: boolean): void;
  /** Replace the entire hand for a player. */
  setHand(cards: Card[], isPlayer: boolean): void;
```

### Step 2.5: Implement in `GameEngine` class

**File:** [MODIFY] `src/core/engine/logic.ts`

**What to do:**

1. Update `createSideState()` to initialize `deck: []`, `hand: []`, `discard: []`, `energy: 3`, `maxEnergy: 3`.
2. Update the `getState()` method to include the new card/energy fields in the snapshot.
3. Update `resetGame()` to clear card/energy state.
4. Implement each new method (`drawCards`, `playCard`, `discardCards`, `setEnergy`, `setMaxEnergy`, `setDeck`, `setHand`) as simple array operations on `SideState`.

**Implementation rules for each method:**

- `drawCards(count, isPlayer)`: `splice(0, count)` from `side.deck`, `push()` to `side.hand`. Return the spliced cards.
- `playCard(cardId, isPlayer)`: `findIndex` in `side.hand` by `card.id === cardId`. If found, `splice` it out, `push` to `side.discard`, return the card. If not found, return `undefined`.
- `discardCards(cardIds, isPlayer)`: for each ID, find and remove from `side.hand`, push to `side.discard`.
- `setEnergy(amount, isPlayer)`: `side.energy = amount`.
- `setMaxEnergy(amount, isPlayer)`: `side.maxEnergy = amount`.
- `setDeck(cards, isPlayer)`: `side.deck = [...cards]`.
- `setHand(cards, isPlayer)`: `side.hand = [...cards]`.

### Step 2.6: Write Tests

**File:** [MODIFY] `src/core/engine/logic.test.ts`

**Add test cases for:**

- `drawCards`: draws correct number, updates deck and hand, draws fewer when deck is small, draws zero from empty deck.
- `playCard`: removes card from hand, adds to discard, returns card. Returns `undefined` for unknown ID.
- `discardCards`: removes multiple cards from hand.
- `setEnergy` / `setMaxEnergy`: sets correct values.
- `setDeck` / `setHand`: replaces arrays.
- `getState()` includes all new fields correctly.
- `resetGame()` clears all card/energy state.
- `getHand`, `getDeck`, `getDiscard`, `getEnergy` reader methods return correct data.

### Step 2.7: Validate

Run: `npm run test:coverage`

**Expected:** All tests pass, 100% coverage maintained.

---

## Phase 3: Commander Type Extensions

**Goal:** Wire commander into `GameMode`, `GameSetup`, `GameModeConstants`, and `MatchMachineContext`.

**Dependency:** Phase 1 (commander type must exist), Phase 2 (engine state extensions).

**Validation:** `npx tsc --noEmit` must pass.

### Step 3.1: Modify `GameMode` in [modes.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/modes.ts)

**Where:** Inside the `GameMode` interface (after the `ruleSet` field, line 88).

**Append:**

```typescript
  /** Card templates available in this mode. Empty array for non-TCG modes. */
  cards: CardTemplate[];

  /** Commander options available in this mode. Empty array if no commander system. */
  commanders: Commander[];
```

**Add imports at the top:**

```typescript
import type { CardTemplate } from "./cards";
import type { Commander } from "./commanders";
```

### Step 3.2: Modify `GameModeConstants` in [modes.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/modes.ts)

**Where:** Inside the `GameModeConstants` interface (after the `BOARD` field, line 34).

**Append:**

```typescript
  CARDS: {
    /** Size of the starting deck */
    DECK_SIZE: number;
    /** Number of cards drawn at match start */
    INITIAL_HAND_SIZE: number;
    /** Cards drawn per turn during the Draw Phase */
    DRAW_PER_TURN: number;
    /** Starting energy at match start */
    INITIAL_ENERGY: number;
    /** Starting max energy at match start */
    INITIAL_MAX_ENERGY: number;
    /** Max energy gained per turn */
    ENERGY_GROWTH_PER_TURN: number;
  };
```

### Step 3.3: Modify `GameSetup` in [manager.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/manager.ts)

**Where:** Inside the `GameSetup` interface (after `gameMode?`, line 48).

**Append:**

```typescript
  /** Player's starting deck (shuffled, after hand draw). */
  playerDeck?: Card[];
  /** Player's starting hand (drawn from deck). */
  playerHand?: Card[];
  /** Enemy's starting deck (shuffled, after hand draw). */
  enemyDeck?: Card[];
  /** Enemy's starting hand (drawn from deck). */
  enemyHand?: Card[];
  /** Starting energy for both players. Default: 3. */
  initialEnergy?: number;
  /** Starting max energy for both players. Default: 3. */
  initialMaxEnergy?: number;
  /** Player's selected commander. */
  playerCommander?: Commander;
  /** Enemy's selected commander. */
  enemyCommander?: Commander;
```

**Add imports at the top:**

```typescript
import type { Card } from "./cards";
import type { Commander } from "./commanders";
```

### Step 3.4: Modify `MatchMachineContext` in [machines.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/machines.ts)

**Where:** Inside the `MatchMachineContext` interface (after `useToggleCount`, line 314).

**Append:**

```typescript
  /** The player's selected commander, or `null` if no commander system. */
  playerCommander: Commander | null;

  /** The enemy's selected commander, or `null` if no commander system. */
  enemyCommander: Commander | null;
```

**Add import at the top:**

```typescript
import type { Commander } from "./commanders";
```

### Step 3.5: Validate

Run: `npx tsc --noEmit`

**Expected:** Compilation errors will appear in `modes/classic/index.ts` because `GameMode` now requires `cards` and `commanders` fields. **This is expected** — Classic mode will be deleted in Phase 5. For now, temporarily add empty arrays to satisfy the type checker, or skip this validation and proceed to Phase 4–5.

---

## Phase 4: New Machine Events

**Goal:** Define the 3 new XState events (`DRAW_CARD`, `PLAY_CARD`, `DISCARD_CARD`) and update the event union.

**Dependency:** Phase 1 (card types).

**Validation:** `npx tsc --noEmit` must pass.

### Step 4.1: Add event interfaces to [machines.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/machines.ts)

**Where:** After the `SyncShotsEvent` interface (after line 473).

**Add these 3 interfaces:**

```typescript
/**
 * Draws cards from the deck to the hand during the Draw Phase.
 * If the deck has fewer cards than `count`, draws all remaining (D15: no penalty).
 */
export interface DrawCardEvent {
  readonly type: "DRAW_CARD";
  /** Number of cards to draw. Default: 1. */
  count: number;
  /** Which side draws. */
  isPlayerDraw: boolean;
}

/**
 * Plays a card from the hand.
 *
 * - For attack cards: `targetX` and `targetY` are REQUIRED (the shot center).
 * - For skill/defense/trap cards: `targetX` and `targetY` are optional
 *   (some effects need a board position, others don't).
 *
 * The machine will:
 * 1. Check `card.canPlay(ctx)` guard (if defined).
 * 2. Deduct `card.energyCost` from the active player's energy.
 * 3. Move the card from hand to discard.
 * 4. Execute `card.onPlay(ctx)`.
 * 5. For attack cards: resolve the `shotPatternId` at `(targetX, targetY)`.
 */
export interface PlayCardEvent {
  readonly type: "PLAY_CARD";
  /** The `id` of the card in the player's hand. */
  cardId: string;
  /** Which side is playing. */
  isPlayerPlay: boolean;
  /** Target board column (0-based). Required for attack cards. */
  targetX?: number;
  /** Target board row (0-based). Required for attack cards. */
  targetY?: number;
}

/**
 * Discards cards from the hand to the discard pile.
 * Used for voluntary discarding or end-of-turn cleanup.
 */
export interface DiscardCardEvent {
  readonly type: "DISCARD_CARD";
  /** IDs of cards to discard from the hand. */
  cardIds: string[];
  /** Which side is discarding. */
  isPlayerDiscard: boolean;
}
```

### Step 4.2: Update `MatchMachineEvent` union

**Where:** The `MatchMachineEvent` type alias (line 482).

**Replace it with:**

```typescript
export type MatchMachineEvent =
  | InitializeEvent
  | PlanShotEvent
  | ConfirmAttackEvent
  | CancelPlanEvent
  | SetRulesetEvent
  | ResetEvent
  | UseItemEvent
  | SyncTurnEvent
  | SyncShotsEvent
  | DrawCardEvent
  | PlayCardEvent
  | DiscardCardEvent;
```

### Step 4.3: Add new result types to [match.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/match.ts)

**Where:** After the `PlanAndAttackResult` interface (after line 476).

**Add:**

```typescript
/**
 * Result of playing a card via `IMatch.playCard()`.
 */
export interface PlayCardResult {
  /** `true` when the card was successfully played. */
  success: boolean;
  /** Error message when `success` is `false`. */
  error?: string;
  /** The card that was played (present when `success` is `true`). */
  card?: Card;
  /** If this was an attack card, the result of the shot pattern execution. */
  attackResult?: ShotPatternResult;
  /** Energy remaining after playing the card. */
  energyRemaining?: number;
}
```

### Step 4.4: Validate

Run: `npx tsc --noEmit`

**Expected:** No errors.

---

## Phase 5: Delete Classic Mode & Create TCG Mode

**Goal:** Remove `modes/classic/` entirely. Create `modes/tcg/` with all entity definitions, constants, ruleset, and commanders. Update `modes/index.ts` to export `TCG_MODE` as default.

**Dependency:** Phase 1–3 (card, commander, and game mode types must be extended).

**Validation:** `npx tsc --noEmit` + `npm run test:coverage`

### Step 5.1: Delete Classic Mode

**Delete the entire directory:** `src/core/modes/classic/`

This removes:
- `src/core/modes/classic/index.ts` — `CLASSIC_MODE` definition
- `src/core/modes/classic/entities/ships.ts` — 4 ship templates
- `src/core/modes/classic/entities/items.ts` — `HEALTH_KIT` template
- `src/core/modes/classic/entities/obstacles.ts` — `ROCK_OBSTACLE`, `ISLAND_OBSTACLE`
- `src/core/modes/classic/entities/shots.ts` — 10 shot patterns
- `src/core/modes/classic/entities/views.ts` — `StandardBoardView`, `DebugBoardView`
- `src/core/modes/classic/entities/game.ts` — `GAME_CONSTANTS`
- `src/core/modes/classic/entities/rulesets.ts` — `ClassicRuleSet`
- `src/core/modes/classic/entities/rulesets.test.ts` — Classic ruleset tests
- `src/core/modes/classic/entities/index.ts` — Barrel exports

### Step 5.2: Create TCG Mode Directory Structure

```
src/core/modes/tcg/
├── entities/
│   ├── cards.ts        ← 15-20 card template definitions
│   ├── commanders.ts   ← 2 commander definitions
│   ├── ships.ts        ← TCG base/defensive unit templates
│   ├── items.ts        ← Collectible powerups on the board
│   ├── obstacles.ts    ← Tactical terrain templates
│   ├── shots.ts        ← Shot patterns (reused by attack cards)
│   ├── views.ts        ← Board view config (7×7 board)
│   ├── rulesets.ts     ← TCGRuleSet
│   ├── game.ts         ← TCG constants (energy, deck, hand)
│   └── index.ts        ← Barrel exports
└── index.ts            ← TCG_MODE export
```

### Step 5.3: Create `modes/tcg/entities/game.ts`

**TCG constants (using decisions D6, D10, D11):**

```typescript
import type { GameModeConstants } from "../../../types/modes";

export const TCG_CONSTANTS = Object.freeze({
  SHIPS: {
    MIN_DISTANCE: 2,
    MAX_PLACEMENT_ATTEMPTS: 200,
  },
  ITEMS: {
    MIN_DISTANCE_FROM_SHIPS: 1,
    MAX_PLACEMENT_ATTEMPTS: 200,
  },
  OBSTACLES: {
    MAX_PLACEMENT_ATTEMPTS: 200,
  },
  GAME_LOGIC: {
    BATTLE: {
      RANDOM_TURN_THRESHOLD: 0.5,
    },
    SHIP_GENERATION: {
      ORIENTATION_RANDOM_THRESHOLD: 0.5,
      QUADRANT_SIZE_DIVISOR: 2,
    },
  },
  BOARD: {
    MIN_SIZE: 5,
    MAX_SIZE: 15,
    DEFAULT_VIEW: /* set after views.ts is created */,
  },
  CARDS: {
    DECK_SIZE: 20,
    INITIAL_HAND_SIZE: 5,      // Decision D11
    DRAW_PER_TURN: 1,
    INITIAL_ENERGY: 3,         // Decision D10
    INITIAL_MAX_ENERGY: 3,     // Decision D10
    ENERGY_GROWTH_PER_TURN: 1, // Decision D10
  },
} satisfies GameModeConstants);
```

### Step 5.4: Create `modes/tcg/entities/views.ts`

**7×7 board (Decision D6):**

```typescript
import type { BoardViewConfig } from "../../../types/config";

export const TCGBoardView = Object.freeze({
  id: "tcg-standard",
  title: "TCGBoardView",
  description: "TCG gameplay: 7x7 board, own board visible, enemy ships hidden",
  width: 7,
  height: 7,
  playerSide: ["playerShips", "playerItems", "playerObstacles", "enemyShots"] as const,
  enemySide: ["enemyObstacles", "playerShots", "collectedItems"] as const,
} satisfies BoardViewConfig);
```

### Step 5.5: Create `modes/tcg/entities/shots.ts`

**Reuse the same shot patterns from Classic — they are referenced by attack cards' `shotPatternId`.**

Copy the following patterns (these are the ones attack cards will reference):
- `SINGLE_SHOT` (id: `"single"`)
- `CROSS_SHOT` (id: `"cross"`)
- `HORIZONTAL_LINE_SHOT` (id: `"horizontal-line"`)
- `VERTICAL_LINE_SHOT` (id: `"vertical-line"`)
- `SQUARE_SHOT` (id: `"square"`)
- `DIAGONAL_X_SHOT` (id: `"diagonal-x"`)
- `SMALL_SQUARE_SHOT` (id: `"small-square"`)

Export as `SHOTS` array using `createEntitySet`.

### Step 5.6: Create `modes/tcg/entities/ships.ts`

**TCG "base" units — these are what the opponent must destroy to win:**

Define 2-3 ship templates (e.g., `FLAGSHIP` 3×1, `OUTPOST` 2×1, `WATCHTOWER` 1×1). Use `createEntitySet`.

### Step 5.7: Create `modes/tcg/entities/obstacles.ts`

**Tactical terrain — at least 1 obstacle template:**

Reuse `ROCK_OBSTACLE` (1×1, defaultCount 2). Use `createEntitySet`.

### Step 5.8: Create `modes/tcg/entities/items.ts`

**Board collectibles — at least 1 item template:**

Reuse `HEALTH_KIT` concept or similar. Use `createEntitySet`.

### Step 5.9: Create `modes/tcg/entities/cards.ts`

**15–20 card templates (Decision D5). No rarity field (Decision D17).**

**Card distribution guidance:**

| Type | Count | Energy Range | Examples |
|---|---|---|---|
| `attack` | 6–8 cards | 1–5 | Single shot (1E), Cross shot (3E), Square shot (5E) |
| `skill` | 4–5 cards | 1–3 | Draw 2 cards (1E), Reveal 3×3 area (2E), Restore 2 energy (1E) |
| `defense` | 3–4 cards | 1–3 | Place 1×1 obstacle (2E), Add 1×1 ship (3E) |
| `trap` | 2–3 cards | 1–3 | Hidden mine (2E), Counter-attack (3E) |

**Each card MUST follow this structure:**

```typescript
export const CARD_NAME: CardTemplate = Object.freeze({
  id: "unique_snake_case_id",
  title: "Display Name",
  description: "What this card does, in one sentence.",
  cardType: "attack" | "skill" | "defense" | "trap",
  energyCost: <number>,
  defaultCount: <number>,       // copies in a default deck
  shotPatternId: "<pattern_id>", // ONLY for attack cards
  coords: [0, 0] as [number, number], // required by GameObject
  part: 1,                       // required by GameObject
  onPlay: (ctx) => { ... },      // ONLY for skill/defense/trap
  canPlay: (ctx) => boolean,     // OPTIONAL guard
});
```

### Step 5.10: Create `modes/tcg/entities/commanders.ts`

**2 commanders (Decision D7, D8):**

**Commander 1: "Admiral Voss" — Energy Commander**
- Passive trigger: `"draw"`
- Effect: +1 bonus energy per turn (total +2 instead of +1)

**Commander 2: "Captain Reyes" — Draw Commander**
- Passive trigger: `"draw"`
- Effect: Draw 2 cards instead of 1 at the start of each turn

### Step 5.11: Create `modes/tcg/entities/rulesets.ts`

**TCGRuleSet implementation:**

```typescript
export const TCGRuleSet: MatchRuleSet = Object.freeze({
  id: "tcg",
  title: "TCGRuleSet",
  description: "Card-based turn structure: Draw → Main → Attack → End",

  decideTurn(attackResult, currentState): TurnDecision {
    // In TCG mode, attacks always come from playing cards.
    // After each attack card is resolved, allow more attacks if energy permits.
    // The turn ends when the player chooses to end it or runs out of energy.
    // For now (simple mode): each attack card resolves independently,
    // but the player can play multiple attack cards per turn (D14).
    return {
      shouldEndTurn: false,
      shouldToggleTurn: false,
      canShootAgain: true,
      reason: "TCG: attack card resolved, player may continue",
    };
  },

  checkGameOver(state): GameOverDecision {
    // Win: destroy all opponent's base units (ships)
    if (state.areAllPlayerShipsDestroyed) {
      return { isGameOver: true, winner: "enemy" };
    }
    if (state.areAllEnemyShipsDestroyed) {
      return { isGameOver: true, winner: "player" };
    }
    return { isGameOver: false, winner: null };
  },

  decideTurnOnItemUse(isPlayerUse, state) {
    // Skill/defense/trap cards use the item system internally.
    // They should NOT end or toggle the turn.
    return { shouldToggleTurn: false, reason: "Card effect doesn't end turn" };
  },
});
```

### Step 5.12: Create `modes/tcg/entities/index.ts` and `modes/tcg/index.ts`

**Barrel exports + `TCG_MODE` definition following the exact same pattern as the old [classic/index.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/modes/classic/index.ts).**

### Step 5.13: Update `modes/index.ts`

**Replace the entire file with:**

```typescript
import { TCG_MODE } from "./tcg";
export const DEFAULT_GAME_MODE = TCG_MODE;
```

### Step 5.14: Update All Tests

All existing test files that import from `modes/classic/` or reference `CLASSIC_MODE` must be updated:

- Any import of `ClassicRuleSet` → use `TCGRuleSet` or define inline test rulesets
- Any import of `CLASSIC_MODE` or `DEFAULT_GAME_MODE` → use `TCG_MODE` or `DEFAULT_GAME_MODE`
- Any hardcoded 5×5 board assumptions → update to 7×7

**Write new test files:**
- `src/core/modes/tcg/entities/rulesets.test.ts` — test `TCGRuleSet.decideTurn`, `checkGameOver`, `decideTurnOnItemUse`
- Tests for each card's `onPlay` and `canPlay` behavior

### Step 5.15: Validate

Run: `npm run test:coverage`

**Expected:** All tests pass, 100% coverage maintained.

---

## Phase 6: Extend Match Machine (XState)

**Goal:** Add handlers for `DRAW_CARD`, `PLAY_CARD`, `DISCARD_CARD` events to the XState machine. Implement the TCG turn structure. Add commander passive execution.

**Dependency:** Phase 2–5 (engine methods, events, TCG mode must exist).

**Validation:** `npm run test:coverage`

### Step 6.1: Modify `MatchMachineContext` initialization

**File:** [MODIFY] `src/core/engine/machines/match.ts`

In the machine's `context` factory (where initial context is built from `MatchMachineInput`):

- Initialize `playerCommander` and `enemyCommander` from the input (or `null`).

### Step 6.2: Add `DRAW_CARD` handler

**In the `planning` state**, add a transition for `DRAW_CARD`:

```
on: {
  DRAW_CARD: {
    actions: [
      (ctx, event) => {
        ctx.engine.drawCards(event.count, event.isPlayerDraw);
      }
    ]
  }
}
```

### Step 6.3: Add `PLAY_CARD` handler

**In the `planning` state**, add a transition for `PLAY_CARD`:

**Logic (in order):**

1. Find the card in the hand by `event.cardId`.
2. If not found → set error, return.
3. Check `card.canPlay(ctx)` if defined → if `false`, set error, return.
4. Check `energy >= card.energyCost` → if not, set error, return.
5. Deduct energy: `engine.setEnergy(currentEnergy - card.energyCost, isPlayer)`.
6. Move card from hand to discard: `engine.playCard(cardId, isPlayer)`.
7. Execute `card.onPlay(ctx)` if defined.
8. If `card.cardType === "attack"` AND `card.shotPatternId` is set:
   - Resolve the shot pattern at `(targetX, targetY)` using `engine.executeShotPattern()`.
   - Run collect handlers and turn resolution through existing machine logic.
9. Fire `onStateChange` callback.

### Step 6.4: Add `DISCARD_CARD` handler

**In the `planning` state**, add a transition for `DISCARD_CARD`:

```
on: {
  DISCARD_CARD: {
    actions: [
      (ctx, event) => {
        ctx.engine.discardCards(event.cardIds, event.isPlayerDiscard);
      }
    ]
  }
}
```

### Step 6.5: Commander passive execution

**Where:** In the `INITIALIZE` handler and at the beginning of each turn.

- After `INITIALIZE`: if a commander has `passiveTrigger === "always"`, apply it immediately.
- At each turn start (when transitioning back to `planning` after a turn toggle): execute the active player's commander passive if `passiveTrigger` matches the current phase.

### Step 6.6: Write Tests

**File:** [MODIFY] `src/core/engine/machines/match.test.ts`

**Test cases:**

- `DRAW_CARD`: draws cards, updates hand and deck state.
- `PLAY_CARD` with attack card: deducts energy, moves to discard, executes shot pattern at target.
- `PLAY_CARD` with skill card: deducts energy, executes `onPlay`, does NOT fire shots.
- `PLAY_CARD` with insufficient energy: fails, no state change.
- `PLAY_CARD` with `canPlay` guard returning false: fails.
- `PLAY_CARD` with invalid card ID: fails.
- `DISCARD_CARD`: removes cards from hand.
- Commander passive triggers at correct phase.
- Full TCG turn sequence: initialize → draw → play skills → play attacks → end turn.

### Step 6.7: Validate

Run: `npm run test:coverage`

**Expected:** All tests pass, 100% coverage maintained.

---

## Phase 7: Extend Match API

**Goal:** Add high-level methods to `IMatch` and `Match` for the new card operations. These are the public API that consumers (UI, multiplayer) will use.

**Dependency:** Phase 6 (machine handlers must exist).

**Validation:** `npm run test:coverage`

### Step 7.1: Extend `IMatch` in [match.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/match.ts)

**Where:** Inside the `IMatch` interface (before the closing `}`).

**Append:**

```typescript
  /** Draw cards from the deck to the hand. Returns the drawn cards. */
  drawCard(count: number, isPlayerDraw: boolean): Card[];

  /**
   * Play a card from the hand.
   * For attack cards, targetX and targetY are REQUIRED.
   */
  playCard(
    cardId: string,
    isPlayerPlay: boolean,
    targetX?: number,
    targetY?: number,
  ): PlayCardResult;

  /** End the current player's turn. Toggles to the opponent. */
  endTurn(): void;
```

### Step 7.2: Extend `MatchQueryAPI` in [match.ts](file:///Users/alex/Desktop/RebelCoderz/engine/src/core/types/match.ts)

**Where:** Inside the `MatchQueryAPI` interface (before the closing `}`).

**Append:**

```typescript
  /** Cards in the specified player's hand. */
  getHand(isPlayer: boolean): readonly Card[];
  /** Cards remaining in the specified player's deck. */
  getDeck(isPlayer: boolean): readonly Card[];
  /** Cards in the specified player's discard pile. */
  getDiscard(isPlayer: boolean): readonly Card[];
  /** Current and max energy for the specified player. */
  getEnergy(isPlayer: boolean): { current: number; max: number };
  /** The player's selected commander, or null. */
  getPlayerCommander(): Commander | null;
  /** The enemy's selected commander, or null. */
  getEnemyCommander(): Commander | null;
```

### Step 7.3: Implement in `Match` class

**File:** [MODIFY] `src/core/engine/match.ts`

Implement each new method by delegating to the machine actor (send events) and the engine (read state).

### Step 7.4: Extend `GameInitializer`

**File:** [MODIFY] `src/core/manager/initializer.ts`

**What to do:**

1. In `getGameSetup()`, after generating ships/items/obstacles/shots:
   - If `gameMode.cards.length > 0`:
     - Build a starting deck from `gameMode.cards` using each template's `defaultCount`.
     - Shuffle using Fisher-Yates.
     - Draw `INITIAL_HAND_SIZE` cards from the top to form the starting hand.
     - Set `initialEnergy` and `initialMaxEnergy` from `gameMode.constants.CARDS`.
   - Add `playerDeck`, `playerHand`, `enemyDeck`, `enemyHand`, `initialEnergy`, `initialMaxEnergy` to the returned `GameSetup`.
2. If `gameMode.commanders.length > 0`, assign default commanders (first commander to player, second to enemy) unless overridden.

### Step 7.5: Write Tests

**File:** [MODIFY] `src/core/engine/match.test.ts`

**Test cases for `Match` class:**

- `drawCard`: returns correct cards, updates state.
- `playCard` attack: deducts energy, fires shots, returns `PlayCardResult`.
- `playCard` skill: deducts energy, applies effect.
- `playCard` insufficient energy: returns error.
- `getHand`, `getDeck`, `getDiscard`, `getEnergy`: return correct data.
- `getPlayerCommander`, `getEnemyCommander`: return selected commanders.
- `endTurn`: toggles turn, triggers draw phase for next player.

**File:** [MODIFY] `src/core/manager/initializer.test.ts`

**Test cases:**

- Generates correct deck from card templates.
- Shuffles deck (verify randomization).
- Draws correct initial hand size.
- Sets correct initial energy values.
- Assigns commanders from game mode.

### Step 7.6: Validate

Run: `npm run test:coverage`

**Expected:** All tests pass, 100% coverage maintained on ALL files.

---

## Phase 8: Final Integration & Cleanup

**Goal:** End-to-end verification. Ensure all imports are clean, no dead code, no Classic mode references remain.

**Dependency:** Phase 1–7 complete.

### Step 8.1: Search for Classic Mode References

Run: `grep -r "classic\|CLASSIC\|ClassicRuleSet" src/` — must return zero results (except this plan file, if it's in `docs/`).

### Step 8.2: Run Full Test Suite

Run: `npm run test:coverage`

**Expected:**
- All tests pass.
- 100% statement, branch, function, and line coverage.
- Zero `classic` imports anywhere.

### Step 8.3: Type Check

Run: `npx tsc --noEmit`

**Expected:** Zero errors.

### Step 8.4: Integration Test

Write and run an integration test that plays a full TCG match:

```typescript
// Pseudo-code for the integration test:
const match = createMatch(); // uses TCG_MODE by default
match.initializeMatch();

// Verify initial state
expect(match.getHand(true).length).toBe(5);   // D11
expect(match.getEnergy(true)).toEqual({ current: 3, max: 3 }); // D10

// Turn 1: Draw phase
match.drawCard(1, true);

// Turn 1: Main phase - play a skill card
const skillCard = match.getHand(true).find(c => c.cardType === "skill");
if (skillCard) {
  const result = match.playCard(skillCard.id!, true);
  expect(result.success).toBe(true);
}

// Turn 1: Attack phase - play an attack card
const attackCard = match.getHand(true).find(c => c.cardType === "attack");
if (attackCard) {
  const result = match.playCard(attackCard.id!, true, 3, 3);
  expect(result.success).toBe(true);
  expect(result.attackResult).toBeDefined();
}

// End turn
match.endTurn();
expect(match.isEnemyTurn()).toBe(true);
```

---

## Verification Summary

| Phase | Command | Expected |
|---|---|---|
| 1 | `npx tsc --noEmit` | No errors (types only) |
| 2 | `npm run test:coverage` | 100% coverage, all tests pass |
| 3 | `npx tsc --noEmit` | No errors (or expected errors from Classic mode) |
| 4 | `npx tsc --noEmit` | No errors |
| 5 | `npm run test:coverage` | 100% coverage with new TCG tests |
| 6 | `npm run test:coverage` | 100% coverage with machine tests |
| 7 | `npm run test:coverage` | 100% coverage with Match API + initializer tests |
| 8 | `npm run test:coverage` + `npx tsc --noEmit` + grep | Zero errors, zero Classic refs, 100% coverage |
