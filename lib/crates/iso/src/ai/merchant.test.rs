use super::*;
use crate::entities::blueprint::{
    EntityAsset, EntityBlueprint, EntityLengthAxis, EntityPlacement, EntityShape,
};
use crate::grid::CHUNK_SIZE;
use crate::npc::wander::tests::ground_from;

fn stall_at(x: i32, y: i32) -> Entity {
    let blueprint = EntityBlueprint {
        npc: None,
        id: "market_stall".to_owned(),
        asset: EntityAsset {
            sprite: "/assets/market_stall/block.svg".to_owned(),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
            fire: false,
            effect: None,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![1.0],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: vec![],
            road_access: false,
        },
    };
    Entity::new(x, y, &blueprint, 0)
}

fn meadow() -> impl PlayerGround {
    let row = "0".repeat(CHUNK_SIZE as usize);
    let rows: Vec<&str> = (0..CHUNK_SIZE).map(|_| row.as_str()).collect();
    ground_from(&rows)
}

#[test]
fn a_stall_gets_a_merchant_standing_right_beside_it() {
    let stall = stall_at(8, 8);
    let born = spawn(&meadow(), &[&stall]);
    assert_eq!(born.len(), 1);
    let merchant = &born[0];
    assert_eq!(merchant.kind, NpcKind::Merchant);
    assert_ne!(merchant.id & ID_BIT, 0);
    assert_eq!(merchant.cell, merchant.home);
    let apart = (merchant.home.x - 8).abs().max((merchant.home.y - 8).abs());
    assert_eq!(
        apart, 1,
        "he is born on the ring next to the stall, never on it"
    );
}

#[test]
fn stalls_of_one_cluster_share_a_merchant_and_a_lone_one_has_its_own() {
    let (a, b, far) = (
        stall_at(4, 4),
        stall_at(7, 5),
        stall_at(4 + SHARED_REACH + 3, 4),
    );
    let born = spawn(&meadow(), &[&far, &b, &a]);
    assert_eq!(
        born.len(),
        2,
        "the cluster of two has one and the far stall its own"
    );
    let ids: Vec<u64> = born.iter().map(|npc| npc.id).collect();
    let again: Vec<u64> = spawn(&meadow(), &[&a, &b, &far])
        .iter()
        .map(|npc| npc.id)
        .collect();
    assert_eq!(ids, again, "the order the stalls come in does not matter");
}

#[test]
fn a_stall_with_no_room_beside_it_gives_nobody() {
    let stall = stall_at(0, 0);
    let rows = ["~~~~~", "~~~~~", "~~~~~", "~~~~~", "~~~~~"];
    assert!(spawn(&ground_from(&rows), &[&stall]).is_empty());
}
