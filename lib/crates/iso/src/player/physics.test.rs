use super::*;
use crate::terrain::{TerrainColumn, TerrainMaterial};

fn ground_from(rows: &[&str]) -> CellGround {
    let mut ground = CellGround::new();
    for (y, row) in rows.iter().enumerate() {
        for (x, ch) in row.chars().enumerate() {
            let elevation = ch.to_digit(10).map(|d| d as i32).unwrap_or(0);
            let walkable = ch != '~';
            let surface = if ch == '~' {
                TerrainMaterial::Water
            } else {
                TerrainMaterial::Grass
            };
            ground.columns.insert(
                WorldCoord {
                    x: x as i32,
                    y: y as i32,
                },
                TerrainColumn {
                    coord: WorldCoord {
                        x: x as i32,
                        y: y as i32,
                    },
                    elevation,
                    surface,
                    walkable,
                },
            );
        }
    }
    ground
}

#[derive(Default)]
struct CellGround {
    columns: std::collections::HashMap<WorldCoord, TerrainColumn>,
    occupancy: std::collections::HashMap<WorldCoord, Vec<PlayerObstacle>>,
}

impl CellGround {
    fn new() -> Self {
        Self::default()
    }
}

impl PlayerGround for CellGround {
    fn column_at(&self, x: i32, y: i32) -> Option<TerrainColumn> {
        self.columns.get(&WorldCoord { x, y }).copied()
    }
    fn occupancy_at(&self, x: i32, y: i32) -> Vec<PlayerObstacle> {
        self.occupancy
            .get(&WorldCoord { x, y })
            .cloned()
            .unwrap_or_default()
    }
}

#[test]
fn get_walk_direction_basic() {
    assert_eq!(
        get_walk_direction(&ScreenDirections {
            up: true,
            ..Default::default()
        }),
        GridPoint {
            x: 1.0 / 2.0_f64.sqrt(),
            y: 1.0 / 2.0_f64.sqrt()
        }
    );
}

#[test]
fn get_walk_direction_diagonal_cancels() {
    assert_eq!(
        get_walk_direction(&ScreenDirections {
            up: true,
            down: true,
            left: true,
            right: true
        }),
        GridPoint { x: 0.0, y: 0.0 }
    );
}

#[test]
fn get_player_facing_undefined_for_zero() {
    assert!(get_player_facing(GridPoint { x: 0.0, y: 0.0 }).is_none());
}

#[test]
fn get_player_facing_east() {
    assert_eq!(get_player_facing(GridPoint { x: 1.0, y: -1.0 }), Some(0));
}

/// The sixteen facings divide the turn evenly, counter-clockwise on screen from east, and a
#[test]
fn get_player_facing_takes_the_nearest_of_sixteen() {
    let index = |x: f64, y: f64| PLAYER_FACINGS[get_player_facing(GridPoint { x, y }).unwrap()];
    assert_eq!(index(1.0, 1.0), "north", "up the screen");
    assert_eq!(index(-1.0, 1.0), "west");
    assert_eq!(index(-1.0, -1.0), "south", "towards the camera");
    assert_eq!(index(1.0, 0.0), "north-east");
    assert_eq!(index(1.0, -0.4142), "east-north-east");
    assert_eq!(index(0.4142, -1.0), "east-south-east");
    assert_eq!(index(-1.0, -0.4142), "south-south-west");
}

#[test]
fn get_player_cells_radius() {
    let cells = get_player_cells(GridPoint { x: 0.0, y: 0.0 });
    assert!(cells.min_x <= 0 && cells.max_x >= 0);
}

#[test]
fn create_player_starts_idle() {
    let ground = ground_from(&["0"]);
    let player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    assert_eq!(player.motion, PlayerMotionType::Idle);
    assert!(player.vertical_speed.is_none());
}

