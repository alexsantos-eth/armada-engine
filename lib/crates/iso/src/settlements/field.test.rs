use super::*;
use crate::entities::EntityCatalog;
use crate::entities::blueprint::*;
use crate::settlements::parse_settlements;
use crate::terrain::TerrainMaterial;

fn entities() -> EntityCatalog {
    let blueprint = |id: &str| EntityBlueprint {
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
            collision: vec![1.0],
        },
        placement: EntityPlacement {
            surfaces: vec![TerrainMaterial::Grass],
            additional_surfaces: vec![],
            road_access: false,
        },
    };
    EntityCatalog {
        schema_version: crate::entities::validation::CATALOG_SCHEMA_VERSION,
        entities: ["hut", "mead_hall", "tree"]
            .into_iter()
            .map(blueprint)
            .collect(),
    }
}

fn wfc() -> crate::entities::wfc::WfcCatalog {
    crate::entities::wfc::parse_wfc(
        r#"{
            "schemaVersion": 2,
            "emptyWeight": 100.0,
            "weights": { "hut": 1.0, "mead_hall": 1.0, "tree": 1.0 }
        }"#,
        &entities(),
        None,
    )
    .expect("fixture wfc validates")
}

struct Fixture {
    chance: f64,
    greens: &'static str,
    blocks: (i32, i32),
    trim: f64,
    front_park: f64,
    lots: (u32, u32),
    shapes: (f64, f64, f64),
    split: f64,
    verge: bool,
}

impl Default for Fixture {
    fn default() -> Self {
        Self {
            chance: 1.0,
            greens: "1.0",
            blocks: (3, 3),
            trim: 0.0,
            front_park: 0.0,
            lots: (1, 2),
            shapes: (0.0, 0.0, 0.0),
            split: 0.0,
            verge: false,
        }
    }
}

fn catalog_of(fixture: Fixture) -> SettlementCatalog {
    let Fixture {
        chance,
        greens,
        blocks,
        trim,
        front_park,
        lots,
        shapes,
        split,
        verge,
    } = fixture;
    let verge = if verge {
        r#",
            { "id": "verge", "role": "verge", "greens": 0.0 }"#
    } else {
        ""
    };
    let json = format!(
        r#"{{
          "schemaVersion": 2,
          "spacing": 60,
          "chance": {chance},
          "layout": {{ "blocks": {{ "min": {}, "max": {} }}, "block": 5, "street": 1, "edge": 2,
                       "exit": 4, "trim": {trim}, "frontPark": {front_park},
                       "lots": {{ "min": {}, "max": {} }},
                       "shapes": {{ "notch": {}, "shrink": {}, "merge": {}, "split": {split} }} }},
          "wilderness": {{ "default": 1.0, "greens": 0.0, "weights": {{ "mead_hall": 0.0 }} }},
          "greens": {{ "spacing": 6.0, "tight": 2.0, "near": 3.0, "far": 9.0, "front": 2,
                       "patio": {{ "chance": 0.8, "min": 2, "max": 4, "reach": 2, "groveChance": 0.3 }} }},
          "zones": [
            {{ "id": "center", "role": "center", "greens": 0.0,
               "weights": {{ "tree": 1.0 }}, "lots": {{ "mead_hall": 1.0 }} }},
            {{ "id": "homes", "role": "residential", "share": 1.0, "greens": 0.5,
               "lots": {{ "hut": 1.0 }} }},
            {{ "id": "park", "role": "park", "share": 1.0, "greens": {greens},
               "weights": {{ "tree": 2.0 }} }},
            {{ "id": "edge", "role": "edge", "greens": 0.5 }},
            {{ "id": "street", "role": "street" }}{verge}
          ]
        }}"#,
        blocks.0, blocks.1, lots.0, lots.1, shapes.0, shapes.1, shapes.2
    );
    parse_settlements(&json, &entities(), &wfc()).expect("the fixture validates")
}

fn catalog() -> SettlementCatalog {
    catalog_of(Fixture::default())
}

fn field_of(catalog: &SettlementCatalog) -> WorldSettlements {
    WorldSettlements::new(99, catalog)
}

/// The settlement of the candidate site `(site_x, site_y)`, found by scanning its cell.
fn settlement_in(world: &WorldSettlements, site_x: i32, site_y: i32) -> Option<Settlement> {
    let spacing = world.catalog().spacing;
    for y in site_y * spacing..(site_y + 1) * spacing {
        for x in site_x * spacing..(site_x + 1) * spacing {
            if let Some(settlement) = world.settlement_at(x, y) {
                return Some(settlement);
            }
        }
    }
    None
}

