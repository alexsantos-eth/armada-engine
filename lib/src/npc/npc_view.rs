//! How the characters are animated: each one keeps the player's animation bookkeeping, fed
//! with what a character does: walking, standing, climbing a block and falling off one.
//!
//! Queuing their sprites needs the atlas and the baked shadows, so it lives in `game::scene`
//! (`collect_npcs`) and is checked by eye with a scripted run on the procedural world.

use std::collections::HashMap;

use iso::npc::{Npc, NpcMotion};
use iso::player::{PlayerJumpPhase, PlayerMotionType};
use iso::projection::GridPoint;
use iso::scene_order::PlayerSheet;

use crate::player::player_shadow::PlayerShadow;
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

/// What one frame of `npc` is to the player's animation: a walk or a rest on the ground, the
/// pull over a ledge, the fall off a block or a hop over level ground. Never a swim or a run.
pub fn npc_moment(npc: &Npc, moved: f64, elapsed_ms: f64) -> PlayerMoment {
    let motion = npc.motion();
    PlayerMoment {
        climbing: npc.climbing(),
        motion: match motion {
            NpcMotion::Idle => PlayerMotionType::Idle,
            NpcMotion::Walking => PlayerMotionType::Walking,
            NpcMotion::Climbing => PlayerMotionType::Climbing,
            NpcMotion::Falling => PlayerMotionType::Falling,
            NpcMotion::Hopping => PlayerMotionType::Jumping,
        },
        direction: npc.direction,
        moved: if motion == NpcMotion::Walking {
            moved
        } else {
            0.0
        },
        jump_phase: match (motion, npc.hopping()) {
            (NpcMotion::Falling, _) => PlayerJumpPhase::Fall,
            (NpcMotion::Hopping, Some(at)) => hop_phase(at),
            _ => PlayerJumpPhase::Ground,
        },
        flip: None,
        elapsed_ms,
    }
}

/// Which of the five jump phases a hop is in, `at` of the way through it (`0` takes off, `1`
/// lands): a little gathered at each end, drawn out over the rest.
pub fn hop_phase(at: f64) -> PlayerJumpPhase {
    match at {
        at if at < 0.12 => PlayerJumpPhase::Takeoff,
        at if at < 0.4 => PlayerJumpPhase::Rise,
        at if at < 0.6 => PlayerJumpPhase::Apex,
        at if at < 0.88 => PlayerJumpPhase::Fall,
        _ => PlayerJumpPhase::Landing,
    }
}

/// The sheets a character is drawn from: the walk, the idle and the climb ones, and the jump
/// sheet for its falling pose. It has no use for the swim and the flip ones.
pub fn npc_sheets(sheets: PlayerSheets) -> PlayerSheets {
    PlayerSheets {
        swim_poses: None,
        flip_poses: None,
        ..sheets
    }
}

/// The colour a character's artwork is multiplied by, from its coat as `0xRRGGBB`.
pub fn coat_color(tint: u32) -> macroquad::color::Color {
    let channel = |shift: u32| f32::from(((tint >> shift) & 0xff) as u8) / 255.0;
    macroquad::color::Color::new(channel(16), channel(8), channel(0), 1.0)
}

/// The ground shadow of a character `scale` times the player's size: as wide and as deep as
/// its body, cast from the same spot.
pub fn scaled_shadow(shadow: PlayerShadow, scale: f64) -> PlayerShadow {
    PlayerShadow {
        width: shadow.width * scale,
        height: shadow.height * scale,
        ..shadow
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
                PlayerSheet::Swim | PlayerSheet::Flip => PlayerSheet::Idle,
                sheet => sheet,
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
