//! Integration test for the settlement catalogue.
//! Loads `content/json/settlements.json` together with the entity and wfc catalogues, the way
//! the client does, and checks that the shipped zones grow a village and leave the wild alone.

fn entities() -> iso::entities::EntityCatalog {
    serde_json::from_str(include_str!("../../../content/json/entities.json"))
        .expect("the entity catalog is valid JSON")
}

fn wfc(entities: &iso::entities::EntityCatalog) -> iso::entities::wfc::WfcCatalog {
    let biomes =
        iso::biomes::parse_biomes(include_str!("../../../content/json/biomes.json"), entities)
            .expect("the shipped biomes content validates");
    iso::entities::wfc::parse_wfc(
        include_str!("../../../content/json/wfc.json"),
        entities,
        Some(&biomes),
    )
    .expect("the shipped wfc content validates")
}

fn settlements() -> iso::settlements::SettlementCatalog {
    let entities = entities();
    let wfc = wfc(&entities);
    iso::settlements::parse_settlements(
        include_str!("../../../content/json/settlements.json"),
        &entities,
        &wfc,
    )
    .expect("the shipped settlement content validates")
}

fn index(entities: &iso::entities::EntityCatalog, id: &str) -> usize {
    entities
        .entities
        .iter()
        .position(|blueprint| blueprint.id == id)
        .expect("shipped blueprint")
}

fn zone<'a>(
    catalog: &'a iso::settlements::SettlementCatalog,
    id: &str,
) -> &'a iso::settlements::SettlementZone {
    catalog
        .zones
        .iter()
        .find(|zone| zone.id == id)
        .expect("shipped zone")
}

#[test]
fn shipped_settlement_content_validates_against_entities_and_wfc() {
    let catalog = settlements();
    let ids: Vec<&str> = catalog.zones.iter().map(|zone| zone.id.as_str()).collect();
    assert_eq!(
        ids,
        [
            "center",
            "residential",
            "row",
            "market",
            "workshops",
            "green",
            "edge",
            "street",
            "verge"
        ]
    );
}

#[test]
fn the_wilderness_grows_no_building_and_the_centre_raises_the_great_hall() {
    let entities = entities();
    let catalog = settlements();
    for building in ["hut_moss", "mead_hall_x", "stave_temple", "market_stall"] {
        assert_eq!(
            catalog.wilderness.multiplier(index(&entities, building)),
            0.0,
            "{building} still grows out in the wild"
        );
    }
    let centre = &zone(&catalog, "center").profile;
    assert!(centre.lot(index(&entities, "mead_hall_x")) > 0.0);
    assert!(centre.lot(index(&entities, "mead_hall_y")) > 0.0);
    assert_eq!(centre.lot(index(&entities, "hut_moss")), 0.0);
}

#[test]
fn houses_stand_only_on_lots_and_never_where_the_solver_scatters() {
    let entities = entities();
    let catalog = settlements();
    let homes = &zone(&catalog, "residential").profile;
    for house in ["hut_moss", "hut_thatch", "cottage_tile"] {
        assert!(homes.lot(index(&entities, house)) > 0.0, "{house}");
        for zone in &catalog.zones {
            assert_eq!(
                zone.profile.multiplier(index(&entities, house)),
                0.0,
                "{} scatters {house}",
                zone.id
            );
        }
    }
    let park = &zone(&catalog, "green").profile;
    assert!(park.lot(index(&entities, "grove_x")) > 0.0);
    assert_eq!(park.lot(index(&entities, "hut_moss")), 0.0);
}

#[test]
fn only_parks_edges_and_homes_keep_their_trees_and_streets_grow_nothing() {
    let catalog = settlements();
    let greens = |id: &str| zone(&catalog, id).profile.greens;
    assert!(greens("center") < greens("residential"));
    assert_eq!(greens("street"), 0.0);
    assert!(greens("residential") > greens("edge"));
    assert!(greens("green") > greens("edge"));
    assert!(catalog.greens.tight < catalog.greens.spacing);
    assert!(catalog.greens.front >= 1);
    assert!(catalog.greens.patio.chance > 0.0 && catalog.greens.patio.min >= 2);
}

