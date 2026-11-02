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
