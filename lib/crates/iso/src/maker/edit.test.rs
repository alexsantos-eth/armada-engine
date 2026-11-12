use super::*;
use crate::entities::{
    EntityAsset, EntityBlueprint, EntityCatalog, EntityLengthAxis, EntityPlacement, EntityShape,
};
use crate::grid::{ChunkCoord, WorldCoord};
use crate::maker::MAKER_TOOLS;
use crate::terrain::{TerrainMaterial, flat_chunk};
use crate::world::ChunkManager;

const CHUNK: ChunkCoord = ChunkCoord { cx: 0, cy: 0 };

fn blueprint(id: &str, length: i32, axis: EntityLengthAxis) -> EntityBlueprint {
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
            length,
            axis,
            collision: vec![0.5; length as usize],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass; length as usize],
            road_access: false,
        },
    }
}

fn maker_world() -> (ChunkManager, Dressing) {
    let catalog = EntityCatalog {
        schema_version: 1,
        entities: vec![
            blueprint("tree", 1, EntityLengthAxis::X),
            blueprint("hotel_x", 2, EntityLengthAxis::X),
            blueprint("hotel_y", 2, EntityLengthAxis::Y),
        ],
    };
    let generator = crate::terrain::TerrainGenerator::new(crate::terrain::TerrainConfig::default())
        .expect("the default terrain configuration is valid");
    let mut manager = ChunkManager::new(generator, catalog);
    manager.load_columns(CHUNK, flat_chunk(CHUNK, 0, TerrainMaterial::Grass));
    (manager, Dressing::default())
}

fn cell(x: i32, y: i32) -> WorldCoord {
    WorldCoord { x, y }
}

fn stroke(tool: MakerTool) -> MakerBrush {
    MakerBrush {
        tool,
        ..MakerBrush::default()
    }
}

#[test]
fn raising_a_column_lifts_it_one_block() {
    let (mut manager, mut dressing) = maker_world();
    let done = apply_brush(
        &mut manager,
        &mut dressing,
        &stroke(MakerTool::Raise),
        cell(4, 4),
    );
    assert_eq!(done, MakerStroke::Terrain);
    assert_eq!(manager.column_at(4, 4).map(|c| c.elevation), Some(1));
}

#[test]
fn raising_stops_at_the_ceiling_the_maker_allows() {
    let (mut manager, mut dressing) = maker_world();
    let brush = stroke(MakerTool::Raise);
    for _ in 0..MAKER_MAX_ELEVATION + 4 {
        apply_brush(&mut manager, &mut dressing, &brush, cell(4, 4));
    }
    assert_eq!(
        manager.column_at(4, 4).map(|c| c.elevation),
        Some(MAKER_MAX_ELEVATION)
    );
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(4, 4)),
        MakerStroke::Nothing
    );
}

#[test]
fn lowering_past_the_shore_turns_the_column_to_water() {
    let (mut manager, mut dressing) = maker_world();
    let brush = stroke(MakerTool::Lower);
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(4, 4)),
        MakerStroke::Terrain
    );
    let column = manager.column_at(4, 4).expect("the column is loaded");
    assert_eq!(column.elevation, -1);
    assert_eq!(column.surface, TerrainMaterial::Water);
    assert!(!column.walkable);
}

#[test]
fn lowering_stops_at_the_floor_the_maker_allows() {
    let (mut manager, mut dressing) = maker_world();
    let brush = stroke(MakerTool::Lower);
    for _ in 0..10 {
        apply_brush(&mut manager, &mut dressing, &brush, cell(4, 4));
    }
    assert_eq!(
        manager.column_at(4, 4).map(|c| c.elevation),
        Some(MAKER_MIN_ELEVATION)
    );
}

#[test]
fn raising_water_back_to_the_shore_makes_it_sand() {
    let (mut manager, mut dressing) = maker_world();
    manager
        .edit_column(cell(4, 4), -1, TerrainMaterial::Water)
        .expect("the column is loaded");
    apply_brush(
        &mut manager,
        &mut dressing,
        &stroke(MakerTool::Raise),
        cell(4, 4),
    );
    let column = manager.column_at(4, 4).expect("the column is loaded");
    assert_eq!(column.elevation, 0);
    assert_eq!(column.surface, TerrainMaterial::Sand);
}

#[test]
fn painting_a_path_keeps_the_level_and_the_material_sticks() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Surface,
        surface: TerrainMaterial::Path,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &brush, cell(7, 7));
    let column = manager.column_at(7, 7).expect("the column is loaded");
    assert_eq!(column.surface, TerrainMaterial::Path);
    assert_eq!(column.elevation, 0);
}