fn some_settlement(world: &WorldSettlements) -> Settlement {
    settlement_in(world, 0, 0).expect("every site hosts a settlement in the fixture")
}

fn zone(world: &WorldSettlements, role: ZoneRole) -> usize {
    world.catalog().zone_of(role)
}

/// Every column of block `(i, j)`.
fn block_cells(settlement: &Settlement, i: i32, j: i32) -> Vec<WorldCoord> {
    let rect = settlement.block_rect(i, j);
    (rect.min_y..=rect.max_y)
        .flat_map(|y| (rect.min_x..=rect.max_x).map(move |x| WorldCoord { x, y }))
        .collect()
}

#[test]
fn every_site_lays_a_settlement_that_stays_inside_its_own_cell() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let margin = catalog.layout.margin();
    for site_y in -2..2 {
        for site_x in -2..2 {
            let settlement = settlement_in(&world, site_x, site_y).expect("chance is one");
            let grid = settlement.bounds();
            assert!(grid.min_x - margin >= site_x * catalog.spacing);
            assert!(grid.min_y - margin >= site_y * catalog.spacing);
            assert!(grid.max_x + margin < (site_x + 1) * catalog.spacing);
            assert!(grid.max_y + margin < (site_y + 1) * catalog.spacing);
        }
    }
}

#[test]
fn the_grid_has_as_many_blocks_as_the_layout_allows() {
    let catalog = catalog_of(Fixture {
        blocks: (2, 4),
        ..Fixture::default()
    });
    let world = field_of(&catalog);
    for site in 0..8 {
        let settlement = settlement_in(&world, site, 0).expect("chance is one");
        assert!((2..=4).contains(&settlement.cols()));
        assert!((2..=4).contains(&settlement.rows()));
        let grid = settlement.bounds();
        assert_eq!(grid.max_x - grid.min_x + 1, settlement.cols() * 6 + 1);
        assert_eq!(grid.max_y - grid.min_y + 1, settlement.rows() * 6 + 1);
    }
}

#[test]
fn every_block_is_ringed_by_streets() {
    let world = field_of(&catalog());
    let street = zone(&world, ZoneRole::Street);
    let settlement = some_settlement(&world);
    for j in 0..settlement.rows() {
        for i in 0..settlement.cols() {
            let rect = settlement.block_rect(i, j);
            for x in rect.min_x - 1..=rect.max_x + 1 {
                assert_eq!(world.zone_at(x, rect.min_y - 1), Some(street));
                assert_eq!(world.zone_at(x, rect.max_y + 1), Some(street));
            }
            for y in rect.min_y - 1..=rect.max_y + 1 {
                assert_eq!(world.zone_at(rect.min_x - 1, y), Some(street));
                assert_eq!(world.zone_at(rect.max_x + 1, y), Some(street));
            }
        }
    }
}

#[test]
fn every_column_of_a_block_belongs_to_the_zone_it_was_dealt() {
    let world = field_of(&catalog());
    let settlement = some_settlement(&world);
    for j in 0..settlement.rows() {
        for i in 0..settlement.cols() {
            let dealt = settlement.block_zone(i, j).expect("nothing is trimmed");
            for cell in block_cells(&settlement, i, j) {
                assert_eq!(world.zone_at(cell.x, cell.y), Some(dealt), "{cell:?}");
            }
        }
    }
}

#[test]
fn the_middle_block_is_the_centre_and_the_rest_are_homes_or_parks() {
    let world = field_of(&catalog());
    let settlement = some_settlement(&world);
    let (homes, park) = (
        zone(&world, ZoneRole::Residential),
        zone(&world, ZoneRole::Park),
    );
    for j in 0..3 {
        for i in 0..3 {
            let dealt = settlement.block_zone(i, j).expect("nothing is trimmed");
            if (i, j) == (1, 1) {
                assert_eq!(dealt, zone(&world, ZoneRole::Center));
            } else {
                assert!(dealt == homes || dealt == park);
            }
        }
    }
}

