/**
 * Shot Patterns Usage Examples
 * 
 * This file demonstrates how to use the shot pattern system to execute
 * multiple shots in configurable patterns.
 */

import { GameEngine, CROSS_SHOT, HORIZONTAL_LINE_SHOT, SQUARE_SHOT, getShotPattern, createCustomPattern } from "../../core/engine";
import type { GameShip } from "../../core/engine";

// ============================================
// Example 1: Using Predefined Shot Patterns
// ============================================

function examplePredefinedPatterns() {
  // Setup game
  const engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
  
  const playerShips: GameShip[] = [
    { coords: [0, 0], width: 3, height: 1 },
  ];
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], width: 4, height: 1 },
    { coords: [8, 2], width: 1, height: 2 },
  ];
  
  engine.initializeGame(playerShips, enemyShips, "PLAYER_TURN");
  
  // Execute a cross shot pattern - fires 5 shots in a + shape
  const crossResult = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
  
  console.log("Cross Shot Results:");
  console.log(`Success: ${crossResult.success}`);
  console.log(`Total shots executed: ${crossResult.shots.filter((s) => s.executed).length}`);
  console.log(`Hits: ${crossResult.shots.filter((s) => s.hit).length}`);
  
  // Execute a horizontal line shot
  const lineResult = engine.executeShotPattern(8, 2, HORIZONTAL_LINE_SHOT, true);
  
  console.log("\nHorizontal Line Shot Results:");
  console.log(`Total shots: ${lineResult.shots.length}`);
  console.log(`Hits: ${lineResult.shots.filter((s) => s.hit).length}`);
}

// ============================================
// Example 2: Using Pattern IDs
// ============================================

function examplePatternByID() {
  const engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
  
  const enemyShips: GameShip[] = [
    { coords: [4, 4], width: 3, height: 1 },
  ];
  
  engine.initializeGame([], enemyShips, "PLAYER_TURN");
  
  // Get pattern by ID
  const pattern = getShotPattern("square"); // 3x3 square pattern
  
  // Execute the pattern
  const result = engine.executeShotPattern(4, 4, pattern, true);
  
  console.log(`Pattern: ${pattern.name}`);
  console.log(`Description: ${pattern.description}`);
  console.log(`Shots executed: ${result.shots.filter((s) => s.executed).length}`);
}

// ============================================
// Example 3: Creating Custom Shot Patterns
// ============================================

function exampleCustomPatterns() {
  const engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
  
  const enemyShips: GameShip[] = [
    { coords: [5, 5], width: 5, height: 1 },
  ];
  
  engine.initializeGame([], enemyShips, "PLAYER_TURN");
  
  // Create a custom V-shaped pattern
  //     X
  //    X X
  //   X   X
  const vPattern = createCustomPattern(
    "v-shape",
    "V-Shape Shot",
    [
      { dx: 0, dy: 0 },   // Top center
      { dx: -1, dy: 1 },  // Second row left
      { dx: 1, dy: 1 },   // Second row right
      { dx: -2, dy: 2 },  // Bottom left
      { dx: 2, dy: 2 },   // Bottom right
    ],
    "Fires 5 shots in a V formation"
  );
  
  const result = engine.executeShotPattern(5, 3, vPattern, true);
  
  console.log("Custom V-Pattern Results:");
  result.shots.forEach((shot) => {
    console.log(`  (${shot.x},${shot.y}): ${shot.hit ? "HIT" : "MISS"} ${shot.executed ? "" : "(not executed)"}`);
  });
}

// ============================================
// Example 4: Handling Edge Cases
// ============================================

function exampleEdgeCases() {
  const engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
  
  const enemyShips: GameShip[] = [
    { coords: [0, 0], width: 2, height: 1 },
  ];
  
  engine.initializeGame([], enemyShips, "PLAYER_TURN");
  
  // Execute cross pattern at board corner (some shots will be out of bounds)
  const result = engine.executeShotPattern(0, 0, CROSS_SHOT, true);
  
  console.log("Edge Case - Corner Shot:");
  result.shots.forEach((shot) => {
    const status = !shot.executed ? "OUT OF BOUNDS" : shot.hit ? "HIT" : "MISS";
    console.log(`  (${shot.x},${shot.y}): ${status}`);
  });
  
  // Try to shoot the same pattern again (cells already shot)
  const result2 = engine.executeShotPattern(0, 0, CROSS_SHOT, true);
  
  console.log("\nSecond attempt - Already Shot:");
  result2.shots.forEach((shot) => {
    const status = !shot.executed ? "ALREADY SHOT" : "NEW SHOT";
    console.log(`  (${shot.x},${shot.y}): ${status}`);
  });
}

