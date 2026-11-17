//! One character and its wander: rest, pick a neighbouring cell, stroll to it, rest again.
//! The way there is a walk, a flight of stairs, a climb or a drop, as the ground asks.

use crate::grid::WorldCoord;
use crate::player::{
    DustRandom, PLAYER_CLIMB_TICKS, PLAYER_GRAVITY, PlayerGround, get_climb_advance,
    get_climb_rise, get_stairs_hop, get_stairs_rise,
};
use crate::projection::GridPoint;
use crate::terrain::{TerrainMaterial, stairs_direction};
use crate::time::TICKS_PER_SECOND;

/// Walking speed of a character, in columns per simulated second: a stroll, slower than the
/// player's walk. Characters never run.
pub const NPC_SPEED: f64 = 1.2;
/// Columns a character advances per tick.
pub const NPC_STEP: f64 = NPC_SPEED / TICKS_PER_SECOND as f64;
/// How many columns a character strays from its home, along either axis.
pub const NPC_LEASH: i32 = 6;
/// The shortest and the longest rest between two strolls, in ticks.
pub const NPC_REST_TICKS: (i32, i32) = (40, 160);
/// The fewest and the most cells one stroll covers before the next rest.
pub const NPC_STROLL_CELLS: (i32, i32) = (1, 4);
/// The rest a character takes when every way out of its cell is closed, in ticks.
pub const NPC_BLOCKED_REST_TICKS: i32 = 20;

/// Share of a cell a character walks up to the wall before it pulls itself onto a block.
pub const NPC_CLIMB_APPROACH: f64 = 0.3;
/// Share of a cell it walks on to the centre after the pull.
pub const NPC_CLIMB_SETTLE: f64 = 0.25;
/// Share of the step at which a character walking off a block leaves its edge and falls.
pub const NPC_DROP_EDGE: f64 = 0.6;

/// The eight neighbours a stroll can head for, in the order they are tried.
const HEADINGS: [(i32, i32); 8] = [
    (1, 0),
    (1, 1),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (-1, -1),
    (0, -1),
    (1, -1),
];

/// What a character is doing, for whoever draws it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NpcMotion {
    Idle,
    Walking,
    /// Pulling itself onto a block one higher.
    Climbing,
    /// In the air on the way down from a block one higher.
    Falling,
}

/// How a step gets from one cell to the next.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NpcMove {
    /// Across level ground.
    Walk,
    /// Through a flight of stairs to the cell beyond it, one level up or down.
    Stairs,
    /// Onto a block one higher: up to its wall, over the ledge and on to its centre.
    Climb,
    /// Off a block onto ground one lower: over the edge and down.
    Drop,
}

/// A step in flight.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NpcStep {
    /// The neighbour it heads for, as a step of the grid.
    pub heading: (i32, i32),
    pub kind: NpcMove,
    /// Levels gained by the end of the step: `1`, `0` or `-1`.
    pub rise: i32,
}

impl NpcStep {
    /// Cells the step covers: two through a flight of stairs, one otherwise.
    pub fn span(&self) -> i32 {
        if self.kind == NpcMove::Stairs { 2 } else { 1 }
    }

    /// Share of the step covered per tick.
    fn pace(&self) -> f64 {
        let (dx, dy) = self.heading;
        let length = f64::from(dx).hypot(f64::from(dy)) * f64::from(self.span());
        match self.kind {
            NpcMove::Climb => 1.0 / climb_ticks(),
            _ => NPC_STEP / length,
        }
    }
}

/// Where a character's feet are: its point of the grid, the level of the ground or the tread
/// under it, and how far above that its body is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcPose {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub height: f64,
}

/// Ticks a climb takes from one centre to the next: the walk to the wall, the pull over the
/// ledge at the player's pace, and the walk on to the centre.
fn climb_ticks() -> f64 {
    (NPC_CLIMB_APPROACH + NPC_CLIMB_SETTLE) / NPC_STEP + f64::from(PLAYER_CLIMB_TICKS)
}

/// A climb at `progress` (0–1) of its whole step: the share of the cell advanced, the share of
/// the block risen and, while the body is on the wall, how far into the pull it is.
pub fn get_npc_climb(progress: f64) -> (f64, f64, Option<f64>) {
    let ticks = progress.clamp(0.0, 1.0) * climb_ticks();
    let approach = NPC_CLIMB_APPROACH / NPC_STEP;
    let pull = f64::from(PLAYER_CLIMB_TICKS);
    if ticks < approach {
        return (ticks * NPC_STEP, 0.0, None);
    }
    let over = 1.0 - NPC_CLIMB_APPROACH - NPC_CLIMB_SETTLE;
    if ticks < approach + pull {
        let pulled = (ticks - approach) / pull;
        return (
            NPC_CLIMB_APPROACH + over * get_climb_advance(pulled),
            get_climb_rise(pulled),
            Some(pulled),
        );
    }
    let settled = (ticks - approach - pull) * NPC_STEP;
    ((1.0 - NPC_CLIMB_SETTLE + settled).min(1.0), 1.0, None)
}

