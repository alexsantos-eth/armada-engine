import { describe, expect, it } from "vitest";
import {
  createMatchActor,
  selectGameState,
  selectCurrentTurn,
  selectWinner,
  selectPlanError,
  selectLastAttackResult
} from "./match";
import { GameEngine } from "../logic";
import type { MatchCallbacks } from "../../types/callbacks";
import { DEFAULT_GAME_MODE } from "../../modes";

describe("Match Machine Selectors", () => {
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
});
