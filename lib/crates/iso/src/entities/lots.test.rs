use super::*;
use crate::entities::blueprint::*;
use crate::entities::validation::CATALOG_SCHEMA_VERSION;
use crate::grid::{WorldCoord, WorldRect};
use crate::settlements::{WorldSettlements, ZoneRole, parse_settlements};
use crate::terrain::TerrainMaterial;

fn blueprint(id: &str, length: i32, axis: EntityLengthAxis) -> EntityBlueprint {
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
            effect: None,
        },
        shape: EntityShape {
            height: 2,
            length,
            axis,
            collision: vec![1.0; length as usize],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass; length as usize],
            additional_surfaces: vec![],
            road_access: true,
        },
    }
}

fn catalog() -> EntityCatalog {
    EntityCatalog {
        schema_version: CATALOG_SCHEMA_VERSION,
        entities: vec![
            blueprint("hut", 1, EntityLengthAxis::X),
            blueprint("cottage", 1, EntityLengthAxis::X),
            blueprint("mead_hall_x", 2, EntityLengthAxis::X),
            blueprint("mead_hall_y", 2, EntityLengthAxis::Y),
        ],
    }
}

fn settlements(catalog: &EntityCatalog) -> WorldSettlements {
    settlements_with(catalog, false)
}

fn settlements_with(catalog: &EntityCatalog, uniform: bool) -> WorldSettlements {
    let wfc = crate::entities::wfc::parse_wfc(
        r#"{ "schemaVersion": 2, "emptyWeight": 10.0,
             "weights": { "hut": 1.0, "cottage": 1.0, "mead_hall_x": 1.0, "mead_hall_y": 1.0 },
             "families": { "mead_hall": ["mead_hall_x", "mead_hall_y"] } }"#,
        catalog,
        None,
    )
    .expect("fixture wfc validates");
    let json = format!(
        r#"{{
      "schemaVersion": 2, "spacing": 60, "chance": 1.0,
      "layout": {{ "blocks": {{ "min": 3, "max": 3 }}, "block": 5, "street": 1, "edge": 2,
                  "exit": 4, "trim": 0.0, "frontPark": 0.0, "lots": {{ "min": 3, "max": 3 }} }},
      "wilderness": {{ "default": 1.0 }},
      "greens": {{ "spacing": 6.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                  "patio": {{ "chance": 0.0, "min": 0, "max": 0, "reach": 1, "groveChance": 0.0 }} }},
      "zones": [
        {{ "id": "center", "role": "center", "lots": {{ "mead_hall": 1000.0, "cottage": 1.0 }} }},
        {{ "id": "homes", "role": "residential", "share": 1.0, "uniform": {uniform},
           "lots": {{ "hut": 1.0, "cottage": 1.0 }} }},
        {{ "id": "park", "role": "park", "share": 0.0 }},
        {{ "id": "edge", "role": "edge" }},
        {{ "id": "street", "role": "street" }}
      ]
    }}"#
    );
    WorldSettlements::new(
        11,
        &parse_settlements(&json, catalog, &wfc).expect("fixture settlements validate"),
    )
}

fn grass(area: WorldRect) -> Vec<TerrainColumn> {
    (area.min_x..=area.max_x)
        .flat_map(|x| {
            (area.min_y..=area.max_y).map(move |y| TerrainColumn {
                coord: WorldCoord { x, y },
                elevation: 0,
                surface: TerrainMaterial::Grass,
                walkable: true,
            })
        })
        .collect()
}

fn site_area(field: &WorldSettlements) -> WorldRect {
    let spacing = field.catalog().spacing;
    WorldRect {
        min_x: 0,
        min_y: 0,
        max_x: spacing - 1,
        max_y: spacing - 1,
    }
}

fn raise(columns: &[TerrainColumn], field: &WorldSettlements) -> Vec<Entity> {
    let mut placed = SpatialIndex::new();
    raise_lots(
        columns,
        &catalog(),
        &mut placed,
        LotsContent {
            settlements: field,
            seed: 3,
        },
    )
}

#[test]
fn every_lot_raises_one_building_on_its_anchor() {
    let catalog = catalog();
    let field = settlements(&catalog);
    let area = site_area(&field);
    let lots = field.lots_in(area);
    let built = raise(&grass(area), &field);
    assert_eq!(built.len(), lots.len());
    for lot in &lots {
        assert!(
            built
                .iter()
                .any(|entity| entity.x() == lot.anchor.x && entity.y() == lot.anchor.y),
            "{lot:?}"
        );
    }
}

