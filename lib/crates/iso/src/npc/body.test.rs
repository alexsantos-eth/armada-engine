use super::super::wander::tests::ground_from;
use super::*;
use crate::npc::{NpcLogic, npc_look};
use crate::player::{PLAYER_RADIUS, create_player, step_player};

fn cell(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

fn crowd_of(npcs: Vec<Npc>) -> Npcs {
    let mut crowd = Npcs::default();
    crowd.sync(&[ChunkCoord { cx: 0, cy: 0 }], |_| npcs.clone());
    crowd
}

#[test]
fn the_body_follows_the_feet_through_a_step() {
    let ground = ground_from(&["......", "......", "......"]);
    let mut crab = Npc::new(NpcLogic::Basic, 3, cell(1, 1), 0);
    crab.rest_ticks = 0;
    let standing = crab.body();
    assert_eq!(standing.centre, GridPoint { x: 1.0, y: 1.0 });
    for _ in 0..4 {
        crate::npc::step_npc(&mut crab, &ground, |_| false);
    }
    assert!(crab.step.is_some(), "the crab set off");
    let walking = crab.body();
    let feet = crab.position();
    assert_eq!(walking.centre, feet);
    assert_ne!(walking.centre, standing.centre);
}

#[test]
fn a_body_has_the_size_of_its_logic_scaled_by_its_look() {
    let body = Npc::new(NpcLogic::Basic, 3, cell(1, 1), 0).body();
    let (side, height) = NpcLogic::Basic.body_size();
    let scale = npc_look(NpcLogic::Basic, 3).scale;
    assert!((body.side - side * scale).abs() < 1e-12);
    assert!((body.height - height * scale).abs() < 1e-12);
}

#[test]
fn a_body_reaches_into_every_cell_its_square_overlaps() {
    let body = NpcBody {
        centre: GridPoint { x: 1.45, y: 2.0 },
        side: 0.4,
        elevation: 0.0,
        height: 0.5,
    };
    assert!(body.covers(cell(1, 2)));
    assert!(body.covers(cell(2, 2)));
    assert!(!body.covers(cell(1, 1)));
    assert!(!body.covers(cell(0, 2)));
}

#[test]
fn the_ground_reports_bodies_where_they_stand_now() {
    let crowd = crowd_of(vec![Npc::new(NpcLogic::Basic, 3, cell(2, 1), 0)]);
    let with = NpcGround {
        ground: ground_from(&["......", "......", "......"]),
        npcs: &crowd,
    };
    let found = with.occupancy_at(2, 1);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].centre, Some(GridPoint { x: 2.0, y: 1.0 }));
    assert!(with.occupancy_at(4, 1).is_empty());
}

#[test]
fn the_player_walks_into_a_body_and_stops() {
    let crowd = crowd_of(vec![Npc::new(NpcLogic::Basic, 3, cell(4, 1), 0)]);
    let mut with = NpcGround {
        ground: ground_from(&["........", "........", "........"]),
        npcs: &crowd,
    };
    let mut player = create_player(&with, GridPoint { x: 1.0, y: 1.0 });
    player.walk = GridPoint { x: 1.0, y: 0.0 };
    step_player(&mut player, &mut with, 120);
    let body = crowd.iter().next().unwrap().body();
    assert!(
        player.x < body.centre.x - body.side / 2.0 - PLAYER_RADIUS + 1e-6,
        "the player stopped against the body, at {}",
        player.x
    );
    assert!(player.x > 2.5, "the player still walked up to it");

    let mut bare = ground_from(&["........", "........", "........"]);
    let mut free = create_player(&bare, GridPoint { x: 1.0, y: 1.0 });
    free.walk = GridPoint { x: 1.0, y: 0.0 };
    step_player(&mut free, &mut bare, 120);
    assert!(free.x > body.centre.x, "without the crowd it walks on");
}