#[test]
fn painting_water_sinks_the_column_and_painting_land_lifts_it_back() {
    let (mut manager, mut dressing) = maker_world();
    let water = MakerBrush {
        tool: MakerTool::Surface,
        surface: TerrainMaterial::Water,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &water, cell(7, 7));
    assert_eq!(manager.column_at(7, 7).map(|c| c.elevation), Some(-1));
    let grass = MakerBrush {
        tool: MakerTool::Surface,
        surface: TerrainMaterial::Grass,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &grass, cell(7, 7));
    let column = manager.column_at(7, 7).expect("the column is loaded");
    assert_eq!(column.elevation, 0);
    assert_eq!(column.surface, TerrainMaterial::Grass);
}

#[test]
fn painting_the_same_surface_again_changes_nothing() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Surface,
        surface: TerrainMaterial::Grass,
        ..MakerBrush::default()
    };
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(7, 7)),
        MakerStroke::Nothing
    );
}

#[test]
fn a_tint_stroke_writes_the_zone_of_the_brush() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Tint,
        tint: 3,
        ..MakerBrush::default()
    };
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(2, 9)),
        MakerStroke::Dressing
    );
    assert_eq!(dressing.tint(cell(2, 9)), Some(3));
}

#[test]
fn a_grass_stroke_writes_the_top_of_the_brush_and_the_plain_block() {
    let (mut manager, mut dressing) = maker_world();
    let grown = MakerBrush {
        tool: MakerTool::Top,
        top: Some(2),
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &grown, cell(2, 9));
    assert_eq!(dressing.top(cell(2, 9)), Some(Some(2)));
    let plain = MakerBrush {
        tool: MakerTool::Top,
        top: None,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &plain, cell(2, 9));
    assert_eq!(dressing.top(cell(2, 9)), Some(None));
}

#[test]
fn a_placing_stroke_puts_the_chosen_blueprint_down() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Place,
        blueprint: 2,
        ..MakerBrush::default()
    };
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(10, 10)),
        MakerStroke::Entities
    );
    let placed = manager.entities_chunk(CHUNK).expect("the chunk is loaded");
    assert_eq!(placed.len(), 1);
    assert_eq!(placed[0].type_(), "hotel_y");
    assert_eq!((placed[0].x(), placed[0].y()), (10, 10));
}

#[test]
fn a_placing_stroke_is_refused_where_the_blueprint_does_not_fit() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Place,
        blueprint: 0,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &brush, cell(10, 10));
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(10, 10)),
        MakerStroke::Nothing
    );
    assert_eq!(manager.entities_chunk(CHUNK).map(<[_]>::len), Some(1));
}

#[test]
fn a_placing_stroke_with_no_such_blueprint_does_nothing() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Place,
        blueprint: 99,
        ..MakerBrush::default()
    };
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(10, 10)),
        MakerStroke::Nothing
    );
}

#[test]
fn an_erasing_stroke_takes_the_entity_first_and_the_dressing_after() {
    let (mut manager, mut dressing) = maker_world();
    let place = MakerBrush {
        tool: MakerTool::Place,
        blueprint: 0,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &place, cell(10, 10));
    dressing.set_tint(cell(10, 10), Some(1));
    let erase = stroke(MakerTool::Erase);
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &erase, cell(10, 10)),
        MakerStroke::Entities
    );
    assert_eq!(dressing.tint(cell(10, 10)), Some(1));
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &erase, cell(10, 10)),
        MakerStroke::Dressing
    );
    assert_eq!(dressing.tint(cell(10, 10)), None);
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &erase, cell(10, 10)),
        MakerStroke::Nothing
    );
}

#[test]
fn a_stroke_outside_the_edited_chunk_does_nothing() {
    let (mut manager, mut dressing) = maker_world();
    for tool in MAKER_TOOLS {
        assert_eq!(
            apply_brush(&mut manager, &mut dressing, &stroke(tool), cell(400, 400)),
            MakerStroke::Nothing,
            "{tool:?} reached a cell with no column"
        );
    }
}

#[test]
fn a_stroke_only_writes_a_terrain_change_it_really_made() {
    let (mut manager, mut dressing) = maker_world();
    let brush = MakerBrush {
        tool: MakerTool::Tint,
        tint: 0,
        ..MakerBrush::default()
    };
    apply_brush(&mut manager, &mut dressing, &brush, cell(1, 1));
    assert_eq!(
        apply_brush(&mut manager, &mut dressing, &brush, cell(1, 1)),
        MakerStroke::Nothing
    );
}
