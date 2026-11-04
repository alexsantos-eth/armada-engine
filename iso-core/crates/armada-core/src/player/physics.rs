//! Player locomotion physics, independent of rendering and of the world's storage.
//!
//! Mirrors `engine/player/player.ts` in the TypeScript game. The machine of motion states
//! already lives in `motion`; this module holds the deterministic step, the constants and
//! the helpers the view and the simulation use.

use crate::time::TICKS_PER_SECOND;
use crate::grid::{ChunkCoord, WorldCoord, WorldRect};
use crate::player::motion::{PlayerMotionEvent, PlayerMotionType, transition_player_motion};
use crate::projection::GridPoint;
use crate::terrain::{TerrainColumn, TerrainMaterial};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
pub const PLAYER_GRAVITY: f64 = (8.0 * PLAYER_JUMP_HEIGHT) / ((PLAYER_JUMP_TICKS as f64) * (PLAYER_JUMP_TICKS as f64));
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
/// The eight facings, counter-clockwise on screen from east.
pub const PLAYER_FACINGS: [&str; 8] = [
    "east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east",
];
/// Columns around the centre a new player's spawn is searched in.
pub const PLAYER_SPAWN_RADIUS: i32 = 32;

const LANDING: f64 = 1e-9;


// ---------------------------------------------------------------------------
// Helper math
// ---------------------------------------------------------------------------

/// Height of the feet above flat ground `tick` ticks into a jump.
pub fn get_jump_height(tick: f64) -> f64 {
    let t = tick.clamp(0.0, PLAYER_JUMP_TICKS as f64);
    (4.0 * PLAYER_JUMP_HEIGHT * t * (PLAYER_JUMP_TICKS as f64 - t)) / (PLAYER_JUMP_TICKS as f64).powi(2)
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    /// the obstacle stands on. Without it, the whole block blocks.
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

/// Top inset function type.
pub type PlayerTopInset = fn(TerrainMaterial) -> f64;

/// No inset: every top at its column's elevation.
pub fn no_top_inset(_: TerrainMaterial) -> f64 {
    0.0
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
}

/// Player state.
#[derive(Clone, Debug)]
pub struct PlayerState {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub inset: f64,
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
    pub previous: PlayerPosition,
    pub feedback: PlayerFeedback,
    pub walk: GridPoint,
    pub motion: PlayerMotionType,
    pub inset_prev: f64,
    pub height_prev: f64,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct PlayerPosition {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub inset: f64,
    pub height: f64,
}

/// Render position for interpolation.
#[derive(Clone, Copy, Debug)]
pub struct PlayerRenderPosition {
    pub x: f64,
    pub y: f64,
    pub elevation: f64,
    pub inset: f64,
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

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

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
    ground
        .occupancy_at(x, y)
        .iter()
        .all(|occ| {
            let side = occ.blocked_side(x as f64, y as f64);
            if side <= 0.0 {
                return true;
            }
            // elevated obstacle leaves enough room
            occ.elevation
                .map(|e| e >= column.elevation as f64 + PLAYER_BODY_HEIGHT - LANDING)
                .unwrap_or(false)
        })
}

fn is_steppable<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {
    let column = match ground.column_at(x, y) {
        Some(c) => c,
        None => return false,
    };
    if column.surface == TerrainMaterial::Water {
        return false;
    }
    (column.elevation as f64 - from_elevation).abs() <= PLAYER_MAX_CLIMB
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

fn fits_in_air<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    feet: f64,
    top_inset: PlayerTopInset,
) -> bool {
    block_reason_at(ground, point, 0.0, feet, true, top_inset).is_none()
}

fn can_leave_edge<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    feet: f64,
    top_inset: PlayerTopInset,
) -> bool {
    let cells = get_player_cells(point);
    let mut missing = false;
    for x in cells.min_x..=cells.max_x {
        for y in cells.min_y..=cells.max_y {
            let column = ground.column_at(x, y);
            if column.map(|c| c.surface == TerrainMaterial::Water).unwrap_or(false) {
                return false;
            }
            if column.is_none() {
                missing = true;
            }
        }
    }
    missing && fits_in_air(ground, point, feet, top_inset)
}

fn block_reason_at<G: PlayerGround>(
    ground: &G,
    point: GridPoint,
    elevation: f64,
    feet: f64,
    airborne: bool,
    top_inset: PlayerTopInset,
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
                    && feet < col.elevation as f64 - top_inset(col.surface) - LANDING
                {
                    return Some(PlayerBlockReason::Terrain);
                }
            } else if !is_steppable(ground, x, y, elevation) {
                return Some(PlayerBlockReason::Terrain);
            }
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
                if !airborne {
                    let col = column.unwrap();
                    if !clears_standing_body(&occ, &col) {
                        return Some(PlayerBlockReason::Obstacle);
                    }
                    continue;
                }
                let base = occ.elevation.unwrap_or(column.map(|c| c.elevation as f64).unwrap_or(0.0));
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
    block_reason_at(ground, point, from_elevation, 0.0, false, no_top_inset).is_none()
}