#[test]
fn find_player_spawn_on_walkable() {
    let ground = ground_from(&["0"]);
    let spawn = find_player_spawn(&ground, GridPoint { x: 0.5, y: 0.5 });
    assert_eq!(spawn.x, 0.0);
    assert_eq!(spawn.y, 0.0);
}

#[test]
fn find_player_spawn_empty_ground() {
    let ground = ground_from(&[]);
    let spawn = find_player_spawn(&ground, GridPoint { x: 2.0, y: 3.0 });
    assert_eq!(spawn.x, 2.0);
    assert_eq!(spawn.y, 3.0);
    assert_eq!(spawn.elevation, 0.0);
}

#[test]
fn get_player_jump_phase_ground() {
    let ground = ground_from(&["0"]);
    let player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    assert_eq!(get_player_jump_phase(&player), PlayerJumpPhase::Ground);
}

#[test]
fn get_player_render_position_anchors_to_the_tick_boundaries() {
    let ground = ground_from(&["0"]);
    let mut player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    player.previous = PlayerPosition {
        x: 1.0,
        y: 2.0,
        elevation: 3.0,
        height: 4.0,
        velocity: GridPoint { x: 0.3, y: -0.2 },
        vertical_speed: Some(0.4),
    };
    player.x = 2.0;
    player.y = 3.0;
    player.elevation = 4.0;
    player.height = 5.0;
    player.velocity = GridPoint { x: 0.3, y: -0.2 };
    player.vertical_speed = Some(0.4);
    let start = get_player_render_position(&player, 0.0);
    assert!((start.x - 1.0).abs() < 1e-12);
    assert!((start.y - 2.0).abs() < 1e-12);
    assert!((start.elevation - 3.0).abs() < 1e-12);
    assert!((start.height - 4.0).abs() < 1e-12);
    let end = get_player_render_position(&player, 1.0);
    assert!((end.x - 2.0).abs() < 1e-12);
    assert!((end.y - 3.0).abs() < 1e-12);
    assert!((end.elevation - 4.0).abs() < 1e-12);
    assert!((end.height - 5.0).abs() < 1e-12);
}

#[test]
fn get_player_render_position_eases_in_with_the_initial_velocity() {
    let ground = ground_from(&["0"]);
    let mut player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    player.previous = PlayerPosition {
        x: 0.0,
        y: 0.0,
        elevation: 0.0,
        height: 0.0,
        velocity: GridPoint { x: 0.0, y: 0.0 },
        vertical_speed: None,
    };
    player.x = 0.3;
    player.y = 0.0;
    player.previous.velocity = GridPoint { x: 0.0, y: 0.0 };
    player.velocity = GridPoint { x: 0.3, y: 0.0 };
    let rp = get_player_render_position(&player, 0.5);
    assert!((rp.x - 0.1125).abs() < 1e-12, "x = {}", rp.x);
}

#[test]
fn get_player_render_position_keeps_a_constant_velocity_perfectly_straight() {
    let ground = ground_from(&["0"]);
    let mut player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    player.previous = PlayerPosition {
        x: 1.0,
        y: 5.0,
        elevation: 0.0,
        height: 0.0,
        velocity: GridPoint { x: 0.3, y: -0.1 },
        vertical_speed: None,
    };
    player.x = 1.3;
    player.y = 4.9;
    player.velocity = GridPoint { x: 0.3, y: -0.1 };
    for alpha in [0.0, 0.25, 0.5, 0.75, 1.0] {
        let rp = get_player_render_position(&player, alpha);
        assert!((rp.x - (1.0 + 0.3 * alpha)).abs() < 1e-12);
        assert!((rp.y - (5.0 - 0.1 * alpha)).abs() < 1e-12);
    }
}

