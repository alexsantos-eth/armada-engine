//! Player locomotion physics, independent of rendering and of the world's storage.

use crate::grid::{ChunkCoord, WorldCoord, WorldRect};
use crate::player::motion::{PlayerMotionEvent, PlayerMotionType, transition_player_motion};
use crate::player::swim::{
    PLAYER_SWIM_ACCEL, PLAYER_SWIM_BRAKE, PLAYER_SWIM_EXIT_CLIMB, PlayerSwim, float_bob,
    float_settle, is_swimmable, is_under, next_float, splashes, swim_step,
};
use crate::projection::GridPoint;
use crate::terrain::{TerrainColumn, TerrainMaterial, stairs_direction};
use crate::time::TICKS_PER_SECOND;

/// Walking speed of the player, in columns per second of simulation.
pub const PLAYER_SPEED: f64 = 3.0;
/// Maximum horizontal columns a walking player moves in one tick.
pub const PLAYER_STEP: f64 = PLAYER_SPEED / TICKS_PER_SECOND as f64;
/// Running speed of the player, in columns per second of simulation.
pub const PLAYER_RUN_SPEED: f64 = 5.0;
/// Maximum horizontal columns a running player moves in one tick.
pub const PLAYER_RUN_STEP: f64 = PLAYER_RUN_SPEED / TICKS_PER_SECOND as f64;
/// Horizontal velocity change per tick while starting or redirecting on land.
pub const PLAYER_GROUND_ACCEL: f64 = 0.05;
/// Horizontal velocity removed per tick when releasing movement on land.
pub const PLAYER_GROUND_BRAKE: f64 = 0.03;
/// Horizontal velocity change per tick while steering in the air.
pub const PLAYER_AIR_ACCEL: f64 = 0.04;
/// Horizontal velocity removed per tick when releasing movement in the air.
pub const PLAYER_AIR_BRAKE: f64 = 0.025;
/// Maximum sideways displacement used to clear a small corner.
pub const PLAYER_CORNER_NUDGE: f64 = 0.04;
/// Half the side of the square the player's feet take on the ground.
pub const PLAYER_RADIUS: f64 = 0.2;
/// Vertical extent of the player's collision body above its feet, in blocks.
pub const PLAYER_BODY_HEIGHT: f64 = 0.6;
/// Distance below the last stable surface at which a fall is rescued.
pub const PLAYER_RESCUE_DROP: f64 = 2.0;
/// Most blocks the player climbs up or down from one column to the next.
pub const PLAYER_MAX_CLIMB: f64 = 1.0;
/// Blocks the player's feet rise at the top of a jump.
pub const PLAYER_JUMP_HEIGHT: f64 = 0.85;
/// Ticks a jump lasts on flat ground, from take-off to landing.
pub const PLAYER_JUMP_TICKS: i32 = 10;
/// Ticks for which a jump press can wait for landing.
pub const PLAYER_JUMP_BUFFER_TICKS: i32 = 2;
/// Ticks for which jumping remains possible after leaving a ledge.
pub const PLAYER_COYOTE_TICKS: i32 = 2;
/// Jumps the player can take in the air before it lands.
pub const PLAYER_AIR_JUMPS: i32 = 1;
/// Blocks per tick the feet rise at take-off.
pub const PLAYER_JUMP_SPEED: f64 = (4.0 * PLAYER_JUMP_HEIGHT) / PLAYER_JUMP_TICKS as f64;
/// Upward speed retained when a jump key is released.
pub const PLAYER_JUMP_CUT_SPEED: f64 = PLAYER_JUMP_SPEED * 0.6;
/// Fastest downward speed in blocks per simulation tick.
pub const PLAYER_MAX_FALL_SPEED: f64 = 0.6;
/// Blocks per tick its feet's upward speed drops each tick in the air.
pub const PLAYER_GRAVITY: f64 =
    (8.0 * PLAYER_JUMP_HEIGHT) / ((PLAYER_JUMP_TICKS as f64) * (PLAYER_JUMP_TICKS as f64));
/// Blocks a top may stand above the player's feet and still be stepped onto in one tick.
pub const PLAYER_STEP_HEIGHT: f64 = 0.25;
/// Ticks a climb of one block lasts.
pub const PLAYER_CLIMB_TICKS: i32 = 12;
/// Real milliseconds a climb of one block lasts.
pub const PLAYER_CLIMB_MS: f64 = (PLAYER_CLIMB_TICKS as f64 * 1000.0) / TICKS_PER_SECOND as f64;
/// Share of a climb its feet take to rise to the top.
pub const PLAYER_CLIMB_RISE_SHARE: f64 = 0.7;
/// Columns past where it reaches the higher top the player walks on during a climb.
pub const PLAYER_CLIMB_REACH: f64 = 0.25;
/// Ticks a flight of stairs of one block lasts: it is walked up, not pulled up.
pub const PLAYER_STAIRS_TICKS: i32 = 16;
/// Columns of the stairs block the player has crossed when it reaches the top of the flight,
/// measured from the edge it stepped on at: it walks almost the whole block.
pub const PLAYER_STAIRS_REACH: f64 = 0.95;
/// Share of the top face of a flight the player crosses from its upper edge before it starts
/// walking down the steps: the last stretch of flat top it stands on.
pub const PLAYER_STAIRS_DESCENT_SHARE: f64 = 0.2;
/// Treads a flight of stairs is taken in, one step of the artwork each.
pub const PLAYER_STAIRS_STEPS: i32 = 4;
/// Share of a tread's time the player spends moving onto it; the rest it stands on it.
pub const PLAYER_STAIRS_LIFT_SHARE: f64 = 0.6;
/// Blocks the player's body pops over the tread as it hops onto the next one.
pub const PLAYER_STAIRS_HOP: f64 = 0.08;
/// Share of a flight over which the sideways slide onto the stairs centreline is walked, from
/// the point the flight starts; the rest of the flight is taken on the middle of its steps.
pub const PLAYER_STAIRS_ALIGN_SHARE: f64 = 0.4;
/// Blocks per tick a flying player's feet rise at most.
pub const PLAYER_FLY_SPEED: f64 = 0.15;
/// Blocks per tick its jetpack speeds a flying player's feet up by each tick.
pub const PLAYER_FLY_THRUST: f64 = 0.04;
/// Highest a flying player's feet go above the last land it stood on.
pub const PLAYER_FLY_MAX_HEIGHT: f64 = 10.0;
/// Ticks the player shows its landing pose after it lands.
pub const PLAYER_LANDING_TICKS: i32 = 3;
/// Ticks after a take-off it shows its take-off pose.
pub const PLAYER_TAKEOFF_TICKS: i32 = 2;
/// Vertical speed under which a jump is at its apex.
pub const PLAYER_APEX_SPEED: f64 = PLAYER_GRAVITY;
/// Key of the player part.
pub const PLAYER_PART_ID: &str = "player";
/// The facings the player is drawn in: the sixteen points of the compass, counter-clockwise on
pub const PLAYER_FACINGS: [&str; 16] = [
    "east",
    "east-north-east",
    "north-east",
    "north-north-east",
    "north",
    "north-north-west",
    "north-west",
    "west-north-west",
    "west",
    "west-south-west",
    "south-west",
    "south-south-west",
    "south",
    "south-south-east",
    "south-east",
    "east-south-east",
];
/// Columns around the centre a new player's spawn is searched in.
pub const PLAYER_SPAWN_RADIUS: i32 = 32;

const LANDING: f64 = 1e-9;

/// Height of the feet above flat ground `tick` ticks into a jump.
pub fn get_jump_height(tick: f64) -> f64 {
    let t = tick.clamp(0.0, PLAYER_JUMP_TICKS as f64);
    (4.0 * PLAYER_JUMP_HEIGHT * t * (PLAYER_JUMP_TICKS as f64 - t))
        / (PLAYER_JUMP_TICKS as f64).powi(2)
}

