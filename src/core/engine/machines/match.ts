import { setup, assign, createActor } from "xstate";
import { GameEngine } from "../logic";
import { DefaultRuleSet } from "../rulesets";
import { SINGLE_SHOT } from "../../constants/shots";
import { PlanError } from "../errors";
import { buildCollectContext, buildUseContext } from "../item";
import { fireMatchCallbacks } from "./callbacks";
import type { GameTurn } from "../../types/common";
import type {
  MatchMachineContext,
  MatchMachineEvent,
  MatchMachineInput,
} from "./types";

export const matchMachine = setup({
  types: {} as {
    context: MatchMachineContext;
    events: MatchMachineEvent;
    input: MatchMachineInput;
  },

  guards: {
    /**
     * Validates that the planned shot is legal:
     * - Position is within the board bounds
     * - Cell has not been shot before (only for single-cell patterns)
     */
    isValidPlan: ({ context, event }) => {
      if (event.type !== "PLAN_SHOT") return false;

      if (!context.engine.isValidPosition(event.centerX, event.centerY)) {
        return false;
      }

      const pattern = event.pattern ?? SINGLE_SHOT;
      if (
        pattern.id === "single" &&
        context.engine.isCellShot(
          event.centerX,
          event.centerY,
          event.isPlayerShot,
        )
      ) {
        return false;
      }

      return true;
    },

    /** The match has ended (the engine knows after the last shot is processed) */
    isGameOver: ({ context }) => context.engine.getState().isGameOver,
  },

  actions: {
    /** Persists the planned shot in context when the shot is valid */
    storePlan: assign(({ event }) => {
      if (event.type !== "PLAN_SHOT") return {};
      return {
        pendingPlan: {
          centerX: event.centerX,
          centerY: event.centerY,
          pattern: event.pattern ?? SINGLE_SHOT,
          isPlayerShot: event.isPlayerShot,
        },
        planError: null,
      };
    }),

    /** Records the plan error when the cell or position is invalid */
    setPlanError: assign(({ context, event }) => {
      if (event.type !== "PLAN_SHOT") return {};

      let planError: PlanError = PlanError.InvalidPlan;
      if (!context.engine.isValidPosition(event.centerX, event.centerY)) {
        planError = PlanError.InvalidPosition;
      } else if (
        context.engine.isCellShot(
          event.centerX,
          event.centerY,
          event.isPlayerShot,
        )
      ) {
        planError = PlanError.CellAlreadyShot;
      }

      return { planError };
    }),

    /** Clears the pending plan */
    clearPlan: assign(() => ({
      pendingPlan: null,
      planError: null,
    })),

    /**
     * Step 1a of the turn cycle: execute the shot pattern in the engine.
     * Stores `lastAttackResult`, `lastAttackIsPlayerShot`, and
     * `lastAttackCenter` so downstream actions and the CallbackCoordinator
     * have everything they need. Clears the pending plan.
     *
     * Callbacks are intentionally NOT fired here — the CallbackCoordinator
     * in `resolveTurn` (step 2) is the single place for all firing.
     *
     * Item `onCollect` lifecycle handlers are not called here; that is
     * `runCollectHandlers`'s responsibility (step 1b).
     */
    executeAttack: assign(({ context }) => {
      if (!context.pendingPlan) return {};

      const { centerX, centerY, pattern, isPlayerShot } = context.pendingPlan;

      const lastAttackResult = context.engine.executeShotPattern(
        centerX,
        centerY,
        pattern,
        isPlayerShot,
      );

      return {
        pendingPlan: null,
        lastAttackResult,
        lastAttackIsPlayerShot: isPlayerShot,
        lastAttackCenter: { centerX, centerY, pattern },
      };
    }),

    /**
     * Step 1b of the turn cycle: invoke `onCollect` for every item that was
     * fully collected by the preceding attack.
     *
     * Responsibilities (only these):
     * 1. Run each collected item's `onCollect` handler.
     * 2. Accumulate `collectToggleCount` from handlers that called
     *    `ctx.toggleTurn()`, storing it for `resolveTurn` to consume.
     * 3. Capture any pending ruleset change from `ctx.setRuleSet()`.
     *
     * Turn mutation and all callbacks belong to `resolveTurn` (step 2).
     */
    runCollectHandlers: assign(({ context }) => {
      if (!context.lastAttackResult || context.lastAttackIsPlayerShot === null) return {};

      const isPlayerShot = context.lastAttackIsPlayerShot;

      let capturedRuleSet: unknown = null;
      let collectToggleCount = 0;

      for (const shot of context.lastAttackResult.shots) {
        if (shot.itemFullyCollected && shot.itemId !== undefined) {
          const engineState = context.engine.getState();
          const items = isPlayerShot
            ? engineState.enemyItems
            : engineState.playerItems;
          const item = items[shot.itemId];
          if (item?.onCollect) {
            const ctx = buildCollectContext(
              context.engine,
              item,
              isPlayerShot,
              shot,
              context.currentTurn,
              () => { collectToggleCount++; },
              (rs) => { capturedRuleSet = rs; },
            );
            item.onCollect(ctx);
          }
        }
      }

      return {
        collectToggleCount,
        pendingRuleSet: capturedRuleSet as typeof context.ruleSet | null,
        // lastAttackIsPlayerShot is intentionally NOT cleared here —
        // resolveTurn still needs it for the CallbackCoordinator payload.
      };
    }),

    /**
     * Step 2 of the turn cycle: resolve the turn outcome and fire all
     * match-level callbacks through the CallbackCoordinator (single call).
     *
     * 1. Apply collect-phase turn toggles accumulated in `collectToggleCount`.
     * 2. Consume any pending ruleset change captured from `onCollect` handlers.
     * 3. Ask the (possibly updated) ruleset to decide the turn outcome.
     * 4. Toggle the turn if the ruleset requires it.
     * 5. Check for game-over via the ruleset.
     * 6. Fire all callbacks via `fireMatchCallbacks`.
     */
    resolveTurn: assign(({ context }) => {
      if (!context.lastAttackResult) return {};

      const pendingRuleSet = context.pendingRuleSet;
      const activeRuleSet =
        (pendingRuleSet as typeof context.ruleSet | null) ?? context.ruleSet;

      // Apply collect-phase toggles accumulated by runCollectHandlers.
      let currentTurn: GameTurn =
        context.collectToggleCount % 2 === 0
          ? context.currentTurn
          : context.currentTurn === "PLAYER_TURN" ? "ENEMY_TURN" : "PLAYER_TURN";

      const stateAfterAttack = context.engine.getState();
      const lastTurnDecision = activeRuleSet.decideTurn(
        context.lastAttackResult,
        stateAfterAttack,
      );

      const rulesetToggledTurn = lastTurnDecision.shouldToggleTurn;
      if (rulesetToggledTurn) {
        currentTurn = currentTurn === "PLAYER_TURN" ? "ENEMY_TURN" : "PLAYER_TURN";
      }

      let winner = null;
      const stateAfterTurn = context.engine.getState();
      if (!stateAfterTurn.isGameOver) {
        const gameOverDecision = activeRuleSet.checkGameOver(stateAfterTurn);
        if (gameOverDecision.isGameOver && gameOverDecision.winner) {
          context.engine.setGameOver(gameOverDecision.winner);
          winner = gameOverDecision.winner;
        }
      }

      fireMatchCallbacks(context.callbacks, context.engine, {
        kind: "attack",
        result: context.lastAttackResult,
        isPlayerShot: context.lastAttackIsPlayerShot ?? false,
        centerX: context.lastAttackCenter?.centerX ?? 0,
        centerY: context.lastAttackCenter?.centerY ?? 0,
        pattern: context.lastAttackCenter?.pattern ?? SINGLE_SHOT,
        currentTurn,
        rulesetToggledTurn,
        winner,
      });

      return {
        currentTurn,
        lastTurnDecision,
        collectToggleCount: 0,
        lastAttackCenter: null,
        lastAttackIsPlayerShot: null,
        pendingRuleSet: null,
        ...(pendingRuleSet ? { ruleSet: activeRuleSet } : {}),
      };
    }),

    /** Initializes the engine with ship placements, items, and the starting turn */
    initializeEngine: assign(({ context, event }) => {
      if (event.type !== "INITIALIZE") return {};

      const currentTurn: GameTurn = event.initialTurn ?? "PLAYER_TURN";

      context.engine.initializeGame(
        event.playerShips,
        event.enemyShips,
        event.playerItems ?? [],
        event.enemyItems ?? [],
      );

      fireMatchCallbacks(context.callbacks, context.engine, {
        kind: "matchStart",
        currentTurn,
      });

      return {
        currentTurn,
        planError: null,
        lastAttackResult: null,
        lastTurnDecision: null,
        lastUseItemResult: null,
        turnBeforeItemUse: null,
        pendingRuleSet: null,
        lastAttackIsPlayerShot: null,
        lastAttackCenter: null,
        collectToggleCount: 0,
        useToggleCount: 0,
        lastUsedItemInfo: null,
      };
    }),

    /** Resets the engine to its initial empty state */
    resetEngine: assign(({ context }) => {
      context.engine.resetGame();

      fireMatchCallbacks(context.callbacks, context.engine, {
        kind: "reset",
        currentTurn: "PLAYER_TURN",
      });

      return {
        currentTurn: "PLAYER_TURN" as GameTurn,
        pendingPlan: null,
        lastAttackResult: null,
        lastTurnDecision: null,
        planError: null,
        lastUseItemResult: null,
        turnBeforeItemUse: null,
        pendingRuleSet: null,
        lastAttackIsPlayerShot: null,
        lastAttackCenter: null,
        collectToggleCount: 0,
        useToggleCount: 0,
        lastUsedItemInfo: null,
      };
    }),

    /** Swaps the active ruleset */
    setRuleSet: assign(({ event }) => {
      if (event.type !== "SET_RULESET") return {};
      return { ruleSet: event.ruleSet };
    }),

    /** Overrides the current turn without side-effects (for network re-sync) */
    syncTurn: assign(({ event }) => {
      if (event.type !== "SYNC_TURN") return {};
      return { currentTurn: event.turn };
    }),

    /**
     * Replaces both sides' shot history atomically.
     * Used for replay and multiplayer synchronisation so all engine mutations
     * continue to flow through the machine rather than bypassing it.
     */
    syncShots: assign(({ context, event }) => {
      if (event.type !== "SYNC_SHOTS") return {};
      context.engine.setPlayerShots(event.playerShots);
      context.engine.setEnemyShots(event.enemyShots);
      return {};
    }),

    /**
     * Activates the `onUse` handler of a collected item.
     * Only reachable from the `planning` state — all other states silently
     * ignore the event.
     *
     * Responsibilities (only these):
     * 1. Validate that it is the caller's turn and the item is usable.
     * 2. Invoke `item.onUse` and mark the item as used.
     * 3. Accumulate `useToggleCount` so `resolveItemUse` can determine
     *    whether the handler itself changed the turn.
     * 4. Store `lastUsedItemInfo` for the CallbackCoordinator.
     *
     * Turn mutation and all callbacks belong to `resolveItemUse`.
     *
     * Stores the outcome in `lastUseItemResult`:
     * - `true`  — handler found, item wasn't used before, `onUse` called.
     * - `false` — item not found, no `onUse` handler, or already used.
     */
    useItem: assign(({ context, event }) => {
      if (event.type !== "USE_ITEM") return {};

      const { itemId, isPlayerShot } = event;

      const isCallersTurn = isPlayerShot
        ? context.currentTurn === "PLAYER_TURN"
        : context.currentTurn === "ENEMY_TURN";

      if (!isCallersTurn) return { lastUseItemResult: false };

      const state = context.engine.getState();
      const items = isPlayerShot ? state.enemyItems : state.playerItems;
      const item = items[itemId];

      if (!item?.onUse) return { lastUseItemResult: false };

      if (context.engine.isItemUsed(itemId, isPlayerShot)) {
        return { lastUseItemResult: false };
      }

      const turnBeforeItemUse = context.currentTurn;
      let useToggleCount = 0;

      let capturedRuleSet: unknown = null;
      const itemCtx = buildUseContext(
        context.engine,
        item,
        isPlayerShot,
        context.currentTurn,
        () => { useToggleCount++; },
        (rs) => { capturedRuleSet = rs; },
      );

      item.onUse(itemCtx);
      context.engine.markItemUsed(itemId, isPlayerShot);

      return {
        lastUseItemResult: true,
        turnBeforeItemUse,
        useToggleCount,
        lastUsedItemInfo: { itemId, isPlayerShot, item },
        pendingRuleSet: capturedRuleSet as typeof context.ruleSet | null,
      };
    }),

    /**
     * Step 2 of the item-use cycle: resolve the turn outcome and fire all
     * match-level callbacks through the CallbackCoordinator (single call).
     *
     * 1. Apply `useToggleCount` accumulated by `useItem`'s handler.
     * 2. Ask the ruleset whether the turn should also toggle after item use.
     * 3. Check for game-over.
     * 4. Fire all callbacks via `fireMatchCallbacks`.
     *
     * Skipped entirely when `lastUseItemResult` is `false` (invalid use).
     */
    resolveItemUse: assign(({ context }) => {
      if (!context.lastUseItemResult) return {};

      // Apply toggles the onUse handler accumulated.
      const itemToggledTurn = context.useToggleCount % 2 !== 0;
      let currentTurn: GameTurn = itemToggledTurn
        ? context.currentTurn === "PLAYER_TURN" ? "ENEMY_TURN" : "PLAYER_TURN"
        : context.currentTurn;
      let rulesetToggledTurn = false;
      const stateAfterUse = context.engine.getState();
      if (!itemToggledTurn && !stateAfterUse.isGameOver) {
        const itemUseTurnDecision = context.ruleSet.decideTurnOnItemUse?.(
          context.turnBeforeItemUse === "PLAYER_TURN",
          stateAfterUse,
        );
        if (itemUseTurnDecision?.shouldToggleTurn) {
          currentTurn = currentTurn === "PLAYER_TURN" ? "ENEMY_TURN" : "PLAYER_TURN";
          rulesetToggledTurn = true;
        }
      }

      let winner = null;
      const stateForGameOver = context.engine.getState();
      if (!stateForGameOver.isGameOver) {
        const gameOverDecision = context.ruleSet.checkGameOver(stateForGameOver);
        if (gameOverDecision.isGameOver && gameOverDecision.winner) {
          context.engine.setGameOver(gameOverDecision.winner);
          winner = gameOverDecision.winner;
        }
      }

      if (context.lastUsedItemInfo) {
        fireMatchCallbacks(context.callbacks, context.engine, {
          kind: "itemUse",
          itemId: context.lastUsedItemInfo.itemId,
          isPlayerShot: context.lastUsedItemInfo.isPlayerShot,
          item: context.lastUsedItemInfo.item,
          currentTurn,
          turnToggled: itemToggledTurn || rulesetToggledTurn,
          winner,
        });
      }

      return {
        currentTurn,
        useToggleCount: 0,
        lastUsedItemInfo: null,
        pendingRuleSet: null,
      };
    }),
  },
}).createMachine({
  id: "match",
  initial: "idle",

  /**
   * Context is initialized with a fresh GameEngine and the chosen ruleset.
   * The engine is held by reference; the machine only updates metadata
   * (pending plan, last result, errors).
   */
  context: ({ input }) => {
    const callbacks = input?.callbacks;
    const engine = input?.engine ?? new GameEngine(input?.config ?? {});

    return {
      engine,
      callbacks,
      ruleSet: input?.ruleSet ?? DefaultRuleSet,
      currentTurn: "PLAYER_TURN" as GameTurn,
      pendingPlan: null,
      lastAttackResult: null,
      lastTurnDecision: null,
      planError: null,
      lastUseItemResult: null,
      turnBeforeItemUse: null,
      pendingRuleSet: null,
      lastAttackIsPlayerShot: null,
      lastAttackCenter: null,
      collectToggleCount: 0,
      useToggleCount: 0,
      lastUsedItemInfo: null,
    };
  },

  states: {
    /**
     * idle — machine created, no active match.
     * Waits for INITIALIZE to transition to active.
     */
    idle: {
      on: {
        INITIALIZE: {
          target: "active",
          actions: "initializeEngine",
        },
      },
    },

    /**
     * active — match in progress.
     * Compound state with three sub-states that model the turn cycle.
     */
    active: {
      initial: "planning",

      on: {
        INITIALIZE: {
          target: "active.planning",
          actions: "initializeEngine",
        },
        RESET: {
          target: "idle",
          actions: "resetEngine",
        },
        SET_RULESET: {
          actions: "setRuleSet",
        },
        SYNC_TURN: {
          actions: "syncTurn",
        },
        SYNC_SHOTS: {
          actions: "syncShots",
        },
      },

      states: {
        /**
         * planning — waiting for the current player to choose a target.
         */
        planning: {
          on: {
            PLAN_SHOT: [
              {
                guard: "isValidPlan",
                target: "planned",
                actions: "storePlan",
              },
              {
                actions: "setPlanError",
              },
            ],
            USE_ITEM: {
              target: "resolvingItemUse",
              actions: "useItem",
            },
          },
        },

        /**
         * planned — plan stored, waiting for confirmation.
         * The player may cancel, re-plan, or confirm.
         */
        planned: {
          on: {
            PLAN_SHOT: [
              {
                guard: "isValidPlan",
                target: "planned",
                actions: ["clearPlan", "storePlan"],
              },
              {
                actions: "setPlanError",
              },
            ],
            CONFIRM_ATTACK: {
              target: "attacking",
            },
            CANCEL_PLAN: {
              target: "planning",
              actions: "clearPlan",
            },
          },
        },

        /**
         * resolvingItemUse — transient state.
         * On entry, applies ruleset turn logic after an item activation and
         * immediately transitions: to gameOver if the match ended, or back
         * to planning.
         */
        resolvingItemUse: {
          entry: "resolveItemUse",
          always: [
            {
              guard: "isGameOver",
              target: "#match.gameOver",
            },
            {
              target: "planning",
            },
          ],
        },

        /**
         * attacking — transient state (steps 1a + 1b).
         * On entry, fires the shot pattern in the engine (executeAttack) and
         * then runs item onCollect lifecycle handlers (runCollectHandlers),
         * before immediately advancing to resolvingTurn.
         */
        attacking: {
          entry: ["executeAttack", "runCollectHandlers"],
          always: [{ target: "resolvingTurn" }],
        },

        /**
         * resolvingTurn — transient state (step 2).
         * On entry, applies ruleset turn logic and immediately transitions:
         * to gameOver if the match ended, or back to planning.
         */
        resolvingTurn: {
          entry: "resolveTurn",
          always: [
            {
              guard: "isGameOver",
              target: "#match.gameOver",
            },
            {
              target: "planning",
            },
          ],
        },
      },
    },

    /**
     * gameOver — final state.
     * The winner is available at context.engine.getState().winner.
     */
    gameOver: {
      type: "final",
    },
  },
});

