import { describe, expect, it } from "vitest";

import { createMatch, Logger, StandardBoardView, withView } from "../../engine";
import type { GameSetup } from "../../manager";

const setup: GameSetup = {
  playerShips: [
    { coords: [0, 0], width: 2, height: 1, shipId: 0 },
    { coords: [3, 3], width: 1, height: 2, shipId: 1 },
  ],
  enemyShips: [
    { coords: [6, 6], width: 2, height: 1, shipId: 0 },
    { coords: [8, 2], width: 1, height: 2, shipId: 1 },
  ],
  initialTurn: "PLAYER_TURN",
  config: {
    boardView: withView({ width: 10, height: 10 }, StandardBoardView),
  },
};

describe("Logger", () => {
  it("stores machine events from a normal attack flow", () => {
    const logger = new Logger();
    const match = createMatch({ setup, logger });

    match.initializeMatch();
    const plan = match.planShot(0, 0, 0, true);
    expect(plan.ready).toBe(true);
    match.confirmAttack();

    const logs = match.getEventLog();

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((event) => event.eventType === "INITIALIZE")).toBe(true);
    expect(logs.some((event) => event.eventType === "PLAN_SHOT")).toBe(true);
    expect(logs.some((event) => event.eventType === "CONFIRM_ATTACK")).toBe(true);

    const lastEvent = match.getLastEventLog();
    expect(lastEvent).toBeDefined();
    expect(lastEvent?.timestamp).toContain("T");
    expect(typeof lastEvent?.machineState).toBe("string");
  });

  it("clears stored events", () => {
    const match = createMatch({ setup });

    match.initializeMatch();
    expect(match.getEventLog().length).toBeGreaterThan(0);

    match.clearEventLog();
    expect(match.getEventLog()).toHaveLength(0);
    expect(match.getLastEventLog()).toBeUndefined();
  });
});