fn harmonic(t: f64) -> f64 {
    let clamped = t.clamp(0.0, 1.0);
    (1.0 - (std::f64::consts::PI * clamped).cos()) / 2.0
}

/// Share of its rise a climb's feet have risen at `progress` (0–1).
pub fn get_climb_rise(progress: f64) -> f64 {
    harmonic(progress / PLAYER_CLIMB_RISE_SHARE)
}

/// Share of the way from `from` to `to` a climb has gone at `progress` (0–1).
pub fn get_climb_advance(progress: f64) -> f64 {
    harmonic((progress - PLAYER_CLIMB_RISE_SHARE) / (1.0 - PLAYER_CLIMB_RISE_SHARE))
}

/// Share of its rise a flight of stairs has taken at `progress` (0–1): one tread at a time,
/// moving onto each step and standing on it, instead of gliding up a ramp. Negative rises, the
/// descents, take their treads the same way.
pub fn get_stairs_rise(progress: f64) -> f64 {
    let steps = f64::from(PLAYER_STAIRS_STEPS);
    let walked = progress.clamp(0.0, 1.0) * steps;
    let tread = walked.floor().min(steps - 1.0);
    let onto = harmonic(((walked - tread) / PLAYER_STAIRS_LIFT_SHARE).min(1.0));
    ((tread + onto) / steps).min(1.0)
}

/// Blocks the player's body is over the tread under its feet at `progress` (0–1) of a flight:
/// a small hop onto each step, nothing as it lands on one.
pub fn get_stairs_hop(progress: f64) -> f64 {
    let steps = f64::from(PLAYER_STAIRS_STEPS);
    let walked = progress.clamp(0.0, 1.0) * steps;
    let tread = walked.floor().min(steps - 1.0);
    let onto = ((walked - tread) / PLAYER_STAIRS_LIFT_SHARE).min(1.0);
    PLAYER_STAIRS_HOP * (std::f64::consts::PI * onto).sin()
}

/// Share of the sideways slide onto the stairs centreline a flight has walked at `progress`
/// (0–1): the first stretch of the flight, eased like a step, so the rest of it is taken on
/// the middle of its steps instead of in a shallow sideways slide.
pub fn get_stairs_align(progress: f64) -> f64 {
    harmonic(progress / PLAYER_STAIRS_ALIGN_SHARE)
}

/// Share of its rise and share of its advance a climb has taken at `progress` (0–1). Over a
/// ledge the player pulls itself up first and steps over after; a flight of stairs advances
/// evenly and rises one tread at a time (`get_stairs_rise`), which is what taking the steps
/// looks like.
pub fn get_climb_shares(stairs: bool, progress: f64) -> (f64, f64) {
    if stairs {
        return (get_stairs_rise(progress), progress.clamp(0.0, 1.0));
    }
    (get_climb_rise(progress), get_climb_advance(progress))
}

/// Why a requested walking step could not advance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlayerBlockReason {
    Terrain,
    Obstacle,
    Climbing,
    Ceiling,
    Airborne,
}

/// Something standing on a column, as the player bumps into it.
#[derive(Clone, Debug)]
pub struct PlayerObstacle {
    pub walkable: bool,
    pub height: Option<f64>,
    pub elevation: Option<f64>,
    /// Side of the square it blocks, as a fraction of the block, precomputed for the column
    pub collision_at: Option<f64>,
}

impl PlayerObstacle {
    pub fn blocked_side(&self, _x: f64, _y: f64) -> f64 {
        if self.walkable {
            return 0.0;
        }
        self.collision_at.unwrap_or(1.0)
    }
}

/// A climb in progress.
#[derive(Clone, Debug)]
pub struct PlayerClimb {
    pub from: GridPoint,
    pub to: GridPoint,
    pub direction: GridPoint,
    pub feet: f64,
    pub rise: f64,
    pub ticks: i32,
    pub tick: i32,
    /// Whether the block being climbed is a flight of stairs, walked across instead of pulled
    /// over.
    pub stairs: bool,
}

/// Feedback counters of a player.
#[derive(Clone, Debug, Default)]
pub struct PlayerFeedback {
    pub jumps: i32,
    pub landings: i32,
    pub rejections: i32,
    pub rejected: Option<PlayerBlockReason>,
    pub air_ticks: i32,
    pub landing_ticks: i32,
    pub impact: f64,
    pub leap: bool,
    pub air_jump: bool,
    /// Times the player has gone into the water fast enough to raise a splash.
    pub splashes: i32,
    /// Blocks per tick it was sinking as it went in, which is how big that splash is.
    pub splash_impact: f64,
}

/// Player state.
#[derive(Clone, Debug)]
pub struct PlayerState {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub height: f64,
    pub vertical_speed: Option<f64>,
    pub last_safe: PlayerPosition,
    pub wants_jump: bool,
    pub jump_buffer_ticks: i32,
    pub coyote_ticks: i32,
    pub jump_held: bool,
    pub running: bool,
    pub air_jumps: i32,
    pub jetpack: bool,
    pub velocity: GridPoint,
    pub climb: Option<PlayerClimb>,
    /// The swim in progress, or `None` on land and in the air.
    pub swim: Option<PlayerSwim>,
    pub previous: PlayerPosition,
    pub feedback: PlayerFeedback,
    pub walk: GridPoint,
    pub motion: PlayerMotionType,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PlayerPosition {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub height: f64,
    /// Horizontal displacement per tick when this state was reached.
    pub velocity: GridPoint,
    /// Vertical displacement per tick when this state was reached; `None` resting on a surface.
    pub vertical_speed: Option<f64>,
}

/// Render position for interpolation.
#[derive(Clone, Copy, Debug)]
pub struct PlayerRenderPosition {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub height: f64,
}

/// Jump phase for animation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlayerJumpPhase {
    Ground,
    Takeoff,
    Rise,
    Apex,
    Fall,
    Landing,
}

/// A world with terrain and occupancy that the player walks on.
pub trait PlayerGround {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn>;
    fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle>;
    fn chunk_has(&self, _coord: ChunkCoord) -> bool {
        true
    }
    fn load_around(&mut self, _point: GridPoint) {}
}

/// Column the ground point `point` belongs to.
pub fn get_player_column(point: GridPoint) -> WorldCoord {
    WorldCoord {
        x: point.x.round() as i32,
        y: point.y.round() as i32,
    }
}

/// Whether the player can stand on the centre of column `(x, y)` coming from `from_elevation`.
pub fn can_stand_on<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {
    let column = match ground.column_at(x, y) {
        Some(c) => c,
        None => return false,
    };
    if column.surface == TerrainMaterial::Water {
        return false;
    }
    if (column.elevation as f64 - from_elevation).abs() > PLAYER_MAX_CLIMB {
        return false;
    }
    ground.occupancy_at(x, y).iter().all(|occ| {
        let side = occ.blocked_side(x as f64, y as f64);
        if side <= 0.0 {
            return true;
        }
        occ.elevation
            .map(|e| e >= column.elevation as f64 + PLAYER_BODY_HEIGHT - LANDING)
            .unwrap_or(false)
    })
}

/// Whether the player can move onto the column `(x, y)` from `from_elevation`, reaching `reach`
/// blocks up or down. Water is always entered, however far below: it is a fall into the water,
/// and the water catches it.
fn is_steppable<G: PlayerGround>(
    ground: &G,
    x: i32,
    y: i32,
    from_elevation: f64,
    reach: f64,
) -> bool {
    let column = match ground.column_at(x, y) {
        Some(c) => c,
        None => return false,
    };
    if is_swimmable(column.surface) {
        return true;
    }
    (column.elevation as f64 - from_elevation).abs() <= reach
}

fn clears_standing_body(occ: &PlayerObstacle, column: &TerrainColumn) -> bool {
    occ.elevation
        .map(|e| e >= column.elevation as f64 + PLAYER_BODY_HEIGHT - LANDING)
        .unwrap_or(false)
}