#[test]
fn a_village_of_the_shipped_field_is_a_grid_of_blocks_with_a_centre_homes_and_streets() {
    use std::collections::HashSet;
    let catalog = settlements();
    let ground = iso::terrain::TerrainGenerator::new(iso::terrain::TerrainConfig::default())
        .expect("the default terrain is valid");
    let field = iso::settlements::WorldSettlements::new(iso::terrain::WORLD_SEED, &catalog)
        .on_ground(ground);
    let spacing = catalog.spacing;
    let mut checked = 0;
    for site in 0..12 {
        let Some(settlement) = (site * spacing..(site + 1) * spacing)
            .flat_map(|x| (0..spacing).map(move |y| (x, y)))
            .find_map(|(x, y)| field.settlement_at(x, y))
        else {
            continue;
        };
        checked += 1;
        let grid = settlement.bounds();
        let mut zones: HashSet<&str> = HashSet::new();
        for y in grid.min_y..=grid.max_y {
            for x in grid.min_x..=grid.max_x {
                if let Some(id) = field.zone_id_at(x, y) {
                    zones.insert(id);
                }
            }
        }
        assert!(zones.contains("center"), "no centre: {zones:?}");
        assert!(zones.contains("street"), "no street: {zones:?}");
        assert!(
            zones.contains("residential") || zones.contains("green"),
            "{zones:?}"
        );
        assert!(!settlement.lots().is_empty());
    }
    assert!(
        checked >= 3,
        "the shipped field hosts only {checked} of six sites"
    );
}

#[test]
fn some_blocks_are_whole_markets_or_rows_of_one_trade() {
    let entities = entities();
    let catalog = settlements();
    let market = zone(&catalog, "market");
    assert!(market.uniform);
    assert!(market.profile.lot(index(&entities, "market_stall")) > 0.0);
    assert!(zone(&catalog, "workshops").uniform);
    assert!(zone(&catalog, "row").uniform);
    assert!(!zone(&catalog, "residential").uniform);
}

#[test]
fn villages_are_dense_enough_to_meet_one_every_few_chunks() {
    let catalog = settlements();
    let area = f64::from(catalog.spacing * catalog.spacing) / catalog.chance;
    let chunk = f64::from(iso::grid::CHUNK_SIZE * iso::grid::CHUNK_SIZE);
    assert!(
        area / chunk < 5.0,
        "one village every {} chunks",
        area / chunk
    );
}

#[test]
fn the_campfire_grows_in_the_wild_and_not_only_inside_a_village() {
    let entities = entities();
    let catalog = settlements();
    assert!(catalog.wilderness.multiplier(index(&entities, "campfire")) > 0.0);
}

#[test]
fn the_wild_scatters_more_rocks_than_the_solver_alone_would() {
    let entities = entities();
    let catalog = settlements();
    for rock in ["rock_small", "rock_medium", "bush"] {
        assert!(
            catalog.wilderness.multiplier(index(&entities, rock)) > 1.0,
            "{rock}"
        );
    }
}

#[test]
fn the_shipped_grid_breaks_the_square_of_some_blocks() {
    let shapes = settlements().layout.shapes;
    assert!(shapes.notch > 0.0 && shapes.shrink > 0.0 && shapes.merge > 0.0);
    assert!(shapes.split > 0.0);
    assert!(shapes.notch + shapes.shrink + shapes.merge + shapes.split < 0.75);
}

#[test]
fn the_wild_grows_more_groves_and_palms_than_the_solver_alone_would() {
    let entities = entities();
    let catalog = settlements();
    for wild in ["grove_x", "palm", "palm_grove_x"] {
        assert!(
            catalog.wilderness.multiplier(index(&entities, wild)) > 2.0,
            "{wild}"
        );
    }
}

#[test]
fn the_verge_in_front_of_every_street_grows_only_low_decor() {
    let entities = entities();
    let catalog = settlements();
    let verge = catalog
        .verge()
        .expect("the shipped content declares a verge");
    let profile = &catalog.zones[verge].profile;
    assert_eq!(profile.greens, 0.0);
    for blueprint in &entities.entities {
        let at = index(&entities, &blueprint.id);
        if profile.multiplier(at) > 0.0 {
            assert!(
                blueprint.shape.height <= 1,
                "{} is too tall for a verge",
                blueprint.id
            );
        }
        assert_eq!(profile.lot(at), 0.0);
    }
}

#[test]
fn parks_raise_groves_and_trees_and_the_wild_grows_more_groves_than_palms() {
    let entities = entities();
    let catalog = settlements();
    let park = &zone(&catalog, "green").profile;
    assert!(park.lot(index(&entities, "grove_x")) >= park.lot(index(&entities, "bush")));
    assert!(park.lot(index(&entities, "tree")) > 0.0);
    assert!(park.greens > 2.0);
    let wild = &catalog.wilderness;
    assert!(
        wild.multiplier(index(&entities, "grove_x")) > wild.multiplier(index(&entities, "palm"))
    );
}
