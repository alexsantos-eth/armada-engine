//! Player sheet columns selected from motion data, without textures or Macroquad.

/// Five airborne pose names plus the ground, which has no jump-sheet column.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JumpPhase {
    Ground,
    Takeoff,
    Rise,
    Apex,
    Fall,
    Landing,
}

/// Columns assigned by the content manifest to jump phases.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct JumpPoses {
    pub takeoff: i32,
    pub rise: i32,
    pub apex: i32,
    pub fall: i32,
    pub landing: i32,
}

pub fn jump_pose(phase: JumpPhase, poses: JumpPoses) -> Option<i32> {
    match phase {
        JumpPhase::Ground => None,
        JumpPhase::Takeoff => Some(poses.takeoff),
        JumpPhase::Rise => Some(poses.rise),
        JumpPhase::Apex => Some(poses.apex),
        JumpPhase::Fall => Some(poses.fall),
        JumpPhase::Landing => Some(poses.landing),
    }
}

/// Equal-length sections of a climb, clamped to its first and last columns.
pub fn climb_pose(progress: f64, frames: i32) -> i32 {
    ((progress * f64::from(frames)).floor().max(0.0) as i32).min(frames - 1)
}

/// Idle column after real elapsed milliseconds, looping once per period.
pub fn idle_pose(ms: f64, frames: i32, period: f64) -> i32 {
    let cycle = ms.max(0.0) % period / period;
    ((cycle * f64::from(frames)).floor() as i32).min(frames - 1)
}

/// Walk column by distance, including backwards pedalling; zero is standing.
pub fn walk_pose(distance: f64, frames: i32, stride: f64) -> i32 {
    let cycle = (((distance / stride) % 1.0) + 1.0) % 1.0;
    1 + ((cycle * f64::from(frames)).floor() as i32).min(frames - 1)
}

/// Flip column by how much of the somersault has been turned, from `0.0` to `1.0`: the sheet's
/// columns are the equal steps of one whole turn.
pub fn flip_pose(turned: f64, columns: i32) -> i32 {
    let share = turned.clamp(0.0, 1.0);
    ((share * f64::from(columns)).floor() as i32).clamp(0, (columns - 1).max(0))
}

/// The column of the swim sheet the figure treads water in: the first one.
pub const SWIM_FLOAT_POSE: i32 = 0;

/// The column a swimmer under the surface is drawn with: the last one of the sheet.
pub fn swim_dive_pose(columns: i32) -> i32 {
    (columns - 1).max(0)
}

/// Swim column by distance swum: one cycle of the crawl every `stride` columns, over the
/// columns between treading water (the first) and diving (the last).
pub fn swim_pose(distance: f64, columns: i32, stride: f64) -> i32 {
    let strokes = (columns - 2).max(1);
    let cycle = (((distance / stride) % 1.0) + 1.0) % 1.0;
    1 + ((cycle * f64::from(strokes)).floor() as i32).min(strokes - 1)
}

#[cfg(test)]
#[path = "poses.test.rs"]
mod tests;