fn support_at<G: PlayerGround>(ground: &G, point: GridPoint) -> Option<TerrainColumn> {
    let (x, y) = (get_player_column(point).x, get_player_column(point).y);
    let column = ground.column_at(x, y)?;
    if column.surface == TerrainMaterial::Water {
        return None;
    }
    for occ in ground.occupancy_at(x, y) {
        let side = occ.blocked_side(x as f64, y as f64);
        if side > 0.0
            && !clears_standing_body(&occ, &column)
            && (point.x - x as f64).abs() < PLAYER_RADIUS + side / 2.0
            && (point.y - y as f64).abs() < PLAYER_RADIUS + side / 2.0
        {
            return None;
        }
    }
    Some(column)
}

/// The way the flight on column `coord` climbs, when that column carries one.
fn flight_direction<G: PlayerGround>(ground: &G, coord: WorldCoord) -> Option<WorldCoord> {
    let column = ground.column_at(coord.x, coord.y)?;
    if column.surface != TerrainMaterial::Stairs {
        return None;
    }
    stairs_direction(coord, column.elevation, |at| {
        ground
            .column_at(at.x, at.y)
            .map(|found| (found.surface, found.elevation))
    })
}

/// The way a body of `PLAYER_RADIUS` overlaps the cell, on each axis. Zero on an axis means
/// the body does not reach into the cell there.
fn body_overlap(point: GridPoint, x: i32, y: i32) -> (f64, f64) {
    let extent =
        |from: f64, to: f64, cell: f64| (to.min(cell + 0.5) - from.max(cell - 0.5)).max(0.0);
    (
        extent(
            point.x - PLAYER_RADIUS,
            point.x + PLAYER_RADIUS,
            f64::from(x),
        ),
        extent(
            point.y - PLAYER_RADIUS,
            point.y + PLAYER_RADIUS,
            f64::from(y),
        ),
    )
}

/// The shove the game gives an idle player floating on a flight: a velocity toward its foot at
/// walk speed, all on the axis the steps are drawn on, or `None` when he is not floating on one
/// (walking, mid-air, on the ground outside a flight, or standing on the last tread flush with
/// the top). A floating player is walked off the flight this way, never into a stairs climb.
fn flight_shove<G: PlayerGround>(player: &PlayerState, ground: &G) -> Option<GridPoint> {
    if player.walk.x != 0.0 || player.walk.y != 0.0 {
        return None;
    }
    if player.vertical_speed.is_some() || player.height != 0.0 || player.climb.is_some() {
        return None;
    }
    let here = GridPoint {
        x: player.x,
        y: player.y,
    };
    let support = support_at(ground, here)?;
    if support.surface != TerrainMaterial::Stairs {
        return None;
    }
    let coord = get_player_column(here);
    let up = flight_direction(ground, coord)?;
    let along = (here.x - f64::from(coord.x)) * f64::from(up.x)
        + (here.y - f64::from(coord.y)) * f64::from(up.y);
    let progress = (along + 0.5).clamp(0.0, 1.0);
    let ramp = (support.elevation - 1) as f64 + get_stairs_rise(progress);
    if player.elevation + player.height - ramp <= PLAYER_STEP_HEIGHT {
        return None;
    }
    Some(GridPoint {
        x: -f64::from(up.x) * PLAYER_STEP,
        y: -f64::from(up.y) * PLAYER_STEP,
    })
}

/// Whether a walking player with its feet at `feet` may move from `from` to `to`. A flight of
/// stairs is only ever taken from its foot, the column it climbs away from, so from anywhere
/// else its side is a wall the body stops against, like any other block's, and is cleared the
/// way any block is, by jumping. A flight at the top is the same leading edge in reverse: it
/// is only entered from its descent edge, along its axis, so a lateral walk cannot step onto
/// the top face. A player who fell into an overlap with a flight's side may not deepen it,
/// but may slide or step away: the overlap may not grow on either axis, or walking out of a
/// corner would be impossible.
fn may_step_onto<G: PlayerGround>(ground: &G, from: GridPoint, to: GridPoint, feet: f64) -> bool {
    let standing = get_player_column(from);
    let body = get_player_cells(to);
    for y in body.min_y..=body.max_y {
        for x in body.min_x..=body.max_x {
            let coord = WorldCoord { x, y };
            if coord == standing {
                continue;
            }
            let Some(column) = ground.column_at(x, y) else {
                continue;
            };
            if f64::from(column.elevation) - feet <= PLAYER_STEP_HEIGHT {
                if let Some(up) = flight_direction(ground, coord) {
                    let foot = WorldCoord {
                        x: coord.x - up.x,
                        y: coord.y - up.y,
                    };
                    let edge = WorldCoord {
                        x: coord.x + up.x,
                        y: coord.y + up.y,
                    };
                    if standing != foot && standing != edge {
                        let (from_x, from_y) = body_overlap(from, x, y);
                        let (to_x, to_y) = body_overlap(to, x, y);
                        if to_x > from_x + 1e-9 || to_y > from_y + 1e-9 {
                            return false;
                        }
                    }
                }
                continue;
            }
            let Some(up) = flight_direction(ground, coord) else {
                continue;
            };
            let foot = WorldCoord {
                x: coord.x - up.x,
                y: coord.y - up.y,
            };
            if standing != foot {
                let (from_x, from_y) = body_overlap(from, x, y);
                let (to_x, to_y) = body_overlap(to, x, y);
                if to_x > from_x + 1e-9 || to_y > from_y + 1e-9 {
                    return false;
                }
            }
        }
    }
    true
}

fn fits_in_air<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    from: Option<GridPoint>,
    feet: f64,
) -> bool {
    block_reason_at(ground, point, from, 0.0, feet, true, PLAYER_MAX_CLIMB).is_none()
}

fn can_leave_edge<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    from: Option<GridPoint>,
    feet: f64,
) -> bool {
    let cells = get_player_cells(point);
    let mut missing = false;
    for x in cells.min_x..=cells.max_x {
        for y in cells.min_y..=cells.max_y {
            let column = ground.column_at(x, y);
            if column.is_none_or(|c| is_swimmable(c.surface)) {
                missing = true;
            }
        }
    }
    missing && fits_in_air(ground, point, from, feet)
}

/// The overlap of one axis between the body's square and the obstacle's square centred on
/// `cell` with side `side`. Zero means the body does not reach into it there.
fn square_overlap(centre: f64, cell: f64, side: f64) -> f64 {
    let overlap = (centre + PLAYER_RADIUS).min(cell + side / 2.0)
        - (centre - PLAYER_RADIUS).max(cell - side / 2.0);
    overlap.max(0.0)
}

fn block_reason_at<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    from: Option<GridPoint>,
    elevation: f64,
    feet: f64,
    airborne: bool,
    reach: f64,
) -> Option<PlayerBlockReason> {
    let cells = get_player_cells(point);
    for x in cells.min_x..=cells.max_x {
        for y in cells.min_y..=cells.max_y {
            let column = ground.column_at(x, y);
            if column.is_none() {
                let chunk_coord = crate::grid::to_chunk_coord(WorldCoord { x, y });
                if !ground.chunk_has(chunk_coord) {
                    return Some(PlayerBlockReason::Terrain);
                }
            }
            if airborne {
                if let Some(col) = column
                    && col.surface != TerrainMaterial::Water
                    && feet < col.elevation as f64 - LANDING
                {
                    return Some(PlayerBlockReason::Terrain);
                }
            } else if !is_steppable(ground, x, y, elevation, reach) {
                return Some(PlayerBlockReason::Terrain);
            }
            for occ in ground.occupancy_at(x, y) {
                let side = occ.blocked_side(x as f64, y as f64);
                if side <= 0.0 {
                    continue;
                }
                let to_x = square_overlap(point.x, f64::from(x), side);
                let to_y = square_overlap(point.y, f64::from(y), side);
                if to_x <= 0.0 || to_y <= 0.0 {
                    continue;
                }
                let blocked = match from {
                    Some(from) => {
                        let from_x = square_overlap(from.x, f64::from(x), side);
                        let from_y = square_overlap(from.y, f64::from(y), side);
                        to_x > from_x + 1e-9 || to_y > from_y + 1e-9
                    }
                    None => true,
                };
                if !blocked {
                    continue;
                }
                if !airborne {
                    let col = column.unwrap();
                    if !clears_standing_body(&occ, &col) {
                        return Some(PlayerBlockReason::Obstacle);
                    }
                    continue;
                }
                let base = occ
                    .elevation
                    .unwrap_or(column.map(|c| c.elevation as f64).unwrap_or(0.0));
                let height = occ.height.unwrap_or(f64::INFINITY);
                if feet < base + height - LANDING && feet + PLAYER_BODY_HEIGHT > base + LANDING {
                    return Some(PlayerBlockReason::Obstacle);
                }
            }
        }
    }
    None
}