#[test]
fn the_blocks_facing_the_camera_turn_into_parks() {
    let catalog = catalog_of(Fixture {
        front_park: 1.0,
        ..Fixture::default()
    });
    let world = field_of(&catalog);
    let park = zone(&world, ZoneRole::Park);
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 1).expect("chance is one");
        for k in 0..3 {
            assert_eq!(settlement.block_zone(k, 0), Some(park));
            assert_eq!(settlement.block_zone(0, k), Some(park));
        }
    }
}

#[test]
fn a_trimmed_corner_turns_into_edge_and_takes_its_outer_streets_along() {
    let catalog = catalog_of(Fixture {
        trim: 1.0,
        ..Fixture::default()
    });
    let world = field_of(&catalog);
    let edge = zone(&world, ZoneRole::Edge);
    let settlement = some_settlement(&world);
    let grid = settlement.bounds();
    for (i, j) in [(0, 0), (2, 0), (0, 2), (2, 2)] {
        assert_eq!(settlement.block_zone(i, j), None);
        for cell in block_cells(&settlement, i, j) {
            assert_eq!(world.zone_at(cell.x, cell.y), Some(edge));
        }
    }
    for (x, y) in [
        (grid.min_x, grid.min_y),
        (grid.max_x, grid.min_y),
        (grid.min_x, grid.max_y),
        (grid.max_x, grid.max_y),
    ] {
        assert_eq!(world.zone_at(x, y), Some(edge));
    }
    assert!(settlement.block_zone(1, 0).is_some());
    assert!(settlement.block_zone(1, 1).is_some());
}

#[test]
fn every_side_opens_one_street_out_into_the_wild() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let street = zone(&world, ZoneRole::Street);
    let reach = catalog.layout.exit;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 2).expect("chance is one");
        let grid = settlement.bounds();
        let column_exits = |x: i32| {
            (grid.min_y..=grid.max_y)
                .filter(|&y| world.zone_at(x, y) == Some(street))
                .count()
        };
        let row_exits = |y: i32| {
            (grid.min_x..=grid.max_x)
                .filter(|&x| world.zone_at(x, y) == Some(street))
                .count()
        };
        assert_eq!(column_exits(grid.min_x - reach), 1);
        assert_eq!(column_exits(grid.max_x + reach), 1);
        assert_eq!(row_exits(grid.min_y - reach), 1);
        assert_eq!(row_exits(grid.max_y + reach), 1);
        assert_eq!(column_exits(grid.min_x - reach - 1), 0);
    }
}

#[test]
fn the_open_band_around_the_streets_is_edge_and_beyond_it_is_wild() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let edge = zone(&world, ZoneRole::Edge);
    let street = zone(&world, ZoneRole::Street);
    let settlement = some_settlement(&world);
    let grid = settlement.bounds();
    let band = catalog.layout.edge;
    for x in grid.min_x..=grid.max_x {
        for offset in 1..=band {
            let found = world.zone_at(x, grid.min_y - offset);
            assert!(found == Some(edge) || found == Some(street));
        }
        let beyond = world.zone_at(x, grid.min_y - band - 1);
        assert!(beyond.is_none() || beyond == Some(street));
    }
}

#[test]
fn every_lot_outside_a_park_stands_on_the_rim_beside_a_street_and_no_two_touch() {
    let world = field_of(&catalog());
    let street = zone(&world, ZoneRole::Street);
    let park = zone(&world, ZoneRole::Park);
    let mut seen = 0;
    for site in 0..8 {
        let settlement = settlement_in(&world, site, 3).expect("chance is one");
        let lots = settlement.lots();
        for lot in lots {
            seen += 1;
            let beside_street = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                .into_iter()
                .any(|(dx, dy)| {
                    world.zone_at(lot.anchor.x + dx, lot.anchor.y + dy) == Some(street)
                });
            assert!(beside_street || lot.zone == park, "{lot:?}");
            assert_eq!(world.zone_at(lot.anchor.x, lot.anchor.y), Some(lot.zone));
            for other in lots {
                let apart =
                    (lot.anchor.x - other.anchor.x).abs() + (lot.anchor.y - other.anchor.y).abs();
                assert_ne!(apart, 1, "{lot:?} touches {other:?}");
            }
        }
    }
    assert!(seen > 30, "the fixture raised only {seen} lots");
}

