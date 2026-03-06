import type { MatchLogger, MatchMachineLogEvent } from "../../types/machines";

/**
 * In-memory logger used by `matchMachine` to persist processed event snapshots.
 */
export class Logger implements MatchLogger {
  private events: MatchMachineLogEvent[] = [];
  private nextId = 1;

  public add(event: Omit<MatchMachineLogEvent, "id">): MatchMachineLogEvent {
    const entry: MatchMachineLogEvent = {
      id: this.nextId++,
      ...event,
    };

    this.events.push(entry);
    return entry;
  }

  public all(): MatchMachineLogEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }

  public last(): MatchMachineLogEvent | undefined {
    return this.events[this.events.length - 1];
  }
}