fn fits_at<G: PlayerGround>(ground: &G, point: GridPoint, from_elevation: f64) -> bool {
    fits_within(ground, point, None, from_elevation, PLAYER_MAX_CLIMB)
}

/// `fits_at` with the reach spelled out: a swimmer pulls itself further up than a walker steps.
/// `from` is the body's own air/ground position, when the caller has one: an overlap that
/// deepens from it is rejected, one that merely slides or steps out is not.
fn fits_within<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    from: Option<GridPoint>,
    from_elevation: f64,
    reach: f64,
) -> bool {
    block_reason_at(ground, point, from, from_elevation, 0.0, false, reach).is_none()
}

fn elevation_at<G: PlayerGround>(ground: &G, point: GridPoint) -> f64 {
    let (x, y) = (get_player_column(point).x, get_player_column(point).y);
    ground
        .column_at(x, y)
        .map(|c| c.elevation as f64)
        .unwrap_or(0.0)
}

/// The furthest point along `[near, far]` whose body fits, for when the far end of a
/// flight of stairs is closed by an entity: a flight ends as far along its block as the
/// body stands clear, never back at its foot. `near` is the point the current step landed
/// on, which is free of obstacles by construction.
fn farthest_clear_point<G: PlayerGround>(
    ground: &G,
    near: GridPoint,
    far: GridPoint,
    elevation: f64,
    reach: f64,
) -> GridPoint {
    if !fits_within(ground, near, None, elevation, reach) {
        return near;
    }
    let mut best = near;
    let mut blocked = far;
    for _ in 0..16 {
        let mid = GridPoint {
            x: (best.x + blocked.x) / 2.0,
            y: (best.y + blocked.y) / 2.0,
        };
        if fits_within(ground, mid, None, elevation, reach) {
            best = mid;
        } else {
            blocked = mid;
        }
    }
    best
}

pub fn find_player_spawn<G: PlayerGround>(ground: &G, centre: GridPoint) -> PlayerPosition {
    let distance = |column: &TerrainColumn| -> f64 {
        (column.coord.x as f64 - centre.x).powi(2) + (column.coord.y as f64 - centre.y).powi(2)
    };
    let before = |a: &TerrainColumn, b: Option<&TerrainColumn>| -> bool {
        match b {
            None => true,
            Some(bb) => {
                let da = distance(a);
                let db = distance(bb);
                if (da - db).abs() > f64::EPSILON {
                    return da < db;
                }
                if a.coord.x != bb.coord.x {
                    return a.coord.x < bb.coord.x;
                }
                a.coord.y < bb.coord.y
            }
        }
    };
    let origin = WorldCoord {
        x: centre.x.floor() as i32,
        y: centre.y.floor() as i32,
    };
    let mut walkable: Option<TerrainColumn> = None;
    let mut any: Option<TerrainColumn> = None;

    for radius in 0..=PLAYER_SPAWN_RADIUS {
        if let Some(w) = walkable.as_ref()
            && (radius as f64 - 1.0).powi(2) > distance(w)
        {
            break;
        }
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                if dx.abs().max(dy.abs()) != radius {
                    continue;
                }
                let column = ground.column_at(origin.x + dx, origin.y + dy);
                if column.is_none() {
                    continue;
                }
                let column = column.unwrap();
                if before(&column, any.as_ref()) {
                    any = Some(column);
                }
                if before(&column, walkable.as_ref())
                    && can_stand_on(
                        ground,
                        column.coord.x,
                        column.coord.y,
                        column.elevation as f64,
                    )
                {
                    walkable = Some(column);
                }
            }
        }
    }
    let spawn = walkable.or(any);
    match spawn {
        Some(s) => PlayerPosition {
            x: s.coord.x as f64,
            y: s.coord.y as f64,
            elevation: s.elevation as f64,
            height: 0.0,
            velocity: GridPoint { x: 0.0, y: 0.0 },
            vertical_speed: None,
        },
        None => PlayerPosition {
            x: centre.x,
            y: centre.y,
            elevation: 0.0,
            height: 0.0,
            velocity: GridPoint { x: 0.0, y: 0.0 },
            vertical_speed: None,
        },
    }
}

pub fn create_player<G: PlayerGround>(ground: &G, at: GridPoint) -> PlayerState {
    let position = PlayerPosition {
        x: at.x,
        y: at.y,
        elevation: elevation_at(ground, at),
        height: 0.0,
        velocity: GridPoint { x: 0.0, y: 0.0 },
        vertical_speed: None,
    };
    PlayerState {
        x: at.x,
        y: at.y,
        elevation: elevation_at(ground, at),
        height: 0.0,
        vertical_speed: None,
        last_safe: position,
        wants_jump: false,
        jump_buffer_ticks: 0,
        coyote_ticks: 0,
        jump_held: false,
        running: false,
        air_jumps: PLAYER_AIR_JUMPS,
        jetpack: false,
        velocity: GridPoint { x: 0.0, y: 0.0 },
        climb: None,
        swim: None,
        previous: position,
        feedback: PlayerFeedback::default(),
        walk: GridPoint { x: 0.0, y: 0.0 },
        motion: PlayerMotionType::Idle,
    }
}

