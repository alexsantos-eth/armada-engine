import { describe, expect, it, vi } from "vitest";
import {
  createMatchActor,
  selectGameState,
  selectCurrentTurn,
  selectWinner,
  selectPlanError,
  selectLastAttackResult
} from "./match";
import { GameEngine } from "../logic";
import type { MatchCallbacks, MatchLogger, MatchMachineLogEvent } from "../../types";
import { PlanError } from "../../types";
import type { ItemActionContext, ShipActionContext } from "../../types/entities";
import { DEFAULT_GAME_MODE } from "../../modes";

describe("Match Machine", () => {
  it("should select state properties correctly", () => {
    const engine = new GameEngine();
    const callbacks: MatchCallbacks = {};
    const ruleSet = DEFAULT_GAME_MODE.ruleSet;
    const actor = createMatchActor({
      engine,
      callbacks,
      ruleSet,
    });
    actor.start();

    const snapshot = actor.getSnapshot();
    expect(selectGameState(snapshot)).toBeDefined();
    expect(selectCurrentTurn(snapshot)).toBe("PLAYER_TURN");
    expect(selectWinner(snapshot)).toBeNull();
    expect(selectPlanError(snapshot)).toBeNull();
    expect(selectLastAttackResult(snapshot)).toBeNull();
  });

  it("should log events and handle circular JSON safely", () => {
    const engine = new GameEngine();
    const logs: MatchMachineLogEvent[] = [];
    const logger: MatchLogger = {
      add: (entry) => {
        const e = { ...entry, id: logs.length } as unknown as MatchMachineLogEvent;
        logs.push(e);
        return e;
      },
      clear: () => { logs.length = 0; },
      all: () => logs,
      last: () => logs[logs.length - 1],
    };

    // Mock JSON.stringify to throw on the first call to simulate circular reference
    const originalStringify = JSON.stringify;
    let thrown = false;
    vi.spyOn(JSON, 'stringify').mockImplementation((val) => {
      if (!thrown) {
        thrown = true;
        throw new Error("Circular");
      }
      return originalStringify(val);
    });

    const actor = createMatchActor({
      engine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet,
      logger
    });
    actor.start();

    actor.send({
      type: "INITIALIZE",
      playerShips: [],
      enemyShips: [],
      initialTurn: "PLAYER_TURN"
    });

    // Trigger an event to log
    actor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });

    expect(logs.length).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });

  it("should handle error paths in planning and executing shots", () => {
    const engine = new GameEngine();
    engine.initializeGame([], [], [], [], [], [], [], []);

    const actor = createMatchActor({
      engine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    actor.start();

    actor.send({
      type: "INITIALIZE",
      playerShips: [],
      enemyShips: [],
      playerShotPatterns: [{ id: "s1", offsets: [{ dx: 0, dy: 0 }] as { dx: number, dy: number }[] }],
      enemyShotPatterns: [{ id: "s1", offsets: [{ dx: 0, dy: 0 }] as { dx: number, dy: number }[] }],
      initialTurn: "PLAYER_TURN"
    });

    // 1. Not your turn
    actor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });
    actor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 5, centerY: 5 });
    expect(selectPlanError(actor.getSnapshot())).not.toBeNull();

    actor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });

    // 2. Invalid position
    actor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: -1, centerY: -1 });
    expect(selectPlanError(actor.getSnapshot())).not.toBeNull();

    // 3. Pattern not available
    actor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 5, centerY: 5, patternIdx: 99 });
    expect(selectPlanError(actor.getSnapshot())).not.toBeNull();

    // 4. Cell already shot
    engine.setBoardDimensions(10, 10);
    const spy = vi.spyOn(engine, 'isCellShot').mockReturnValue(true);
    actor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 5, centerY: 5, patternIdx: 0 });
    expect(selectPlanError(actor.getSnapshot())).toBe("Cell already shot");
    spy.mockRestore();
  });

  it("should handle initialization, setup, and item usage", () => {
    const engine = new GameEngine();
    const actor = createMatchActor({
      engine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    actor.start();

    actor.send({
      type: "INITIALIZE",
      playerShips: [],
      enemyShips: [],
      initialTurn: "PLAYER_TURN"
    });

    actor.send({ type: "SET_RULESET", ruleSet: DEFAULT_GAME_MODE.ruleSet });
    actor.send({ type: "SYNC_SHOTS", playerShots: [], enemyShots: [] });

    // Test USE_ITEM
    actor.send({
      type: "USE_ITEM",
      itemId: 99,
      isPlayerShot: true,
      shipId: 1
    });
  });

  it("should handle full attack cycle with collect and destroy handlers", () => {
    const engine = new GameEngine();
    const actor = createMatchActor({
      engine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    actor.start();

    const playerShips = [{
      coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0, onDestroy: (ctx: ShipActionContext) => {
        ctx.toggleTurn();
        ctx.setRuleSet(DEFAULT_GAME_MODE.ruleSet);
        ctx.setBoardViewPlayerSide([]);
        ctx.setBoardViewEnemySide([]);
      }
    }];

    const playerItems = [
      {
        coords: [0, 1] as [number, number], part: 1, itemId: 0, onCollect: (ctx: ItemActionContext) => {
          ctx.toggleTurn();
          ctx.setRuleSet(DEFAULT_GAME_MODE.ruleSet);
          ctx.setBoardViewPlayerSide([]);
          ctx.setBoardViewEnemySide([]);
        }
      },
      {
        coords: [0, 2] as [number, number], part: 1, itemId: 1, onCollect: (ctx: ItemActionContext) => {
          ctx.toggleTurn();
          ctx.setBoardViewPlayerSide([]);
        }
      },
      {
        coords: [0, 4] as [number, number], part: 1, itemId: 2, onCollect: (ctx: ItemActionContext) => {
          ctx.setBoardViewEnemySide([]);
        }
      }
    ];
    const enemyShips = [
      {
        coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0, onDestroy: (ctx: ShipActionContext) => {
          ctx.toggleTurn();
          ctx.setRuleSet(DEFAULT_GAME_MODE.ruleSet);
          ctx.setBoardViewPlayerSide([]);
          ctx.setBoardViewEnemySide([]);
        }
      },
      { coords: [5, 5] as [number, number], width: 1, height: 1, shipId: 1 }
    ];
    const enemyItems = [
      {
        coords: [0, 1] as [number, number], part: 1, itemId: 0, onCollect: (ctx: ItemActionContext) => {
          ctx.toggleTurn();
          ctx.setRuleSet(DEFAULT_GAME_MODE.ruleSet);
          ctx.setBoardViewPlayerSide([]);
          ctx.setBoardViewEnemySide([]);
        }
      }
    ];
    const shotPatterns = [{ id: "s1", offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 1 }] as { dx: number, dy: number }[] }];

    actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      playerShotPatterns: shotPatterns,
      enemyShotPatterns: shotPatterns,
      initialTurn: "PLAYER_TURN"
    });

    actor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
    actor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: 0 });
    actor.send({ type: "CONFIRM_ATTACK" });

    // Second attack to hit playerItems[1] (ENEMY_TURN)
    actor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });
    actor.send({ type: "PLAN_SHOT", isPlayerShot: false, centerX: 0, centerY: 2, patternIdx: 0 }); // hits 0,2 and 0,3
    actor.send({ type: "CONFIRM_ATTACK" });

    // Third attack to hit playerItems[2] (ENEMY_TURN)
    actor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });
    actor.send({ type: "PLAN_SHOT", isPlayerShot: false, centerX: 0, centerY: 4, patternIdx: 0 }); // hits 0,4 and 0,5
    actor.send({ type: "CONFIRM_ATTACK" });
  });

  describe("Item Usage", () => {
    const engine = new GameEngine();
    const playerShips = [{ coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0 }];
    const enemyShips = [{ coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0 }];
    const playerItems = [{
      coords: [0, 0] as [number, number], part: 1, itemId: 0, onUse: (ctx: ItemActionContext) => {
        ctx.setRuleSet(DEFAULT_GAME_MODE.ruleSet);
        ctx.setBoardViewPlayerSide([]);
        ctx.setBoardViewEnemySide([]);
      }
    }];
    const enemyItems = [{
      coords: [0, 0] as [number, number], part: 1, itemId: 0, onUse: (ctx: ItemActionContext) => {
        ctx.toggleTurn();
        ctx.toggleTurn();
        ctx.setRuleSet(DEFAULT_GAME_MODE.ruleSet);
        ctx.setBoardViewPlayerSide([]);
        ctx.setBoardViewEnemySide([]);
      }
    }];

    const actor = createMatchActor({
      engine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    actor.start();

    actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      initialTurn: "PLAYER_TURN"
    });

    // Test RESET
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toEqual('idle');

    // Re-initialize for next tests
    actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      initialTurn: "PLAYER_TURN"
    });

    it("should handle invalid item usage", () => {
      // Test USE_ITEM
      // Not caller's turn (it's PLAYER_TURN, so enemy can't use)
      actor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: false, shipId: 0 });
    });

    it("should handle USE_ITEM full cycle", () => {
      // Use player item
      const mockRuleSet = {
        ...DEFAULT_GAME_MODE.ruleSet,
        decideTurnOnItemUse: () => ({ shouldToggleTurn: true, reason: "Item used" })
      };
      actor.send({ type: "SET_RULESET", ruleSet: mockRuleSet });
      actor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: true, shipId: 0 });

      // Try to use it again (already used)
      actor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
      actor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: true, shipId: 0 });

      // Now test gameOver during resolveItemUse
      const mockRuleSetGameOver = {
        ...DEFAULT_GAME_MODE.ruleSet,
        checkGameOver: () => ({ isGameOver: true, winner: 'player' as const })
      };
      actor.send({ type: "SET_RULESET", ruleSet: mockRuleSetGameOver });
      // Add another item so it's not "already used"
      actor.send({
        type: "INITIALIZE",
        playerShips,
        enemyShips,
        playerItems,
        enemyItems,
        initialTurn: "PLAYER_TURN"
      });
      actor.send({ type: "SET_RULESET", ruleSet: mockRuleSetGameOver });
      actor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: true, shipId: 0 });
    });

    it("should handle USE_ITEM edge cases for enemy turn and game over", () => {
      const localEngine = new GameEngine();
      const localActor = createMatchActor({
        engine: localEngine,
        callbacks: {},
        ruleSet: DEFAULT_GAME_MODE.ruleSet
      });
      localActor.start();

      const enemyItemForToggle = {
        coords: [1, 1] as [number, number],
        part: 1,
        itemId: 0,
        onUse: (ctx: ItemActionContext) => {
          ctx.toggleTurn(); // makes itemToggledTurn = true
          ctx.setBoardViewPlayerSide([]);
          ctx.setBoardViewEnemySide([]);
        }
      };

      const enemyItemForRulesetToggle = {
        coords: [1, 2] as [number, number],
        part: 1,
        itemId: 1,
        onUse: (ctx: ItemActionContext) => {
          ctx.setBoardViewEnemySide([]);
        }
      };

      const enemyItemForGameOver = {
        coords: [1, 3] as [number, number],
        part: 1,
        itemId: 2,
        onUse: (ctx: ItemActionContext) => {
          ctx.setBoardViewPlayerSide([]);
        }
      };

      const playerItemForToggle = {
        coords: [2, 2] as [number, number],
        part: 1,
        itemId: 0,
        onUse: (ctx: ItemActionContext) => {
          ctx.toggleTurn();
        }
      };

      localActor.send({
        type: "INITIALIZE",
        playerShips,
        enemyShips,
        playerItems: [enemyItemForToggle, enemyItemForRulesetToggle, enemyItemForGameOver],
        enemyItems: [playerItemForToggle],
        initialTurn: "ENEMY_TURN"
      });

      // 1. itemToggledTurn = true for ENEMY_TURN
      localActor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: false, shipId: 0 });

      // Reset turn to ENEMY_TURN because itemId 0 toggled it to PLAYER_TURN
      localActor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });

      // 2. rulesetToggledTurn for ENEMY_TURN
      const mockRuleSet = {
        ...DEFAULT_GAME_MODE.ruleSet,
        decideTurnOnItemUse: () => ({ shouldToggleTurn: true, reason: "Item used" })
      };
      localActor.send({ type: "SET_RULESET", ruleSet: mockRuleSet });
      localActor.send({ type: "USE_ITEM", itemId: 1, isPlayerShot: false, shipId: 0 });

      // Reset turn to ENEMY_TURN because itemId 1 toggled it to PLAYER_TURN
      localActor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });

      // 3. itemToggledTurn = true for PLAYER_TURN
      localActor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
      localActor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: true, shipId: 0 });

      // 4. stateAfterUse.isGameOver = true before checking game over logic
      // We can make the engine state say it's game over right before the check
      localEngine.setGameOver("enemy");
      localActor.send({ type: "USE_ITEM", itemId: 2, isPlayerShot: false, shipId: 0 });
    });
  });

  it("should handle game over in resolveTurn", () => {
    const localEngine = new GameEngine();
    const localActor = createMatchActor({
      engine: localEngine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    localActor.start();

    const enemyShipsForGameOver = [{
      coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0, onDestroy: (ctx: ShipActionContext) => {
        ctx.setBoardViewPlayerSide([]);
      }
    }];

    localActor.send({
      type: "INITIALIZE",
      playerShips: [],
      enemyShips: enemyShipsForGameOver,
      initialTurn: "PLAYER_TURN",
      playerShotPatterns: [{ id: "s1", offsets: [{ dx: 0, dy: 0 }] }]
    });

    // Test resolveTurn when engine is already game over BEFORE resolveTurn runs
    localEngine.setGameOver("enemy");
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: 0 });
    localActor.send({ type: "CONFIRM_ATTACK" });
  });

  it("should handle ODD toggle count for PLAYER_TURN", () => {
    const localEngine = new GameEngine();
    const localActor = createMatchActor({
      engine: localEngine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    localActor.start();

    const enemyShipsWithToggle = [{
      coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0, onDestroy: (ctx: ShipActionContext) => {
        ctx.toggleTurn();
        ctx.setBoardViewEnemySide([]);
      }
    }];

    localActor.send({
      type: "INITIALIZE",
      playerShips: [],
      enemyShips: enemyShipsWithToggle,
      initialTurn: "PLAYER_TURN",
      playerShotPatterns: [{ id: "s1", offsets: [{ dx: 0, dy: 0 }] }]
    });

    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: 0 });
    localActor.send({ type: "CONFIRM_ATTACK" });
  });

  it("should handle PLAN_SHOT errors and remaining edge cases", () => {
    const localEngine = new GameEngine();
    const localActor = createMatchActor({
      engine: localEngine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    localActor.start();

    const enemyShipsWithEnemySideOnly = [
      {
        coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0, onDestroy: (ctx: ShipActionContext) => {
          ctx.setBoardViewEnemySide([]);
        }
      },
      {
        coords: [1, 1] as [number, number], width: 1, height: 1, shipId: 1, onDestroy: (ctx: ShipActionContext) => {
          ctx.setBoardViewPlayerSide([]);
        }
      },
      { coords: [5, 5] as [number, number], width: 1, height: 1, shipId: 2 }
    ];

    localActor.send({
      type: "INITIALIZE",
      playerShips: [{ coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0 }],
      enemyShips: enemyShipsWithEnemySideOnly,
      initialTurn: "PLAYER_TURN",
      playerShotPatterns: [{ id: "s1", offsets: [{ dx: 0, dy: 0 }] }]
    });

    // Error: NotYourTurn (isPlayerShot: false during PLAYER_TURN)
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: false, centerX: 0, centerY: 0, patternIdx: 0 });
    expect(localActor.getSnapshot().context.planError).toEqual(PlanError.NotYourTurn);

    // Error: InvalidPosition
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: -1, centerY: -1, patternIdx: 0 });
    expect(localActor.getSnapshot().context.planError).toEqual(PlanError.InvalidPosition);

    // Error: PatternNotAvailable (PLAYER_TURN)
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: 99 });
    expect(localActor.getSnapshot().context.planError).toEqual(PlanError.PatternNotAvailable);

    // Switch to ENEMY_TURN
    localActor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });

    // Error: NotYourTurn (isPlayerShot: true during ENEMY_TURN)
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: 0 });
    expect(localActor.getSnapshot().context.planError).toEqual(PlanError.NotYourTurn);

    // Error: PatternNotAvailable (ENEMY_TURN) - tests undefined patternIdx and isPlayerShot: false
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: false, centerX: 0, centerY: 0, patternIdx: 99 });
    expect(localActor.getSnapshot().context.planError).toEqual(PlanError.PatternNotAvailable);

    // Switch back to PLAYER_TURN and execute attack to destroy ship 0 (enemySide only)
    localActor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: 0 });
    localActor.send({ type: "CONFIRM_ATTACK" });

    // Attack to destroy ship 1 (playerSide only)
    localActor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 1, centerY: 1, patternIdx: 0 });
    localActor.send({ type: "CONFIRM_ATTACK" });

    // Back to PLAYER_TURN for next attack (if ruleset toggled turn, we sync)
    localActor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });

    // Error 2: CellAlreadyShot
    localActor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 0, centerY: 0, patternIdx: undefined });
    expect(localActor.getSnapshot().context.planError).toEqual(PlanError.CellAlreadyShot);
  });

  it("should cover edge cases in turn resolution and item usage", () => {
    const engine = new GameEngine();
    const playerShips = [
      { coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0, onDestroy: () => { } },
      { coords: [1, 1] as [number, number], width: 1, height: 1, shipId: 1 }
    ];
    const enemyShips = [{ coords: [0, 0] as [number, number], width: 1, height: 1, shipId: 0 }];
    const enemyItems = [{
      coords: [0, 0] as [number, number], part: 1, itemId: 0, onUse: (ctx: ItemActionContext) => {
        ctx.deletePlayerShip(0);
        ctx.deletePlayerShip(1); // destroy both ships to trigger game over
      }
    }];
    const playerItems = [
      { coords: [0, 0] as [number, number], part: 1, itemId: 0, onUse: () => { } },
      { coords: [0, 1] as [number, number], part: 1, itemId: 1, onUse: () => { } }, // empty for rule set toggle
      { coords: [0, 2] as [number, number], part: 1, itemId: 2, onUse: (ctx: ItemActionContext) => { ctx.toggleTurn(); } } // toggles turn once
    ];

    // Cover machine context fallbacks
    const emptyActor = createMatchActor();
    emptyActor.start();

    const actor = createMatchActor({
      engine,
      callbacks: {},
      ruleSet: DEFAULT_GAME_MODE.ruleSet
    });
    actor.start();
    actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      playerItems,
      enemyItems,
      initialTurn: "ENEMY_TURN"
    });

    // 1. isPlayerShot: false in USE_ITEM and toggleTurn from ENEMY_TURN to PLAYER_TURN
    // Also covers null captured views (playerItems[0].onUse is empty)
    actor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: false, shipId: 0 });

    // 2. PLAN_SHOT without patternIdx to hit ?? 0 in resolveTurn
    actor.send({ type: "PLAN_SHOT", isPlayerShot: false, centerX: 0, centerY: 0 }); // undefined patternIdx, destroys ship 0 but not ship 1
    actor.send({ type: "CONFIRM_ATTACK" });

    // 3. stateAfterTurn.isGameOver in resolveTurn
    actor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
    actor.send({ type: "PLAN_SHOT", isPlayerShot: true, centerX: 5, centerY: 5 }); // arbitrary miss

    // Test ruleset toggle from ENEMY_TURN to PLAYER_TURN using an unused item (itemId: 1)
    // playerItems[1] does not toggle turn
    actor.send({ type: "SYNC_TURN", turn: "ENEMY_TURN" });
    const mockRuleSetEdgeCase = {
      ...DEFAULT_GAME_MODE.ruleSet,
      decideTurnOnItemUse: () => ({ shouldToggleTurn: true, reason: "Item used" })
    };
    actor.send({ type: "SET_RULESET", ruleSet: mockRuleSetEdgeCase });
    actor.send({ type: "USE_ITEM", itemId: 1, isPlayerShot: false, shipId: 0 });

    // Test itemToggledTurn from PLAYER_TURN to ENEMY_TURN
    actor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
    actor.send({ type: "USE_ITEM", itemId: 2, isPlayerShot: true, shipId: 0 });

    // Mock getState just for the resolveTurn action
    const originalGetState = engine.getState.bind(engine);
    vi.spyOn(engine, 'getState').mockImplementation(() => {
      const state = originalGetState();
      // Only mock isGameOver true when resolving turn after the attack
      if (actor.getSnapshot().value && typeof actor.getSnapshot().value === 'object' && (actor.getSnapshot().value as unknown as { active: string }).active === 'attacking') {
        return { ...state, isGameOver: true };
      }
      return state;
    });

    actor.send({ type: "CONFIRM_ATTACK" });

    // 4. Trigger game over via item to cover the true branch of stateAfterUse.isGameOver
    // enemyItems[0] deletes both player ships
    actor.send({ type: "SYNC_TURN", turn: "PLAYER_TURN" });
    actor.send({ type: "USE_ITEM", itemId: 0, isPlayerShot: true, shipId: 0 });
  });
});