/**
 * Creates and starts a ready-to-use matchMachine actor.
 *
 * @example
 * ```ts
 * const actor = createMatchActor({ ruleSet: ClassicRuleSet });
 * actor.subscribe(snapshot => console.log(snapshot.value));
 * actor.start();
 *
 * actor.send({ type: 'INITIALIZE', playerShips: [...], enemyShips: [...] });
 * actor.send({ type: 'PLAN_SHOT', centerX: 3, centerY: 4, isPlayerShot: true });
 * actor.send({ type: 'CONFIRM_ATTACK' });
 * ```
 */
export function createMatchActor(
  input?: MatchMachineInput,
  options?: Parameters<typeof createActor>[1],
) {
  return createActor(matchMachine, { input, ...options });
}

export type MatchMachineActor = ReturnType<typeof createMatchActor>;
export type MatchMachineSnapshot = ReturnType<MatchMachineActor["getSnapshot"]>;

/**
 * Selector: engine state extracted from the current snapshot.
 * Avoids calling `context.engine.getState()` directly in consumers.
 */
export function selectGameState(snapshot: MatchMachineSnapshot) {
  return snapshot.context.engine.getState();
}

/**
 * Selector: current turn ('PLAYER_TURN' | 'ENEMY_TURN').
 */
export function selectCurrentTurn(snapshot: MatchMachineSnapshot) {
  return snapshot.context.currentTurn;
}

/**
 * Selector: match winner, or null if the match is still in progress.
 */
export function selectWinner(snapshot: MatchMachineSnapshot) {
  return snapshot.context.engine.getWinner();
}

/**
 * Selector: last error produced while planning a shot.
 */
export function selectPlanError(snapshot: MatchMachineSnapshot) {
  return snapshot.context.planError;
}

/**
 * Selector: result of the last executed attack.
 */
export function selectLastAttackResult(snapshot: MatchMachineSnapshot) {
  return snapshot.context.lastAttackResult;
}