#[test]
fn get_player_render_position_reproduces_the_jump_arc_exactly() {
    let mut ground = ground_from(&["0000000000"]);
    let mut player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    jump_player(&mut player);
    step_player(&mut player, &mut ground, 3);
    let v0 = PLAYER_JUMP_SPEED;
    let g = PLAYER_GRAVITY;
    assert!((player.previous.height - (v0 * 2.0 - g * 2.0 * 2.0 / 2.0)).abs() < 1e-9);
    for alpha in [0.0, 0.25, 0.5, 0.75, 1.0] {
        let rp = get_player_render_position(&player, alpha);
        let h = v0 * (2.0 + alpha) - g * (2.0 + alpha) * (2.0 + alpha) / 2.0;
        assert!(
            (rp.height - h).abs() < 1e-9,
            "alpha {alpha}: height {} vs parabola {h}",
            rp.height
        );
    }
}

#[test]
fn get_player_climb_progress_none_when_not_climbing() {
    let ground = ground_from(&["0"]);
    let player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    assert!(get_player_climb_progress(&player, 0.5).is_none());
}

#[test]
fn step_player_moves_on_ground() {
    let mut ground = ground_from(&["00", "00"]);
    let mut player = create_player(&ground, GridPoint { x: 0.5, y: 0.5 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            right: true,
            ..Default::default()
        },
    );
    step_player(&mut player, &mut ground, 1);
    assert!(player.previous.x >= 0.0);
}

/// An obstacle standing on a column, like the entities the client reads out of a chunk.
fn obstacle(side: f64) -> PlayerObstacle {
    PlayerObstacle {
        walkable: false,
        height: Some(1.0),
        elevation: Some(0.0),
        collision_at: Some(side),
    }
}

/// Walks the player straight along `+y` into the middle of `(1, 1)` and reports where it came
fn walk_into_centre(side: f64) -> GridPoint {
    let mut ground = ground_from(&["000", "000", "000"]);
    ground
        .occupancy
        .insert(WorldCoord { x: 1, y: 1 }, vec![obstacle(side)]);
    let mut player = create_player(&ground, GridPoint { x: 1.0, y: 0.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            up: true,
            left: true,
            ..Default::default()
        },
    );
    step_player(&mut player, &mut ground, 20);
    GridPoint {
        x: player.x,
        y: player.y,
    }
}

#[test]
fn a_trunk_sized_collision_lets_the_player_onto_the_cell_it_stands_on() {
    const TRUNK: f64 = 0.15;
    let at = walk_into_centre(TRUNK);

    let stop = PLAYER_RADIUS + TRUNK / 2.0;
    assert!(
        (at.x - 1.0).abs() < 1e-9 && (at.y - (1.0 - stop)).abs() < 0.05,
        "stopped at the trunk, at {at:?}"
    );
    assert_eq!(
        get_player_column(at),
        WorldCoord { x: 1, y: 1 },
        "it walks onto the cell the tree grows on"
    );
}

#[test]
fn a_whole_block_collision_keeps_the_player_off_the_cell() {
    let at = walk_into_centre(1.0);

    assert_eq!(
        get_player_column(at),
        WorldCoord { x: 1, y: 0 },
        "a house fills its cell, so the player never steps onto it"
    );
}

fn stairs_ground() -> CellGround {
    let mut ground = ground_from(&["00111", "00111", "00111"]);
    if let Some(column) = ground.columns.get_mut(&WorldCoord { x: 2, y: 1 }) {
        column.surface = TerrainMaterial::Stairs;
    }
    if let Some(column) = ground.columns.get_mut(&WorldCoord { x: 1, y: 1 }) {
        column.surface = TerrainMaterial::Path;
    }
    ground
}

fn walk_onto_stairs(ground: &mut CellGround) -> PlayerState {
    let mut player = create_player(ground, GridPoint { x: 1.0, y: 1.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            right: true,
            up: true,
            ..Default::default()
        },
    );
    for _ in 0..40 {
        step_player(&mut player, ground, 1);
        if player.climb.is_some() {
            break;
        }
    }
    player
}