fn elevation_at<G: PlayerGround>(ground: &G, point: GridPoint) -> f64 {
    let (x, y) = (get_player_column(point).x, get_player_column(point).y);
    ground.column_at(x, y).map(|c| c.elevation as f64).unwrap_or(0.0)
}

fn inset_at<G: PlayerGround>(ground: &G, point: GridPoint, top_inset: PlayerTopInset) -> f64 {
    let (x, y) = (get_player_column(point).x, get_player_column(point).y);
    ground
        .column_at(x, y)
        .map(|c| top_inset(c.surface))
        .unwrap_or(0.0)
}

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

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
                if before(&column, walkable.as_ref()) && can_stand_on(ground, column.coord.x, column.coord.y, column.elevation as f64) {
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
            inset: 0.0,
            height: 0.0,
        },
        None => PlayerPosition {
            x: centre.x,
            y: centre.y,
            elevation: 0.0,
            inset: 0.0,
            height: 0.0,
        },
    }
}

pub fn create_player<G: PlayerGround>(ground: &G, at: GridPoint) -> PlayerState {
    let position = PlayerPosition {
        x: at.x,
        y: at.y,
        elevation: elevation_at(ground, at),
        inset: 0.0,
        height: 0.0,
    };
    PlayerState {
        x: at.x,
        y: at.y,
        elevation: elevation_at(ground, at),
        inset: 0.0,
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
        previous: position,
        feedback: PlayerFeedback::default(),
        walk: GridPoint { x: 0.0, y: 0.0 },
        motion: PlayerMotionType::Idle,
        inset_prev: 0.0,
        height_prev: 0.0,
    }
}

// ---------------------------------------------------------------------------
// Walk direction and facing
// ---------------------------------------------------------------------------

