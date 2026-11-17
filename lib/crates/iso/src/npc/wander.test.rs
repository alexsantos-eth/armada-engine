use std::collections::HashMap;

use super::*;
use crate::player::PlayerObstacle;
use crate::terrain::TerrainColumn;

#[derive(Default)]
pub(crate) struct CellGround {
    pub(crate) columns: HashMap<WorldCoord, TerrainColumn>,
    pub(crate) occupancy: HashMap<WorldCoord, Vec<PlayerObstacle>>,
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

/// Ground from rows of characters: a digit is grass at that level, `~` water, `s` stairs,
/// `T` grass with a tree on it and a space no ground at all.
pub(crate) fn ground_from(rows: &[&str]) -> CellGround {
    let mut ground = CellGround::default();
    for (y, row) in rows.iter().enumerate() {
        for (x, ch) in row.chars().enumerate() {
            if ch == ' ' {
                continue;
            }
            let coord = WorldCoord {
                x: x as i32,
                y: y as i32,
            };
            let surface = match ch {
                '~' => TerrainMaterial::Water,
                's' => TerrainMaterial::Stairs,
                _ => TerrainMaterial::Grass,
            };
            ground.columns.insert(
                coord,
                TerrainColumn {
                    coord,
                    elevation: ch.to_digit(10).map_or(0, |level| level as i32),
                    surface,
                    walkable: ch != '~',
                },
            );
            if ch == 'T' {
                ground.occupancy.insert(
                    coord,
                    vec![PlayerObstacle {
                        walkable: false,
                        height: Some(2.0),
                        elevation: Some(0.0),
                        collision_at: Some(0.15),
                    }],
                );
            }
        }
    }
    ground
}

fn cell(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

fn nobody(_: WorldCoord) -> bool {
    false
}

fn ready(home: WorldCoord) -> Npc {
    let mut npc = Npc::new(7, home, 0);
    npc.rest_ticks = 0;
    npc
}

#[test]
fn stands_only_on_dry_level_free_ground() {
    let ground = ground_from(&["0~s", "T1 "]);
    assert!(can_npc_stand(&ground, cell(0, 0), None));
    assert!(!can_npc_stand(&ground, cell(1, 0), None));
    assert!(!can_npc_stand(&ground, cell(2, 0), None));
    assert!(!can_npc_stand(&ground, cell(0, 1), None));
    assert!(can_npc_stand(&ground, cell(1, 1), None));
    assert!(!can_npc_stand(&ground, cell(1, 1), Some(0)));
    assert!(!can_npc_stand(&ground, cell(2, 1), None));
}

#[test]
fn never_steps_up_down_into_water_or_past_its_leash() {
    let ground = ground_from(&["010", "0~0", "000"]);
    let npc = ready(cell(0, 0));
    assert!(!can_npc_step(&npc, (1, 0), &ground, nobody));
    assert!(can_npc_step(&npc, (0, 1), &ground, nobody));
    assert!(!can_npc_step(&npc, (1, 1), &ground, nobody));
    assert!(!can_npc_step(&npc, (-1, 0), &ground, nobody));

    let mut far = ready(cell(0, 0));
    far.home = cell(0, -NPC_LEASH);
    assert!(can_npc_step(&far, (1, 0), &ground_from(&["00"]), nobody));
    assert!(!can_npc_step(&far, (0, 1), &ground, nobody));
}

#[test]
fn a_diagonal_does_not_cut_a_closed_corner() {
    let open = ground_from(&["00", "00"]);
    let corner = ground_from(&["0T", "00"]);
    let npc = ready(cell(0, 0));
    assert!(can_npc_step(&npc, (1, 1), &open, nobody));
    assert!(!can_npc_step(&npc, (1, 1), &corner, nobody));
}

#[test]
fn does_not_step_into_a_taken_cell() {
    let ground = ground_from(&["00"]);
    let npc = ready(cell(0, 0));
    assert!(!can_npc_step(&npc, (1, 0), &ground, |at| at == cell(1, 0)));
}

#[test]
fn rests_before_it_sets_off() {
    let ground = ground_from(&["000", "000", "000"]);
    let mut npc = Npc::new(7, cell(1, 1), 0);
    npc.rest_ticks = 3;
    for _ in 0..3 {
        step_npc(&mut npc, &ground, nobody);
        assert_eq!(npc.motion(), NpcMotion::Idle);
    }
    step_npc(&mut npc, &ground, nobody);
    assert_eq!(npc.motion(), NpcMotion::Walking);
}

#[test]
fn walks_a_cell_at_its_pace_and_lands_on_the_centre() {
    let ground = ground_from(&["00"]);
    let mut npc = ready(cell(0, 0));
    step_npc(&mut npc, &ground, nobody);
    assert_eq!(npc.heading, Some((1, 0)));
    assert_eq!(npc.direction, GridPoint { x: 1.0, y: 0.0 });
    step_npc(&mut npc, &ground, nobody);
    assert!((npc.position().x - NPC_STEP).abs() < 1e-12);
    assert!((npc.render_position(0.5).x - NPC_STEP / 2.0).abs() < 1e-12);
    let mut ticks = 1;
    while npc.heading.is_some() {
        step_npc(&mut npc, &ground, nobody);
        ticks += 1;
        assert!(ticks < 100);
    }
    assert_eq!(ticks, (1.0 / NPC_STEP).ceil() as i32);
    assert_eq!(npc.cell, cell(1, 0));
    assert_eq!(npc.position(), GridPoint { x: 1.0, y: 0.0 });
    assert!(npc.rest_ticks >= NPC_REST_TICKS.0 && npc.rest_ticks <= NPC_REST_TICKS.1);
}

#[test]
fn a_boxed_in_character_waits_and_tries_again() {
    let ground = ground_from(&["~~~", "~0~", "~~~"]);
    let mut npc = ready(cell(1, 1));
    step_npc(&mut npc, &ground, nobody);
    assert_eq!(npc.motion(), NpcMotion::Idle);
    assert_eq!(npc.rest_ticks, NPC_BLOCKED_REST_TICKS);
}

#[test]
fn a_long_wander_stays_level_dry_and_near_home() {
    let rows = [
        "0000000000000000",
        "000~~00000T00000",
        "000~~00000000110",
        "0000000T00000110",
        "0000000000000000",
        "00s0000000~~0000",
        "0000000000~~0000",
        "0000000000000000",
    ];
    let ground = ground_from(&rows);
    let mut npc = ready(cell(6, 4));
    let mut visited = std::collections::HashSet::new();
    for _ in 0..20_000 {
        step_npc(&mut npc, &ground, nobody);
        visited.insert(npc.cell);
        assert!(can_npc_stand(&ground, npc.cell, Some(0)));
        assert!((npc.cell.x - npc.home.x).abs() <= NPC_LEASH);
        assert!((npc.cell.y - npc.home.y).abs() <= NPC_LEASH);
        let step = npc.position();
        assert!((step.x - npc.previous.x).hypot(step.y - npc.previous.y) <= NPC_STEP + 1e-9);
    }
    assert!(visited.len() > 20);
}

#[test]
fn the_same_character_wanders_the_same_way() {
    let ground = ground_from(&["00000", "00000", "00000", "00000", "00000"]);
    let mut one = Npc::new(42, cell(2, 2), 0);
    let mut other = Npc::new(42, cell(2, 2), 0);
    for _ in 0..2_000 {
        step_npc(&mut one, &ground, nobody);
        step_npc(&mut other, &ground, nobody);
    }
    assert_eq!(one.cell, other.cell);
    assert_eq!(one.position(), other.position());
}