// ============================================
// Example 5: Game Over Detection
// ============================================

function exampleGameOver() {
  const engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
  
  // Small enemy ship that can be destroyed quickly
  const enemyShips: GameShip[] = [
    { coords: [5, 5], width: 2, height: 1 }, // 2 cells
  ];
  
  engine.initializeGame([], enemyShips, "PLAYER_TURN");
  
  // Execute cross pattern that will hit and destroy the ship
  const result = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
  
  console.log("Game Over Example:");
  console.log(`Game Over: ${result.isGameOver}`);
  console.log(`Winner: ${result.winner}`);
  console.log(`Ships destroyed: ${result.shots.filter((s) => s.shipDestroyed).length}`);
}

// ============================================
// Example 6: Pattern Comparison
// ============================================

function examplePatternComparison() {
  console.log("Available Shot Patterns:\n");
  
  const patterns = [
    { name: "Single", pattern: getShotPattern("single") },
    { name: "Cross (5 shots)", pattern: CROSS_SHOT },
    { name: "Large Cross (9 shots)", pattern: getShotPattern("large-cross") },
    { name: "Horizontal Line (3 shots)", pattern: HORIZONTAL_LINE_SHOT },
    { name: "Vertical Line (3 shots)", pattern: getShotPattern("vertical-line") },
    { name: "Small Square (4 shots)", pattern: getShotPattern("small-square") },
    { name: "Square (9 shots)", pattern: SQUARE_SHOT },
    { name: "Diagonal X (5 shots)", pattern: getShotPattern("diagonal-x") },
    { name: "T-Shape (5 shots)", pattern: getShotPattern("t-shape") },
    { name: "L-Shape (5 shots)", pattern: getShotPattern("l-shape") },
  ];
  
  patterns.forEach(({ name, pattern }) => {
    console.log(`${name}:`);
    console.log(`  ID: ${pattern.id}`);
    console.log(`  Shots: ${pattern.offsets.length}`);
    console.log(`  Description: ${pattern.description}`);
    console.log();
  });
}

// ============================================
// Example 7: Strategic Usage
// ============================================

function exampleStrategicUsage() {
  const engine = new GameEngine({ boardWidth: 10, boardHeight: 10 });
  
  const enemyShips: GameShip[] = [
    { coords: [2, 2], width: 3, height: 1 },
    { coords: [7, 5], width: 1, height: 4 },
  ];
  
  engine.initializeGame([], enemyShips, "PLAYER_TURN");
  
  console.log("Strategic Pattern Usage:\n");
  
  // Use cross pattern for initial search
  console.log("1. Using cross pattern for area search:");
  const searchResult = engine.executeShotPattern(5, 5, CROSS_SHOT, true);
  console.log(`   Hits found: ${searchResult.shots.filter((s) => s.hit).length}`);
  
  // Use horizontal line when you suspect a horizontal ship
  console.log("\n2. Using horizontal line to follow up on hit:");
  const lineResult = engine.executeShotPattern(2, 2, HORIZONTAL_LINE_SHOT, true);
  console.log(`   Hits: ${lineResult.shots.filter((s) => s.hit).length}`);
  
  // Use square pattern for concentrated area attack
  console.log("\n3. Using square pattern for area saturation:");
  const squareResult = engine.executeShotPattern(7, 5, SQUARE_SHOT, true);
  console.log(`   Hits: ${squareResult.shots.filter((s) => s.hit).length}`);
}

// ============================================
// Run Examples
// ============================================

if (typeof window === "undefined") {
  console.log("=".repeat(60));
  console.log("SHOT PATTERNS USAGE EXAMPLES");
  console.log("=".repeat(60));
  
  console.log("\n--- Example 1: Predefined Patterns ---");
  examplePredefinedPatterns();
  
  console.log("\n--- Example 2: Pattern by ID ---");
  examplePatternByID();
  
  console.log("\n--- Example 3: Custom Patterns ---");
  exampleCustomPatterns();
  
  console.log("\n--- Example 4: Edge Cases ---");
  exampleEdgeCases();
  
  console.log("\n--- Example 5: Game Over Detection ---");
  exampleGameOver();
  
  console.log("\n--- Example 6: Pattern Comparison ---");
  examplePatternComparison();
  
  console.log("\n--- Example 7: Strategic Usage ---");
  exampleStrategicUsage();
}

export {
  examplePredefinedPatterns,
  examplePatternByID,
  exampleCustomPatterns,
  exampleEdgeCases,
  exampleGameOver,
  examplePatternComparison,
  exampleStrategicUsage,
};
