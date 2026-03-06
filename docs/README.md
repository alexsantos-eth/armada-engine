# RebelCoderz Game Engine Documentation

Complete reference for the v3 architecture, development rules, and extension patterns.

---

## 📚 Documentation Hub

### For New Developers
1. **[Core v3 Architecture](core-v3-arch.md)** — 10 minutes
   - High-level architecture overview
   - Directory structure and layer responsibilities
   - Data flow and design principles
   - What changed in v3.1 (logger, GameEntity, etc.)

2. **[Development Guidelines](development-guidelines.md)** — 20 minutes
   - Strict coding rules and patterns
   - Type system requirements
   - Naming conventions and code organization
   - Testing standards and coverage targets
   - State management best practices
   - Error handling patterns

3. **[ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md)** — 10 minutes
   - The 10 forbidden patterns ❌
   - The 7 required patterns ✅
   - Pre-push checklist
   - **Read this first — these rules cannot be broken**

### For Extending the Engine
4. **[Extension Guide v3](extension-guide-v3.md)** — 15 minutes
   - How to add new ship types
   - How to add new items with custom behaviors
   - How to add new rulesets
   - How to add custom perspectives/resource types
   - Common patterns and examples
   - Troubleshooting guide

### For Reference
- **Type Definitions** — `src/core/types/`
  - `entities.ts` — GameEntity, GameShip, GameItem, ItemActionContext
  - `constants.ts` — ShipTemplate, ItemTemplate, GameObject
  - `config.ts` — GameConfig, GameSetup
  - `rulesets.ts` — MatchRuleSet, TurnDecision, GameOverDecision
  - `engine.ts` — GameEngineState, IGameEngine, IGameEngineReader
  - `machines.ts` — Machine context, event, state types
  - `shots.ts` — Shot, ShotPattern, ShotPatternResult
  - `board.ts` — BoardLayer, BoardView, BoardViewConfig

- **Constant Templates** — `src/core/constants/`
  - `ships.ts` — All ShipTemplate definitions
  - `items.ts` — All ItemTemplate definitions with handlers
  - `obstacles.ts` — All ObstacleTemplate definitions
  - `rulesets.ts` — Built-in MatchRuleSet implementations
  - `shots.ts` — Predefined ShotPattern definitions

---

## 🏗️ Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│  manager/  (GameInitializer — config → GameSetup)          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  machines/ (XState — orchestration, logger, callbacks)     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  engine/   (GameEngine — mutable state, logic, board)      │
│  - logic.ts, board.ts, errors.ts, item.ts, perspective.ts │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  tools/    (Pure utilities — ships, items, shots, etc.)    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  types/    (Type contracts — all layers depend on this)    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  constants/ (Immutable data — frozen templates)            │
└─────────────────────────────────────────────────────────────┘
```

**Key Rule:** Imports only go downward. No circular dependencies.

---

## 🎯 Core Principles

### 1. **Type-Driven Design**
- Types define the contract; implementation follows
- All public APIs have explicit type annotations
- Strong TypeScript with strict mode

### 2. **Single Source of Truth**
- `GameEngine` owns all mutable game state
- No state duplication
- All reads via snapshots (`GameEngineState`)

### 3. **Immutability by Default**
- Constants are frozen with `Object.freeze()` and `as const`
- Expose read-only views (`readonly` arrays, getters)
- State captured in immutable snapshots

### 4. **Deterministic Behavior**
- Same input → same output (required for multiplayer)
- No random in game logic (only in setup via `randomSeed`)
- All callbacks fire in deterministic order

### 5. **Errors as Results, Not Exceptions**
- Game logic errors are expected, not exceptional
- Return result objects with `{ success, error, reason }`
- Only throw for programmer errors

### 6. **Clear Separation of Concerns**
- Each layer has one responsibility
- Tools are pure functions (no state)
- Engine is stateful (no flow control)
- Machine orchestrates flow (no game state)

---

## 🚀 Quick Start

### Running Tests
```bash
npm run test        # Watch mode
npm run test:run    # Single run
npm run test:coverage  # With coverage report
```

### Build & Type Check
```bash
npm run build       # TypeScript + Vite
tsc -b              # TypeScript only (catches circular deps)
```

### Development
```bash
npm run dev         # Vite dev server
npm run test:ui    # Vitest UI
```

---

## ❌ Never Do This

1. ❌ Import backwards (only go down layers)
2. ❌ Throw errors for game logic (use result objects)
3. ❌ Mutate constants or frozen objects
4. ❌ Duplicate game state (one source of truth)
5. ❌ Store engine in component state (read from engine directly)
6. ❌ Add logic to type files (keep types in `types/`, logic in `tools/` or `engine/`)
7. ❌ Make behavior non-deterministic (same input must give same output)
8. ❌ Expose internal mutable arrays directly (use readonly getters)
9. ❌ Bypass validation (e.g., direct array.push instead of addShip method)
10. ❌ Add game state to handlers (handlers receive read-only snapshots)

See [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md) for detailed explanations and fixes.

---

## ✅ Always Do This

1. ✅ Follow layer boundaries (constants → types → tools → engine → machines → manager)
2. ✅ Document all public APIs with JSDoc
3. ✅ Test with Vitest (85%+ coverage)
4. ✅ Use result objects `{ success, error, reason }`
5. ✅ Freeze constants with `Object.freeze()` and `as const`
6. ✅ Expose read-only views of internal state
7. ✅ Keep rulesets stateless and deterministic
8. ✅ Use `ItemActionContext` snapshots in handlers
9. ✅ Register templates and rulesets for discoverability
10. ✅ Trace the machine logger for debugging state transitions

---

## 📖 Document Navigation

- **Just learning?** → Start with [Core v3 Architecture](core-v3-arch.md)
- **Writing code?** → Follow [Development Guidelines](development-guidelines.md)
- **Breaking rules?** → Check [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md)
- **Adding features?** → Follow [Extension Guide v3](extension-guide-v3.md)
- **Need types?** → See `src/core/types/` JSDoc comments
- **Need examples?** → See `src/core/tests/` for tests

---

## 🔍 Recent Changes (v3.1+)

- **GameEntity & GameObject:** Unified metadata pattern for all entities
- **Machine Logger:** New `machines/logger.ts` for debugging state transitions
- **Standard RuleSet Methods:** Consistent interface across all rulesets
- **Improved Error Handling:** Typed error constants with reason strings
- **Game Entity Tools:** New `tools/constants.ts` for entity management

See [Core v3 Architecture](core-v3-arch.md#recent-changes-v31) for details.

---

## 💬 Questions?

1. **Architecture question?** → [Core v3 Architecture](core-v3-arch.md)
2. **How to code?** → [Development Guidelines](development-guidelines.md)
3. **Extending?** → [Extension Guide v3](extension-guide-v3.md)
4. **Rule broken?** → [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md)
5. **Type help?** → Look at JSDoc in `src/core/types/`
6. **Example?** → Check tests in `src/core/tests/`

---

**Last Updated:** March 6, 2026  
**Status:** Complete v3 documentation with strict development guidelines
