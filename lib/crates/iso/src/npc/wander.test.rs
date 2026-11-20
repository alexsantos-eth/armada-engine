use std::collections::HashMap;

use super::*;
use crate::player::PlayerObstacle;
use crate::terrain::TerrainColumn;

/// A gait that walks, takes stairs and climbs, and looks where it goes: what the logics of
/// the engine's tests need to exercise every kind of step.
pub(crate) fn walker_gait() -> NpcGait {
    NpcGait {
        step: NPC_STEP,
        leash: 6,
        rest_ticks: (40, 160),
        stroll_cells: (1, 4),
        climbs: true,
        sideways: false,
        turns_back: false,
    }
}

/// A character born on `home` that walks like [`walker_gait`].
pub(crate) fn walker(id: u64, home: WorldCoord, elevation: i32) -> Npc {
    Npc::new(NpcLogic::Basic, id, home, elevation).with_gait(walker_gait())
}

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
/// `.` sand at level 0, `T` grass with a tree on it and a space no ground at all.
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
                '.' => TerrainMaterial::Sand,
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
                        centre: None,
                    }],
                );
            }
        }
    }
    ground
}

/// Lays a road over `cells`, each a column, its level and whether it is a flight of stairs.
fn pave(ground: &mut CellGround, cells: &[(i32, i32, i32, bool)]) {
    for &(x, y, elevation, stairs) in cells {
        let coord = WorldCoord { x, y };
        ground.columns.insert(
            coord,
            TerrainColumn {
                coord,
                elevation,
                surface: if stairs {
                    TerrainMaterial::Stairs
                } else {
                    TerrainMaterial::Path
                },
                walkable: true,
            },
        );
    }
}

fn walk_out(npc: &mut Npc, ground: &CellGround) -> Vec<NpcPose> {
    let mut poses = Vec::new();
    while npc.step.is_some() {
        step_npc(npc, ground, nobody);
        poses.push(npc.pose());
        assert!(poses.len() < 200);
    }
    poses
}