pub fn get_walk_direction(directions: &ScreenDirections) -> GridPoint {
    let across = if directions.right { 1.0 } else { 0.0 } - if directions.left { 1.0 } else { 0.0 };
    let up = if directions.up { 1.0 } else { 0.0 } - if directions.down { 1.0 } else { 0.0 };
    let x: f64 = across + up;
    let y: f64 = up - across;
    let length = x.hypot(y);
    if length == 0.0 {
        GridPoint { x: 0.0, y: 0.0 }
    } else {
        GridPoint {
            x: x / length,
            y: y / length,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ScreenDirections {
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,
}

pub fn get_player_facing(walk: GridPoint) -> Option<usize> {
    let across = walk.x - walk.y;
    let up = walk.x + walk.y;
    if across == 0.0 && up == 0.0 {
        return None;
    }
    let step = std::f64::consts::TAU / PLAYER_FACINGS.len() as f64;
    let turn = (up.atan2(across) / step).round() as i32;
    Some(turn.rem_euclid(PLAYER_FACINGS.len() as i32) as usize)
}

pub fn set_player_walk(player: &mut PlayerState, directions: ScreenDirections) {
    player.walk = get_walk_direction(&directions);
}

pub fn set_player_jetpack(player: &mut PlayerState, jetpack: bool) {
    player.jetpack = jetpack;
}

pub fn set_player_run(player: &mut PlayerState, running: bool) {
    player.running = running;
}

pub fn is_player_running(player: &PlayerState) -> bool {
    player.motion == PlayerMotionType::Running
}

pub fn is_player_skidding(player: &PlayerState) -> bool {
    player.motion == PlayerMotionType::Skidding
}

pub fn jump_player(player: &mut PlayerState) {
    player.wants_jump = true;
    player.jump_buffer_ticks = PLAYER_JUMP_BUFFER_TICKS;
    player.jump_held = true;
}

pub fn set_player_jump_held(player: &mut PlayerState, held: bool) {
    player.jump_held = held;
}

pub fn cancel_player_jump(player: &mut PlayerState) {
    player.wants_jump = false;
    player.jump_buffer_ticks = 0;
    player.coyote_ticks = 0;
    player.jump_held = false;
}

fn approach_velocity(current: GridPoint, desired: GridPoint, rate: f64) -> GridPoint {
    let dx = desired.x - current.x;
    let dy = desired.y - current.y;
    let distance = dx.hypot(dy);
    if distance <= rate {
        return desired;
    }
    GridPoint {
        x: current.x + (dx / distance) * rate,
        y: current.y + (dy / distance) * rate,
    }
}

fn is_faster_than_walk(player: &PlayerState) -> bool {
    (player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y).sqrt()
        > PLAYER_STEP + 1e-9
}

fn is_sliding(player: &PlayerState) -> bool {
    let v = &player.velocity;
    if v.x == 0.0 && v.y == 0.0 {
        return false;
    }
    let w = &player.walk;
    (w.x == 0.0 && w.y == 0.0) || v.x * w.x + v.y * w.y < 0.0
}

fn get_gait(player: &PlayerState, moved: bool) -> &'static str {
    if !moved {
        return "IDLE";
    }
    if is_sliding(player) {
        return "SKIDDING";
    }
    if is_faster_than_walk(player) {
        return "RUNNING";
    }
    "WALKING"
}

fn get_motion_event(player: &PlayerState, flying: bool) -> PlayerMotionEvent {
    let moved = player.x != player.previous.x || player.y != player.previous.y;
    if player.climb.as_ref().is_some_and(|climb| !climb.stairs) {
        return if player.motion == PlayerMotionType::Climbing {
            PlayerMotionEvent::ClimbTick
        } else {
            PlayerMotionEvent::Climb
        };
    }
    if player.motion == PlayerMotionType::Climbing {
        return if moved {
            PlayerMotionEvent::ClimbDoneWalking
        } else {
            PlayerMotionEvent::ClimbDoneIdle
        };
    }
    if let Some(swim) = player.swim {
        return if is_under(swim.depth) {
            PlayerMotionEvent::Sink
        } else {
            PlayerMotionEvent::Swim
        };
    }
    if let Some(vs) = player.vertical_speed {
        if flying {
            return PlayerMotionEvent::Fly;
        }
        return if vs > 0.0 {
            PlayerMotionEvent::Jump
        } else {
            PlayerMotionEvent::Fall
        };
    }
    let gait = get_gait(player, moved);
    let air_motions = matches!(
        player.motion,
        PlayerMotionType::Jumping | PlayerMotionType::Falling | PlayerMotionType::Flying
    );
    if air_motions {
        return match gait {
            "IDLE" => PlayerMotionEvent::LandIdle,
            "WALKING" => PlayerMotionEvent::LandWalking,
            "RUNNING" => PlayerMotionEvent::LandRunning,
            "SKIDDING" => PlayerMotionEvent::LandSkidding,
            _ => PlayerMotionEvent::LandIdle,
        };
    }
    match gait {
        "IDLE" => PlayerMotionEvent::Stop,
        "WALKING" => PlayerMotionEvent::Walk,
        "RUNNING" => PlayerMotionEvent::Run,
        "SKIDDING" => PlayerMotionEvent::Skid,
        _ => PlayerMotionEvent::Stop,
    }
}

fn update_motion(player: &mut PlayerState, flying: bool) {
    let event = get_motion_event(player, flying);
    let next = transition_player_motion(player.motion, event);
    player.motion = next;
}

fn take_off(player: &mut PlayerState, air: bool) {
    if air {
        player.air_jumps -= 1;
    }
    player.vertical_speed = Some(PLAYER_JUMP_SPEED);
    player.wants_jump = false;
    player.jump_buffer_ticks = 0;
    player.coyote_ticks = 0;
    player.feedback.jumps += 1;
    player.feedback.air_ticks = 0;
    player.feedback.landing_ticks = 0;
    player.feedback.leap = true;
    player.feedback.air_jump = air;
}

fn reject_jump(player: &mut PlayerState, reason: PlayerBlockReason) {
    player.feedback.rejections += 1;
    player.feedback.rejected = Some(reason);
}

fn land(player: &mut PlayerState) {
    player.feedback.landings += 1;
    player.feedback.landing_ticks = PLAYER_LANDING_TICKS;
    player.feedback.leap = false;
    player.air_jumps = PLAYER_AIR_JUMPS;
}

fn accelerate_player(player: &mut PlayerState) {
    if let Some(swim) = player.swim {
        let step = swim_step(player.running, swim.depth);
        let desired = GridPoint {
            x: player.walk.x * step,
            y: player.walk.y * step,
        };
        let rate = if desired.x == 0.0 && desired.y == 0.0 {
            PLAYER_SWIM_BRAKE
        } else if player.velocity.x * desired.x + player.velocity.y * desired.y < 0.0 {
            PLAYER_SWIM_ACCEL + PLAYER_SWIM_BRAKE
        } else if player.velocity.x.hypot(player.velocity.y) > step + 1e-9 {
            PLAYER_SWIM_BRAKE
        } else {
            PLAYER_SWIM_ACCEL
        };
        player.velocity = approach_velocity(player.velocity, desired, rate);
        return;
    }
    let airborne = player.vertical_speed.is_some();
    let step = if player.running {
        PLAYER_RUN_STEP
    } else {
        PLAYER_STEP
    };
    let desired = GridPoint {
        x: player.walk.x * step,
        y: player.walk.y * step,
    };
    let turning = player.velocity.x * desired.x + player.velocity.y * desired.y < 0.0;
    let slowing = player.velocity.x.hypot(player.velocity.y) > step + 1e-9;
    let rate = if airborne {
        if desired.x == 0.0 && desired.y == 0.0 {
            PLAYER_AIR_BRAKE
        } else if turning {
            PLAYER_AIR_ACCEL + PLAYER_AIR_BRAKE
        } else {
            PLAYER_AIR_ACCEL
        }
    } else if desired.x == 0.0 && desired.y == 0.0 {
        PLAYER_GROUND_BRAKE
    } else if turning {
        PLAYER_GROUND_ACCEL + PLAYER_GROUND_BRAKE
    } else if slowing {
        PLAYER_GROUND_BRAKE
    } else {
        PLAYER_GROUND_ACCEL
    };
    player.velocity = approach_velocity(player.velocity, desired, rate);
}

fn step_once<G: PlayerGround>(
    player: &mut PlayerState,
    ground: &G,
    diagnose: bool,
    shove: bool,
) -> Option<PlayerBlockReason> {
    let velocity = player.velocity;
    if velocity.x == 0.0 && velocity.y == 0.0 {
        return None;
    }
    let from = GridPoint {
        x: player.x,
        y: player.y,
    };
    let moves = [
        GridPoint {
            x: from.x + velocity.x,
            y: from.y + velocity.y,
        },
        GridPoint {
            x: from.x + velocity.x,
            y: from.y,
        },
        GridPoint {
            x: from.x,
            y: from.y + velocity.y,
        },
    ];
    let airborne = player.vertical_speed.is_some();
    let swimming = player.swim.is_some();
    let reach = if swimming {
        PLAYER_SWIM_EXIT_CLIMB
    } else {
        PLAYER_MAX_CLIMB
    };
    let feet = player.elevation + player.height;
    let vs = player.vertical_speed.unwrap_or(0.0);
    let clearance_feet = if airborne && vs > 0.0 {
        feet + vs - PLAYER_GRAVITY / 2.0
    } else {
        feet
    };
    let fits = |point: GridPoint| -> bool {
        if airborne {
            fits_in_air(ground, point, Some(from), clearance_feet)
        } else {
            may_step_onto(ground, from, point, feet)
                && (fits_within(ground, point, Some(from), player.elevation, reach)
                    || can_leave_edge(ground, point, Some(from), feet))
        }
    };
    let mut next: Option<GridPoint> = None;
    for m in &moves {
        if (m.x != from.x || m.y != from.y) && fits(*m) {
            next = Some(*m);
            break;
        }
    }
    if next.is_none() {
        let nudges = if velocity.x.abs() >= velocity.y.abs() {
            vec![
                GridPoint {
                    x: 0.0,
                    y: PLAYER_CORNER_NUDGE,
                },
                GridPoint {
                    x: 0.0,
                    y: -PLAYER_CORNER_NUDGE,
                },
            ]
        } else {
            vec![
                GridPoint {
                    x: PLAYER_CORNER_NUDGE,
                    y: 0.0,
                },
                GridPoint {
                    x: -PLAYER_CORNER_NUDGE,
                    y: 0.0,
                },
            ]
        };
        for nudge in &nudges {
            let aside = GridPoint {
                x: from.x + nudge.x,
                y: from.y + nudge.y,
            };
            let around = GridPoint {
                x: moves[0].x + nudge.x,
                y: moves[0].y + nudge.y,
            };
            if fits(aside) && fits(around) {
                next = Some(around);
                break;
            }
        }
    }
    let next = match next {
        Some(n) => n,
        None => {
            player.velocity = GridPoint { x: 0.0, y: 0.0 };
            if diagnose {
                return block_reason_at(
                    ground,
                    moves[0],
                    Some(from),
                    player.elevation,
                    clearance_feet,
                    airborne,
                    reach,
                );
            }
            return None;
        }
    };
    player.velocity = GridPoint {
        x: next.x - from.x,
        y: next.y - from.y,
    };
    if !airborne
        && !shove
        && let Some(descent) = start_stairs_descent(ground, from, next, feet)
    {
        player.climb = Some(descent);
        player.vertical_speed = None;
        player.velocity = GridPoint { x: 0.0, y: 0.0 };
        return None;
    }
    let surface = support_at(ground, next);
    let elevation = surface
        .map(|s| s.elevation as f64)
        .unwrap_or(player.elevation);
    let rise = elevation - feet;
    // without a surface there is nothing to climb onto: a swimmer's feet are under its own
    // water top, which is not a step up
    if !airborne && surface.is_some() && rise > PLAYER_STEP_HEIGHT {
        let stairs = surface.is_some_and(|column| column.surface == TerrainMaterial::Stairs);
        let length = (next.x - from.x).hypot(next.y - from.y);
        let direction = if length > 0.0 {
            GridPoint {
                x: (next.x - from.x) / length,
                y: (next.y - from.y) / length,
            }
        } else {
            GridPoint { x: 0.0, y: 0.0 }
        };
        let column = get_player_column(next);
        let direction = match flight_direction(ground, column).filter(|_| stairs) {
            Some(up) => GridPoint {
                x: f64::from(up.x),
                y: f64::from(up.y),
            },
            None => direction,
        };
        let further = if stairs {
            GridPoint {
                x: f64::from(column.x) + direction.x * (PLAYER_STAIRS_REACH - 0.5),
                y: f64::from(column.y) + direction.y * (PLAYER_STAIRS_REACH - 0.5),
            }
        } else {
            GridPoint {
                x: next.x + direction.x * PLAYER_CLIMB_REACH,
                y: next.y + direction.y * PLAYER_CLIMB_REACH,
            }
        };
        let on_top = get_player_column(further);
        let fits_top = on_top.x == column.x
            && on_top.y == column.y
            && fits_within(ground, further, None, elevation, reach);
        let to = if fits_top {
            further
        } else if stairs {
            farthest_clear_point(ground, next, further, elevation, reach)
        } else {
            next
        };
        let ticks = if stairs {
            PLAYER_STAIRS_TICKS
        } else {
            PLAYER_CLIMB_TICKS
        };
        player.climb = Some(PlayerClimb {
            from,
            to,
            direction,
            feet,
            rise,
            ticks: (ticks as f64 * rise).round() as i32,
            tick: 0,
            stairs,
        });
        player.vertical_speed = None;
        player.velocity = GridPoint { x: 0.0, y: 0.0 };
        return None;
    }
    player.x = next.x;
    player.y = next.y;
    player.elevation = elevation;
    player.height = if airborne || swimming {
        feet - elevation
    } else {
        (feet - elevation).max(0.0)
    };
    if !airborne && !swimming && player.height == 0.0 {
        player.vertical_speed = None;
    }
    None
}

/// The descent the player starts when it walks off the top of a flight of stairs, or `None`
/// where it is not on one, is not walking down it, or has not yet crossed
/// `PLAYER_STAIRS_DESCENT_SHARE` of its top face. The flight is read with `stairs_direction`,
/// the same rule that picks its artwork, so the player only ever walks down drawn steps.
fn start_stairs_descent<G: PlayerGround>(
    ground: &G,
    from: GridPoint,
    next: GridPoint,
    feet: f64,
) -> Option<PlayerClimb> {
    let column = support_at(ground, from)?;
    if column.surface != TerrainMaterial::Stairs {
        return None;
    }
    let coord = get_player_column(from);
    let up = stairs_direction(coord, column.elevation, |at| {
        ground
            .column_at(at.x, at.y)
            .map(|found| (found.surface, found.elevation))
    })?;
    let down = GridPoint {
        x: -f64::from(up.x),
        y: -f64::from(up.y),
    };
    let step = GridPoint {
        x: next.x - from.x,
        y: next.y - from.y,
    };
    if step.x * down.x + step.y * down.y <= 0.0 {
        return None;
    }
    let crossed =
        (next.x - f64::from(coord.x)) * down.x + (next.y - f64::from(coord.y)) * down.y + 0.5;
    if crossed < PLAYER_STAIRS_DESCENT_SHARE {
        return None;
    }
    let below = ground.column_at(coord.x - up.x, coord.y - up.y)?;
    if !below.walkable || below.surface == TerrainMaterial::Water {
        return None;
    }
    let landing = f64::from(below.elevation);
    let rise = landing - feet;
    if rise > -PLAYER_STEP_HEIGHT || rise < -PLAYER_MAX_CLIMB {
        return None;
    }
    let to = GridPoint {
        x: f64::from(coord.x - up.x),
        y: f64::from(coord.y - up.y),
    };
    if !fits_at(ground, to, landing) {
        return None;
    }
    let start = if get_player_column(next) == coord {
        next
    } else {
        from
    };
    Some(PlayerClimb {
        from: start,
        to,
        direction: down,
        feet,
        rise,
        ticks: (PLAYER_STAIRS_TICKS as f64 * rise.abs()).round() as i32,
        tick: 0,
        stairs: true,
    })
}

fn step_air<G: PlayerGround>(
    player: &mut PlayerState,
    ground: &G,
    flying: bool,
    water: Option<f64>,
) -> Option<&'static str> {
    let support = support_at(
        ground,
        GridPoint {
            x: player.x,
            y: player.y,
        },
    );
    let top = support.map(|s| s.elevation as f64);
    let feet = player.elevation + player.height;
    if player.vertical_speed.is_none() {
        if player.height > 0.0 || top.is_none() {
            player.vertical_speed = Some(0.0);
        } else {
            return None;
        }
    }
    let vs = player.vertical_speed.unwrap_or(0.0);
    let speed = if vs > 0.0 && !player.jump_held {
        vs.min(PLAYER_JUMP_CUT_SPEED)
    } else {
        vs
    };
    let roof = player.last_safe.elevation + PLAYER_FLY_MAX_HEIGHT;
    let next_speed = if flying {
        (PLAYER_FLY_SPEED)
            .min(speed + PLAYER_FLY_THRUST)
            .min((roof - feet).max(-PLAYER_FLY_SPEED))
    } else {
        (speed - PLAYER_GRAVITY).max(-PLAYER_MAX_FALL_SPEED)
    };
    let next_feet = if flying {
        feet + next_speed
    } else {
        feet + (speed + next_speed) / 2.0
    };
    let ceiling = if (if flying { next_speed } else { speed }) > 0.0 {
        ceiling_at(
            ground,
            GridPoint {
                x: player.x,
                y: player.y,
            },
            feet + PLAYER_BODY_HEIGHT,
            next_feet + PLAYER_BODY_HEIGHT,
        )
    } else {
        None
    };
    if let Some(ceil) = ceiling {
        player.height = ceil - PLAYER_BODY_HEIGHT - player.elevation;
        player.vertical_speed = Some(0.0);
        return Some("ceiling");
    }
    // the water's top is reached, not landed on: the feet stop there for this tick and the
    // speed they fell at goes on as the plunge under the surface
    if let Some(level) = water
        && next_speed <= 0.0
        && next_feet < level
    {
        player.height = level - player.elevation;
        player.vertical_speed = Some(next_speed);
        return Some("water");
    }
    let landed = top
        .map(|t| speed <= 0.0 && feet >= t - LANDING && next_feet <= t + LANDING)
        .unwrap_or(false);
    player.height = if landed {
        0.0
    } else {
        next_feet - player.elevation
    };
    player.vertical_speed = if landed { None } else { Some(next_speed) };
    if landed {
        if let Some(s) = support {
            player.feedback.impact = (-(speed + next_speed) / 2.0).max(0.0);
            player.elevation = s.elevation as f64;
            player.last_safe = PlayerPosition {
                x: player.x,
                y: player.y,
                elevation: player.elevation,
                height: 0.0,
                velocity: GridPoint { x: 0.0, y: 0.0 },
                vertical_speed: None,
            };
            return Some("landed");
        }
    } else if water.is_none() && next_feet < player.last_safe.elevation - PLAYER_RESCUE_DROP {
        let safe = player.last_safe;
        player.x = safe.x;
        player.y = safe.y;
        player.elevation = safe.elevation;
        player.height = 0.0;
        player.vertical_speed = None;
        return Some("rescued");
    }
    None
}

fn ceiling_at<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    head: f64,
    next_head: f64,
) -> Option<f64> {
    let cells = get_player_cells(point);
    let mut ceiling: Option<f64> = None;
    for x in cells.min_x..=cells.max_x {
        for y in cells.min_y..=cells.max_y {
            let column = ground.column_at(x, y);
            for occ in ground.occupancy_at(x, y) {
                let side = occ.blocked_side(x as f64, y as f64);
                if side <= 0.0 {
                    continue;
                }
                if (point.x - x as f64).abs() >= PLAYER_RADIUS + side / 2.0 {
                    continue;
                }
                if (point.y - y as f64).abs() >= PLAYER_RADIUS + side / 2.0 {
                    continue;
                }
                let base = occ
                    .elevation
                    .unwrap_or(column.map(|c| c.elevation as f64).unwrap_or(0.0));
                if head <= base + LANDING
                    && next_head > base + LANDING
                    && (ceiling.is_none() || base < ceiling.unwrap())
                {
                    ceiling = Some(base);
                }
            }
        }
    }
    ceiling
}