#[test]
fn every_block_but_a_park_raises_as_many_lots_as_the_layout_allows() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let layout = catalog.layout;
    let park = zone(&world, ZoneRole::Park);
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 4).expect("chance is one");
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                if settlement.block_zone(i, j) == Some(park) {
                    continue;
                }
                let rect = settlement.block_rect(i, j);
                let corner = WorldCoord {
                    x: rect.min_x,
                    y: rect.min_y,
                };
                let count = settlement
                    .lots()
                    .iter()
                    .filter(|lot| lot.block == corner)
                    .count() as u32;
                assert!(
                    (layout.lots_min..=layout.lots_max).contains(&count),
                    "block ({i}, {j}) raised {count} lots"
                );
            }
        }
        for lot in settlement.lots() {
            assert!((lot.block.x..lot.block.x + layout.block).contains(&lot.anchor.x));
            assert!((lot.block.y..lot.block.y + layout.block).contains(&lot.anchor.y));
        }
    }
}

#[test]
fn lots_in_an_area_are_the_lots_whose_anchor_falls_inside_it() {
    let world = field_of(&catalog());
    let settlement = some_settlement(&world);
    let grid = settlement.bounds();
    let half = WorldRect {
        min_x: grid.min_x,
        min_y: grid.min_y,
        max_x: (grid.min_x + grid.max_x) / 2,
        max_y: grid.max_y,
    };
    let expected: Vec<Lot> = settlement
        .lots()
        .iter()
        .copied()
        .filter(|lot| {
            (half.min_x..=half.max_x).contains(&lot.anchor.x)
                && (half.min_y..=half.max_y).contains(&lot.anchor.y)
        })
        .collect();
    let mut found = world.lots_in(half);
    found.sort_by_key(|lot| (lot.anchor.y, lot.anchor.x));
    let mut expected = expected;
    expected.sort_by_key(|lot| (lot.anchor.y, lot.anchor.x));
    assert_eq!(found, expected);
    assert!(!world.lots_in(grid).is_empty());
}

#[test]
fn outside_every_settlement_the_wilderness_profile_rules() {
    let catalog = catalog();
    let world = field_of(&catalog);
    let settlement = some_settlement(&world);
    let grid = settlement.bounds();
    let (x, y) = (grid.min_x - catalog.layout.margin() - 1, grid.min_y);
    assert_eq!(world.zone_at(x, y), None);
    assert_eq!(world.settlement_at(x, y), None);
    assert_eq!(world.profile_at(x, y), &catalog.wilderness);
}

#[test]
fn another_seed_moves_the_settlements() {
    let catalog = catalog();
    let one = WorldSettlements::new(1, &catalog);
    let two = WorldSettlements::new(2, &catalog);
    let differs = (0..6).any(|site| {
        settlement_in(&one, site, 0).map(|s| s.bounds())
            != settlement_in(&two, site, 0).map(|s| s.bounds())
    });
    assert!(differs);
}

#[test]
fn a_chance_below_one_leaves_sites_empty() {
    let catalog = catalog_of(Fixture {
        chance: 0.3,
        ..Fixture::default()
    });
    let world = field_of(&catalog);
    let hosted = (0..20)
        .filter(|&site| settlement_in(&world, site, 0).is_some())
        .count();
    assert!(hosted > 0 && hosted < 20, "{hosted}");
}

#[test]
fn resolving_a_whole_area_answers_exactly_what_the_columns_answer_one_by_one() {
    let world = field_of(&catalog());
    let coords: Vec<WorldCoord> = (-70..70)
        .flat_map(|y| (-70..70).map(move |x| WorldCoord { x, y }))
        .step_by(3)
        .collect();
    let zones = world.zones_over(&coords);
    for (coord, zone) in coords.iter().zip(&zones) {
        assert_eq!(*zone, world.zone_at(coord.x, coord.y));
    }
    assert!(zones.iter().any(Option::is_some) && zones.iter().any(Option::is_none));
}

#[test]
fn the_zone_of_a_column_never_depends_on_which_column_was_asked_first() {
    let world = field_of(&catalog());
    let forward: Vec<_> = (0..60).map(|x| world.zone_at(x, 20)).collect();
    let backward: Vec<_> = (0..60).rev().map(|x| world.zone_at(x, 20)).collect();
    assert!(forward.iter().eq(backward.iter().rev()));
}

#[test]
fn a_zone_resolved_once_answers_the_same_profile_as_the_column() {
    let world = field_of(&catalog());
    let settlement = some_settlement(&world);
    let grid = settlement.bounds();
    for x in grid.min_x - 5..grid.max_x + 5 {
        let zone = world.zone_at(x, grid.min_y + 3);
        assert_eq!(
            world.profile_of(zone).greens,
            world.profile_at(x, grid.min_y + 3).greens
        );
    }
}

