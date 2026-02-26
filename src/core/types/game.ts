/**
 * Identifies whose turn it currently is within a match.
 *
 * Owned by `matchMachine` rather than the compute engine. All turn-toggling
 * logic reads and writes this value through the machine context, not the
 * engine state.
 */
export type GameTurn = "PLAYER_TURN" | "ENEMY_TURN";

/**
 * Canonical identifier for either active participant in a match.
 *
 * Used throughout the engine to tag entities, shots, and events as belonging
 * to one specific side. Also serves as the resolved value of {@link Winner}
 * once the match ends.
 */
export type PlayerName = "player" | "enemy";

/**
 * Outcome of a finished match.
 *
 * `null` while the game is still in progress. Set to `"player"` or `"enemy"`
 * by `MatchRuleSet.checkGameOver` as soon as a winning condition is met and
 * propagated through `GameEngineState.winner` and `MatchState`.
 */
export type Winner = PlayerName | null;

/**
 * Role of a participant inside a networked session.
 *
 * The `"host"` creates and owns the room and is responsible for
 * authoritative game-state broadcasting. The `"guest"` joins an existing
 * room and receives state updates from the host.
 */
export type PlayerRole = "host" | "guest";
