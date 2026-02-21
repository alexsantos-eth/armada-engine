# Game Engine — Core Architecture

This document explains how the core of the game engine is structured, how the pieces relate to each other, and the complete turn lifecycle.

---

## 1. High-Level Architecture

The core is composed of three layers that communicate in one direction:

```mermaid
graph TD
    subgraph "Public API"
        Match["Match\n(match.ts)\nSimple public interface"]
    end

    subgraph "State Orchestration"
        MM["matchMachine\n(XState)\nState & phase management"]
    end

    subgraph "Pure Compute"
        GE["GameEngine\n(logic.ts)\nBoard state, shots, ships"]
        RS["MatchRuleSet\n(rulesets.ts)\nTurn & game-over rules"]
    end

    Match -->|"sends events\n(INITIALIZE, PLAN_SHOT…)"| MM
    Match -->|"reads snapshot"| MM
    MM -->|"actions call"| GE
    MM -->|"decideTurn / checkGameOver"| RS
    GE -->|"callbacks (onShot, onTurnChange…)"| Match
```

### Responsibilities

| Layer | Class / Module | Responsibility |
|---|---|---|
| Public API | `Match` | Wraps the XState actor; exposes simple methods (planShot, confirmAttack, planAndAttack, resetMatch…) and forwards callbacks to consumers. |
| State Orchestration | `matchMachine` | Owns the named states (`idle`, `active.planning`, `active.planned`, `active.attacking`, `gameOver`) and guards/actions that transition between them. |
| Pure Compute | `GameEngine` | Holds all mutable board data (shots maps, ship positions, hit counters, turn, game-over flag). Executes shot patterns and emits callbacks. |
| Rules | `MatchRuleSet` | Stateless object that decides, after each attack, whether to toggle the turn and whether the game is over. |

---

## 2. matchMachine — State Diagram

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> active : INITIALIZE\n[initializeEngine]

    state active {
        [*] --> planning

        planning --> planned : PLAN_SHOT [isValidPlan]\n/ storePlan

        planning --> planning : PLAN_SHOT [invalid]\n/ setPlanError

        planned --> planned : PLAN_SHOT [isValidPlan]\n/ clearPlan + storePlan

        planned --> planning : CANCEL_PLAN\n/ clearPlan

        planned --> attacking : CONFIRM_ATTACK

        attacking --> gameOver : [isGameOver]
        attacking --> planning : [else]
    }

    active --> active : INITIALIZE\n[initializeEngine]
    active --> idle : RESET\n[resetEngine]
    active --> active : SET_RULESET\n[setRuleSet]

    gameOver --> [*]
```

### State descriptions

| State | Description |
|---|---|
| `idle` | Machine created; no match in progress. Waiting for `INITIALIZE`. |
| `active.planning` | Waiting for the current player to choose a target cell. |
| `active.planned` | A valid plan is stored; waiting for confirmation or cancellation. |
| `active.attacking` | **Transient**: executes the attack + turn resolution atomically, then immediately transitions to `gameOver` or back to `planning`. |
| `gameOver` | Final state. The winner is read from `engine.getState().winner`. |

---

## 3. Turn Lifecycle — Sequence Diagram

Each turn is a three-phase cycle: **PLAN → ATTACK → TURN RESOLUTION**.

```mermaid
sequenceDiagram
    actor Consumer
    participant Match
    participant matchMachine
    participant GameEngine
    participant MatchRuleSet

    Consumer->>Match: planShot(x, y, pattern, isPlayerShot)
    Match->>matchMachine: send PLAN_SHOT
    matchMachine->>matchMachine: guard isValidPlan
    alt valid plan
        matchMachine->>matchMachine: action storePlan → pendingPlan set
        Match-->>Consumer: { ready: true }
    else invalid
        matchMachine->>matchMachine: action setPlanError
        Match-->>Consumer: { ready: false, error }
    end

    Consumer->>Match: confirmAttack()
    Match->>matchMachine: send CONFIRM_ATTACK
    matchMachine->>matchMachine: transition → attacking

    Note over matchMachine: entry action: executeAttackAndResolveTurn

    matchMachine->>GameEngine: executeShotPattern(x, y, pattern, isPlayerShot)
    GameEngine-->>matchMachine: ShotPatternResult

    GameEngine->>Match: callbacks.onShot / onStateChange

    matchMachine->>MatchRuleSet: decideTurn(attackResult, state)
    MatchRuleSet-->>matchMachine: TurnDecision { shouldToggleTurn, canShootAgain }

    alt shouldToggleTurn
        matchMachine->>GameEngine: engineInternal.toggleTurn()
        GameEngine->>Match: callbacks.onTurnChange
    end

    matchMachine->>MatchRuleSet: checkGameOver(state)
    MatchRuleSet-->>matchMachine: GameOverDecision

    alt isGameOver
        matchMachine->>GameEngine: engineInternal.setGameOver(winner)
        matchMachine->>matchMachine: transition → gameOver
        GameEngine->>Match: callbacks.onGameOver
    else
        matchMachine->>matchMachine: transition → planning
    end

    Match-->>Consumer: MatchShotResult { shots, turnEnded, canShootAgain, winner… }
