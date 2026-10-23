import type { SavedWorldPart, WorldPart, WorldPartKey } from "../../types";

/** Saved parts of a world, by part id (`WorldSnapshot.parts`). */
export type SavedWorldParts = Readonly<Record<string, SavedWorldPart>>;

function assertUniqueIds(parts: readonly WorldPart<unknown, unknown, never>[]): void {
  const seen = new Set<string>();
  parts.forEach(({ id }) => {
    if (seen.has(id)) throw new Error(`World part "${id}" is registered twice`);
    seen.add(id);
  });
}

/**
 * The parts of one world (`World.parts`): the state of each registered {@link WorldPart}, read by
 * key (`get(CLOCK_PART)`), and how they are saved and restored. A part is registered once per
 * world (the app lists them, e.g. `createWorldParts()`); the world never names any of them.
 */
export class WorldParts {
  private readonly parts: readonly WorldPart<unknown, unknown, never>[];
  private readonly states: ReadonlyMap<string, unknown>;
  /** Saved parts no registered part restored: kept so that saving again does not lose them. */
  private readonly detached: SavedWorldParts;

  private constructor(
    parts: readonly WorldPart<unknown, unknown, never>[],
    states: ReadonlyMap<string, unknown>,
    detached: SavedWorldParts,
  ) {
    this.parts = parts;
    this.states = states;
    this.detached = detached;
  }

  /**
   * Creates the state of every part for a newly generated world, in list order.
   *
   * @throws When two parts share an id; no part is created.
   */
  static create<TContext>(parts: readonly WorldPart<unknown, unknown, TContext>[], context: TContext): WorldParts {
    assertUniqueIds(parts);
    return new WorldParts(parts, new Map(parts.map((part) => [part.id, part.create(context)])), {});
  }

  /**
   * Restores every part from `saved`, in list order. A part with no saved data (added after the
   * save) gets a new state, as in a new world; saved data no part claims (a part left out) is kept
   * as it was and saved again by {@link serialize}.
   *
   * @throws When two parts share an id, or a part was saved at a version other than its own.
   */
  static restore<TContext>(
    parts: readonly WorldPart<unknown, unknown, TContext>[],
    saved: SavedWorldParts,
    context: TContext,
  ): WorldParts {
    assertUniqueIds(parts);
    const states = new Map(
      parts.map((part) => {
        const entry = Object.hasOwn(saved, part.id) ? saved[part.id] : undefined;
        if (entry === undefined) return [part.id, part.create(context)];
        if (entry.version !== part.version) {
          throw new Error(
            `Unsupported save of world part "${part.id}": version ${String(entry.version)}, expected ${String(part.version)}`,
          );
        }
        return [part.id, part.restore(entry.data, context)];
      }),
    );
    const detached = Object.fromEntries(Object.entries(saved).filter(([id]) => !states.has(id)));
    return new WorldParts(parts, states, detached);
  }

  /** Ids of the registered parts, in registration order. */
  get ids(): string[] {
    return this.parts.map(({ id }) => id);
  }

  /** Whether the world has the part `key` names. */
  has<TState>(key: WorldPartKey<TState>): boolean {
    return this.states.has(key.id);
  }

  /** State of the part `key` names, or `undefined` when the world has no such part. */
  find<TState>(key: WorldPartKey<TState>): TState | undefined {
    // The key's id is the part's, and the part created this state: same type by construction.
    return this.states.get(key.id) as TState | undefined;
  }

  /**
   * State of the part `key` names.
   *
   * @throws When the world has no such part (it was not registered).
   */
  get<TState>(key: WorldPartKey<TState>): TState {
    if (!this.states.has(key.id)) throw new Error(`The world has no "${key.id}" part`);
    return this.states.get(key.id) as TState;
  }

  /** Saves every part with its version, then the detached ones, as plain JSON. */
  serialize(): Record<string, SavedWorldPart> {
    const saved = Object.fromEntries(
      this.parts.map((part) => [part.id, { version: part.version, data: part.serialize(this.states.get(part.id)) }]),
    );
    return { ...saved, ...this.detached };
  }
}