/// Blocks a body has fallen `ticks` ticks after it walked off an edge, a block at most.
pub fn get_npc_fall(ticks: f64) -> f64 {
    (PLAYER_GRAVITY * ticks.max(0.0).powi(2) / 2.0).min(1.0)
}

/// One character. It stands on the centre of `cell` or is on its way to another one. It walks
/// level ground, takes a flight of stairs, climbs a block one higher and drops off a block
/// onto ground one lower; it never jumps, swims or runs.
#[derive(Clone, Copy, Debug)]
pub struct Npc {
    /// Stable identity, derived from the home cell.
    pub id: u64,
    /// The cell it was born on and stays within [`NPC_LEASH`] of.
    pub home: WorldCoord,
    /// The cell it stands on, or is leaving while a step is in flight.
    pub cell: WorldCoord,
    /// The level of the ground of that cell.
    pub elevation: i32,
    /// The step in flight, or `None` standing.
    pub step: Option<NpcStep>,
    /// How much of that step is covered, `0` to `1`.
    pub progress: f64,
    /// The way it last walked, as a unit vector of the grid; what it faces while it rests.
    pub direction: GridPoint,
    /// Ticks of rest left before the next stroll.
    pub rest_ticks: i32,
    /// Cells of the current stroll still to walk after the step in flight.
    pub strides_left: i32,
    /// Where it was a tick ago, for interpolation.
    pub previous: NpcPose,
    random: DustRandom,
}

impl Npc {
    /// A character born on `home`, at `elevation`, resting for a first while drawn from its
    /// own stream so that neighbours do not set off together.
    pub fn new(id: u64, home: WorldCoord, elevation: i32) -> Self {
        let mut random = DustRandom::new(id);
        let facing = HEADINGS[pick(&mut random, 0, HEADINGS.len() as i32 - 1) as usize];
        let rest_ticks = pick(&mut random, 0, NPC_REST_TICKS.1);
        let mut npc = Self {
            id,
            home,
            cell: home,
            elevation,
            step: None,
            progress: 0.0,
            direction: unit(facing),
            rest_ticks,
            strides_left: 0,
            previous: NpcPose {
                x: 0.0,
                y: 0.0,
                elevation: 0.0,
                height: 0.0,
            },
            random,
        };
        npc.previous = npc.pose();
        npc
    }

    /// Where its feet are now. A cell's centre is its integer pair, as for the player.
    pub fn pose(&self) -> NpcPose {
        let from = centre(self.cell);
        let level = f64::from(self.elevation);
        let Some(step) = self.step else {
            return NpcPose {
                x: from.x,
                y: from.y,
                elevation: level,
                height: 0.0,
            };
        };
        let (dx, dy) = (f64::from(step.heading.0), f64::from(step.heading.1));
        let rise = f64::from(step.rise);
        let (advance, elevation, height) = match step.kind {
            NpcMove::Walk => (self.progress, level, 0.0),
            NpcMove::Stairs => {
                let flight = ((self.progress - 0.25) / 0.5).clamp(0.0, 1.0);
                let on_flight = flight > 0.0 && flight < 1.0;
                (
                    self.progress * 2.0,
                    level + rise * get_stairs_rise(flight),
                    if on_flight {
                        get_stairs_hop(flight)
                    } else {
                        0.0
                    },
                )
            }
            NpcMove::Climb => {
                let (advance, risen, _) = get_npc_climb(self.progress);
                (advance, level + risen, 0.0)
            }
            NpcMove::Drop if self.progress < NPC_DROP_EDGE => (self.progress, level, 0.0),
            NpcMove::Drop => {
                let ticks = (self.progress - NPC_DROP_EDGE) / NPC_STEP;
                (self.progress, level - 1.0, 1.0 - get_npc_fall(ticks))
            }
        };
        NpcPose {
            x: from.x + dx * advance,
            y: from.y + dy * advance,
            elevation,
            height,
        }
    }

    /// Where it is on the ground now.
    pub fn position(&self) -> GridPoint {
        let pose = self.pose();
        GridPoint {
            x: pose.x,
            y: pose.y,
        }
    }

