import { describe, expect, it } from "vitest";
import { Logger } from "./logger";
import type { MatchMachineLogEvent } from "../../types/machines";

describe("Match Logger", () => {
  it("should initialize empty", () => {
    const logger = new Logger();
    expect(logger.all()).toEqual([]);
    expect(logger.last()).toBeUndefined();
  });

  it("should add events and assign auto-incrementing ids", () => {
    const logger = new Logger();
    
    const event1 = logger.add({
      timestamp: "123",
      machineState: "test1",
      stage: "action1",
      eventType: "PLAN_SHOT"
    } as unknown as Omit<MatchMachineLogEvent, "id">);

    expect(event1.id).toBe(1);
    expect(event1.stage).toBe("action1");

    const event2 = logger.add({
      timestamp: "124",
      machineState: "test2",
      stage: "action2",
      eventType: "PLAN_SHOT"
    } as unknown as Omit<MatchMachineLogEvent, "id">);

    expect(event2.id).toBe(2);
    expect(logger.all()).toHaveLength(2);
    expect(logger.last()).toEqual(event2);
  });

  it("should clear events", () => {
    const logger = new Logger();
    logger.add({
      timestamp: "123",
      machineState: "test1",
      stage: "action1",
      eventType: "PLAN_SHOT"
    } as unknown as Omit<MatchMachineLogEvent, "id">);

    logger.clear();
    expect(logger.all()).toEqual([]);
    expect(logger.last()).toBeUndefined();
  });
});
