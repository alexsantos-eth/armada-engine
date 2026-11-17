//! One character and its wander: rest, pick a neighbouring cell, stroll to it, rest again.

use crate::grid::WorldCoord;
use crate::player::{DustRandom, PlayerGround};
use crate::projection::GridPoint;
use crate::terrain::TerrainMaterial;
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
}

/// One character. It stands on the centre of `cell` or is on its way to the next one, always
/// on ground of its own level: it never jumps, climbs, swims or runs.
#[derive(Clone, Copy, Debug)]
pub struct Npc {
    /// Stable identity, derived from the home cell.
    pub id: u64,
    /// The cell it was born on and stays within [`NPC_LEASH`] of.
    pub home: WorldCoord,
    /// The cell it stands on, or is leaving while a step is in flight.
    pub cell: WorldCoord,
    /// The level of the ground it walks on.
    pub elevation: i32,
    /// The step in flight towards a neighbouring cell, or `None` standing.
    pub heading: Option<(i32, i32)>,
    /// How much of that step is covered, `0` to `1`.
    pub progress: f64,
    /// The way it last walked, as a unit vector of the grid; what it faces while it rests.
    pub direction: GridPoint,
    /// Ticks of rest left before the next stroll.
    pub rest_ticks: i32,
    /// Cells of the current stroll still to walk after the step in flight.
    pub strides_left: i32,
    /// Where it was a tick ago, for interpolation.
    pub previous: GridPoint,
    random: DustRandom,
}

impl Npc {
    /// A character born on `home`, at `elevation`, resting for a first while drawn from its
    /// own stream so that neighbours do not set off together.
    pub fn new(id: u64, home: WorldCoord, elevation: i32) -> Self {
        let mut random = DustRandom::new(id);
        let facing = HEADINGS[pick(&mut random, 0, HEADINGS.len() as i32 - 1) as usize];
        let rest_ticks = pick(&mut random, 0, NPC_REST_TICKS.1);
        Self {
            id,
            home,
            cell: home,
            elevation,
            heading: None,
            progress: 0.0,
            direction: unit(facing),
            rest_ticks,
            strides_left: 0,
            previous: centre(home),
            random,
        }
    }

    /// Where it is now, in the player's coordinates: a cell's centre is its integer pair.
    pub fn position(&self) -> GridPoint {
        let from = centre(self.cell);
        match self.heading {
            Some((dx, dy)) => GridPoint {
                x: from.x + f64::from(dx) * self.progress,
                y: from.y + f64::from(dy) * self.progress,
            },
            None => from,
        }
    }

    /// Where it is drawn `alpha` of the way from the tick before to this one.
    pub fn render_position(&self, alpha: f64) -> GridPoint {
        let t = if alpha.is_finite() {
            alpha.clamp(0.0, 1.0)
        } else {
            1.0
        };
        let now = self.position();
        GridPoint {
            x: self.previous.x + (now.x - self.previous.x) * t,
            y: self.previous.y + (now.y - self.previous.y) * t,
        }
    }

    /// The cell it is walking into, when a step is in flight.
    pub fn target(&self) -> Option<WorldCoord> {
        self.heading.map(|(dx, dy)| WorldCoord {
            x: self.cell.x + dx,
            y: self.cell.y + dy,
        })
    }

    /// Whether it holds `cell`: it stands there or is on its way in.
    pub fn claims(&self, cell: WorldCoord) -> bool {
        self.cell == cell || self.target() == Some(cell)
    }

    /// What it is doing this tick.
    pub fn motion(&self) -> NpcMotion {
        if self.heading.is_some() {
            NpcMotion::Walking
        } else {
            NpcMotion::Idle
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

/// Whether a character can stand on `cell`: dry, level ground that is not a flight of stairs,
/// with nothing solid on it. With `level`, the ground must be at exactly that level, which is
/// what keeps a character from ever climbing or dropping.
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

/// Whether `npc` can step from its cell towards `heading`: the cell there is within its leash,
/// standable at its own level and not `taken`, and a diagonal does not cut a closed corner.
pub fn can_npc_step<G: PlayerGround>(
    npc: &Npc,
    heading: (i32, i32),
    ground: &G,
    taken: impl Fn(WorldCoord) -> bool,
) -> bool {
    let (dx, dy) = heading;
    let to = WorldCoord {
        x: npc.cell.x + dx,
        y: npc.cell.y + dy,
    };
    if (to.x - npc.home.x).abs() > NPC_LEASH || (to.y - npc.home.y).abs() > NPC_LEASH {
        return false;
    }
    let level = Some(npc.elevation);
    if taken(to) || !can_npc_stand(ground, to, level) {
        return false;
    }
    if dx == 0 || dy == 0 {
        return true;
    }
    let beside = WorldCoord {
        x: npc.cell.x + dx,
        y: npc.cell.y,
    };
    let ahead = WorldCoord {
        x: npc.cell.x,
        y: npc.cell.y + dy,
    };
    can_npc_stand(ground, beside, level) && can_npc_stand(ground, ahead, level)
}

/// One tick of `npc`: rest, or set off on a stroll, or carry the step in flight on. `taken`
/// answers whether somebody else holds a cell.
pub fn step_npc<G: PlayerGround>(npc: &mut Npc, ground: &G, taken: impl Fn(WorldCoord) -> bool) {
    npc.previous = npc.position();
    let Some(heading) = npc.heading else {
        if npc.rest_ticks > 0 {
            npc.rest_ticks -= 1;
            return;
        }
        set_off(npc, ground, taken);
        return;
    };
    let length = f64::from(heading.0).hypot(f64::from(heading.1));
    npc.progress += NPC_STEP / length;
    if npc.progress < 1.0 {
        return;
    }
    let over = npc.progress - 1.0;
    npc.cell = WorldCoord {
        x: npc.cell.x + heading.0,
        y: npc.cell.y + heading.1,
    };
    npc.heading = None;
    npc.progress = 0.0;
    if npc.strides_left > 0 && can_npc_step(npc, heading, ground, taken) {
        npc.strides_left -= 1;
        npc.heading = Some(heading);
        npc.progress = over;
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
        .find(|heading| can_npc_step(npc, *heading, ground, &taken));
    match open {
        Some(heading) => {
            npc.heading = Some(heading);
            npc.progress = 0.0;
            npc.direction = unit(heading);
            npc.strides_left = strides - 1;
        }
        None => npc.rest_ticks = NPC_BLOCKED_REST_TICKS,
    }
}

#[cfg(test)]
#[path = "wander.test.rs"]
pub(crate) mod tests;