```

---

## 4. MatchRuleSet — Pluggable Rules

The `MatchRuleSet` interface makes turn management and game-over logic fully replaceable at runtime.

```mermaid
classDiagram
    class MatchRuleSet {
        <<interface>>
        +name: string
        +description: string
        +decideTurn(attackResult, state) TurnDecision
        +checkGameOver(state) GameOverDecision
    }

    class ClassicRuleSet {
        Hit (ship survives) → shoot again
        Ship destroyed → turn ends
        Miss → turn ends
        Game over → all enemy ships destroyed
    }

    class AlternatingTurnsRuleSet {
        Every shot → turn ends
        Hit or Miss → turn always switches
        Game over → all enemy ships destroyed
    }

    class DefaultRuleSet {
        Alias for ClassicRuleSet
    }

    MatchRuleSet <|.. ClassicRuleSet
    MatchRuleSet <|.. AlternatingTurnsRuleSet
    MatchRuleSet <|.. DefaultRuleSet
```

```mermaid
flowchart TD
    A[Attack executed] --> B{Game already over?}
    B -- Yes --> END[Turn ends, no toggle]
    B -- No --> C{Any shot hit?}
    C -- No / Miss --> D[Turn ends\nshouldToggleTurn = true\ncanShootAgain = false]
    C -- Yes --> E{Ship destroyed?}
    E -- Yes --> F[Turn ends\nshouldToggleTurn = true\ncanShootAgain = false]
    E -- No --> G[Hit — shoot again\nshouldToggleTurn = false\ncanShootAgain = true]
```

---

## 5. Class Relationships

```mermaid
classDiagram
    class Match {
        -actor: XStateActor~matchMachine~
        -matchCallbacks: MatchCallbacks
        +initializeMatch(playerShips, enemyShips, initialTurn)
        +planShot(x, y, pattern, isPlayerShot) PlanPhaseResult
        +confirmAttack() MatchShotResult
        +planAndAttack(x, y, isPlayerShot, pattern) MatchShotResult
        +cancelPlan()
        +resetMatch()
        +setRuleSet(ruleSet)
        +getState() GameEngineState
        +getEngine() GameEngine
        +getActor()
    }

    class matchMachine {
        <<XState Machine>>
        +states: idle | active | gameOver
        +context: MatchMachineContext
        +guards: isValidPlan, isGameOver
        +actions: storePlan, executeAttackAndResolveTurn, initializeEngine…
    }

    class GameEngine {
        -currentTurn: GameTurn
        -playerShips / enemyShips
        -shotsMap, shipPositions, hitCounters
        +initializeGame(playerShips, enemyShips, initialTurn)
        +executeShotPattern(x, y, pattern, isPlayerShot)
        +isCellShot(x, y, isPlayerShot)
        +isValidPosition(x, y)
        +getState() GameEngineState
        +getInternalAPI()
        -callbacks: onShot, onTurnChange, onStateChange, onGameOver
    }

    class MatchRuleSet {
        <<interface>>
        +decideTurn(result, state) TurnDecision
        +checkGameOver(state) GameOverDecision
    }

    Match "1" --> "1" matchMachine : creates & sends events
    matchMachine "1" --> "1" GameEngine : holds reference in context
    matchMachine "1" --> "1" MatchRuleSet : holds reference in context
    GameEngine ..> Match : fires callbacks
```

---

## 6. React Integration

The engine is consumed in React through two hooks that sit above `Match`.

```mermaid
graph LR
    subgraph "React Component (e.g. SingleMatch)"
        SC["SingleMatch.tsx\nuseBoard()"]
    end

    subgraph "Hooks Layer"
        UB["useBoard\n- calls planAndAttack\n- exposes board grids"]
        UM["useMatch\n- creates Match instance\n- manages gameState via useState\n- builds playerBoard / enemyBoard"]
    end

    subgraph "Core Engine"
        Match
    end

    SC --> UB
    UB --> UM
    UM --> Match
    Match -->|"onStateChange → setGameState"| UM
```

### Data flow in `useMatch`

```mermaid
sequenceDiagram
    participant Component
    participant useBoard
    participant useMatch
    participant Match

    Component->>useBoard: planAndAttack(x, y, pattern)
    useBoard->>useMatch: match.match.planAndAttack(x, y, isPlayer, pattern)
    useMatch->>Match: planAndAttack(x, y, isPlayer, pattern)
    Match-->>useMatch: onStateChange(newState)
    useMatch->>useMatch: setGameState(newState)
    useMatch-->>useBoard: { playerBoard, enemyBoard, gameState }
    useBoard-->>Component: re-render with updated boards
```

---

## 7. Usage Example (without React)

```typescript
import { Match } from "./src/core/engine";
import { ClassicRuleSet } from "./src/core/engine/rulesets";

// 1. Create a match with a ruleset and callbacks
const match = new Match(
  { boardWidth: 10, boardHeight: 10 },
  {
    onShot: (shot, isPlayer) => console.log("Shot fired", shot, isPlayer),
    onTurnChange: (turn) => console.log("Turn changed to", turn),
    onGameOver: (winner) => console.log("Game over! Winner:", winner),
  },
  ClassicRuleSet,
);

// 2. Initialize with ship placements
match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

// 3A. Two-phase attack (plan then confirm)
const plan = match.planShot(3, 4, SINGLE_SHOT, true);
if (plan.ready) {
  const result = match.confirmAttack();
  console.log(result.shots, result.turnEnded, result.canShootAgain);
}

// 3B. One-call shortcut
const result = match.planAndAttack(3, 4, true, SINGLE_SHOT);
```

---

## 8. Context Data Flow Summary

```mermaid
flowchart LR
    INPUT["Match constructor\n(config, callbacks, ruleSet)"]
    --> ENGINE["new GameEngine(config, callbacks)"]
    --> ACTOR["createActor(matchMachine, { engine, ruleSet })"]

    ACTOR --> CTX["context\n{ engine, ruleSet, pendingPlan,\nlastAttackResult, lastTurnDecision, planError }"]

    CTX --> OUTPUT["Match public methods\nread context via actor.getSnapshot()"]
```