/// A ledge is pulled up and stepped over; a flight of stairs is walked, so its rise and its
#[test]
fn a_climb_rises_before_it_advances_and_a_flight_does_both_at_once() {
    for progress in [0.25, 0.5, 0.75] {
        let (rise, advance) = get_climb_shares(true, progress);
        assert!((rise - progress).abs() < 1e-9, "a flight rises evenly");
        assert!((advance - progress).abs() < 1e-9, "and advances with it");
        let (rise, advance) = get_climb_shares(false, progress);
        assert!(rise > advance, "a ledge is pulled up before it is crossed");
    }
    assert_eq!(get_climb_shares(true, 1.0), (1.0, 1.0));
    assert_eq!(get_climb_shares(false, 1.0), (1.0, 1.0));
}

/// Stepping onto a stairs block starts a flight: it crosses the whole block instead of just
#[test]
fn stepping_onto_a_stairs_block_starts_a_flight_across_it() {
    let mut ground = stairs_ground();
    let player = walk_onto_stairs(&mut ground);
    let climb = player.climb.as_ref().expect("the player starts a climb");
    assert!(climb.stairs, "the block it steps onto is a flight");
    assert_eq!(climb.ticks, PLAYER_STAIRS_TICKS);
    let crossed = (climb.to.x - climb.from.x).hypot(climb.to.y - climb.from.y);
    assert!(
        crossed > PLAYER_STAIRS_REACH * 0.9,
        "a flight crosses its block, not just its edge: {crossed}"
    );
    assert_eq!(
        get_player_column(climb.to),
        WorldCoord { x: 2, y: 1 },
        "and it ends on the flight itself, not past it"
    );
}

/// The same step onto a plain block one higher is still the old ledge climb.
#[test]
fn stepping_onto_a_plain_block_keeps_the_ledge_climb() {
    let mut ground = ground_from(&["00111", "00111", "00111"]);
    let player = walk_onto_stairs(&mut ground);
    let climb = player.climb.as_ref().expect("the player starts a climb");
    assert!(!climb.stairs);
    assert_eq!(climb.ticks, PLAYER_CLIMB_TICKS);
}

/// A flight whose far end is closed by an entity in the next block ends as far along
/// the flight as the body fits, not back at its foot.
#[test]
fn a_flight_ends_next_to_the_entity_at_its_far_end() {
    let mut ground = stairs_ground();
    ground.occupancy.insert(
        WorldCoord { x: 3, y: 1 },
        vec![PlayerObstacle {
            walkable: false,
            height: Some(1.0),
            elevation: Some(1.0),
            collision_at: Some(1.0),
        }],
    );
    let mut player = walk_onto_stairs(&mut ground);
    assert!(player.climb.is_some(), "the player starts the flight");
    for _ in 0..PLAYER_STAIRS_TICKS {
        step_player(&mut player, &mut ground, 1);
    }
    let end = player.x;
    step_player(&mut player, &mut ground, 1);
    assert!(player.climb.is_none(), "and the flight is over");
    assert!(
        end > 2.25,
        "the flight ends at the far edge of its top face, not at its start: {end}"
    );
    assert!(
        end <= 2.3 + 1e-6,
        "and the body stops clear of the entity, not inside it: {end}"
    );
}

