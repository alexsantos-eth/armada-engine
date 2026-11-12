use super::*;
use crate::entities::{EntityAsset, EntityBlueprint, EntityCatalog, EntityPlacement, EntityShape};
use crate::terrain::TerrainMaterial;

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
            axis: crate::entities::EntityLengthAxis::X,
            collision: vec![0.5],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            road_access: false,
        },
    }
}

fn catalog(ids: &[&str]) -> EntityCatalog {
    EntityCatalog {
        schema_version: 1,
        entities: ids.iter().map(|id| blueprint(id)).collect(),
    }
}

#[test]
fn the_brush_starts_raising_the_ground_on_grass() {
    let brush = MakerBrush::default();
    assert_eq!(brush.tool, MakerTool::Raise);
    assert_eq!(brush.surface, TerrainMaterial::Grass);
    assert_eq!(brush.top, None);
    assert_eq!(brush.blueprint, 0);
}

#[test]
fn turning_a_name_swaps_the_axis_segment() {
    assert_eq!(
        turned_blueprint("apartments_x").as_deref(),
        Some("apartments_y")
    );
    assert_eq!(turned_blueprint("hotel_y").as_deref(), Some("hotel_x"));
    assert_eq!(
        turned_blueprint("pier_x_reverse").as_deref(),
        Some("pier_y_reverse")
    );
}

#[test]
fn a_name_without_an_axis_segment_cannot_be_turned() {
    assert_eq!(turned_blueprint("house"), None);
    assert_eq!(turned_blueprint("tree_2"), None);
    assert_eq!(turned_blueprint("skyscraper"), None);
}

#[test]
fn turning_the_brush_moves_it_to_the_sibling_in_the_catalog() {
    let catalog = catalog(&["house", "hotel_x", "hotel_y"]);
    let mut brush = MakerBrush {
        blueprint: 1,
        ..MakerBrush::default()
    };
    assert!(brush.turn(&catalog));
    assert_eq!(brush.blueprint, 2);
    assert!(brush.turn(&catalog));
    assert_eq!(brush.blueprint, 1);
}

#[test]
fn turning_a_brush_whose_sibling_is_missing_leaves_it_where_it_was() {
    let catalog = catalog(&["house", "hotel_x"]);
    let mut brush = MakerBrush {
        blueprint: 1,
        ..MakerBrush::default()
    };
    assert!(!brush.turn(&catalog));
    assert_eq!(brush.blueprint, 1);
    brush.blueprint = 0;
    assert!(!brush.turn(&catalog));
    assert_eq!(brush.blueprint, 0);
}

#[test]
fn turning_an_empty_catalog_does_nothing() {
    let catalog = catalog(&[]);
    let mut brush = MakerBrush::default();
    assert!(!brush.turn(&catalog));
}

#[test]
fn the_panel_offers_every_surface_the_terrain_knows() {
    assert_eq!(MAKER_SURFACES.len(), 6);
    assert!(MAKER_SURFACES.contains(&TerrainMaterial::Path));
    assert!(MAKER_SURFACES.contains(&TerrainMaterial::Stairs));
    assert!(MAKER_SURFACES.contains(&TerrainMaterial::Water));
}

#[test]
fn the_panel_offers_every_tool_once() {
    let mut tools = MAKER_TOOLS;
    tools.sort_unstable_by_key(|tool| format!("{tool:?}"));
    let mut unique = tools.to_vec();
    unique.dedup();
    assert_eq!(unique.len(), MAKER_TOOLS.len());
    assert_eq!(MAKER_TOOLS.len(), 7);
}