#[test]
fn a_lot_raises_only_what_its_zone_weighs() {
    let catalog = catalog();
    let field = settlements(&catalog);
    let area = site_area(&field);
    let centre = field.catalog().zone_of(ZoneRole::Center);
    let built = raise(&grass(area), &field);
    for lot in field.lots_in(area) {
        let entity = built
            .iter()
            .find(|entity| entity.x() == lot.anchor.x && entity.y() == lot.anchor.y)
            .expect("every lot is raised");
        if lot.zone == centre {
            assert!(
                entity.type_().starts_with("mead_hall") || entity.type_() == "cottage",
                "{}",
                entity.type_()
            );
        } else {
            assert!(
                ["hut", "cottage"].contains(&entity.type_()),
                "{}",
                entity.type_()
            );
        }
    }
}

#[test]
fn a_building_that_does_not_fit_gives_way_to_the_next_one_its_zone_weighs() {
    let catalog = catalog();
    let field = settlements(&catalog);
    let centre = field.catalog().zone_of(ZoneRole::Center);
    let lot = field
        .lots_in(site_area(&field))
        .into_iter()
        .find(|lot| lot.zone == centre)
        .expect("the centre raises a lot");
    let clipped = WorldRect {
        min_x: lot.anchor.x - 6,
        min_y: lot.anchor.y - 6,
        max_x: lot.anchor.x,
        max_y: lot.anchor.y,
    };
    let built = raise(&grass(clipped), &field);
    let hall = built
        .iter()
        .find(|entity| entity.x() == lot.anchor.x && entity.y() == lot.anchor.y)
        .expect("the lot still raises a building");
    assert_eq!(hall.type_(), "cottage");
}

#[test]
fn a_lot_on_water_raises_nothing() {
    let catalog = catalog();
    let field = settlements(&catalog);
    let area = site_area(&field);
    let lots = field.lots_in(area);
    let flooded = lots[0].anchor;
    let mut columns = grass(area);
    for column in columns.iter_mut().filter(|column| column.coord == flooded) {
        column.surface = TerrainMaterial::Water;
        column.elevation = -1;
        column.walkable = false;
    }
    let built = raise(&columns, &field);
    assert_eq!(built.len(), lots.len() - 1);
    assert!(
        built
            .iter()
            .all(|entity| (entity.x(), entity.y()) != (flooded.x, flooded.y))
    );
}

#[test]
fn raising_the_same_chunk_twice_raises_the_same_buildings() {
    let catalog = catalog();
    let field = settlements(&catalog);
    let columns = grass(site_area(&field));
    assert!(raise(&columns, &field) == raise(&columns, &field));
}

#[test]
fn nothing_is_raised_where_no_settlement_stands() {
    let catalog = catalog();
    let field = settlements(&catalog);
    let spacing = field.catalog().spacing;
    let bounds = field
        .lots_in(site_area(&field))
        .iter()
        .map(|lot| lot.anchor.x)
        .min()
        .expect("lots");
    let wild = WorldRect {
        min_x: 0,
        min_y: 0,
        max_x: bounds - 6,
        max_y: spacing - 1,
    };
    assert!(raise(&grass(wild), &field).is_empty());
}

/// The building type of every lot, grouped by block.
fn types_by_block(
    field: &WorldSettlements,
    built: &[Entity],
) -> std::collections::BTreeMap<(i32, i32), Vec<String>> {
    let homes = field.catalog().zone_of(ZoneRole::Residential);
    let mut blocks = std::collections::BTreeMap::new();
    for lot in field.lots_in(site_area(field)) {
        if lot.zone != homes {
            continue;
        }
        let entity = built
            .iter()
            .find(|entity| (entity.x(), entity.y()) == (lot.anchor.x, lot.anchor.y))
            .expect("every lot is raised");
        blocks
            .entry((lot.block.x, lot.block.y))
            .or_insert_with(Vec::new)
            .push(entity.type_().to_owned());
    }
    blocks
}

#[test]
fn a_uniform_zone_raises_one_building_type_across_each_block() {
    let catalog = catalog();
    let field = settlements_with(&catalog, true);
    let built = raise(&grass(site_area(&field)), &field);
    let blocks = types_by_block(&field, &built);
    assert!(!blocks.is_empty());
    for (block, types) in &blocks {
        assert!(
            types.iter().all(|kind| kind == &types[0]),
            "{block:?}: {types:?}"
        );
    }
}

#[test]
fn a_mixed_zone_varies_its_buildings_within_a_block() {
    let catalog = catalog();
    let field = settlements_with(&catalog, false);
    let built = raise(&grass(site_area(&field)), &field);
    let blocks = types_by_block(&field, &built);
    assert!(
        blocks
            .values()
            .any(|types| types.iter().any(|kind| kind != &types[0])),
        "{blocks:?}"
    );
}
