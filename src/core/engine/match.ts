import { createActor } from "xstate";

import { PlanError, AttackError, MatchSetupError } from "../types/errors";
import { GameInitializer, type GameSetup } from "../manager";
import { type MatchState, toMatchState } from "./logic";
import { buildPlayerBoard, buildEnemyBoard } from "./board";
import { matchMachine } from "./machines/match";
import type { MatchMachineSnapshot } from "./machines/match";
import { DefaultRuleSet, type MatchRuleSet } from "../constants/rulesets";

import type { Winner, GameTurn } from "../types/game";
import type { Board } from "../types/board";
import type { Shot } from "../types/shots";
import type { MatchCallbacks } from "./machines/types";
import type { BoardViewConfig } from "../types/config";
import type {
  NewMatch,
  CellInfo,
  PlanShotResult,
  PlanAndAttackResult,
  IMatch,
} from "../types/match";

export type { MatchCallbacks };
export type { MatchState };
export type {
  MatchItemActionContext,
  MatchShipActionContext,
  MatchQueryAPI,
  IMatch,
  CellInfo,
  PlanShotResult,
  PlanAndAttackResult,
  NewMatch,
} from "../types/match";

export class Match implements IMatch {
  private actor: ReturnType<typeof createActor<typeof matchMachine>>;
  private setup?: GameSetup;

  private get snap() {
    return this.actor.getSnapshot();
  }

  private get engine() {
    return this.snap.context.engine;
  }

  constructor({ setup, setupProvider, ...callbacks }: NewMatch) {
    if (setup) {
      this.setup = setup;
    } else if (setupProvider) {
      this.setup = setupProvider.getGameSetup();
    } else {
      throw new Error(
        MatchSetupError.MissingSetup,
      );
    }

    const ruleSet = this.setup?.config.ruleSet ?? DefaultRuleSet;

    this.actor = createActor(matchMachine, {
      input: { config: this.setup?.config, ruleSet, callbacks },
    });

    this.actor.start();
  }

  public initializeMatch(): void {
    const {
      playerShips,
      enemyShips,
      initialTurn,
      playerItems,
      enemyItems,
      playerObstacles,
      enemyObstacles,
      playerShotPatterns,
      enemyShotPatterns,
    } = this.setup!;

    this.actor.send({
      type: "INITIALIZE",
      playerShips,
      enemyShips,
      initialTurn,
      playerItems,
      enemyItems,
      playerObstacles,
      enemyObstacles,
      playerShotPatterns,
      enemyShotPatterns,
    });
  }

  public planShot(
    centerX: number,
    centerY: number,
    patternIdx: number = 0,
    isPlayerShot: boolean,
  ): PlanShotResult {
    this.actor.send({
      type: "PLAN_SHOT",
      centerX,
      centerY,
      patternIdx,
      isPlayerShot,
    });

    if (this.snap.context.planError) {
      return { ready: false, error: this.snap.context.planError };
    }

    if (!this.snap.context.pendingPlan) {
      return { ready: false, error: PlanError.InvalidPlan };
    }

    return { ready: true, patternIdx, centerX, centerY };
  }

  public confirmAttack(): PlanAndAttackResult {
    this.actor.send({ type: "CONFIRM_ATTACK" });

    const { lastAttackResult, lastTurnDecision } = this.snap.context;

    if (!lastAttackResult) {
      const state = this.engine.getState();
      return {
        success: false,
        error: AttackError.AttackFailed,
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: AttackError.AttackFailed,
      };
    }

    const state = this.engine.getState();

    return {
      ...lastAttackResult,
      isGameOver: state.isGameOver,
      winner: state.winner,
      turnEnded: lastTurnDecision?.shouldEndTurn ?? true,
      canShootAgain: state.isGameOver
        ? false
        : (lastTurnDecision?.canShootAgain ?? false),
      reason: state.isGameOver ? "Game over" : (lastTurnDecision?.reason ?? ""),
    };
  }

  public cancelPlan(): void {
    this.actor.send({ type: "CANCEL_PLAN" });
  }

  public getPendingPlan(): {
    centerX: number;
    centerY: number;
    patternIdx: number;
    isPlayerShot: boolean;
  } | null {
    return this.snap.context.pendingPlan;
  }