#[test]
fn a_zone_that_grows_no_greenery_asks_for_no_spacing() {
    let world = field_of(&catalog());
    let centre = Some(zone(&world, ZoneRole::Center));
    assert_eq!(world.greens_of(centre), 0.0);
    assert_eq!(world.greens_spacing(centre, 0.0), None);
    assert_eq!(world.greens_spacing(None, 0.0), None);
    let street = Some(zone(&world, ZoneRole::Street));
    assert_eq!(world.greens_spacing(street, 0.0), None);
}

#[test]
fn the_greenery_hugs_a_wall_and_opens_up_in_the_clearing() {
    let world = field_of(&catalog());
    let park = Some(zone(&world, ZoneRole::Park));
    let beside = world.greens_spacing(park, 0.0).expect("greens");
    let middling = world.greens_spacing(park, 6.0).expect("greens");
    let open = world.greens_spacing(park, 20.0).expect("greens");
    assert_eq!(beside, 2.0);
    assert_eq!(open, 6.0);
    assert!(
        beside < middling && middling < open,
        "{beside} {middling} {open}"
    );
}

#[test]
fn a_denser_zone_tightens_the_spacing() {
    let catalog = catalog_of(Fixture {
        greens: "2.0",
        ..Fixture::default()
    });
    let world = field_of(&catalog);
    let park = Some(zone(&world, ZoneRole::Park));
    assert_eq!(world.greens_spacing(park, 20.0), Some(3.0));
}

#[test]
fn the_streets_of_an_area_are_exactly_its_street_zone_columns() {
    let world = field_of(&catalog());
    let street = zone(&world, ZoneRole::Street);
    let coords: Vec<WorldCoord> = (-10..70)
        .flat_map(|y| (-10..70).map(move |x| WorldCoord { x, y }))
        .collect();
    let streets = world.streets_over(&coords);
    for (coord, &paved) in coords.iter().zip(&streets) {
        assert_eq!(paved, world.zone_at(coord.x, coord.y) == Some(street));
    }
    assert!(streets.iter().any(|&paved| paved));
}

fn ground() -> crate::terrain::TerrainGenerator {
    crate::terrain::TerrainGenerator::new(crate::terrain::TerrainConfig::default())
        .expect("the default terrain is valid")
}

fn is_land(generator: &crate::terrain::TerrainGenerator, at: WorldCoord) -> bool {
    matches!(
        generator.column_at(at).surface,
        TerrainMaterial::Grass | TerrainMaterial::Ground
    )
}

#[test]
fn on_the_ground_every_block_that_stands_has_land_under_its_corners_and_middle() {
    let generator = ground();
    let world = field_of(&catalog()).on_ground(generator.clone());
    let mut blocks = 0;
    for site_y in -4..4 {
        for site_x in -4..4 {
            let Some(settlement) = settlement_in(&world, site_x, site_y) else {
                continue;
            };
            for j in 0..settlement.rows() {
                for i in 0..settlement.cols() {
                    if settlement.block_zone(i, j).is_none() {
                        continue;
                    }
                    blocks += 1;
                    let rect = settlement.block_rect(i, j);
                    for (x, y) in [
                        (rect.min_x, rect.min_y),
                        (rect.max_x, rect.min_y),
                        (rect.min_x, rect.max_y),
                        (rect.max_x, rect.max_y),
                        ((rect.min_x + rect.max_x) / 2, (rect.min_y + rect.max_y) / 2),
                    ] {
                        assert!(is_land(&generator, WorldCoord { x, y }), "({x}, {y})");
                    }
                }
            }
        }
    }
    assert!(blocks > 0, "the default terrain hosts no block at all");
}

#[test]
fn on_the_ground_a_site_whose_middle_block_is_not_land_hosts_nothing() {
    let generator = ground();
    let bare = field_of(&catalog());
    let grounded = field_of(&catalog()).on_ground(generator.clone());
    let mut dropped = 0;
    for site_y in -6..6 {
        for site_x in -6..6 {
            let Some(settlement) = settlement_in(&bare, site_x, site_y) else {
                continue;
            };
            let rect = settlement.block_rect(settlement.cols() / 2, settlement.rows() / 2);
            let middle = WorldCoord {
                x: (rect.min_x + rect.max_x) / 2,
                y: (rect.min_y + rect.max_y) / 2,
            };
            if !is_land(&generator, middle) {
                dropped += 1;
                assert!(settlement_in(&grounded, site_x, site_y).is_none());
            }
        }
    }
    assert!(dropped > 0, "the scanned terrain is land everywhere");
}

