use super::*;
use crate::entities::{
    Entity, EntityAsset, EntityBlueprint, EntityCatalog, EntityLengthAxis, EntityPlacement,
    EntityShape,
};
use crate::terrain::{TerrainMaterial, flat_chunk};

const CHUNK: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };

fn blueprint(id: &str) -> EntityBlueprint {
    EntityBlueprint {
        npc: None,
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{id}.svg"),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
            draw_under_player: false,
            fire: false,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![0.5],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: vec![],
            road_access: false,
        },
    }
}

fn world() -> ChunkManager {
    let catalog = EntityCatalog {
        schema_version: 1,
        entities: vec![blueprint("tree"), blueprint("rock")],
    };
    let generator = crate::terrain::TerrainGenerator::new(crate::terrain::TerrainConfig::default())
        .expect("the default terrain configuration is valid");
    let mut manager = ChunkManager::new(generator, catalog);
    manager.load_columns(CHUNK, flat_chunk(CHUNK, 0, TerrainMaterial::Grass));
    manager
}

#[test]
fn the_players_line_carries_the_cell_it_stands_on() {
    let player = player_of(4.75, -3.25, 2.0);

    assert_eq!(player.cell, [4, -4]);
    assert_eq!(player.elevation, 2.0);
}

#[test]
fn what_stands_in_the_world_is_listed_by_cell() {
    let mut manager = world();
    let rock = manager.catalog().entities[1].clone();
    let tree = manager.catalog().entities[0].clone();
    manager.put_entity(Entity::new(6, 2, &rock, 0));
    manager.put_entity(Entity::new(3, 1, &tree, 0));

    let listed = entities_in(&manager, &[CHUNK]);

    assert_eq!(
        listed,
        vec![
            ReportEntity {
                blueprint: "tree".to_owned(),
                cell: [3, 1],
                elevation: 0
            },
            ReportEntity {
                blueprint: "rock".to_owned(),
                cell: [6, 2],
                elevation: 0
            },
        ]
    );
}

#[test]
fn a_chunk_the_run_never_loaded_adds_nothing_to_the_list() {
    let manager = world();

    let listed = entities_in(&manager, &[ChunkCoord { cx: 9, cy: 9 }]);

    assert!(listed.is_empty());
}

#[test]
fn a_chunk_named_twice_lists_what_stands_in_it_once() {
    let mut manager = world();
    let tree = manager.catalog().entities[0].clone();
    manager.put_entity(Entity::new(3, 1, &tree, 0));

    let listed = entities_in(&manager, &[CHUNK, CHUNK]);

    assert_eq!(listed.len(), 1);
}

#[test]
fn a_report_serialises_its_fields_in_camel_case() {
    let report = Report {
        frames: 12,
        steps_taken: 2,
        steps: 3,
        shots: vec!["antes.png".to_owned()],
        phase: "dawn".to_owned(),
        player: Some(player_of(1.5, 2.5, 0.0)),
        entities: Vec::new(),
        notes: vec!["nothing changed".to_owned()],
    };

    let json = serde_json::to_string(&report).expect("a report serialises");

    assert!(json.contains("\"stepsTaken\":2"), "{json}");
    assert!(json.contains("\"frames\":12"), "{json}");
    assert!(json.contains("\"cell\":[1,2]"), "{json}");
}

#[test]
fn a_refusal_says_what_the_cell_is_and_what_stands_on_it() {
    let column = TerrainColumn {
        coord: crate::grid::WorldCoord { x: 2, y: 3 },
        elevation: 4,
        surface: TerrainMaterial::Sand,
        walkable: true,
    };

    let note = refusal_note([2, 3], Some(column), Some("tree"));

    assert!(note.contains("[2, 3]"), "{note}");
    assert!(note.contains("Sand"), "{note}");
    assert!(note.contains("elevation 4"), "{note}");
    assert!(note.contains("tree already stands"), "{note}");
}

#[test]
fn a_refusal_outside_the_loaded_world_says_so() {
    let note = refusal_note([9000, 9000], None, None);

    assert!(note.contains("outside the loaded world"), "{note}");
}
