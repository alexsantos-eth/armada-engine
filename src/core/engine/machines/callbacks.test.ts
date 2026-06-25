import { describe, expect, it, vi } from "vitest";
import { fireMatchCallbacks } from "./callbacks";
import { GameEngine } from "../logic";
import type { MatchCallbacks, AttackCyclePayload, ItemUseCyclePayload } from "../../types/callbacks";
import type { ShotPatternResult } from "../../types/shots";
import type { GameItem } from "../../types/entities";

describe("Match Callbacks", () => {
  it("should do nothing if callbacks are undefined", () => {
    const engine = new GameEngine();
    expect(() => fireMatchCallbacks(undefined, engine, { kind: "matchStart", currentTurn: "PLAYER_TURN" })).not.toThrow();
  });

  it("should trigger matchStart callbacks", () => {
    const engine = new GameEngine();
    const callbacks: MatchCallbacks = {
      onMatchStart: vi.fn(),
      onStateChange: vi.fn(),
    };

    fireMatchCallbacks(callbacks, engine, { kind: "matchStart", currentTurn: "PLAYER_TURN" });
    expect(callbacks.onMatchStart).toHaveBeenCalled();
    expect(callbacks.onStateChange).toHaveBeenCalled();
  });

  it("should trigger reset callbacks", () => {
    const engine = new GameEngine();
    const callbacks: MatchCallbacks = {
      onStateChange: vi.fn(),
    };

    fireMatchCallbacks(callbacks, engine, { kind: "reset", currentTurn: "ENEMY_TURN" });
    expect(callbacks.onStateChange).toHaveBeenCalled();
  });

  describe("attack lifecycle", () => {
    it("should trigger onItemCollected for player shots", () => {
      const engine = new GameEngine();
      const enemyItem: GameItem = { itemId: 0, coords: [0, 0], part: 1 };
      engine.initializeGame([], [], [], [enemyItem], [], [], [], []);

      const callbacks: MatchCallbacks = {
        onItemCollected: vi.fn(),
      };

      const payload: AttackCyclePayload = {
        kind: "attack",
        result: {
          success: true,
          shots: [{ x: 0, y: 0, hit: false, collected: true, itemFullyCollected: true, itemId: 0, executed: true }],
        } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 0, centerY: 0,
        currentTurn: "PLAYER_TURN",
      } as unknown as AttackCyclePayload;

      fireMatchCallbacks(callbacks, engine, payload);

      expect(callbacks.onItemCollected).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 0 }),
        enemyItem,
        true
      );
    });

    it("should trigger onItemCollected for enemy shots", () => {
      const engine = new GameEngine();
      const playerItem: GameItem = { itemId: 0, coords: [0, 0], part: 1 };
      engine.initializeGame([], [], [playerItem], [], [], [], [], []);

      const callbacks: MatchCallbacks = {
        onItemCollected: vi.fn(),
      };

      const payload: AttackCyclePayload = {
        kind: "attack",
        result: {
          success: true,
          shots: [{ x: 0, y: 0, hit: false, collected: true, itemFullyCollected: true, itemId: 0, executed: true }],
        } as unknown as ShotPatternResult,
        isPlayerShot: false,
        centerX: 0, centerY: 0,
        currentTurn: "ENEMY_TURN",
      } as unknown as AttackCyclePayload;

      fireMatchCallbacks(callbacks, engine, payload);

      expect(callbacks.onItemCollected).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 0 }),
        playerItem,
        false
      );
    });

    it("should NOT trigger onItemCollected if item is undefined", () => {
      const engine = new GameEngine();
      engine.initializeGame([], [], [], [], [], [], [], []); // No items

      const callbacks: MatchCallbacks = {
        onItemCollected: vi.fn(),
      };

      const payload: AttackCyclePayload = {
        kind: "attack",
        result: {
          success: true,
          shots: [{ x: 0, y: 0, hit: false, collected: true, itemFullyCollected: true, itemId: 0, executed: true }],
        } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 0, centerY: 0,
        currentTurn: "PLAYER_TURN",
      } as unknown as AttackCyclePayload;

      fireMatchCallbacks(callbacks, engine, payload);

      expect(callbacks.onItemCollected).not.toHaveBeenCalled();
    });

    it("should NOT trigger onItemCollected if itemFullyCollected is false", () => {
      const engine = new GameEngine();
      const enemyItem: GameItem = { itemId: 0, coords: [0, 0], part: 1 };
      engine.initializeGame([], [], [], [enemyItem], [], [], [], []);

      const callbacks: MatchCallbacks = {
        onItemCollected: vi.fn(),
      };

      const payload: AttackCyclePayload = {
        kind: "attack",
        result: {
          success: true,
          shots: [{ x: 0, y: 0, hit: false, collected: true, itemFullyCollected: false, itemId: 0, executed: true }],
        } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 0, centerY: 0,
        currentTurn: "PLAYER_TURN",
      } as unknown as AttackCyclePayload;

      fireMatchCallbacks(callbacks, engine, payload);

      expect(callbacks.onItemCollected).not.toHaveBeenCalled();
    });

    it("should trigger onTurnChange when rulesetToggledTurn is true", () => {
      const engine = new GameEngine();
      const callbacks: MatchCallbacks = {
        onTurnChange: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "attack",
        result: { success: true, shots: [] } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 0, centerY: 0,
        currentTurn: "ENEMY_TURN",
        rulesetToggledTurn: true,
      } as unknown as AttackCyclePayload);

      expect(callbacks.onTurnChange).toHaveBeenCalledWith("ENEMY_TURN");
    });

    it("should trigger onShot callback with centerShot data", () => {
      const engine = new GameEngine();
      const callbacks: MatchCallbacks = {
        onShot: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "attack",
        result: {
          success: true,
          shots: [
            { x: 5, y: 5, hit: true, executed: true, patternId: 2, shipId: 1 },
            { x: 6, y: 5, hit: false, executed: true, patternId: 2 },
          ],
        } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 5, centerY: 5,
        currentTurn: "PLAYER_TURN",
      } as unknown as AttackCyclePayload);

      expect(callbacks.onShot).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 5,
          y: 5,
          hit: true,
          shipId: 1,
          patternId: 2,
          patternCenterX: 5,
          patternCenterY: 5,
        }),
        true
      );
    });

    it("should trigger onShot callback with default patternId 0 when no executed shot", () => {
      const engine = new GameEngine();
      const callbacks: MatchCallbacks = {
        onShot: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "attack",
        result: {
          success: true,
          shots: [
            { x: 5, y: 5, hit: false, executed: false },
          ],
        } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 5, centerY: 5,
        currentTurn: "PLAYER_TURN",
      } as unknown as AttackCyclePayload);

      expect(callbacks.onShot).toHaveBeenCalledWith(
        expect.objectContaining({
          patternId: 0,
        }),
        true
      );
    });

    it("should trigger onGameOver when winner is present", () => {
      const engine = new GameEngine();
      const callbacks: MatchCallbacks = {
        onGameOver: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "attack",
        result: { success: true, shots: [] } as unknown as ShotPatternResult,
        isPlayerShot: true,
        centerX: 0, centerY: 0,
        currentTurn: "PLAYER_TURN",
        winner: "player",
      } as unknown as AttackCyclePayload);

      expect(callbacks.onGameOver).toHaveBeenCalledWith("player");
    });
  });

  describe("itemUse lifecycle", () => {
    it("should trigger onItemUse when isPlayerShot is true", () => {
      const engine = new GameEngine();
      const item: GameItem = { itemId: 5, coords: [0, 0], part: 1 };
      const callbacks: MatchCallbacks = {
        onItemUse: vi.fn(),
      };

      const payload: ItemUseCyclePayload = {
        kind: "itemUse",
        itemId: 5,
        isPlayerShot: true,
        item,
        currentTurn: "PLAYER_TURN",
      } as unknown as ItemUseCyclePayload;

      fireMatchCallbacks(callbacks, engine, payload);

      expect(callbacks.onItemUse).toHaveBeenCalledWith(5, true, item, undefined);
    });
    
    it("should trigger onItemUse with shipId", () => {
      const engine = new GameEngine();
      const item: GameItem = { itemId: 5, coords: [0, 0], part: 1 };
      const callbacks: MatchCallbacks = {
        onItemUse: vi.fn(),
      };

      const payload: ItemUseCyclePayload = {
        kind: "itemUse",
        itemId: 5,
        isPlayerShot: true,
        item,
        currentTurn: "PLAYER_TURN",
        shipId: 3,
      } as unknown as ItemUseCyclePayload;

      fireMatchCallbacks(callbacks, engine, payload);

      expect(callbacks.onItemUse).toHaveBeenCalledWith(5, true, item, 3);
    });

    it("should NOT trigger onItemUse when isPlayerShot is false", () => {
      const engine = new GameEngine();
      const item: GameItem = { itemId: 5, coords: [0, 0], part: 1 };
      const callbacks: MatchCallbacks = {
        onItemUse: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "itemUse",
        itemId: 5,
        isPlayerShot: false,
        item,
        currentTurn: "ENEMY_TURN",
      } as unknown as ItemUseCyclePayload);

      expect(callbacks.onItemUse).not.toHaveBeenCalled();
    });

    it("should trigger onTurnChange when turnToggled is true", () => {
      const engine = new GameEngine();
      const callbacks: MatchCallbacks = {
        onTurnChange: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "itemUse",
        itemId: 0,
        isPlayerShot: true,
        item: { itemId: 0, coords: [0,0], part: 1 },
        currentTurn: "ENEMY_TURN",
        turnToggled: true,
      } as unknown as ItemUseCyclePayload);

      expect(callbacks.onTurnChange).toHaveBeenCalledWith("ENEMY_TURN");
    });

    it("should trigger onGameOver when winner is present", () => {
      const engine = new GameEngine();
      const callbacks: MatchCallbacks = {
        onGameOver: vi.fn(),
      };

      fireMatchCallbacks(callbacks, engine, {
        kind: "itemUse",
        itemId: 0,
        isPlayerShot: true,
        item: { itemId: 0, coords: [0,0], part: 1 },
        currentTurn: "PLAYER_TURN",
        winner: "enemy",
      } as unknown as ItemUseCyclePayload);

      expect(callbacks.onGameOver).toHaveBeenCalledWith("enemy");
    });
  });
});