#[test]
fn the_ground_never_moves_a_settlement_it_keeps() {
    let bare = field_of(&catalog());
    let grounded = field_of(&catalog()).on_ground(ground());
    for site in 0..10 {
        if let Some(kept) = settlement_in(&grounded, site, -3) {
            let free = settlement_in(&bare, site, -3).expect("the ground only removes");
            assert_eq!(kept.bounds(), free.bounds());
            assert_eq!(kept.center, free.center);
        }
    }
}

#[test]
fn the_blocks_of_an_area_are_its_centre_residential_park_and_verge_columns() {
    let world = fixture_world(Fixture {
        verge: true,
        ..Fixture::default()
    });
    let roles = [
        ZoneRole::Center,
        ZoneRole::Residential,
        ZoneRole::Park,
        ZoneRole::Verge,
    ];
    let coords: Vec<WorldCoord> = (-10..70)
        .flat_map(|y| (-10..70).map(move |x| WorldCoord { x, y }))
        .collect();
    let blocks = world.blocks_over(&coords);
    let verge = world.catalog().verge();
    assert!(
        coords
            .iter()
            .any(|coord| world.zone_at(coord.x, coord.y) == verge)
    );
    for (coord, &block) in coords.iter().zip(&blocks) {
        let expected = world
            .zone_at(coord.x, coord.y)
            .is_some_and(|zone| roles.contains(&world.catalog().zones[zone].role));
        assert_eq!(block, expected);
    }
    assert!(blocks.iter().any(|&block| block));
}

fn shaped(shapes: (f64, f64, f64)) -> WorldSettlements {
    WorldSettlements::new(
        99,
        &catalog_of(Fixture {
            shapes,
            ..Fixture::default()
        }),
    )
}

/// The cells of block `(i, j)` the field hands to the street.
fn removed_cells(
    world: &WorldSettlements,
    settlement: &Settlement,
    i: i32,
    j: i32,
) -> Vec<WorldCoord> {
    let street = zone(world, ZoneRole::Street);
    block_cells(settlement, i, j)
        .into_iter()
        .filter(|cell| world.zone_at(cell.x, cell.y) == Some(street))
        .collect()
}

#[test]
fn a_notched_block_hands_one_corner_square_of_half_its_side_to_the_street() {
    let world = shaped((1.0, 0.0, 0.0));
    let half = world.catalog().layout.block / 2;
    let mut notched = 0;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 5).expect("chance is one");
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                let removed = removed_cells(&world, &settlement, i, j);
                if (i, j) == (settlement.cols() / 2, settlement.rows() / 2) {
                    assert_eq!(settlement.block_shape(i, j), BlockShape::Square);
                    assert!(removed.is_empty());
                    continue;
                }
                let BlockShape::Notched { high_x, high_y } = settlement.block_shape(i, j) else {
                    panic!("block ({i}, {j}) is {:?}", settlement.block_shape(i, j));
                };
                notched += 1;
                assert_eq!(removed.len() as i32, half * half);
                let rect = settlement.block_rect(i, j);
                for cell in removed {
                    let near_x = if high_x {
                        rect.max_x - cell.x
                    } else {
                        cell.x - rect.min_x
                    };
                    let near_y = if high_y {
                        rect.max_y - cell.y
                    } else {
                        cell.y - rect.min_y
                    };
                    assert!(near_x < half && near_y < half, "{cell:?}");
                }
            }
        }
    }
    assert!(notched > 20);
}

#[test]
fn a_shrunk_block_hands_one_whole_side_row_to_the_street() {
    let world = shaped((0.0, 1.0, 0.0));
    let block = world.catalog().layout.block;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 5).expect("chance is one");
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                if (i, j) == (settlement.cols() / 2, settlement.rows() / 2) {
                    continue;
                }
                let BlockShape::Shrunk { along_x, high } = settlement.block_shape(i, j) else {
                    panic!("block ({i}, {j}) is {:?}", settlement.block_shape(i, j));
                };
                let removed = removed_cells(&world, &settlement, i, j);
                assert_eq!(removed.len() as i32, block);
                let rect = settlement.block_rect(i, j);
                let edge = match (along_x, high) {
                    (true, false) => removed.iter().all(|cell| cell.x == rect.min_x),
                    (true, true) => removed.iter().all(|cell| cell.x == rect.max_x),
                    (false, false) => removed.iter().all(|cell| cell.y == rect.min_y),
                    (false, true) => removed.iter().all(|cell| cell.y == rect.max_y),
                };
                assert!(edge, "{removed:?}");
            }
        }
    }
}