pub fn get_walk_direction(directions: &ScreenDirections) -> GridPoint {
    let across = if directions.right { 1.0 } else { 0.0 } - if directions.left { 1.0 } else { 0.0 };
    let up = if directions.up { 1.0 } else { 0.0 } - if directions.down { 1.0 } else { 0.0 };
    let x: f64 = across + up;
    let y: f64 = up - across;
    let length = x.hypot(y);
    if length == 0.0 {
        GridPoint { x: 0.0, y: 0.0 }
    } else {
        GridPoint { x: x / length, y: y / length }
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
    let octant = (up.atan2(across) / (std::f64::consts::PI / 4.0)).round() as i32;
    Some(((octant + PLAYER_FACINGS.len() as i32) as usize) % PLAYER_FACINGS.len())
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

// ---------------------------------------------------------------------------
// Internal physics helpers
// ---------------------------------------------------------------------------

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
    (player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y).sqrt() > PLAYER_STEP + 1e-9
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
    if player.climb.is_some() {
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
    top_inset: PlayerTopInset,
    diagnose: bool,
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
    let feet = player.elevation - player.inset + player.height;
    let vs = player.vertical_speed.unwrap_or(0.0);
    let clearance_feet = if airborne && vs > 0.0 {
        feet + vs - PLAYER_GRAVITY / 2.0
    } else {
        feet
    };
    let fits = |point: GridPoint| -> bool {
        if airborne {
            fits_in_air(ground, point, clearance_feet, top_inset)
        } else {
            fits_at(ground, point, player.elevation) || can_leave_edge(ground, point, feet, top_inset)
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
                GridPoint { x: 0.0, y: PLAYER_CORNER_NUDGE },
                GridPoint { x: 0.0, y: -PLAYER_CORNER_NUDGE },
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
                return block_reason_at(ground, moves[0], player.elevation, clearance_feet, airborne, top_inset);
            }
            return None;
        }
    };
    player.velocity = GridPoint {
        x: next.x - from.x,
        y: next.y - from.y,
    };
    let surface = support_at(ground, next);
    let elevation = surface.map(|s| s.elevation as f64).unwrap_or(player.elevation);
    let inset = surface.map(|s| top_inset(s.surface)).unwrap_or(player.inset);
    let rise = elevation - inset - feet;
    if !airborne && rise > PLAYER_STEP_HEIGHT {
        // start climb
        let length = (next.x - from.x).hypot(next.y - from.y);
        let direction = if length > 0.0 {
            GridPoint {
                x: (next.x - from.x) / length,
                y: (next.y - from.y) / length,
            }
        } else {
            GridPoint { x: 0.0, y: 0.0 }
        };
        let further = GridPoint {
            x: next.x + direction.x * PLAYER_CLIMB_REACH,
            y: next.y + direction.y * PLAYER_CLIMB_REACH,
        };
        let column = get_player_column(next);
        let on_top = get_player_column(further);
        let fits_top = on_top.x == column.x
            && on_top.y == column.y
            && fits_at(ground, further, elevation);
        let to = if fits_top { further } else { next };
        player.climb = Some(PlayerClimb {
            from,
            to,
            direction,
            feet,
            rise,
            ticks: (PLAYER_CLIMB_TICKS as f64 * rise).round() as i32,
            tick: 0,
        });
        player.vertical_speed = None;
        player.velocity = GridPoint { x: 0.0, y: 0.0 };
        return None;
    }
    player.x = next.x;
    player.y = next.y;
    player.elevation = elevation;
    player.inset = inset;
    player.height = if airborne {
        feet - (elevation - inset)
    } else {
        (feet - (elevation - inset)).max(0.0)
    };
    if !airborne && player.height == 0.0 {
        player.vertical_speed = None;
    }
    None
}

fn step_air<G: PlayerGround>(
    player: &mut PlayerState,
    ground: &G,
    top_inset: PlayerTopInset,
    flying: bool,
) -> Option<&'static str> {
    let support = support_at(ground, GridPoint {
        x: player.x,
        y: player.y,
    });
    let top = support.map(|s| s.elevation as f64 - top_inset(s.surface));
    let feet = player.elevation - player.inset + player.height;
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
    let roof = player.last_safe.elevation - player.last_safe.inset + PLAYER_FLY_MAX_HEIGHT;
    let next_speed = if flying {
        (PLAYER_FLY_SPEED).min(speed + PLAYER_FLY_THRUST).min((roof - feet).max(-PLAYER_FLY_SPEED))
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
            GridPoint { x: player.x, y: player.y },
            feet + PLAYER_BODY_HEIGHT,
            next_feet + PLAYER_BODY_HEIGHT,
        )
    } else {
        None
    };
    if let Some(ceil) = ceiling {
        player.height = ceil - PLAYER_BODY_HEIGHT - (player.elevation - player.inset);
        player.vertical_speed = Some(0.0);
        return Some("ceiling");
    }
    let landed = top
        .map(|t| speed <= 0.0 && feet >= t - LANDING && next_feet <= t + LANDING)
        .unwrap_or(false);
    player.height = if landed {
        0.0
    } else {
        next_feet - (player.elevation - player.inset)
    };
    player.vertical_speed = if landed { None } else { Some(next_speed) };
    if landed {
        if let Some(s) = support {
            player.feedback.impact = (-(speed + next_speed) / 2.0).max(0.0);
            player.elevation = s.elevation as f64;
            player.inset = top_inset(s.surface);
            player.last_safe = PlayerPosition {
                x: player.x,
                y: player.y,
                elevation: player.elevation,
                inset: player.inset,
                height: 0.0,
            };
            return Some("landed");
        }
    } else if next_feet < player.last_safe.elevation - player.last_safe.inset - PLAYER_RESCUE_DROP {
        let safe = player.last_safe;
        player.x = safe.x;
        player.y = safe.y;
        player.elevation = safe.elevation;
        player.inset = safe.inset;
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
                let base = occ.elevation.unwrap_or(column.map(|c| c.elevation as f64).unwrap_or(0.0));
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

// ---------------------------------------------------------------------------
// stepPlayer
// ---------------------------------------------------------------------------

pub fn step_player<G: PlayerGround>(
    player: &mut PlayerState,
    ground: &mut G,
    ticks: u32,
    top_inset: PlayerTopInset,
) {
    for tick in 0..ticks {
        // A climb is over the tick after its last one.
        if player.climb.as_ref().map(|c| c.tick >= c.ticks).unwrap_or(false) {
            player.climb = None;
        }
        let climb = player.climb.clone();
        // Resting shortcut.
        let resting = player.walk.x == 0.0
            && player.walk.y == 0.0
            && player.velocity.x == 0.0
            && player.velocity.y == 0.0
            && player.vertical_speed.is_none()
            && player.jump_buffer_ticks == 0
            && climb.is_none();
        if resting && tick > 0 {
            return;
        }
        // On the ground its feet are on the top under it.
        if player.vertical_speed.is_none() && climb.is_none() {
            player.inset = inset_at(ground, GridPoint { x: player.x, y: player.y }, top_inset);
        }
        let (x, y, elevation, inset, height) = (player.x, player.y, player.elevation, player.inset, player.height);
        player.previous = PlayerPosition {
            x,
            y,
            elevation,
            inset,
            height,
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
            // step climb
            climb.tick += 1;
            let progress = climb.tick as f64 / climb.ticks as f64;
            let advance = get_climb_advance(progress);
            let point = GridPoint {
                x: climb.from.x + (climb.to.x - climb.from.x) * advance,
                y: climb.from.y + (climb.to.y - climb.from.y) * advance,
            };
            let feet = climb.feet + climb.rise * get_climb_rise(progress);
            player.x = point.x;
            player.y = point.y;
            player.elevation = elevation_at(ground, point);
            player.inset = inset_at(ground, point, top_inset);
            let h = feet - (player.elevation - player.inset);
            player.height = if h > LANDING { h } else { 0.0 };
            player.climb = Some(climb);
            update_motion(player, false);
            continue;
        }

        let grounded_at_start = player.vertical_speed.is_none()
            && player.height == 0.0
            && support_at(ground, GridPoint { x: player.x, y: player.y }).is_some();
        if grounded_at_start {
            player.coyote_ticks = PLAYER_COYOTE_TICKS;
        }
        let took_off = player.jump_buffer_ticks > 0
            && (grounded_at_start || player.coyote_ticks > 0);
        let airborne = player.vertical_speed.is_some();
        if !took_off && airborne && player.jetpack {
            player.wants_jump = false;
            player.jump_buffer_ticks = 0;
        }
        let air_jumped = !took_off
            && player.jump_buffer_ticks > 0
            && airborne
            && player.air_jumps > 0;
        if took_off || air_jumped {
            take_off(player, air_jumped);
        }
        let flying = is_flying(player);
        accelerate_player(player);
        let block_reason = step_once(player, ground, top_inset, false);
        let air_result = if player.climb.is_none() {
            step_air(player, ground, top_inset, flying)
        } else {
            None
        };
        if player.climb.is_some() {
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
                && support_at(ground, GridPoint { x: player.x, y: player.y }).is_some()
            {
                player.coyote_ticks = PLAYER_COYOTE_TICKS;
            } else if !grounded_at_start && player.coyote_ticks > 0 {
                player.coyote_ticks -= 1;
            }
        }
        if player.vertical_speed.is_none()
            && support_at(ground, GridPoint { x: player.x, y: player.y }).is_some()
        {
            player.last_safe = PlayerPosition {
                x: player.x,
                y: player.y,
                elevation: player.elevation,
                inset: player.inset,
                height: 0.0,
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

// ---------------------------------------------------------------------------
// Jump phase
// ---------------------------------------------------------------------------

pub fn get_player_jump_phase(player: &PlayerState) -> PlayerJumpPhase {
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
            if player.feedback.leap && vs > 0.0 && player.feedback.air_ticks <= PLAYER_TAKEOFF_TICKS {
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

// ---------------------------------------------------------------------------
// Climb progress
// ---------------------------------------------------------------------------

pub fn get_player_climb_progress(player: &PlayerState, alpha: f64) -> Option<f64> {
    let climb = player.climb.as_ref()?;
    let t = if alpha.is_finite() {
        alpha.clamp(0.0, 1.0)
    } else {
        1.0
    };
    let progress = ((climb.tick as f64 - 1.0 + t) / climb.ticks as f64).clamp(0.0, 1.0);
    Some(progress)
}

// ---------------------------------------------------------------------------
// Render position
// ---------------------------------------------------------------------------

pub fn get_player_render_position(player: &PlayerState, alpha: f64) -> PlayerRenderPosition {
    let t = if alpha.is_finite() {
        alpha.clamp(0.0, 1.0)
    } else {
        1.0
    };
    let lerp = |from: f64, to: f64| from + (to - from) * t;
    PlayerRenderPosition {
        x: lerp(player.previous.x, player.x),
        y: lerp(player.previous.y, player.y),
        elevation: lerp(player.previous.elevation, player.elevation),
        inset: lerp(player.previous.inset, player.inset),
        height: lerp(player.previous.height, player.height),
    }
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// canStandOn / fitsPlayerAt (public)
// ---------------------------------------------------------------------------

pub fn can_stand_on_public<G: PlayerGround>(ground: &G, x: i32, y: i32, from_elevation: f64) -> bool {
    can_stand_on(ground, x, y, from_elevation)
}

pub fn fits_player_at<G: PlayerGround>(ground: &G, point: GridPoint) -> bool {
    fits_at(ground, point, elevation_at(ground, point))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
#[path = "physics.test.rs"]
mod tests;
