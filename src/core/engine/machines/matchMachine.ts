import { setup, assign, createActor } from "xstate";
import { GameEngine } from "../logic";
import { DefaultRuleSet } from "../rulesets";
import { SINGLE_SHOT } from "../../constants/shots";
import { PlanError } from "../errors";
import { buildCollectContext, buildUseContext } from "../itemContext";
import type { Shot } from "../../types/common";
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
     * Step 1 of the turn cycle: execute the shot pattern in the engine.
     * Stores `lastAttackResult`, clears the pending plan, and invokes
     * `onCollect` for every item that was fully collected by this attack.
     *
     * `onCollect` must run here (not in a Match callback) so that any
     * `ctx.setRuleSet()` call is captured into `pendingRuleSet` in machine
     * context before `resolveTurn` reads it — guaranteeing the new ruleset
     * is applied to the same turn cycle.
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

      // Fire onItemCollected BEFORE item.onCollect so the match-level observer
      // sees the event before any side-effects the item handler produces.
      if (context.callbacks?.onItemCollected) {
        const engineState = context.engine.getState();
        const notifyItems = isPlayerShot ? engineState.enemyItems : engineState.playerItems;
        for (const shot of lastAttackResult.shots) {
          if (shot.itemFullyCollected && shot.itemId !== undefined) {
            const item = notifyItems[shot.itemId];
            if (item) {
              context.callbacks.onItemCollected(shot as Shot, item, isPlayerShot);
            }
          }
        }
      }

      let capturedRuleSet: unknown = null;

      for (const shot of lastAttackResult.shots) {
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
              (rs) => { capturedRuleSet = rs; },
            );
            item.onCollect(ctx);
          }
        }
      }

      // Fire onShot once per attack with a representative center shot
      if (context.callbacks?.onShot) {
        const centerShot: Shot = {
          x: centerX,
          y: centerY,
          hit: lastAttackResult.shots.some((s) => s.hit && s.executed),
          shipId: lastAttackResult.shots.find((s) => s.hit && s.executed)?.shipId,
          patternId: pattern.id,
          patternCenterX: centerX,
          patternCenterY: centerY,
        };
        context.callbacks.onShot(centerShot, isPlayerShot);
      }

      context.callbacks?.onStateChange?.(context.engine.getState());
      return {
        pendingPlan: null,
        lastAttackResult,
        pendingRuleSet: capturedRuleSet as typeof context.ruleSet | null,
      };
    }),

    /**
     * Step 2 of the turn cycle: resolve the turn outcome.
     *
     * 1. Consume any pending ruleset change captured from `onCollect` handlers
     * 2. Ask the ruleset to decide the turn outcome
     * 3. Toggle the turn if required
     * 4. Check for game-over via the ruleset
     */
    resolveTurn: assign(({ context }) => {
      if (!context.lastAttackResult) return {};

      const pendingRuleSet = context.pendingRuleSet;
      const activeRuleSet =
        (pendingRuleSet as typeof context.ruleSet | null) ?? context.ruleSet;

      const stateAfterAttack = context.engine.getState();
      const lastTurnDecision = activeRuleSet.decideTurn(
        context.lastAttackResult,
        stateAfterAttack,
      );

      if (lastTurnDecision.shouldToggleTurn) {
        context.engine.toggleTurn();
        context.callbacks?.onTurnChange?.(context.engine.getCurrentTurn());
      }

      const stateAfterTurn = context.engine.getState();
      if (!stateAfterTurn.isGameOver) {
        const gameOverDecision = activeRuleSet.checkGameOver(stateAfterTurn);
        if (gameOverDecision.isGameOver && gameOverDecision.winner) {
          context.engine.setGameOver(gameOverDecision.winner);
          context.callbacks?.onGameOver?.(gameOverDecision.winner);
        }
      }

      context.callbacks?.onStateChange?.(context.engine.getState());
      return {
        lastTurnDecision,
        pendingRuleSet: null,
        ...(pendingRuleSet ? { ruleSet: activeRuleSet } : {}),
      };
    }),

    /** Initializes the engine with ship placements, items, and the starting turn */
    initializeEngine: assign(({ context, event }) => {
      if (event.type !== "INITIALIZE") return {};

      context.engine.initializeGame(
        event.playerShips,
        event.enemyShips,
        event.initialTurn ?? "PLAYER_TURN",
        event.playerItems ?? [],
        event.enemyItems ?? [],
      );

      context.callbacks?.onMatchStart?.();
      context.callbacks?.onStateChange?.(context.engine.getState());
      return {
        planError: null,
        lastAttackResult: null,
        lastTurnDecision: null,
        lastUseItemResult: null,
        turnBeforeItemUse: null,
        pendingRuleSet: null,
      };
    }),

    /** Resets the engine to its initial empty state */
    resetEngine: assign(({ context }) => {
      context.engine.resetGame();
      context.callbacks?.onStateChange?.(context.engine.getState());
      return {
        pendingPlan: null,
        lastAttackResult: null,
        lastTurnDecision: null,
        planError: null,
        lastUseItemResult: null,
        turnBeforeItemUse: null,
        pendingRuleSet: null,
      };
    }),

    /** Swaps the active ruleset */
    setRuleSet: assign(({ event }) => {
      if (event.type !== "SET_RULESET") return {};
      return { ruleSet: event.ruleSet };
    }),

    /**
     * Activates the `onUse` handler of a collected item.
     * Only reachable from the `planning` state — all other states silently
     * ignore the event.
     *
     * Stores the outcome in `lastUseItemResult`:
     * - `true`  — handler found, item wasn't used before, `onUse` called.
     * - `false` — item not found, no `onUse` handler, or already used.
     */
    useItem: assign(({ context, event }) => {
      if (event.type !== "USE_ITEM") return {};

      const { itemId, isPlayerShot } = event;
      const state = context.engine.getState();

      const isCallersTurn = isPlayerShot
        ? state.currentTurn === "PLAYER_TURN"
        : state.currentTurn === "ENEMY_TURN";
        
      if (!isCallersTurn) return { lastUseItemResult: false };

      const items = isPlayerShot ? state.enemyItems : state.playerItems;
      const item = items[itemId];

      if (!item?.onUse) return { lastUseItemResult: false };

      if (context.engine.isItemUsed(itemId, isPlayerShot)) {
        return { lastUseItemResult: false };
      }

      const turnBeforeItemUse = context.engine.getState().currentTurn;

      let capturedRuleSet: unknown = null;
      const itemCtx = buildUseContext(
        context.engine,
        item,
        isPlayerShot,
        (rs) => { capturedRuleSet = rs; },
      );

      item.onUse(itemCtx);
      context.engine.markItemUsed(itemId, isPlayerShot);

      if (isPlayerShot) {
        context.callbacks?.onItemUse?.(itemId, isPlayerShot, item);
      }

      context.callbacks?.onStateChange?.(context.engine.getState());
      return {
        lastUseItemResult: true,
        turnBeforeItemUse,
        pendingRuleSet: capturedRuleSet as typeof context.ruleSet | null,
      };
    }),

    /**
     * Step 2 of the item-use cycle: resolve the turn outcome.
     * Mirrors the logic that `resolveTurn` applies after an attack:
     * 1. Ask the ruleset whether the turn should toggle after item use.
     * 2. Check for game-over.
     * Skipped entirely when `lastUseItemResult` is `false` (invalid use).
     */
    resolveItemUse: assign(({ context }) => {
      if (!context.lastUseItemResult) return {};

      const stateAfterUse = context.engine.getState();

      const itemToggledTurn =
        stateAfterUse.currentTurn !== context.turnBeforeItemUse;
      let rulesetToggledTurn = false;
      if (!itemToggledTurn && !stateAfterUse.isGameOver) {
        const itemUseTurnDecision = context.ruleSet.decideTurnOnItemUse?.(
          context.turnBeforeItemUse === "PLAYER_TURN",
          stateAfterUse,
        );
        if (itemUseTurnDecision?.shouldToggleTurn) {
          context.engine.toggleTurn();
          rulesetToggledTurn = true;
        }
      }

      if (itemToggledTurn || rulesetToggledTurn) {
        context.callbacks?.onTurnChange?.(context.engine.getCurrentTurn());
      }

      const stateForGameOver = context.engine.getState();
      if (!stateForGameOver.isGameOver) {
        const gameOverDecision = context.ruleSet.checkGameOver(stateForGameOver);
        if (gameOverDecision.isGameOver && gameOverDecision.winner) {
          context.engine.setGameOver(gameOverDecision.winner);
          context.callbacks?.onGameOver?.(gameOverDecision.winner);
        }
      }

      context.callbacks?.onStateChange?.(context.engine.getState());
      return { pendingRuleSet: null };
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
      pendingPlan: null,
      lastAttackResult: null,
      lastTurnDecision: null,
      planError: null,
      lastUseItemResult: null,
      turnBeforeItemUse: null,
      pendingRuleSet: null,
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
         * attacking — transient state (step 1).
         * On entry, fires the shot pattern in the engine and immediately
         * advances to resolvingTurn.
         */
        attacking: {
          entry: "executeAttack",
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
  return snapshot.context.engine.getCurrentTurn();
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