/// Up a flight the player takes the treads one at a time, hopping onto each one.
#[test]
fn a_flight_hops_its_player_up_its_treads_one_at_a_time() {
    let mut ground = stairs_ground();
    let mut player = walk_onto_stairs(&mut ground);
    let start = player.elevation + player.height;
    let mut feet = Vec::new();
    for _ in 0..PLAYER_STAIRS_TICKS {
        step_player(&mut player, &mut ground, 1);
        assert!(
            player.height >= 0.0 && player.height <= PLAYER_STAIRS_HOP + 1e-9,
            "it hops onto each tread, it does not leap: {}",
            player.height
        );
        feet.push(player.elevation);
    }
    assert!(
        feet.windows(2).all(|pair| pair[1] >= pair[0]),
        "the tread under its feet only ever rises: {feet:?}"
    );
    assert!(
        feet.windows(2)
            .filter(|pair| pair[1] > pair[0] + 1e-9)
            .count()
            >= 2,
        "and it rises in steps, not in one glide: {feet:?}"
    );
    let top = feet.last().copied().expect("the flight takes ticks");
    assert!((top - (start + 1.0)).abs() < 1e-9, "it ends a block higher");
    step_player(&mut player, &mut ground, 1);
    assert!(player.climb.is_none(), "and the flight is over");
    assert!(
        (player.elevation - (start + 1.0)).abs() < 1e-9,
        "standing on the top of the flight"
    );
    assert_eq!(player.height, 0.0);
}

/// A flight is walked, so the view is told to walk it rather than to play the climb poses.
#[test]
fn a_flight_reports_no_climb_pose_and_keeps_the_player_walking() {
    let mut ground = stairs_ground();
    let mut player = walk_onto_stairs(&mut ground);
    assert!(get_player_climb_progress(&player, 0.5).is_none());
    for _ in 0..3 {
        step_player(&mut player, &mut ground, 1);
        assert_eq!(player.motion, PlayerMotionType::Walking);
    }
}

fn walk_down_stairs(ground: &mut CellGround) -> PlayerState {
    let mut player = create_player(ground, GridPoint { x: 4.0, y: 1.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            left: true,
            down: true,
            ..Default::default()
        },
    );
    for _ in 0..80 {
        step_player(&mut player, ground, 1);
        if player.climb.is_some() {
            break;
        }
    }
    player
}

/// Coming from the top, the player walks a little way onto the flight before it starts down it.
#[test]
fn a_flight_is_walked_down_once_its_top_face_is_crossed() {
    let mut ground = stairs_ground();
    let mut player = create_player(&ground, GridPoint { x: 4.0, y: 1.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            left: true,
            down: true,
            ..Default::default()
        },
    );
    let mut entered = None;
    for _ in 0..80 {
        step_player(&mut player, &mut ground, 1);
        if get_player_column(GridPoint {
            x: player.x,
            y: player.y,
        }) == (WorldCoord { x: 2, y: 1 })
            && entered.is_none()
        {
            entered = Some(player.x);
            assert!(
                player.climb.is_none(),
                "the edge of the top face is still walked, not stepped down"
            );
        }
        if player.climb.is_some() {
            break;
        }
    }
    let climb = player.climb.as_ref().expect("the player starts down");
    assert!(climb.stairs, "it walks the steps down, it does not drop");
    let crossed = 2.5 - climb.from.x;
    assert!(
        crossed >= PLAYER_STAIRS_DESCENT_SHARE,
        "it crosses the top face before it starts down: {crossed}"
    );
    assert!(
        crossed < PLAYER_STAIRS_DESCENT_SHARE + 2.0 * PLAYER_STEP,
        "and it starts down as soon as it has: {crossed}"
    );
    assert!(climb.rise < 0.0, "a descent falls a block: {}", climb.rise);
    assert_eq!(
        get_player_column(climb.to),
        WorldCoord { x: 1, y: 1 },
        "and it ends on the road below"
    );
}

