import { setup, assign, createActor } from "xstate";
import { GameEngine } from "../logic";
import { StandardBoardView } from "../../constants/views";

import {
  buildCollectContext,
  buildUseContext,
  buildDestroyContext,
} from "../item";
import { fireMatchCallbacks } from "./callbacks";
import type { GameTurn } from "../../types/game";
import type { BoardLayer } from "../../types/board";
import type { BoardViewConfig } from "../../types/config";
import type {
  MatchMachineContext,
  MatchMachineEvent,
  MatchMachineInput,
} from "./types";
import { PlanError } from "../../types";
import { DEFAULT_RULESET } from "../../constants";

export const matchMachine = setup({
  types: {} as {
    context: MatchMachineContext;
    events: MatchMachineEvent;
    input: MatchMachineInput;
  },

  guards: {
    isValidPlan: ({ context, event }) => {
      if (event.type !== "PLAN_SHOT") return false;

      const expectedTurn = event.isPlayerShot ? "PLAYER_TURN" : "ENEMY_TURN";
      if (context.currentTurn !== expectedTurn) {
        return false;
      }

      if (!context.engine.isValidPosition(event.centerX, event.centerY)) {
        return false;
      }

      const patternIdx = event.patternIdx ?? 0;
      const patterns = event.isPlayerShot
        ? context.engine.getPlayerShotPatterns()
        : context.engine.getEnemyShotPatterns();
      if (patternIdx < 0 || patternIdx >= patterns.length) {
        return false;
      }
      const pattern = patterns[patternIdx];
      if (
        pattern.offsets.length === 1 &&
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

    isGameOver: ({ context }) => context.engine.getState().isGameOver,
  },

  actions: {
    storePlan: assign(({ event }) => {
      if (event.type !== "PLAN_SHOT") return {};
      return {
        pendingPlan: {
          centerX: event.centerX,
          centerY: event.centerY,
          patternIdx: event.patternIdx ?? 0,
          isPlayerShot: event.isPlayerShot,
        },
        planError: null,
      };
    }),

    setPlanError: assign(({ context, event }) => {
      if (event.type !== "PLAN_SHOT") return {};

      let planError: PlanError = PlanError.InvalidPlan;
      const expectedTurn = event.isPlayerShot ? "PLAYER_TURN" : "ENEMY_TURN";
      if (context.currentTurn !== expectedTurn) {
        planError = PlanError.NotYourTurn;
      } else if (
        !context.engine.isValidPosition(event.centerX, event.centerY)
      ) {
        planError = PlanError.InvalidPosition;
      } else {
        const patternIdx = event.patternIdx ?? 0;
        const patterns = event.isPlayerShot
          ? context.engine.getPlayerShotPatterns()
          : context.engine.getEnemyShotPatterns();
        if (patternIdx < 0 || patternIdx >= patterns.length) {
          planError = PlanError.PatternNotAvailable;
        } else if (
          context.engine.isCellShot(
            event.centerX,
            event.centerY,
            event.isPlayerShot,
          )
        ) {
          planError = PlanError.CellAlreadyShot;
        }
      }

      return { planError };
    }),

    clearPlan: assign(() => ({
      pendingPlan: null,
      planError: null,
    })),

    executeAttack: assign(({ context }) => {
      if (!context.pendingPlan) return {};

      const { centerX, centerY, patternIdx, isPlayerShot } =
        context.pendingPlan;

      const lastAttackResult = context.engine.executeShotPattern(
        centerX,
        centerY,
        patternIdx,
        isPlayerShot,
      );

      return {
        pendingPlan: null,
        lastAttackResult,
        lastAttackIsPlayerShot: isPlayerShot,
        lastAttackCenter: { centerX, centerY, patternIdx },
      };
    }),

    runCollectHandlers: assign(({ context }) => {
      if (!context.lastAttackResult || context.lastAttackIsPlayerShot === null)
        return {};

      const isPlayerShot = context.lastAttackIsPlayerShot;

      let capturedRuleSet: unknown = null;
      let collectToggleCount = 0;
      let capturedPlayerSide: BoardLayer[] | null = null;
      let capturedEnemySide: BoardLayer[] | null = null;

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
              () => {
                collectToggleCount++;
              },
              (rs) => {
                capturedRuleSet = rs;
              },
              (layers) => {
                capturedPlayerSide = layers;
              },
              (layers) => {
                capturedEnemySide = layers;
              },
            );
            item.onCollect(ctx);
          }
        }
      }

      const updatedBoardView =
        capturedPlayerSide !== null || capturedEnemySide !== null
          ? {
              ...context.boardView,
              ...(capturedPlayerSide !== null
                ? { playerSide: capturedPlayerSide }
                : {}),
              ...(capturedEnemySide !== null
                ? { enemySide: capturedEnemySide }
                : {}),
            }
          : context.boardView;

      return {
        collectToggleCount,
        pendingRuleSet: capturedRuleSet as typeof context.ruleSet | null,
        boardView: updatedBoardView,
      };
    }),

    runDestroyHandlers: assign(({ context }) => {
      if (!context.lastAttackResult || context.lastAttackIsPlayerShot === null)
        return {};

      const isPlayerShot = context.lastAttackIsPlayerShot;

      let capturedRuleSet: unknown = null;
      let destroyToggleCount = 0;
      let capturedPlayerSide: BoardLayer[] | null = null;
      let capturedEnemySide: BoardLayer[] | null = null;

      for (const shot of context.lastAttackResult.shots) {
        if (shot.shipDestroyed && shot.shipId !== undefined) {
          const engineState = context.engine.getState();
          const ships = isPlayerShot
            ? engineState.enemyShips
            : engineState.playerShips;
          const ship = ships.find((s) => s.shipId === shot.shipId);
          if (ship?.onDestroy) {
            const ctx = buildDestroyContext(
              context.engine,
              ship,
              isPlayerShot,
              shot,
              context.currentTurn,
              () => {
                destroyToggleCount++;
              },
              (rs) => {
                capturedRuleSet = rs;
              },
              (layers) => {
                capturedPlayerSide = layers;
              },
              (layers) => {
                capturedEnemySide = layers;
              },
            );
            ship.onDestroy(ctx);
          }
        }
      }

      const updatedBoardView =
        capturedPlayerSide !== null || capturedEnemySide !== null
          ? {
              ...context.boardView,
              ...(capturedPlayerSide !== null
                ? { playerSide: capturedPlayerSide }
                : {}),
              ...(capturedEnemySide !== null
                ? { enemySide: capturedEnemySide }
                : {}),
            }
          : context.boardView;

      return {
        collectToggleCount: context.collectToggleCount + destroyToggleCount,
        ...(capturedRuleSet !== null
          ? { pendingRuleSet: capturedRuleSet as typeof context.ruleSet }
          : {}),
        boardView: updatedBoardView,
      };
    }),

    resolveTurn: assign(({ context }) => {
      if (!context.lastAttackResult) return {};

      const pendingRuleSet = context.pendingRuleSet;
      const activeRuleSet =
        (pendingRuleSet as typeof context.ruleSet | null) ?? context.ruleSet;

      let currentTurn: GameTurn =
        context.collectToggleCount % 2 === 0
          ? context.currentTurn
          : context.currentTurn === "PLAYER_TURN"
            ? "ENEMY_TURN"
            : "PLAYER_TURN";

      const stateAfterAttack = context.engine.getState();
      const lastTurnDecision = activeRuleSet.decideTurn(
        context.lastAttackResult,
        stateAfterAttack,
      );

      const rulesetToggledTurn = lastTurnDecision.shouldToggleTurn;
      if (rulesetToggledTurn) {
        currentTurn =
          currentTurn === "PLAYER_TURN" ? "ENEMY_TURN" : "PLAYER_TURN";
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
        patternIdx: context.lastAttackCenter?.patternIdx ?? 0,
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

    initializeEngine: assign(({ context, event }) => {
      if (event.type !== "INITIALIZE") return {};

      const currentTurn: GameTurn = event.initialTurn ?? "PLAYER_TURN";

      context.engine.initializeGame(
        event.playerShips,
        event.enemyShips,
        event.playerItems ?? [],
        event.enemyItems ?? [],
        event.playerObstacles ?? [],
        event.enemyObstacles ?? [],
        event.playerShotPatterns ?? [],
        event.enemyShotPatterns ?? [],
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

    setRuleSet: assign(({ event }) => {
      if (event.type !== "SET_RULESET") return {};
      return { ruleSet: event.ruleSet };
    }),

    syncTurn: assign(({ event }) => {
      if (event.type !== "SYNC_TURN") return {};
      return { currentTurn: event.turn };
    }),

    syncShots: assign(({ context, event }) => {
      if (event.type !== "SYNC_SHOTS") return {};
      context.engine.setPlayerShots(event.playerShots);
      context.engine.setEnemyShots(event.enemyShots);
      return {};
    }),

    useItem: assign(({ context, event }) => {
      if (event.type !== "USE_ITEM") return {};

      const { itemId, isPlayerShot, shipId } = event;

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
      let capturedPlayerSide: BoardLayer[] | null = null;
      let capturedEnemySide: BoardLayer[] | null = null;
      const itemCtx = buildUseContext(
        context.engine,
        item,
        isPlayerShot,
        context.currentTurn,
        () => {
          useToggleCount++;
        },
        (rs) => {
          capturedRuleSet = rs;
        },
        (layers) => {
          capturedPlayerSide = layers;
        },
        (layers) => {
          capturedEnemySide = layers;
        },
      );

      item.onUse(itemCtx);
      context.engine.markItemUsed(itemId, isPlayerShot, shipId);

      const updatedBoardView =
        capturedPlayerSide !== null || capturedEnemySide !== null
          ? {
              ...context.boardView,
              ...(capturedPlayerSide !== null
                ? { playerSide: capturedPlayerSide }
                : {}),
              ...(capturedEnemySide !== null
                ? { enemySide: capturedEnemySide }
                : {}),
            }
          : context.boardView;

      return {
        lastUseItemResult: true,
        turnBeforeItemUse,
        useToggleCount,
        lastUsedItemInfo: { itemId, isPlayerShot, item, shipId },
        pendingRuleSet: capturedRuleSet as typeof context.ruleSet | null,
        boardView: updatedBoardView,
      };
    }),

    resolveItemUse: assign(({ context }) => {
      if (!context.lastUseItemResult) return {};

      const itemToggledTurn = context.useToggleCount % 2 !== 0;
      let currentTurn: GameTurn = itemToggledTurn
        ? context.currentTurn === "PLAYER_TURN"
          ? "ENEMY_TURN"
          : "PLAYER_TURN"
        : context.currentTurn;
      let rulesetToggledTurn = false;
      const stateAfterUse = context.engine.getState();
      if (!itemToggledTurn && !stateAfterUse.isGameOver) {
        const itemUseTurnDecision = context.ruleSet.decideTurnOnItemUse?.(
          context.turnBeforeItemUse === "PLAYER_TURN",
          stateAfterUse,
        );
        if (itemUseTurnDecision?.shouldToggleTurn) {
          currentTurn =
            currentTurn === "PLAYER_TURN" ? "ENEMY_TURN" : "PLAYER_TURN";
          rulesetToggledTurn = true;
        }
      }

      let winner = null;
      const stateForGameOver = context.engine.getState();
      if (!stateForGameOver.isGameOver) {
        const gameOverDecision =
          context.ruleSet.checkGameOver(stateForGameOver);
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
          shipId: context.lastUsedItemInfo.shipId,
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
  context: ({ input }) => {
    const callbacks = input?.callbacks;
    const engine = input?.engine ?? new GameEngine(input?.config ?? {});

    return {
      engine,
      callbacks,
      ruleSet: input?.ruleSet ?? DEFAULT_RULESET,
      boardView: (input?.config?.boardView ??
        StandardBoardView) as BoardViewConfig,
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
    idle: {
      on: {
        INITIALIZE: {
          target: "active",
          actions: "initializeEngine",
        },
      },
    },

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
        attacking: {
          entry: ["executeAttack", "runCollectHandlers", "runDestroyHandlers"],
          always: [{ target: "resolvingTurn" }],
        },
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

    gameOver: {
      type: "final",
    },
  },
});

export function createMatchActor(
  input?: MatchMachineInput,
  options?: Parameters<typeof createActor>[1],
) {
  return createActor(matchMachine, { input, ...options });
}

export type MatchMachineActor = ReturnType<typeof createMatchActor>;
export type MatchMachineSnapshot = ReturnType<MatchMachineActor["getSnapshot"]>;

export function selectGameState(snapshot: MatchMachineSnapshot) {
  return snapshot.context.engine.getState();
}
export function selectCurrentTurn(snapshot: MatchMachineSnapshot) {
  return snapshot.context.currentTurn;
}
export function selectWinner(snapshot: MatchMachineSnapshot) {
  return snapshot.context.engine.getWinner();
}
export function selectPlanError(snapshot: MatchMachineSnapshot) {
  return snapshot.context.planError;
}
export function selectLastAttackResult(snapshot: MatchMachineSnapshot) {
  return snapshot.context.lastAttackResult;
}