#[test]
fn a_merged_block_swallows_the_street_to_its_neighbour_but_not_the_crossings() {
    let world = shaped((0.0, 0.0, 1.0));
    let street = zone(&world, ZoneRole::Street);
    let mut merges = 0;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 5).expect("chance is one");
        let mut partners = std::collections::HashSet::new();
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                let rect = settlement.block_rect(i, j);
                let dealt = settlement.block_zone(i, j);
                let (segment, other): (Vec<WorldCoord>, (i32, i32)) =
                    match settlement.block_shape(i, j) {
                        BlockShape::MergedX => (
                            (rect.min_y..=rect.max_y)
                                .map(|y| WorldCoord {
                                    x: rect.max_x + 1,
                                    y,
                                })
                                .collect(),
                            (i + 1, j),
                        ),
                        BlockShape::MergedY => (
                            (rect.min_x..=rect.max_x)
                                .map(|x| WorldCoord {
                                    x,
                                    y: rect.max_y + 1,
                                })
                                .collect(),
                            (i, j + 1),
                        ),
                        _ => continue,
                    };
                merges += 1;
                assert!(partners.insert((i, j)), "({i}, {j}) merges twice");
                assert!(partners.insert(other), "{other:?} merges twice");
                assert_eq!(settlement.block_zone(other.0, other.1), dealt);
                assert_eq!(settlement.block_shape(other.0, other.1), BlockShape::Square);
                for cell in &segment {
                    assert_eq!(world.zone_at(cell.x, cell.y), dealt, "{cell:?}");
                }
                let first = segment[0];
                let last = segment[segment.len() - 1];
                let (before, after) = if first.x == last.x {
                    (
                        WorldCoord {
                            x: first.x,
                            y: first.y - 1,
                        },
                        WorldCoord {
                            x: last.x,
                            y: last.y + 1,
                        },
                    )
                } else {
                    (
                        WorldCoord {
                            x: first.x - 1,
                            y: first.y,
                        },
                        WorldCoord {
                            x: last.x + 1,
                            y: last.y,
                        },
                    )
                };
                assert_eq!(world.zone_at(before.x, before.y), Some(street));
                assert_eq!(world.zone_at(after.x, after.y), Some(street));
            }
        }
    }
    assert!(merges > 5, "only {merges} merges");
}

#[test]
fn whatever_their_shape_every_block_raises_lots_beside_a_street_and_none_touch() {
    let world = shaped((0.3, 0.2, 0.3));
    let street = zone(&world, ZoneRole::Street);
    let park = zone(&world, ZoneRole::Park);
    for site in 0..8 {
        let settlement = settlement_in(&world, site, 6).expect("chance is one");
        let lots = settlement.lots();
        for lot in lots {
            assert_eq!(world.zone_at(lot.anchor.x, lot.anchor.y), Some(lot.zone));
            let beside_street = [(1, 0), (-1, 0), (0, 1), (0, -1)]
                .into_iter()
                .any(|(dx, dy)| {
                    world.zone_at(lot.anchor.x + dx, lot.anchor.y + dy) == Some(street)
                });
            assert!(beside_street || lot.zone == park, "{lot:?}");
            for other in lots {
                let apart =
                    (lot.anchor.x - other.anchor.x).abs() + (lot.anchor.y - other.anchor.y).abs();
                assert_ne!(apart, 1, "{lot:?} touches {other:?}");
            }
        }
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                let rect = settlement.block_rect(i, j);
                let corner = WorldCoord {
                    x: rect.min_x,
                    y: rect.min_y,
                };
                assert!(
                    lots.iter().any(|lot| lot.block == corner),
                    "block ({i}, {j}) raised nothing"
                );
            }
        }
    }
}

fn fixture_world(fixture: Fixture) -> WorldSettlements {
    WorldSettlements::new(99, &catalog_of(fixture))
}

