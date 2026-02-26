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

## Design Rules & Best Practices
- Always use the full template object when placing ships or items to preserve handlers.
- Never overlap ships and items on the same cell.
- All player↔enemy field mapping is handled in `perspective.ts` for easy extension.
- Use the public type barrel (`src/core/types/index.ts`) for stable imports.

---

## See Also
- [Core v3 Architecture](core-v3-arch.md)
- [Type Documentation](../src/core/types/)