  public planAndAttack(
    x: number,
    y: number,
    isPlayerShot: boolean,
    patternIdx: number = 0,
  ): PlanAndAttackResult {
    const planResult = this.planShot(x, y, patternIdx, isPlayerShot);

    if (!planResult.ready) {
      const state = this.engine.getState();
      return {
        success: false,
        error: planResult.error,
        shots: [],
        isGameOver: state.isGameOver,
        winner: state.winner,
        turnEnded: false,
        canShootAgain: false,
        reason: planResult.error || "Invalid shot",
      };
    }

    return this.confirmAttack();
  }

  public isPlayerTurn(): boolean {
    return this.snap.context.currentTurn === "PLAYER_TURN";
  }

  public isEnemyTurn(): boolean {
    return this.snap.context.currentTurn === "ENEMY_TURN";
  }

  public getCurrentTurn(): GameTurn {
    return this.snap.context.currentTurn;
  }

  public getState(): MatchState {
    return toMatchState(this.engine.getState(), this.snap.context.currentTurn);
  }

  public forceSetTurn(turn: GameTurn): void {
    this.actor.send({ type: "SYNC_TURN", turn });
  }

  public syncShots(playerShots: Shot[], enemyShots: Shot[]): void {
    this.actor.send({ type: "SYNC_SHOTS", playerShots, enemyShots });
  }

  public isCellShot(x: number, y: number, isPlayerShot: boolean): boolean {
    return this.engine.isCellShot(x, y, isPlayerShot);
  }

  public isValidPosition(x: number, y: number): boolean {
    return this.engine.isValidPosition(x, y);
  }

  public getCellInfo(
    x: number,
    y: number,
    perspective: "player" | "enemy",
  ): CellInfo {
    if (!this.engine.isValidPosition(x, y)) {
      return { valid: false, isShot: false, hasShip: false };
    }
    const isPlayer = perspective === "player";
    return {
      valid: true,
      isShot: this.engine.isCellShot(x, y, isPlayer),
      shot: this.engine.getShotAtPosition(x, y, isPlayer),
      hasShip: this.engine.hasShipAtPosition(x, y, isPlayer),
    };
  }

  public getWinner(): Winner {
    return this.getState().winner;
  }

  public isMatchOver(): boolean {
    return this.getState().isGameOver;
  }

  public resetMatch(): void {
    this.actor.send({ type: "RESET" });
  }

  public getMachineState(): typeof this.snap.value {
    return this.snap.value;
  }

  public getRuleSet(): MatchRuleSet {
    return this.snap.context.ruleSet;
  }

  public setRuleSet(ruleSet: MatchRuleSet): void {
    this.actor.send({ type: "SET_RULESET", ruleSet });
  }

  public useItem(
    itemId: number,
    isPlayerShot: boolean,
    shipId?: number,
  ): boolean {
    this.actor.send({ type: "USE_ITEM", itemId, isPlayerShot, shipId });
    return this.snap.context.lastUseItemResult ?? false;
  }

  public getBoardDimensions(): { width: number; height: number } {
    return this.engine.getBoardDimensions();
  }

  public getBoardView(): BoardViewConfig {
    return this.snap.context.boardView;
  }

  public areAllShipsDestroyed(isPlayerShips: boolean): boolean {
    return this.engine.areAllShipsDestroyed(isPlayerShips);
  }
  public getShotAtPosition(
    x: number,
    y: number,
    isPlayerShot: boolean,
  ): Shot | undefined {
    return this.engine.getShotAtPosition(x, y, isPlayerShot);
  }
  public hasShipAtPosition(
    x: number,
    y: number,
    isPlayerShips: boolean,
  ): boolean {
    return this.engine.hasShipAtPosition(x, y, isPlayerShips);
  }

  public subscribe(
    callback: (snapshot: MatchMachineSnapshot) => void,
  ): () => void {
    const subscription = this.actor.subscribe(callback);
    return () => subscription.unsubscribe();
  }

  public getPlayerBoard(): Board {
    return buildPlayerBoard(
      this.engine.getState(),
      this.snap.context.boardView,
    );
  }

  public getEnemyBoard(): Board {
    return buildEnemyBoard(this.engine.getState(), this.snap.context.boardView);
  }
}

export function createMatch(opts: NewMatch = {}): Match {
  if (!opts.setup && !opts.setupProvider) {
    return new Match({ ...opts, setupProvider: new GameInitializer() });
  }
  return new Match(opts);
}
