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

/// Walking up a flight the player is on the steps, not in the air over them, and its feet rise
#[test]
fn a_flight_walks_its_player_up_the_steps_without_leaving_the_ground() {
    let mut ground = stairs_ground();
    let mut player = walk_onto_stairs(&mut ground);
    let start = player.elevation + player.height;
    let mut feet = Vec::new();
    for _ in 0..PLAYER_STAIRS_TICKS {
        step_player(&mut player, &mut ground, 1);
        assert_eq!(player.height, 0.0, "it walks on the steps, never over them");
        feet.push(player.elevation + player.height);
    }
    assert!(
        feet.windows(2).all(|pair| pair[1] >= pair[0]),
        "its feet only ever rise: {feet:?}"
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