/// The top of the water the player is over, or `None` where the column under it is not water.
fn water_over<G: PlayerGround>(ground: &G, point: GridPoint) -> Option<f64> {
    let column = get_player_column(point);
    let found = ground.column_at(column.x, column.y)?;
    is_swimmable(found.surface).then(|| f64::from(found.elevation))
}

/// One tick of floating in water topped at `level`: the body is carried by the buoyancy spring,
/// the swim is started if it has just gone in, and the feet are placed at the depth it reached.
fn step_swim(player: &mut PlayerState, level: f64) {
    let feet = player.elevation + player.height;
    let mut swim = match player.swim {
        Some(swim) => PlayerSwim { level, ..swim },
        None => {
            let sink = player.vertical_speed.map(|v| -v).unwrap_or(0.0);
            if splashes(sink) {
                player.feedback.splashes += 1;
                player.feedback.splash_impact = sink;
            }
            PlayerSwim::entering(level, (level - feet).max(0.0), sink)
        }
    };
    let (sink, depth) = next_float(swim.sink, swim.depth);
    swim.sink = sink;
    swim.depth = depth;
    swim.ticks = swim.ticks.saturating_add(1);
    // the swell is drawn on top of the depth, not pushed into it: the buoyancy spring keeps
    // working from where the body really is
    let moving = player.velocity.x != 0.0 || player.velocity.y != 0.0;
    let bob = float_bob(swim.ticks, float_settle(depth), moving);
    player.elevation = level;
    player.height = -(depth + bob);
    player.vertical_speed = None;
    player.swim = Some(swim);
}

