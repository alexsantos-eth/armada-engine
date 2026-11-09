/**
 * World parts: pieces of world state that a system owns (the clock, the player, later weather or
 * needs), registered with the world instead of written into its type. Each part creates its
 * state when a world is generated and saves and restores it on its own, with its own version, so
 * a new system with state never edits the `World` type, its snapshot or the snapshot version.
 */

/** Ties a {@link WorldPartKey} to the type of its state. Never set at runtime. */
declare const partState: unique symbol;

/**
 * Names a world part and the type of its state, to read it from a world
 * (`world.parts.get(key)`). Every {@link WorldPart} is its own key; a part made by a factory
 * (`createClockPart(startTick)`) also exports a plain key for readers.
 */
export type WorldPartKey<TState> = {
  /** Unique name of the part, and its key in a saved world (`WorldSnapshot.parts`). */
  readonly id: string;
  /**
   * Type marker only: carries `TState`, so reading a part needs no cast. A method, so that a list
   * of parts with different states (`WorldPart<unknown>[]`) accepts each of them.
   */
  [partState]?(state: TState): TState;
};

/** How a part is stored in a saved world: its data, and the version of its shape. */
export type SavedWorldPart = {
  /** The part's {@link WorldPart.version} when it was saved. */
  readonly version: number;
  /** What `serialize()` returned: plain JSON. */
  readonly data: unknown;
};

/**
 * A piece of world state owned by one system. `TContext` is what the part needs from the rest
 * of the world to create or restore its state (the player needs the ground it stands on); the
 * world gives it its terrain and entities, never other parts. State is plain data that only the
 * simulation changes, like the rest of the world.
 */
export type WorldPart<TState, TSaved = unknown, TContext = unknown> = WorldPartKey<TState> & {
  /** Version of what `serialize()` returns; bump it when that shape changes. */
  readonly version: number;
  /** Creates the state of a newly generated world. Deterministic: no clock, no `Math.random()`. */
  create(context: TContext): TState;
  /** Converts the state into plain JSON. Derived and transient data (input, caches) is left out. */
  serialize(state: TState): TSaved;
  /** Rebuilds the state from what `serialize()` returned, saved at this part's `version`. */
  restore(saved: TSaved, context: TContext): TState;
};

/**
 * Read access to the parts of a world (`World.parts` satisfies it), for modules that read a part
 * without depending on the world or on how parts are stored.
 */
export type WorldPartReader = {
  /** State of the part `key` names; throws when the world has no such part. */
  get<TState>(key: WorldPartKey<TState>): TState;
};
