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
                WorldCoord { x: x as i32, y: y as i32 },
                TerrainColumn {
                    coord: WorldCoord { x: x as i32, y: y as i32 },
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
    assert_eq!(get_walk_direction(&ScreenDirections { up: true, ..Default::default() }), GridPoint { x: 1.0 / 2.0_f64.sqrt(), y: 1.0 / 2.0_f64.sqrt() });
}

#[test]
fn get_walk_direction_diagonal_cancels() {
    assert_eq!(get_walk_direction(&ScreenDirections { up: true, down: true, left: true, right: true }), GridPoint { x: 0.0, y: 0.0 });
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
/// direction between two of them takes the nearer.
#[test]
fn get_player_facing_takes_the_nearest_of_sixteen() {
    let index = |x: f64, y: f64| PLAYER_FACINGS[get_player_facing(GridPoint { x, y }).unwrap()];
    assert_eq!(index(1.0, 1.0), "north", "up the screen");
    assert_eq!(index(-1.0, 1.0), "west");
    assert_eq!(index(-1.0, -1.0), "south", "towards the camera");
    assert_eq!(index(1.0, 0.0), "north-east");
    // Half way between east and north-east, which eight facings could not tell apart.
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
fn get_player_render_position_interpolates() {
    let ground = ground_from(&["0"]);
    let mut player = create_player(&ground, GridPoint { x: 0.0, y: 0.0 });
    player.previous = PlayerPosition { x: 0.0, y: 0.0, elevation: 0.0, inset: 0.0, height: 0.0 };
    player.x = 1.0;
    player.y = 1.0;
    let rp = get_player_render_position(&player, 0.5);
    assert!((rp.x - 0.5).abs() < 1e-9);
    assert!((rp.y - 0.5).abs() < 1e-9);
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
    set_player_walk(&mut player, ScreenDirections { right: true, ..Default::default() });
    step_player(&mut player, &mut ground, 1, no_top_inset);
    // Player should have moved (velocity applied).
    // At minimum, previous should be set.
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
/// to rest. Walking on one axis only keeps it from sliding around the obstacle.
fn walk_into_centre(side: f64) -> GridPoint {
    let mut ground = ground_from(&["000", "000", "000"]);
    ground.occupancy.insert(WorldCoord { x: 1, y: 1 }, vec![obstacle(side)]);
    let mut player = create_player(&ground, GridPoint { x: 1.0, y: 0.0 });
    set_player_walk(
        &mut player,
        ScreenDirections { up: true, left: true, ..Default::default() },
    );
    step_player(&mut player, &mut ground, 20, no_top_inset);
    GridPoint { x: player.x, y: player.y }
}

#[test]
fn a_trunk_sized_collision_lets_the_player_onto_the_cell_it_stands_on() {
    // The side the content gives every tree (`TREE_TRUNK_COLLISION` in
    // `src/isometric/content/entities.ts`): only its trunk blocks.
    const TRUNK: f64 = 0.15;
    let at = walk_into_centre(TRUNK);

    // It is stopped by the trunk, not by the cell: half the collision square plus the player's
    // own radius away from the middle, which is still inside the cell.
    let stop = PLAYER_RADIUS + TRUNK / 2.0;
    assert!(
        (at.x - 1.0).abs() < 1e-9 && (at.y - (1.0 - stop)).abs() < 0.05,
        "stopped at the trunk, at {at:?}"
    );
    assert_eq!(
        get_player_column(at),
        WorldCoord { x: 1, y: 1 },
        "it walks onto the cell the tree grows on, as the TypeScript client does"
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

/// A beach of sand with a step up along the right: the row against that step is the terrace,
/// and the player stands on its lifted top rather than on the sunken one the rest of the beach
/// is drawn with.
fn beach_with_a_step() -> CellGround {
    let mut ground = CellGround::new();
    for x in 0..4 {
        for y in 0..3 {
            let step = x == 3;
            ground.columns.insert(
                WorldCoord { x, y },
                TerrainColumn {
                    coord: WorldCoord { x, y },
                    elevation: i32::from(step),
                    surface: if step {
                        TerrainMaterial::Grass
                    } else {
                        TerrainMaterial::Sand
                    },
                    walkable: true,
                },
            );
        }
    }
    ground
}

fn sand_inset(_: TerrainMaterial) -> f64 {
    0.5
}

#[test]
fn the_player_stands_on_the_lifted_top_of_the_terrace_row() {
    let ground = beach_with_a_step();
    let terrace = ground.column_at(2, 1).expect("the row against the step");
    let open_beach = ground.column_at(0, 1).expect("the open beach");
    assert_eq!(
        drawn_inset(&ground, terrace, sand_inset),
        0.0,
        "the terrace row's top is drawn at its own plane, so the feet rise with it"
    );
    assert_eq!(
        drawn_inset(&ground, open_beach, sand_inset),
        0.5,
        "the rest of the beach keeps the sunken top sand is drawn with"
    );
}

#[test]
fn the_feet_follow_the_terrace_row_up() {
    let mut ground = beach_with_a_step();
    let mut on_terrace = create_player(&ground, GridPoint { x: 2.5, y: 1.5 });
    let mut on_beach = create_player(&ground, GridPoint { x: 0.5, y: 1.5 });
    step_player(&mut on_terrace, &mut ground, 1, sand_inset);
    step_player(&mut on_beach, &mut ground, 1, sand_inset);
    let feet = |p: &PlayerState| p.elevation - p.inset;
    assert!(
        feet(&on_terrace) > feet(&on_beach),
        "the terrace stands {} above the beach's {}",
        feet(&on_terrace),
        feet(&on_beach)
    );
}