fn is_flying(player: &PlayerState) -> bool {
    let vs = match player.vertical_speed {
        Some(v) => v,
        None => return false,
    };
    if !player.jetpack || !player.jump_held {
        return false;
    }
    player.motion == PlayerMotionType::Flying || vs <= PLAYER_APEX_SPEED + LANDING
}

pub fn step_player<G: PlayerGround>(player: &mut PlayerState, ground: &mut G, ticks: u32) {
    for tick in 0..ticks {
        if player
            .climb
            .as_ref()
            .map(|c| c.tick >= c.ticks)
            .unwrap_or(false)
        {
            player.climb = None;
        }
        let climb = player.climb.clone();
        let resting = player.walk.x == 0.0
            && player.walk.y == 0.0
            && player.velocity.x == 0.0
            && player.velocity.y == 0.0
            && player.vertical_speed.is_none()
            && player.jump_buffer_ticks == 0
            && climb.is_none()
            && player.swim.is_none();
        if resting && tick > 0 {
            return;
        }
        let (x, y, elevation, height) = (player.x, player.y, player.elevation, player.height);
        player.previous = PlayerPosition {
            x,
            y,
            elevation,
            height,
            velocity: player.velocity,
            vertical_speed: player.vertical_speed,
        };
        if player.feedback.landing_ticks > 0 {
            player.feedback.landing_ticks -= 1;
        }

        if let Some(mut climb) = player.climb.clone() {
            if player.wants_jump {
                reject_jump(player, PlayerBlockReason::Climbing);
            }
            player.wants_jump = false;
            player.jump_buffer_ticks = 0;
            player.coyote_ticks = 0;
            player.velocity = GridPoint { x: 0.0, y: 0.0 };
            climb.tick += 1;
            let progress = climb.tick as f64 / climb.ticks as f64;
            let (rise, advance) = get_climb_shares(climb.stairs, progress);
            let mut point = GridPoint {
                x: climb.from.x + (climb.to.x - climb.from.x) * advance,
                y: climb.from.y + (climb.to.y - climb.from.y) * advance,
            };
            if climb.stairs {
                let axis = climb.direction;
                let lateral =
                    axis.x * (climb.from.y - climb.to.y) - axis.y * (climb.from.x - climb.to.x);
                let slide = lateral * ((1.0 - get_stairs_align(progress)) - (1.0 - advance));
                point.x += -axis.y * slide;
                point.y += axis.x * slide;
            }
            let feet = climb.feet + climb.rise * rise;
            player.x = point.x;
            player.y = point.y;
            if climb.stairs {
                player.elevation = feet;
                player.height = get_stairs_hop(progress);
            } else {
                player.elevation = elevation_at(ground, point);
                let h = feet - player.elevation;
                player.height = if h > LANDING { h } else { 0.0 };
            }
            player.climb = Some(climb);
            update_motion(player, false);
            continue;
        }

        let grounded_at_start = player.vertical_speed.is_none()
            && player.height == 0.0
            && support_at(
                ground,
                GridPoint {
                    x: player.x,
                    y: player.y,
                },
            )
            .is_some();
        if grounded_at_start {
            player.coyote_ticks = PLAYER_COYOTE_TICKS;
        }
        // the jump key does nothing in the water: there is nothing to push off
        if player.swim.is_some() && player.jump_buffer_ticks > 0 {
            player.wants_jump = false;
            player.jump_buffer_ticks = 0;
            player.coyote_ticks = 0;
        }
        let took_off =
            player.jump_buffer_ticks > 0 && (grounded_at_start || player.coyote_ticks > 0);
        let airborne = player.vertical_speed.is_some();
        if !took_off && airborne && player.jetpack {
            player.wants_jump = false;
            player.jump_buffer_ticks = 0;
        }
        let air_jumped =
            !took_off && player.jump_buffer_ticks > 0 && airborne && player.air_jumps > 0;
        if took_off || air_jumped {
            take_off(player, air_jumped);
        }
        let flying = is_flying(player);
        accelerate_player(player);
        let shove = flight_shove(player, ground);
        if let Some(velocity) = shove {
            player.velocity = velocity;
        }
        let block_reason = step_once(player, ground, false, shove.is_some());
        let here = GridPoint {
            x: player.x,
            y: player.y,
        };
        let water = water_over(ground, here);
        let swimming = player.swim.is_some()
            && water.is_some_and(|level| player.elevation + player.height <= level + LANDING);
        let air_result = match (player.climb.is_some(), swimming) {
            (true, _) => None,
            (false, true) => {
                step_swim(player, water.unwrap());
                None
            }
            (false, false) => {
                player.swim = None;
                let result = step_air(player, ground, flying, water);
                if result == Some("water") {
                    step_swim(player, water.unwrap());
                    Some("splashed")
                } else {
                    result
                }
            }
        };
        if player.climb.is_some() {
            player.swim = None;
            player.wants_jump = false;
            player.jump_buffer_ticks = 0;
            player.coyote_ticks = 0;
        } else if air_result == Some("rescued") {
            cancel_player_jump(player);
            player.velocity = GridPoint { x: 0.0, y: 0.0 };
        } else if air_result == Some("landed") && player.jump_buffer_ticks > 0 {
            land(player);
            take_off(player, false);
        } else {
            if air_result == Some("landed") {
                land(player);
            } else if air_result == Some("ceiling") && (took_off || air_jumped) {
                player.feedback.jumps -= 1;
                player.feedback.leap = false;
                reject_jump(player, PlayerBlockReason::Ceiling);
            }
            if player.jump_buffer_ticks > 0 {
                player.jump_buffer_ticks -= 1;
                player.wants_jump = player.jump_buffer_ticks > 0;
                if !player.wants_jump {
                    reject_jump(player, PlayerBlockReason::Airborne);
                }
            }
            if player.vertical_speed.is_none()
                && support_at(
                    ground,
                    GridPoint {
                        x: player.x,
                        y: player.y,
                    },
                )
                .is_some()
            {
                player.coyote_ticks = PLAYER_COYOTE_TICKS;
            } else if !grounded_at_start && player.coyote_ticks > 0 {
                player.coyote_ticks -= 1;
            }
        }
        if player.vertical_speed.is_none()
            && (player.swim.is_some()
                || support_at(
                    ground,
                    GridPoint {
                        x: player.x,
                        y: player.y,
                    },
                )
                .is_some())
        {
            player.last_safe = PlayerPosition {
                x: player.x,
                y: player.y,
                elevation: player.elevation,
                height: 0.0,
                velocity: GridPoint { x: 0.0, y: 0.0 },
                vertical_speed: None,
            };
        }
        player.feedback.air_ticks = if player.vertical_speed.is_none() {
            0
        } else {
            player.feedback.air_ticks + 1
        };
        if player.vertical_speed.is_none() {
            player.air_jumps = PLAYER_AIR_JUMPS;
        }
        update_motion(player, flying);
        let _ = block_reason;
    }
}

