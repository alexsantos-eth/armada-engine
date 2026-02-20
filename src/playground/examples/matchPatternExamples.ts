import { Match } from "../../core/engine/match";
import { CROSS_SHOT, HORIZONTAL_LINE_SHOT, SQUARE_SHOT, createCustomPattern } from "../../core/constants/shotPatterns";
import type { GameShip } from "../../core/types/common";

/**
 * Example 1: Basic usage of planShot and confirmAttack
 */
function basicPatternExample() {
  console.log("=".repeat(50));
  console.log("Example 1: Basic Pattern Shot");
  console.log("=".repeat(50));

  const match = new Match({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "medium", orientation: "horizontal" },
    { coords: [8, 2], variant: "small", orientation: "vertical" },
  ];

  match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

  // Step 1: Plan the attack with a cross pattern
  console.log("\n1. Planning a cross shot at (5, 5)...");
  const plan = match.planShot(5, 5, CROSS_SHOT, true);
  
  if (plan.ready) {
    console.log(`   ✓ Plan ready: ${plan.pattern?.name}`);
    console.log(`   Center: (${plan.centerX}, ${plan.centerY})`);
    console.log(`   Phase: ${match.getPhase()}`);
  }

  // Step 2: Confirm and execute the attack
  console.log("\n2. Confirming attack...");
  const result = match.confirmAttack();
  
  console.log(`   Success: ${result.success}`);
  console.log(`   Shots executed: ${result.shots.filter((s) => s.executed).length}/${result.shots.length}`);
  console.log(`   Hits: ${result.shots.filter((s) => s.hit).length}`);
  console.log(`   Phase: ${match.getPhase()}`);
  console.log(`   Turn ended: ${result.turnEnded}`);
}

/**
 * Example 2: Changing pattern before confirming
 */
function changingPlanExample() {
  console.log("\n" + "=".repeat(50));
  console.log("Example 2: Changing Plan Before Confirming");
  console.log("=".repeat(50));

  const match = new Match({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "large", orientation: "horizontal" },
  ];

  match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

  // First plan: Cross shot
  console.log("\n1. Initial plan: CROSS_SHOT");
  let plan = match.planShot(5, 5, CROSS_SHOT, true);
  console.log(`   Pattern: ${plan.pattern?.name}`);
  console.log(`   Shots in pattern: ${plan.pattern?.offsets.length}`);

  // Change mind: Use horizontal line instead
  console.log("\n2. Changing plan: HORIZONTAL_LINE_SHOT");
  plan = match.planShot(5, 5, HORIZONTAL_LINE_SHOT, true);
  console.log(`   Pattern: ${plan.pattern?.name}`);
  console.log(`   Shots in pattern: ${plan.pattern?.offsets.length}`);

  // Confirm the second plan
  console.log("\n3. Confirming...");
  const result = match.confirmAttack();
  console.log(`   Executed: ${result.shots.filter((s) => s.executed).length} shots`);
  console.log(`   Pattern used: ${plan.pattern?.name}`);
}

/**
 * Example 3: Canceling a plan
 */
function cancelPlanExample() {
  console.log("\n" + "=".repeat(50));
  console.log("Example 3: Canceling a Plan");
  console.log("=".repeat(50));

  const match = new Match({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "medium", orientation: "horizontal" },
  ];

  match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

  // Plan an attack
  console.log("\n1. Planning attack...");
  match.planShot(5, 5, CROSS_SHOT, true);
  console.log(`   Pending plan: ${match.getPendingPlan() ? "Yes" : "No"}`);

  // Cancel it
  console.log("\n2. Canceling plan...");
  match.cancelPlan();
  console.log(`   Pending plan: ${match.getPendingPlan() ? "Yes" : "No"}`);
  console.log(`   Phase: ${match.getPhase()}`);

  // Try to confirm (should fail)
  console.log("\n3. Trying to confirm without plan...");
  const result = match.confirmAttack();
  console.log(`   Success: ${result.success}`);
  console.log(`   Error: ${result.error}`);
}

/**
 * Example 4: Custom pattern
 */
function customPatternExample() {
  console.log("\n" + "=".repeat(50));
  console.log("Example 4: Custom Pattern - Arrow Shape");
  console.log("=".repeat(50));

  const match = new Match({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "large", orientation: "horizontal" },
  ];

  match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

  // Create a custom arrow pattern
  // Pattern:
  //     X
  //   X X X
  //     X
  //     X
  const arrowPattern = createCustomPattern(
    "arrow",
    "Arrow Shot",
    [
      { dx: 0, dy: -1 },  // Top
      { dx: -1, dy: 0 },  // Left
      { dx: 0, dy: 0 },   // Center
      { dx: 1, dy: 0 },   // Right
      { dx: 0, dy: 1 },   // Bottom 1
      { dx: 0, dy: 2 },   // Bottom 2
    ],
    "Fires 6 shots in an arrow pointing down"
  );

  console.log(`\nCustom pattern: ${arrowPattern.name}`);
  console.log(`Description: ${arrowPattern.description}`);
  console.log(`Shots: ${arrowPattern.offsets.length}`);

  // Plan and execute
  console.log("\nExecuting arrow pattern at (5, 5)...");
  match.planShot(5, 5, arrowPattern, true);
  const result = match.confirmAttack();
  
  console.log(`Success: ${result.success}`);
  console.log(`Hits: ${result.shots.filter((s) => s.hit).length}`);
  
  result.shots.forEach((shot, i) => {
    const status = shot.executed ? (shot.hit ? "HIT" : "MISS") : "NOT EXECUTED";
    console.log(`  Shot ${i + 1}: (${shot.x}, ${shot.y}) - ${status}`);
  });
}