/// Down a flight it takes the same treads the other way, hopping down each one.
#[test]
fn a_flight_hops_its_player_down_its_treads_one_at_a_time() {
    let mut ground = stairs_ground();
    let mut player = walk_down_stairs(&mut ground);
    let start = player.elevation + player.height;
    let ticks = player.climb.as_ref().expect("a descent").ticks;
    assert_eq!(ticks, PLAYER_STAIRS_TICKS, "it takes as long as the climb");
    let mut feet = Vec::new();
    for _ in 0..ticks {
        step_player(&mut player, &mut ground, 1);
        assert!(
            player.height >= 0.0 && player.height <= PLAYER_STAIRS_HOP + 1e-9,
            "it hops down each tread, it does not drop: {}",
            player.height
        );
        feet.push(player.elevation);
    }
    assert!(
        feet.windows(2).all(|pair| pair[1] <= pair[0]),
        "the tread under its feet only ever falls: {feet:?}"
    );
    assert!(
        feet.windows(2)
            .filter(|pair| pair[1] < pair[0] - 1e-9)
            .count()
            >= 2,
        "and it falls in steps, not in one glide: {feet:?}"
    );
    let bottom = feet.last().copied().expect("the descent takes ticks");
    assert!(
        (bottom - (start - 1.0)).abs() < 1e-9,
        "it ends a block lower: {bottom} from {start}"
    );
    step_player(&mut player, &mut ground, 1);
    assert!(player.climb.is_none(), "and the descent is over");
    assert_eq!(player.height, 0.0);
}

/// Walking down a flight is walking: the view is never told to play the climb poses.
#[test]
fn walking_down_a_flight_is_reported_as_walking() {
    let mut ground = stairs_ground();
    let mut player = walk_down_stairs(&mut ground);
    assert_eq!(get_player_climb_progress(&player, 0.0), None);
    for _ in 0..PLAYER_STAIRS_TICKS {
        step_player(&mut player, &mut ground, 1);
        assert_eq!(get_player_climb_progress(&player, 0.0), None);
    }
}

/// A plain ledge is still a drop: only a flight of stairs is walked down.
#[test]
fn walking_off_a_plain_ledge_is_still_a_drop() {
    let mut ground = ground_from(&["00111", "00111", "00111"]);
    let player = walk_down_stairs(&mut ground);
    assert!(
        player.climb.is_none(),
        "there are no steps to walk down off a plain block"
    );
}

/// A flight is taken one tread at a time: the feet lift onto a step and rest on it, instead of
#[test]
fn a_flight_rises_one_tread_at_a_time() {
    let steps = f64::from(PLAYER_STAIRS_STEPS);
    assert_eq!(get_stairs_rise(0.0), 0.0);
    assert!((get_stairs_rise(1.0) - 1.0).abs() < 1e-9);
    for tread in 0..=PLAYER_STAIRS_STEPS {
        let at = f64::from(tread) / steps;
        assert!(
            (get_stairs_rise(at) - at).abs() < 1e-9,
            "it stands on tread {tread} when it has walked {at} of the flight"
        );
    }
    let mut last = 0.0;
    for tick in 0..=200 {
        let share = get_stairs_rise(f64::from(tick) / 200.0);
        assert!(
            share >= last - 1e-9,
            "its feet never sink: {share} after {last}"
        );
        last = share;
    }
    let middle = 0.5 / steps;
    assert!(
        get_stairs_rise(middle) > middle + 0.05,
        "halfway through a tread the foot is already most of the way onto it"
    );
}

/// Each tread is hopped onto: the body pops a little and lands back on the step.
#[test]
fn each_tread_is_hopped_onto_and_landed_on() {
    let steps = f64::from(PLAYER_STAIRS_STEPS);
    for tread in 0..=PLAYER_STAIRS_STEPS {
        let at = f64::from(tread) / steps;
        assert!(
            get_stairs_hop(at) < 1e-9,
            "it lands on tread {tread}: {}",
            get_stairs_hop(at)
        );
    }
    for tread in 0..PLAYER_STAIRS_STEPS {
        let middle = (f64::from(tread) + 0.3) / steps;
        let hop = get_stairs_hop(middle);
        assert!(
            hop > 0.0 && hop <= PLAYER_STAIRS_HOP + 1e-9,
            "it is in the air between treads, barely: {hop}"
        );
    }
}