    /// Where it is drawn `alpha` of the way from the tick before to this one.
    pub fn render_pose(&self, alpha: f64) -> NpcPose {
        let t = if alpha.is_finite() {
            alpha.clamp(0.0, 1.0)
        } else {
            1.0
        };
        let (before, now) = (self.previous, self.pose());
        let mix = |from: f64, to: f64| from + (to - from) * t;
        let feet = mix(before.elevation + before.height, now.elevation + now.height);
        let elevation = if before.elevation == now.elevation {
            now.elevation
        } else if (before.elevation - now.elevation).abs() >= 1.0 {
            now.elevation.min(feet)
        } else {
            mix(before.elevation, now.elevation)
        };
        NpcPose {
            x: mix(before.x, now.x),
            y: mix(before.y, now.y),
            elevation,
            height: feet - elevation,
        }
    }

    /// The cell it is on its way to, when a step is in flight.
    pub fn target(&self) -> Option<WorldCoord> {
        self.step.map(|step| WorldCoord {
            x: self.cell.x + step.heading.0 * step.span(),
            y: self.cell.y + step.heading.1 * step.span(),
        })
    }

    /// Whether it holds `cell`: it stands there, is on its way in, or is crossing it.
    pub fn claims(&self, cell: WorldCoord) -> bool {
        self.cell == cell
            || self.target() == Some(cell)
            || self.step.is_some_and(|step| {
                step.span() == 2
                    && cell
                        == WorldCoord {
                            x: self.cell.x + step.heading.0,
                            y: self.cell.y + step.heading.1,
                        }
            })
    }

    /// How far into the pull over a ledge it is, or `None` when it is not on a wall.
    pub fn climbing(&self) -> Option<f64> {
        self.step.filter(|step| step.kind == NpcMove::Climb)?;
        get_npc_climb(self.progress).2
    }

    /// What it is doing this tick.
    pub fn motion(&self) -> NpcMotion {
        match self.step {
            None => NpcMotion::Idle,
            Some(_) if self.climbing().is_some() => NpcMotion::Climbing,
            Some(step) if step.kind == NpcMove::Drop && self.pose().height > 0.0 => {
                NpcMotion::Falling
            }
            Some(_) => NpcMotion::Walking,
        }
    }
}

fn centre(cell: WorldCoord) -> GridPoint {
    GridPoint {
        x: f64::from(cell.x),
        y: f64::from(cell.y),
    }
}

fn unit((dx, dy): (i32, i32)) -> GridPoint {
    let length = f64::from(dx).hypot(f64::from(dy));
    GridPoint {
        x: f64::from(dx) / length,
        y: f64::from(dy) / length,
    }
}

/// A whole number from `low` to `high`, both included, off `random`.
fn pick(random: &mut DustRandom, low: i32, high: i32) -> i32 {
    let span = f64::from(high - low + 1);
    low + ((random.roll() * span) as i32).min(high - low)
}

/// Whether a character can stand on `cell`: dry ground that is not a flight of stairs, with
/// nothing solid on it. With `level`, the ground must be at exactly that level.
pub fn can_npc_stand<G: PlayerGround>(ground: &G, cell: WorldCoord, level: Option<i32>) -> bool {
    let Some(column) = ground.column_at(cell.x, cell.y) else {
        return false;
    };
    if !column.walkable
        || matches!(
            column.surface,
            TerrainMaterial::Water | TerrainMaterial::Stairs
        )
    {
        return false;
    }
    if level.is_some_and(|level| level != column.elevation) {
        return false;
    }
    ground
        .occupancy_at(cell.x, cell.y)
        .iter()
        .all(|occupant| occupant.blocked_side(f64::from(cell.x), f64::from(cell.y)) <= 0.0)
}

/// Whether `cell` is within the leash of `npc`.
fn in_leash(npc: &Npc, cell: WorldCoord) -> bool {
    (cell.x - npc.home.x).abs() <= NPC_LEASH && (cell.y - npc.home.y).abs() <= NPC_LEASH
}

/// The way the flight on `cell` climbs, when that column carries one.
fn flight_up<G: PlayerGround>(ground: &G, cell: WorldCoord, elevation: i32) -> Option<(i32, i32)> {
    stairs_direction(cell, elevation, |at| {
        ground
            .column_at(at.x, at.y)
            .map(|found| (found.surface, found.elevation))
    })
    .map(|up| (up.x, up.y))
}

