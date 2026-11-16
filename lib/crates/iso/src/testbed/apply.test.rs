use super::*;
use crate::entities::{
    EntityAsset, EntityBlueprint, EntityLengthAxis, EntityPlacement, EntityShape,
};
use crate::grid::ChunkCoord;
use crate::terrain::{TerrainMaterial, flat_chunk};

const CHUNK: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };

fn blueprint(id: &str) -> EntityBlueprint {
    EntityBlueprint {
        id: id.to_owned(),
        asset: EntityAsset {
            sprite: format!("/assets/{id}.svg"),
            reflection: None,
            color_replacements: None,
            sway: None,
            contact_shadow: None,
        },
        shape: EntityShape {
            height: 1,
            length: 1,
            axis: EntityLengthAxis::X,
            collision: vec![0.5],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            road_access: false,
        },
    }
}

fn world() -> (ChunkManager, Dressing) {
    let catalog = EntityCatalog {
        schema_version: 1,
        entities: vec![blueprint("tree"), blueprint("pier_x"), blueprint("pier_y")],
    };
    let generator = crate::terrain::TerrainGenerator::new(crate::terrain::TerrainConfig::default())
        .expect("the default terrain configuration is valid");
    let mut manager = ChunkManager::new(generator, catalog);
    manager.load_columns(CHUNK, flat_chunk(CHUNK, 0, TerrainMaterial::Grass));
    (manager, Dressing::default())
}

#[test]
fn a_raise_that_repeats_lifts_the_column_once_per_stroke() {
    let (mut manager, mut dressing) = world();

    let stroke = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Raise {
            at: [4, 4],
            times: 3,
        },
    )
    .expect("a raise on a loaded cell is applied");

    assert_eq!(stroke, MakerStroke::Terrain);
    assert_eq!(
        manager
            .column_at(4, 4)
            .expect("the cell is loaded")
            .elevation,
        3
    );
}

#[test]
fn a_surface_edit_paints_the_material_the_scene_names() {
    let (mut manager, mut dressing) = world();

    apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Surface {
            at: [5, 5],
            material: TerrainMaterial::Sand,
        },
    )
    .expect("sand is a surface");

    assert_eq!(
        manager.column_at(5, 5).expect("the cell is loaded").surface,
        TerrainMaterial::Sand
    );
}

#[test]
fn a_place_edit_puts_the_blueprint_the_scene_names_on_the_cell() {
    let (mut manager, mut dressing) = world();

    let stroke = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Place {
            at: [6, 6],
            blueprint: "tree".to_owned(),
            turned: false,
        },
    )
    .expect("tree is in the catalog");

    assert_eq!(stroke, MakerStroke::Entities);
    let standing = manager.entities_chunk(CHUNK).expect("the chunk is loaded");
    assert_eq!(standing.len(), 1);
    assert_eq!(standing[0].type_(), "tree");
}

#[test]
fn a_turned_place_reaches_for_the_blueprints_sibling_along_the_other_axis() {
    let (manager, _) = world();

    let turned = blueprint_index(manager.catalog(), "pier_x", true).expect("pier_y is its sibling");

    assert_eq!(manager.catalog().entities[turned].id, "pier_y");
}

#[test]
fn a_blueprint_with_no_axis_in_its_name_cannot_be_turned() {
    let (manager, _) = world();

    let refused =
        blueprint_index(manager.catalog(), "tree", true).expect_err("a tree stands one way");

    assert!(refused.contains("no axis"), "{refused}");
}

#[test]
fn a_blueprint_the_catalog_does_not_have_is_named_in_the_refusal() {
    let (mut manager, mut dressing) = world();

    let refused = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Place {
            at: [6, 6],
            blueprint: "longhouse".to_owned(),
            turned: false,
        },
    )
    .expect_err("the catalog has no longhouse");

    assert!(refused.contains("longhouse"), "{refused}");
}

#[test]
fn an_edit_outside_the_loaded_world_changes_nothing_and_says_so() {
    let (mut manager, mut dressing) = world();

    let stroke = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Raise {
            at: [9000, 9000],
            times: 1,
        },
    )
    .expect("a cell outside the world is not a scene error");

    assert_eq!(stroke, MakerStroke::Nothing);
}

#[test]
fn a_tint_and_a_top_are_written_as_dressing() {
    let (mut manager, mut dressing) = world();

    let tint = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Tint {
            at: [7, 7],
            zone: 2,
        },
    )
    .expect("a tint is applied");
    let top = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Top {
            at: [7, 8],
            variant: Some(1),
        },
    )
    .expect("a top is applied");

    assert_eq!(tint, MakerStroke::Dressing);
    assert_eq!(top, MakerStroke::Dressing);
    assert_eq!(dressing.tint(WorldCoord { x: 7, y: 7 }), Some(2));
    assert_eq!(dressing.top(WorldCoord { x: 7, y: 8 }), Some(Some(1)));
}

#[test]
fn an_erase_takes_away_what_a_place_put_down() {
    let (mut manager, mut dressing) = world();
    apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Place {
            at: [8, 8],
            blueprint: "tree".to_owned(),
            turned: false,
        },
    )
    .expect("tree is in the catalog");

    let stroke = apply_edit(
        &mut manager,
        &mut dressing,
        &SceneEdit::Erase { at: [8, 8] },
    )
    .expect("an erase is applied");

    assert_eq!(stroke, MakerStroke::Entities);
    assert!(
        manager
            .entities_chunk(CHUNK)
            .expect("the chunk is loaded")
            .is_empty()
    );
}

#[test]
fn the_more_telling_stroke_of_a_repeat_is_the_one_reported() {
    assert_eq!(
        stronger(MakerStroke::Nothing, MakerStroke::Terrain),
        MakerStroke::Terrain
    );
    assert_eq!(
        stronger(MakerStroke::Terrain, MakerStroke::Nothing),
        MakerStroke::Terrain
    );
    assert_eq!(
        stronger(MakerStroke::Dressing, MakerStroke::Entities),
        MakerStroke::Entities
    );
}

#[test]
fn every_edit_takes_the_tool_the_editor_would_take_for_it() {
    let (manager, _) = world();
    let catalog = manager.catalog();
    let tool = |edit: &SceneEdit| brush_for(catalog, edit).expect("the edit has a brush").tool;

    assert_eq!(
        tool(&SceneEdit::Raise {
            at: [0, 0],
            times: 1
        }),
        MakerTool::Raise
    );
    assert_eq!(
        tool(&SceneEdit::Lower {
            at: [0, 0],
            times: 1
        }),
        MakerTool::Lower
    );
    assert_eq!(
        tool(&SceneEdit::Surface {
            at: [0, 0],
            material: TerrainMaterial::Path
        }),
        MakerTool::Surface
    );
    assert_eq!(
        tool(&SceneEdit::Tint {
            at: [0, 0],
            zone: 0
        }),
        MakerTool::Tint
    );
    assert_eq!(
        tool(&SceneEdit::Top {
            at: [0, 0],
            variant: None
        }),
        MakerTool::Top
    );
    assert_eq!(tool(&SceneEdit::Erase { at: [0, 0] }), MakerTool::Erase);
}
