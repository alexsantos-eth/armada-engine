//! How the characters are animated: each one keeps the player's animation bookkeeping, fed
//! with the only two things a character does, walking and standing.
//!
//! Queuing their sprites needs the atlas and the baked shadows, so it lives in `game::scene`
//! (`collect_npcs`) and is checked by eye with a scripted run on the procedural world.

use std::collections::HashMap;

use iso::npc::{Npc, NpcMotion};
use iso::player::{PlayerJumpPhase, PlayerMotionType};
use iso::projection::GridPoint;
use iso::scene_order::PlayerSheet;

use crate::player::player_view::{PlayerAnimation, PlayerMoment, PlayerPose, PlayerSheets};

/// The animation of one character between frames, and where it was last drawn.
#[derive(Clone, Copy, Debug)]
struct NpcView {
    animation: PlayerAnimation,
    drawn_at: GridPoint,
    seen: bool,
}

/// The animation of every character drawn lately, by id.
#[derive(Debug, Default)]
pub struct NpcViews {
    views: HashMap<u64, NpcView>,
}

/// What one frame of `npc` is to the player's animation: a walk or a rest on the ground, never
/// a jump, a climb, a swim or a run.
pub fn npc_moment(npc: &Npc, moved: f64, elapsed_ms: f64) -> PlayerMoment {
    let walking = npc.motion() == NpcMotion::Walking;
    PlayerMoment {
        climbing: None,
        motion: if walking {
            PlayerMotionType::Walking
        } else {
            PlayerMotionType::Idle
        },
        direction: npc.direction,
        moved: if walking { moved } else { 0.0 },
        jump_phase: PlayerJumpPhase::Ground,
        flip: None,
        elapsed_ms,
    }
}

/// The sheets a character is drawn from: only the walk and the idle ones, whatever the atlas
/// holds for the player.
pub fn npc_sheets(sheets: PlayerSheets) -> PlayerSheets {
    PlayerSheets {
        walk_poses: sheets.walk_poses,
        idle_poses: sheets.idle_poses,
        ..PlayerSheets::default()
    }
}

impl NpcViews {
    /// Marks every view unseen; the ones not drawn before [`NpcViews::finish`] are dropped.
    pub fn begin(&mut self) {
        for view in self.views.values_mut() {
            view.seen = false;
        }
    }

    /// Takes one frame of `npc`, drawn at `at`, into account and answers with its pose.
    pub fn advance(
        &mut self,
        npc: &Npc,
        at: GridPoint,
        elapsed_ms: f64,
        sheets: PlayerSheets,
    ) -> PlayerPose {
        let view = self.views.entry(npc.id).or_insert(NpcView {
            animation: PlayerAnimation::default(),
            drawn_at: at,
            seen: true,
        });
        let moved = (at.x - view.drawn_at.x).hypot(at.y - view.drawn_at.y);
        view.drawn_at = at;
        view.seen = true;
        let pose = view
            .animation
            .advance(npc_moment(npc, moved, elapsed_ms), npc_sheets(sheets));
        PlayerPose {
            sheet: match pose.sheet {
                PlayerSheet::Walk => PlayerSheet::Walk,
                _ => PlayerSheet::Idle,
            },
            ..pose
        }
    }

    /// Drops the view of whoever was not drawn since [`NpcViews::begin`].
    pub fn finish(&mut self) {
        self.views.retain(|_, view| view.seen);
    }

    /// How many characters have a view.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.views.len()
    }
}

#[cfg(test)]
#[path = "npc_view.test.rs"]
mod tests;