/**
 * Example 5: Strategic gameplay with patterns
 */
function strategicGameplayExample() {
  console.log("\n" + "=".repeat(50));
  console.log("Example 5: Strategic Gameplay");
  console.log("=".repeat(50));

  const match = new Match({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "small", orientation: "horizontal" },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "large", orientation: "horizontal" },
    { coords: [2, 2], variant: "medium", orientation: "vertical" },
  ];

  match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

  // Turn 1: Search with Cross pattern
  console.log("\nTurn 1: Search with CROSS pattern");
  match.planShot(5, 5, CROSS_SHOT, true);
  let result = match.confirmAttack();
  const hits1 = result.shots.filter((s) => s.hit);
  console.log(`  Hits found: ${hits1.length}`);
  if (hits1.length > 0) {
    console.log(`  Hit at: (${hits1[0].x}, ${hits1[0].y})`);
  }

  // Turn 2: Follow up with Horizontal Line
  if (!match.isPlayerTurn()) {
    match.getEngine().toggleTurn();
  }
  
  console.log("\nTurn 2: Follow up with HORIZONTAL_LINE");
  match.planShot(5, 5, HORIZONTAL_LINE_SHOT, true);
  result = match.confirmAttack();
  const hits2 = result.shots.filter((s) => s.hit);
  console.log(`  Hits found: ${hits2.length}`);

  // Turn 3: Saturate area with Square pattern
  if (!match.isPlayerTurn()) {
    match.getEngine().toggleTurn();
  }
  
  console.log("\nTurn 3: Saturate with SQUARE pattern");
  match.planShot(2, 2, SQUARE_SHOT, true);
  result = match.confirmAttack();
  const hits3 = result.shots.filter((s) => s.hit);
  console.log(`  Hits found: ${hits3.length}`);
  
  console.log(`\nTotal strategy executed: 3 pattern attacks`);
  console.log(`Game over: ${result.isGameOver}`);
  if (result.isGameOver) {
    console.log(`Winner: ${result.winner}`);
  }
}

/**
 * Example 6: Error handling
 */
function errorHandlingExample() {
  console.log("\n" + "=".repeat(50));
  console.log("Example 6: Error Handling");
  console.log("=".repeat(50));

  const match = new Match({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], variant: "medium", orientation: "horizontal" },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], variant: "medium", orientation: "horizontal" },
  ];

  match.initializeMatch(playerShips, enemyShips, "PLAYER_TURN");

  // Error 1: Invalid position
  console.log("\n1. Planning shot at invalid position (-1, 5)...");
  let plan = match.planShot(-1, 5, CROSS_SHOT, true);
  console.log(`   Ready: ${plan.ready}`);
  console.log(`   Error: ${plan.error}`);

  // Error 2: Confirming without plan
  console.log("\n2. Confirming without planning...");
  let result = match.confirmAttack();
  console.log(`   Success: ${result.success}`);
  console.log(`   Error: ${result.error}`);

  // Error 3: Pattern at board edge (some shots out of bounds)
  console.log("\n3. Planning cross at board corner (0, 0)...");
  plan = match.planShot(0, 0, CROSS_SHOT, true);
  result = match.confirmAttack();
  const outOfBounds = result.shots.filter((s) => !s.executed);
  console.log(`   Total shots: ${result.shots.length}`);
  console.log(`   Executed: ${result.shots.filter((s) => s.executed).length}`);
  console.log(`   Out of bounds: ${outOfBounds.length}`);
}

// ============================================
// Run Examples
// ============================================

if (typeof window === "undefined") {
  console.log("\n\n");
  console.log("###############################################");
  console.log("#  Match Pattern System - Usage Examples     #");
  console.log("###############################################");
  
  basicPatternExample();
  changingPlanExample();
  cancelPlanExample();
  customPatternExample();
  strategicGameplayExample();
  errorHandlingExample();
  
  console.log("\n\n");
  console.log("###############################################");
  console.log("#  All Examples Complete!                    #");
  console.log("###############################################");
}

export {
  basicPatternExample,
  changingPlanExample,
  cancelPlanExample,
  customPatternExample,
  strategicGameplayExample,
  errorHandlingExample,
};