/// The step `npc` would take from its cell towards `heading`, or `None` when that way is
/// closed. Level ground is walked in any of the eight directions, without cutting a closed
/// corner. Straight ahead only: a flight of stairs is taken along its axis through to the cell
/// beyond it, a block exactly one higher is climbed and ground exactly one lower is dropped
/// onto. The cell it ends on is within its leash, standable and not `taken`.
pub fn plan_npc_step<G: PlayerGround>(
    npc: &Npc,
    heading: (i32, i32),
    ground: &G,
    taken: impl Fn(WorldCoord) -> bool,
) -> Option<NpcStep> {
    let (dx, dy) = heading;
    let level = npc.elevation;
    let straight = dx == 0 || dy == 0;
    let to = WorldCoord {
        x: npc.cell.x + dx,
        y: npc.cell.y + dy,
    };
    let column = ground.column_at(to.x, to.y)?;
    if taken(to) {
        return None;
    }
    if column.surface == TerrainMaterial::Stairs {
        if !straight {
            return None;
        }
        let up = flight_up(ground, to, column.elevation)?;
        let rise = if up == heading && column.elevation == level + 1 {
            1
        } else if up == (-dx, -dy) && column.elevation == level {
            -1
        } else {
            return None;
        };
        let beyond = WorldCoord {
            x: to.x + dx,
            y: to.y + dy,
        };
        let open = in_leash(npc, beyond)
            && !taken(beyond)
            && can_npc_stand(ground, beyond, Some(level + rise));
        return open.then_some(NpcStep {
            heading,
            kind: NpcMove::Stairs,
            rise,
        });
    }
    if !in_leash(npc, to) || !can_npc_stand(ground, to, None) {
        return None;
    }
    let rise = column.elevation - level;
    let kind = match rise {
        0 => NpcMove::Walk,
        1 if straight => NpcMove::Climb,
        -1 if straight => NpcMove::Drop,
        _ => return None,
    };
    if !straight {
        let beside = WorldCoord {
            x: npc.cell.x + dx,
            y: npc.cell.y,
        };
        let ahead = WorldCoord {
            x: npc.cell.x,
            y: npc.cell.y + dy,
        };
        if !can_npc_stand(ground, beside, Some(level)) || !can_npc_stand(ground, ahead, Some(level))
        {
            return None;
        }
    }
    Some(NpcStep {
        heading,
        kind,
        rise,
    })
}

/// One tick of `npc`: rest, or set off on a stroll, or carry the step in flight on. `taken`
/// answers whether somebody else holds a cell.
pub fn step_npc<G: PlayerGround>(npc: &mut Npc, ground: &G, taken: impl Fn(WorldCoord) -> bool) {
    npc.previous = npc.pose();
    let Some(step) = npc.step else {
        if npc.rest_ticks > 0 {
            npc.rest_ticks -= 1;
            return;
        }
        set_off(npc, ground, taken);
        return;
    };
    npc.progress += step.pace();
    if npc.progress < 1.0 {
        return;
    }
    let over = (npc.progress - 1.0) / step.pace();
    npc.cell = WorldCoord {
        x: npc.cell.x + step.heading.0 * step.span(),
        y: npc.cell.y + step.heading.1 * step.span(),
    };
    npc.elevation += step.rise;
    npc.step = None;
    npc.progress = 0.0;
    let next = (npc.strides_left > 0)
        .then(|| plan_npc_step(npc, step.heading, ground, taken))
        .flatten();
    if let Some(next) = next {
        npc.strides_left -= 1;
        npc.step = Some(next);
        npc.progress = over * next.pace();
        return;
    }
    npc.strides_left = 0;
    npc.rest_ticks = pick(&mut npc.random, NPC_REST_TICKS.0, NPC_REST_TICKS.1);
}

/// Starts a stroll towards the first open neighbour, tried round from one drawn at random.
fn set_off<G: PlayerGround>(npc: &mut Npc, ground: &G, taken: impl Fn(WorldCoord) -> bool) {
    let count = HEADINGS.len();
    let first = pick(&mut npc.random, 0, count as i32 - 1) as usize;
    let strides = pick(&mut npc.random, NPC_STROLL_CELLS.0, NPC_STROLL_CELLS.1);
    let open = (0..count)
        .map(|turn| HEADINGS[(first + turn) % count])
        .find_map(|heading| plan_npc_step(npc, heading, ground, &taken));
    match open {
        Some(step) => {
            npc.step = Some(step);
            npc.progress = 0.0;
            npc.direction = unit(step.heading);
            npc.strides_left = strides - 1;
        }
        None => npc.rest_ticks = NPC_BLOCKED_REST_TICKS,
    }
}

#[cfg(test)]
#[path = "wander.test.rs"]
pub(crate) mod tests;