fn cell(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

fn nobody(_: WorldCoord) -> bool {
    false
}

fn ready(home: WorldCoord) -> Npc {
    let mut npc = walker(7, home, 0);
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
fn walks_level_ground_but_not_water_cliffs_or_past_its_leash() {
    let ground = ground_from(&["020", "0~0", "000"]);
    let npc = ready(cell(0, 0));
    assert!(plan_npc_step(&npc, (1, 0), &ground, nobody).is_none());
    assert_eq!(
        plan_npc_step(&npc, (0, 1), &ground, nobody).map(|step| step.kind),
        Some(NpcMove::Walk)
    );
    assert!(plan_npc_step(&npc, (1, 1), &ground, nobody).is_none());
    assert!(plan_npc_step(&npc, (-1, 0), &ground, nobody).is_none());

    let mut far = ready(cell(0, 0));
    far.home = cell(0, -walker_gait().leash);
    assert!(plan_npc_step(&far, (1, 0), &ground_from(&["00"]), nobody).is_some());
    assert!(plan_npc_step(&far, (0, 1), &ground, nobody).is_none());
}

#[test]
fn a_diagonal_does_not_cut_a_closed_corner_nor_change_level() {
    let open = ground_from(&["00", "00"]);
    let corner = ground_from(&["0T", "00"]);
    let step_up = ground_from(&["00", "01"]);
    let npc = ready(cell(0, 0));
    assert!(plan_npc_step(&npc, (1, 1), &open, nobody).is_some());
    assert!(plan_npc_step(&npc, (1, 1), &corner, nobody).is_none());
    assert!(plan_npc_step(&npc, (1, 1), &step_up, nobody).is_none());
}

#[test]
fn does_not_step_into_a_taken_cell() {
    let ground = ground_from(&["00"]);
    let npc = ready(cell(0, 0));
    assert!(plan_npc_step(&npc, (1, 0), &ground, |at| at == cell(1, 0)).is_none());
}

#[test]
fn rests_before_it_sets_off() {
    let ground = ground_from(&["000", "000", "000"]);
    let mut npc = walker(7, cell(1, 1), 0);
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
    assert_eq!(npc.step.map(|step| step.heading), Some((1, 0)));
    assert_eq!(npc.direction, GridPoint { x: 1.0, y: 0.0 });
    step_npc(&mut npc, &ground, nobody);
    assert!((npc.position().x - NPC_STEP).abs() < 1e-12);
    assert!((npc.render_pose(0.5).x - NPC_STEP / 2.0).abs() < 1e-12);
    let ticks = 1 + walk_out(&mut npc, &ground).len() as i32;
    assert_eq!(ticks, (1.0 / NPC_STEP).ceil() as i32);
    assert_eq!(npc.cell, cell(1, 0));
    assert_eq!(npc.position(), GridPoint { x: 1.0, y: 0.0 });
    assert!(
        npc.rest_ticks >= walker_gait().rest_ticks.0
            && npc.rest_ticks <= walker_gait().rest_ticks.1
    );
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
fn climbs_a_block_one_higher_and_no_more() {
    let ground = ground_from(&["012"]);
    let mut npc = ready(cell(0, 0));
    let step = plan_npc_step(&npc, (1, 0), &ground, nobody).expect("a block one higher");
    assert_eq!((step.kind, step.rise), (NpcMove::Climb, 1));
    assert!(plan_npc_step(&ready(cell(0, 0)), (1, 0), &ground_from(&["02"]), nobody).is_none());

    npc.step = Some(step);
    let poses = walk_out(&mut npc, &ground);
    assert_eq!((npc.cell, npc.elevation), (cell(1, 0), 1));
    assert_eq!(npc.pose().elevation, 1.0);
    let mut before = 0.0;
    for pose in &poses {
        assert!(pose.elevation >= before - 1e-12 && pose.elevation <= 1.0 + 1e-12);
        assert!(pose.x >= -1e-12 && pose.x <= 1.0 + 1e-12);
        before = pose.elevation;
    }
    assert!(
        poses
            .iter()
            .any(|pose| pose.elevation > 0.2 && pose.x < 0.5)
    );
}

#[test]
fn the_pull_of_a_climb_is_the_only_part_that_climbs() {
    let mut npc = ready(cell(0, 0));
    npc.step = Some(NpcStep {
        heading: (1, 0),
        kind: NpcMove::Climb,
        rise: 1,
    });
    assert_eq!(npc.motion(), NpcMotion::Walking);
    assert!(npc.climbing().is_none());
    npc.progress = 0.5;
    assert_eq!(npc.motion(), NpcMotion::Climbing);
    assert!(npc.climbing().is_some_and(|pull| pull > 0.0 && pull < 1.0));
    npc.progress = 0.99;
    assert_eq!(npc.motion(), NpcMotion::Walking);

    let (start, _, _) = get_npc_climb(0.0);
    let (end, risen, _) = get_npc_climb(1.0);
    assert_eq!(start, 0.0);
    assert!((end - 1.0).abs() < 1e-9 && risen == 1.0);
}

#[test]
fn drops_off_a_block_onto_ground_one_lower_and_no_more() {
    let ground = ground_from(&["10"]);
    let mut npc = walker(7, cell(0, 0), 1);
    npc.rest_ticks = 0;
    let step = plan_npc_step(&npc, (1, 0), &ground, nobody).expect("ground one lower");
    assert_eq!((step.kind, step.rise), (NpcMove::Drop, -1));
    let mut high = walker(7, cell(0, 0), 2);
    high.rest_ticks = 0;
    assert!(plan_npc_step(&high, (1, 0), &ground_from(&["20"]), nobody).is_none());
    assert!(plan_npc_step(&npc, (1, 0), &ground_from(&["1~"]), nobody).is_none());

    npc.step = Some(step);
    let poses = walk_out(&mut npc, &ground);
    assert_eq!((npc.cell, npc.elevation), (cell(1, 0), 0));
    assert_eq!(npc.pose().height, 0.0);
    let mut feet = 1.0;
    let mut fell = false;
    for pose in &poses {
        let now = pose.elevation + pose.height;
        assert!(now <= feet + 1e-12 && now >= -1e-12);
        if pose.x < NPC_DROP_EDGE - 1e-9 {
            assert_eq!(now, 1.0);
        }
        fell |= pose.height > 0.0 && pose.elevation == 0.0;
        feet = now;
    }
    assert!(fell);
    assert_eq!(get_npc_fall(0.0), 0.0);
    assert_eq!(get_npc_fall(100.0), 1.0);
}

#[test]
fn a_falling_character_is_falling_and_drawn_between_ticks_without_a_jump() {
    let ground = ground_from(&["10"]);
    let mut npc = walker(7, cell(0, 0), 1);
    npc.step = plan_npc_step(&npc, (1, 0), &ground, nobody);
    let mut seen_falling = false;
    while npc.step.is_some() {
        let before = npc.pose();
        step_npc(&mut npc, &ground, nobody);
        let now = npc.pose();
        let between = npc.render_pose(0.5);
        let (low, high) = (now.elevation + now.height, before.elevation + before.height);
        let feet = between.elevation + between.height;
        assert!(feet >= low - 1e-12 && feet <= high + 1e-12);
        assert!(between.height >= -1e-12);
        seen_falling |= npc.motion() == NpcMotion::Falling;
    }
    assert!(seen_falling);
}

/// A road along `x`: level 0 on columns 0 and 1, a flight on column 2 and level 1 beyond.
fn flight() -> CellGround {
    let mut ground = ground_from(&["00011", "00011", "00011"]);
    pave(
        &mut ground,
        &[
            (0, 1, 0, false),
            (1, 1, 0, false),
            (2, 1, 1, true),
            (3, 1, 1, false),
            (4, 1, 1, false),
        ],
    );
    ground
}

#[test]
fn takes_a_flight_of_stairs_up_through_to_the_cell_beyond() {
    let ground = flight();
    let mut npc = ready(cell(1, 1));
    let step = plan_npc_step(&npc, (1, 0), &ground, nobody).expect("the foot of a flight");
    assert_eq!((step.kind, step.rise, step.span()), (NpcMove::Stairs, 1, 2));
    npc.step = Some(step);
    assert!(npc.claims(cell(2, 1)) && npc.claims(cell(3, 1)));
    let poses = walk_out(&mut npc, &ground);
    assert_eq!((npc.cell, npc.elevation), (cell(3, 1), 1));
    let mut before = 0.0;
    for pose in &poses {
        assert!(pose.elevation >= before - 1e-12 && pose.elevation <= 1.0 + 1e-12);
        if pose.x <= 1.5 {
            assert_eq!(pose.elevation, 0.0);
        }
        if pose.x >= 2.5 {
            assert_eq!(pose.elevation, 1.0);
        }
        before = pose.elevation;
    }
    assert!(poses.iter().any(|pose| pose.height > 0.0));
    assert_eq!(poses.len(), (2.0 / NPC_STEP).ceil() as usize);
}

#[test]
fn takes_a_flight_of_stairs_down_from_the_cell_above() {
    let ground = flight();
    let mut npc = walker(7, cell(3, 1), 1);
    npc.rest_ticks = 0;
    let step = plan_npc_step(&npc, (-1, 0), &ground, nobody).expect("the top of a flight");
    assert_eq!((step.kind, step.rise), (NpcMove::Stairs, -1));
    npc.step = Some(step);
    let poses = walk_out(&mut npc, &ground);
    assert_eq!((npc.cell, npc.elevation), (cell(1, 1), 0));
    let mut before = 1.0;
    for pose in &poses {
        assert!(pose.elevation <= before + 1e-12 && pose.elevation >= -1e-12);
        before = pose.elevation;
    }
}

#[test]
fn a_flight_is_only_taken_along_its_axis_and_never_stood_on() {
    let ground = flight();
    assert!(!can_npc_stand(&ground, cell(2, 1), None));
    let beside = ready(cell(2, 0));
    assert!(plan_npc_step(&beside, (0, 1), &ground, nobody).is_none());
    let corner = ready(cell(1, 0));
    assert!(plan_npc_step(&corner, (1, 1), &ground, nobody).is_none());
    let foot = ready(cell(1, 1));
    assert!(plan_npc_step(&foot, (1, 0), &ground, |at| at == cell(3, 1)).is_none());
    assert!(plan_npc_step(&foot, (1, 0), &ground, |at| at == cell(2, 1)).is_none());
}

#[test]
fn a_long_wander_stays_dry_on_solid_ground_and_near_home() {
    let rows = [
        "0000000000000000",
        "000~~00000T00000",
        "000~~00000000110",
        "0000000T00000110",
        "0000000000022000",
        "0000000000~~0000",
        "0000300000~~0000",
        "0000000000000000",
    ];
    let mut ground = ground_from(&rows);
    pave(
        &mut ground,
        &[(1, 5, 0, false), (2, 5, 1, true), (3, 5, 1, false)],
    );
    let mut npc = ready(cell(6, 4));
    let mut visited = std::collections::HashSet::new();
    let mut moves = Vec::new();
    for _ in 0..60_000 {
        let before = npc.pose();
        step_npc(&mut npc, &ground, nobody);
        visited.insert(npc.cell);
        if let Some(step) = npc.step {
            moves.push(step.kind);
        }
        assert!(can_npc_stand(&ground, npc.cell, Some(npc.elevation)));
        assert!(npc.elevation <= 2);
        assert!((npc.cell.x - npc.home.x).abs() <= walker_gait().leash);
        assert!((npc.cell.y - npc.home.y).abs() <= walker_gait().leash);
        let now = npc.pose();
        assert!((now.x - before.x).hypot(now.y - before.y) <= 0.3);
        assert!(now.height >= 0.0);
    }
    assert!(visited.len() > 20);
    for kind in [
        NpcMove::Walk,
        NpcMove::Climb,
        NpcMove::Drop,
        NpcMove::Stairs,
    ] {
        assert!(moves.contains(&kind), "never took a {kind:?}");
    }
}

#[test]
fn the_same_character_wanders_the_same_way() {
    let ground = ground_from(&["00000", "00100", "00000", "00000", "00000"]);
    let mut one = walker(42, cell(2, 2), 0);
    let mut other = walker(42, cell(2, 2), 0);
    for _ in 0..2_000 {
        step_npc(&mut one, &ground, nobody);
        step_npc(&mut other, &ground, nobody);
    }
    assert_eq!(one.cell, other.cell);
    assert_eq!(one.pose(), other.pose());
}

fn crab_at(home: WorldCoord, elevation: i32) -> Npc {
    let mut crab = Npc::new(NpcLogic::Basic, 7, home, elevation);
    crab.rest_ticks = 0;
    crab
}

#[test]
fn a_crab_never_climbs_a_block_nor_takes_stairs() {
    let crab = crab_at(cell(0, 0), 0);
    assert!(plan_npc_step(&crab, (1, 0), &ground_from(&["01"]), nobody).is_none());
    assert!(plan_npc_step(&ready(cell(0, 0)), (1, 0), &ground_from(&["01"]), nobody).is_some());

    let ground = flight();
    assert!(plan_npc_step(&crab_at(cell(1, 1), 0), (1, 0), &ground, nobody).is_none());
    assert!(plan_npc_step(&crab_at(cell(3, 1), 1), (-1, 0), &ground, nobody).is_none());
}

#[test]
fn a_crab_scuttles_level_ground_and_drops_off_a_block() {
    let crab = crab_at(cell(0, 0), 1);
    let ground = ground_from(&["110"]);
    assert_eq!(
        plan_npc_step(&crab, (1, 0), &ground, nobody).map(|step| step.kind),
        Some(NpcMove::Walk)
    );
    let mut edge = crab_at(cell(1, 0), 1);
    let step = plan_npc_step(&edge, (1, 0), &ground, nobody).expect("a drop is open");
    assert_eq!((step.kind, step.rise), (NpcMove::Drop, -1));
    edge.step = Some(step);
    walk_out(&mut edge, &ground);
    assert_eq!((edge.cell, edge.elevation), (cell(2, 0), 0));
}

#[test]
fn a_crab_scuttles_faster_on_a_shorter_leash() {
    let (villager, crab) = (walker_gait(), NpcLogic::Basic.gait());
    assert!(crab.step > villager.step);
    assert!(crab.leash < villager.leash);
    let mut far = crab_at(cell(0, 0), 0);
    far.home = cell(-crate::ai::basic::LEASH, 0);
    assert!(plan_npc_step(&far, (1, 0), &ground_from(&["00"]), nobody).is_none());
}

#[test]
fn a_crab_faces_across_its_way() {
    let crab = crab_at(cell(1, 1), 0);
    let ground = ground_from(&["000", "000", "000"]);
    let mut crab = crab;
    step_npc(&mut crab, &ground, nobody);
    let step = crab.step.expect("it sets off");
    let (dx, dy) = (f64::from(step.heading.0), f64::from(step.heading.1));
    assert!((crab.direction.x * dx + crab.direction.y * dy).abs() < 1e-12);
    assert!((crab.direction.x.hypot(crab.direction.y) - 1.0).abs() < 1e-12);
}

#[test]
fn a_crab_keeps_the_side_it_faced_and_otherwise_faces_the_camera() {
    let east = GridPoint { x: 1.0, y: 0.0 };
    let turned = facing_for(NpcLogic::Basic.gait(), (0, 1), east);
    assert_eq!(turned, GridPoint { x: 1.0, y: 0.0 });
    let back = facing_for(NpcLogic::Basic.gait(), (0, -1), east);
    assert_eq!(back, GridPoint { x: 1.0, y: 0.0 });
    let fresh = facing_for(NpcLogic::Basic.gait(), (1, 0), GridPoint { x: 1.0, y: 0.0 });
    assert!(fresh.x + fresh.y < 0.0);
    assert_eq!(
        facing_for(walker_gait(), (0, 1), east),
        GridPoint { x: 0.0, y: 1.0 }
    );
}

#[test]
fn a_crab_that_meets_a_wall_turns_back() {
    let ground = ground_from(&["00001"]);
    let mut crab = crab_at(cell(2, 0), 0);
    crab.step = Some(NpcStep {
        heading: (1, 0),
        kind: NpcMove::Walk,
        rise: 0,
    });
    crab.strides_left = 2;
    walk_out_one(&mut crab, &ground);
    assert_eq!(crab.cell, cell(3, 0));
    assert_eq!(crab.step.map(|step| step.heading), Some((-1, 0)));

    let mut villager = ready(cell(2, 0));
    villager.step = crab.step.map(|_| NpcStep {
        heading: (1, 0),
        kind: NpcMove::Walk,
        rise: 0,
    });
    villager.strides_left = 2;
    walk_out_one(&mut villager, &ground);
    assert_eq!(villager.step.map(|step| step.kind), Some(NpcMove::Climb));
}

/// Steps `npc` until the step in flight ends and it is either resting or on a new one.
fn walk_out_one(npc: &mut Npc, ground: &CellGround) {
    let from = npc.cell;
    for _ in 0..200 {
        step_npc(npc, ground, nobody);
        if npc.cell != from {
            return;
        }
    }
    panic!("the step never ended");
}