pub fn get_player_jump_phase(player: &PlayerState) -> PlayerJumpPhase {
    if player.swim.is_some() {
        return PlayerJumpPhase::Ground;
    }
    if player.climb.is_some() {
        return PlayerJumpPhase::Ground;
    }
    match player.vertical_speed {
        None => {
            if player.feedback.landing_ticks > 0 {
                PlayerJumpPhase::Landing
            } else {
                PlayerJumpPhase::Ground
            }
        }
        Some(vs) => {
            if player.motion == PlayerMotionType::Flying {
                return PlayerJumpPhase::Apex;
            }
            if player.feedback.leap && vs > 0.0 && player.feedback.air_ticks <= PLAYER_TAKEOFF_TICKS
            {
                return PlayerJumpPhase::Takeoff;
            }
            if player.feedback.leap && vs.abs() <= PLAYER_APEX_SPEED + LANDING {
                return PlayerJumpPhase::Apex;
            }
            if vs > 0.0 {
                PlayerJumpPhase::Rise
            } else {
                PlayerJumpPhase::Fall
            }
        }
    }
}

/// How far into a climb over a ledge the player is, for the climbing poses. A flight of stairs
/// is walked instead of pulled up, so it reports nothing and the view keeps walking.
pub fn get_player_climb_progress(player: &PlayerState, alpha: f64) -> Option<f64> {
    let climb = player.climb.as_ref().filter(|climb| !climb.stairs)?;
    let t = if alpha.is_finite() {
        alpha.clamp(0.0, 1.0)
    } else {
        1.0
    };
    let progress = ((climb.tick as f64 - 1.0 + t) / climb.ticks as f64).clamp(0.0, 1.0);
    Some(progress)
}

pub fn get_player_render_position(player: &PlayerState, alpha: f64) -> PlayerRenderPosition {
    let t = if alpha.is_finite() {
        alpha.clamp(0.0, 1.0)
    } else {
        1.0
    };
    let previous = &player.previous;
    let hermite = |from: f64, to: f64, tangent_from: f64, tangent_to: f64| {
        let t2 = t * t;
        let t3 = t2 * t;
        let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
        let h10 = t3 - 2.0 * t2 + t;
        let h01 = -2.0 * t3 + 3.0 * t2;
        let h11 = t3 - t2;
        h00 * from + h10 * tangent_from + h01 * to + h11 * tangent_to
    };
    let tangent_x_from = previous.velocity.x;
    let tangent_y_from = previous.velocity.y;
    let tangent_x_to = player.velocity.x;
    let tangent_y_to = player.velocity.y;
    let tangent_height_from = previous.vertical_speed.unwrap_or(0.0);
    let tangent_height_to = player.vertical_speed.unwrap_or(0.0);
    PlayerRenderPosition {
        x: hermite(previous.x, player.x, tangent_x_from, tangent_x_to),
        y: hermite(previous.y, player.y, tangent_y_from, tangent_y_to),
        elevation: hermite(previous.elevation, player.elevation, 0.0, 0.0),
        height: hermite(
            previous.height,
            player.height,
            tangent_height_from,
            tangent_height_to,
        ),
    }
}

pub fn get_player_cells(point: GridPoint) -> crate::grid::WorldRect {
    let min = get_player_column(GridPoint {
        x: point.x - PLAYER_RADIUS,
        y: point.y - PLAYER_RADIUS,
    });
    let max = get_player_column(GridPoint {
        x: point.x + PLAYER_RADIUS,
        y: point.y + PLAYER_RADIUS,
    });
    WorldRect {
        min_x: min.x,
        min_y: min.y,
        max_x: max.x,
        max_y: max.y,
    }
}

pub fn can_stand_on_public<G: PlayerGround>(
    ground: &G,
    x: i32,
    y: i32,
    from_elevation: f64,
) -> bool {
    can_stand_on(ground, x, y, from_elevation)
}

pub fn fits_player_at<G: PlayerGround>(ground: &G, point: GridPoint) -> bool {
    fits_at(ground, point, elevation_at(ground, point))
}

#[cfg(test)]
#[path = "physics.test.rs"]
mod tests;
