import { setup, assign, createActor } from "xstate";
import { GameEngine } from "../logic";
import { DefaultRuleSet } from "../rulesets";
import { SINGLE_SHOT } from "../../constants/shotPatterns";
import { PlanError } from "../errors";
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
     * Stores `lastAttackResult` and clears the pending plan.
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
      };
    }),

    /**
     * Step 2 of the turn cycle: resolve the turn outcome.
     *
     * 1. Ask the ruleset to decide the turn outcome
     * 2. Toggle the turn if required
     * 3. Check for game-over via the ruleset
     */
    resolveTurn: assign(({ context }) => {
      if (!context.lastAttackResult) return {};

      const engineInternal = context.engine.getInternalAPI();

      const stateAfterAttack = context.engine.getState();
      const lastTurnDecision = context.ruleSet.decideTurn(
        context.lastAttackResult,
        stateAfterAttack,
      );

      if (lastTurnDecision.shouldToggleTurn) {
        engineInternal.toggleTurn();
      }

      const stateAfterTurn = context.engine.getState();
      if (!stateAfterTurn.isGameOver) {
        const gameOverDecision = context.ruleSet.checkGameOver(stateAfterTurn);
        if (gameOverDecision.isGameOver && gameOverDecision.winner) {
          engineInternal.setGameOver(gameOverDecision.winner);
        }
      }

      return { lastTurnDecision };
    }),

    /** Initializes the engine with ship placements and the starting turn */
    initializeEngine: assign(({ context, event }) => {
      if (event.type !== "INITIALIZE") return {};

      context.engine.initializeGame(
        event.playerShips,
        event.enemyShips,
        event.initialTurn ?? "PLAYER_TURN",
      );

      return {
        planError: null,
        lastAttackResult: null,
        lastTurnDecision: null,
      };
    }),

    /** Resets the engine to its initial empty state */
    resetEngine: assign(({ context }) => {
      context.engine.resetGame();
      return {
        pendingPlan: null,
        lastAttackResult: null,
        lastTurnDecision: null,
        planError: null,
      };
    }),

    /** Swaps the active ruleset */
    setRuleSet: assign(({ event }) => {
      if (event.type !== "SET_RULESET") return {};
      return { ruleSet: event.ruleSet };
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
    const engine = input?.engine ?? new GameEngine(input?.config ?? {});
    return {
      engine,
      ruleSet: input?.ruleSet ?? DefaultRuleSet,
      pendingPlan: null,
      lastAttackResult: null,
      lastTurnDecision: null,
      planError: null,
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
         *
         * Kept as a separate state so future logic (e.g. animations, network
         * acknowledgement) can be inserted here without touching the attack
         * step or the public event API.
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