#[test]
fn with_a_verge_nothing_of_a_block_stands_right_in_front_of_a_street() {
    let world = fixture_world(Fixture {
        verge: true,
        shapes: (0.25, 0.15, 0.2),
        split: 0.15,
        ..Fixture::default()
    });
    let street = zone(&world, ZoneRole::Street);
    let verge = world
        .catalog()
        .verge()
        .expect("the fixture declares a verge");
    let roles = [ZoneRole::Center, ZoneRole::Residential, ZoneRole::Park];
    let mut verges = 0;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 7).expect("chance is one");
        let grid = settlement.bounds();
        for y in grid.min_y..=grid.max_y {
            for x in grid.min_x..=grid.max_x {
                let found = world.zone_at(x, y);
                let behind = world.zone_at(x + 1, y) == Some(street)
                    || world.zone_at(x, y + 1) == Some(street);
                if found == Some(verge) {
                    verges += 1;
                    assert!(behind, "({x}, {y}) is verge with no street behind it");
                }
                if let Some(zone) = found
                    && roles.contains(&world.catalog().zones[zone].role)
                {
                    assert!(!behind, "({x}, {y}) hides the street behind it");
                }
            }
        }
        for lot in settlement.lots() {
            assert_ne!(world.zone_at(lot.anchor.x, lot.anchor.y), Some(verge));
        }
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                let rect = settlement.block_rect(i, j);
                let corner = WorldCoord {
                    x: rect.min_x,
                    y: rect.min_y,
                };
                assert!(
                    settlement.lots().iter().any(|lot| lot.block == corner),
                    "block ({i}, {j}) raised nothing"
                );
            }
        }
    }
    assert!(verges > 50);
}

#[test]
fn a_split_block_is_cut_by_an_alley_that_joins_the_streets_on_both_sides() {
    let world = fixture_world(Fixture {
        split: 1.0,
        ..Fixture::default()
    });
    let street = zone(&world, ZoneRole::Street);
    let half = world.catalog().layout.block / 2;
    let mut splits = 0;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 8).expect("chance is one");
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                if (i, j) == (settlement.cols() / 2, settlement.rows() / 2) {
                    continue;
                }
                let BlockShape::Split { along_x } = settlement.block_shape(i, j) else {
                    panic!("block ({i}, {j}) is {:?}", settlement.block_shape(i, j));
                };
                splits += 1;
                let rect = settlement.block_rect(i, j);
                let alley: Vec<WorldCoord> = if along_x {
                    (rect.min_y - 1..=rect.max_y + 1)
                        .map(|y| WorldCoord {
                            x: rect.min_x + half,
                            y,
                        })
                        .collect()
                } else {
                    (rect.min_x - 1..=rect.max_x + 1)
                        .map(|x| WorldCoord {
                            x,
                            y: rect.min_y + half,
                        })
                        .collect()
                };
                for cell in &alley {
                    assert_eq!(world.zone_at(cell.x, cell.y), Some(street), "{cell:?}");
                }
                let carved = removed_cells(&world, &settlement, i, j);
                assert_eq!(carved.len() as i32, world.catalog().layout.block);
            }
        }
    }
    assert!(splits > 20);
}

#[test]
fn a_park_raises_a_lot_on_every_cell_of_one_checkerboard_colour_not_only_its_rim() {
    let world = fixture_world(Fixture {
        verge: true,
        front_park: 1.0,
        ..Fixture::default()
    });
    let park = zone(&world, ZoneRole::Park);
    let mut parks = 0;
    for site in 0..6 {
        let settlement = settlement_in(&world, site, 9).expect("chance is one");
        for j in 0..settlement.rows() {
            for i in 0..settlement.cols() {
                if settlement.block_zone(i, j) != Some(park) {
                    continue;
                }
                parks += 1;
                let rect = settlement.block_rect(i, j);
                let corner = WorldCoord {
                    x: rect.min_x,
                    y: rect.min_y,
                };
                let lots: Vec<WorldCoord> = settlement
                    .lots()
                    .iter()
                    .filter(|lot| lot.block == corner)
                    .map(|lot| lot.anchor)
                    .collect();
                for cell in block_cells(&settlement, i, j) {
                    let wanted = (cell.x + cell.y).rem_euclid(2) == 0
                        && world.zone_at(cell.x, cell.y) == Some(park);
                    assert_eq!(lots.contains(&cell), wanted, "{cell:?}");
                }
            }
        }
    }
    assert!(parks > 10);
}