fn flight_with_open_sides() -> CellGround {
    let mut ground = ground_from(&["00000", "00111", "00000"]);
    if let Some(column) = ground.columns.get_mut(&WorldCoord { x: 2, y: 1 }) {
        column.surface = TerrainMaterial::Stairs;
    }
    for coord in [WorldCoord { x: 1, y: 1 }, WorldCoord { x: 3, y: 1 }] {
        if let Some(column) = ground.columns.get_mut(&coord) {
            column.surface = TerrainMaterial::Path;
        }
    }
    ground
}

fn walk_into_flight_side(ground: &mut CellGround) -> PlayerState {
    let mut player = create_player(ground, GridPoint { x: 2.0, y: 0.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            left: true,
            up: true,
            ..Default::default()
        },
    );
    player
}

/// Falling onto a corner with a fat obstacle in the lateral block must not wedge the player:
/// it lands (the rounded cell is clear), the overlap it fell into may not deepen further
/// in any axis, but sliding or stepping out must pass, otherwise it is frozen for good.
#[test]
fn a_player_dropped_at_a_corner_beside_an_obstacle_walks_out_of_it() {
    let mut ground = ground_from(&["00000", "00000", "00000"]);
    ground
        .occupancy
        .insert(WorldCoord { x: 3, y: 0 }, vec![obstacle(1.0)]);
    let mut player = create_player(&ground, GridPoint { x: 2.5, y: 0.5 });
    player.elevation = 0.0;
    player.height = 2.0;
    player.vertical_speed = Some(0.0);
    for _ in 0..60 {
        step_player(&mut player, &mut ground, 1);
        if player.vertical_speed.is_none() && player.height == 0.0 {
            break;
        }
    }
    assert!(
        player.vertical_speed.is_none() && player.height == 0.0,
        "it lands beside the obstacle"
    );
    assert_eq!(player.elevation, 0.0);

    set_player_walk(
        &mut player,
        ScreenDirections {
            left: true,
            ..Default::default()
        },
    );
    for _ in 0..10 {
        step_player(&mut player, &mut ground, 1);
    }
    assert!(
        player.x < 2.0,
        "it walks out of the corner back along the face, not frozen: x = {}",
        player.x
    );
    assert_eq!(player.elevation, 0.0);
}

/// The corner where the foot's low side meets the flight: falling straight into it leaves the
/// body overlapping the flight below its rim, which the side wall forbids the body from
/// entering. The overlap must not be allowed to grow, not to freeze the player for good —
/// every move that slides out or away must pass.
#[test]
fn a_player_dropped_on_a_flights_corner_walks_back_off_it() {
    let mut ground = ground_from(&["00000", "01000", "00000"]);
    ground
        .columns
        .get_mut(&WorldCoord { x: 1, y: 1 })
        .unwrap()
        .surface = TerrainMaterial::Stairs;
    ground
        .columns
        .get_mut(&WorldCoord { x: 1, y: 0 })
        .unwrap()
        .surface = TerrainMaterial::Path;
    let mut player = create_player(&ground, GridPoint { x: 1.5, y: 0.5 });
    player.elevation = 0.0;
    player.height = 2.0;
    player.vertical_speed = Some(0.0);
    for _ in 0..60 {
        step_player(&mut player, &mut ground, 1);
        if player.vertical_speed.is_none() && player.height == 0.0 {
            break;
        }
    }
    assert!(
        player.vertical_speed.is_none() && player.height == 0.0,
        "it lands on the low cell's top"
    );
    assert_eq!(player.elevation, 0.0, "on the foot's level");

    set_player_walk(
        &mut player,
        ScreenDirections {
            left: true,
            ..Default::default()
        },
    );
    for _ in 0..10 {
        step_player(&mut player, &mut ground, 1);
    }
    assert!(
        (player.x - 1.5).abs() < 1e-9,
        "the side is still a wall from the corner: x = {}",
        player.x
    );
    assert!(
        player.climb.is_none(),
        "it does not climb the side of the flight"
    );

    set_player_walk(
        &mut player,
        ScreenDirections {
            right: true,
            ..Default::default()
        },
    );
    for _ in 0..10 {
        step_player(&mut player, &mut ground, 1);
    }
    assert!(
        player.x > 2.0,
        "it walks out of the corner instead of freezing in it: x = {}",
        player.x
    );
    assert_eq!(player.elevation, 0.0);
}

