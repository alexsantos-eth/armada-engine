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

#[cfg(test)]
#[path = "poses.test.rs"]
mod tests;