/// What the foot is for going up, the descent edge is for coming down, all at the top:
/// a flight is only ever entered along its axis, never from a side, at any height.
#[test]
fn a_flight_is_a_wall_from_its_sides_at_the_top() {
    let mut ground = stairs_ground();
    let mut player = create_player(&ground, GridPoint { x: 2.0, y: 0.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            up: true,
            left: true,
            ..Default::default()
        },
    );
    for _ in 0..40 {
        step_player(&mut player, &mut ground, 1);
        assert!(
            player.climb.is_none(),
            "there are no steps in from the side of the top face"
        );
    }
    assert_eq!(
        player.elevation, 1.0,
        "it stays on the plateau, not on the flight"
    );
    assert!(
        player.y < 0.5 - PLAYER_RADIUS + 1e-9,
        "it stops against the side as against any block: {}",
        player.y
    );
}

/// A flight is taken from its foot, never over its sides: from the side it is a wall like any
#[test]
fn a_flight_is_a_wall_from_its_sides() {
    let mut ground = flight_with_open_sides();
    let mut player = walk_into_flight_side(&mut ground);
    for _ in 0..40 {
        step_player(&mut player, &mut ground, 1);
        assert!(
            player.climb.is_none(),
            "there are no steps up the side of a flight"
        );
    }
    assert_eq!(player.elevation, 0.0, "it never gets up the side");
    assert!(
        player.y < 0.5 - PLAYER_RADIUS + 1e-9,
        "it stops against the side as against any block: {}",
        player.y
    );
}

/// From its foot the flight is walked up, straight up the steps whatever way the player came.
#[test]
fn a_flight_is_climbed_from_its_foot() {
    let mut ground = flight_with_open_sides();
    let mut player = create_player(&ground, GridPoint { x: 1.0, y: 1.0 });
    set_player_walk(
        &mut player,
        ScreenDirections {
            right: true,
            up: true,
            ..Default::default()
        },
    );
    for _ in 0..40 {
        step_player(&mut player, &mut ground, 1);
        if player.climb.is_some() {
            break;
        }
    }
    let climb = player.climb.as_ref().expect("the flight is walked up");
    assert!(climb.stairs);
    assert!(
        (climb.direction.x - 1.0).abs() < 1e-9 && climb.direction.y.abs() < 1e-9,
        "it walks up the way the flight climbs: {:?}",
        climb.direction
    );
}

/// The side of a flight is cleared the way any block is: with a double jump.
#[test]
fn a_flight_side_is_cleared_with_a_double_jump() {
    let mut ground = flight_with_open_sides();
    let mut player = walk_into_flight_side(&mut ground);
    set_player_jump_held(&mut player, true);
    jump_player(&mut player);
    step_player(&mut player, &mut ground, 4);
    jump_player(&mut player);
    step_player(&mut player, &mut ground, 4);
    assert!(
        player.elevation + player.height >= 1.0,
        "two jumps carry it over the top of the flight: {}",
        player.elevation + player.height
    );
    set_player_walk(&mut player, ScreenDirections::default());
    for _ in 0..40 {
        step_player(&mut player, &mut ground, 1);
        if player.vertical_speed.is_none() {
            break;
        }
    }
    assert_eq!(
        get_player_column(GridPoint {
            x: player.x,
            y: player.y
        }),
        WorldCoord { x: 2, y: 1 },
        "it lands on the flight"
    );
    assert_eq!(player.elevation, 1.0, "on its top");
    assert_eq!(player.height, 0.0);
}
