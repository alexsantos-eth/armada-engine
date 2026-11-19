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

#[test]
fn shipped_settlement_content_validates_against_entities_and_wfc() {
    let catalog = settlements();
    let ids: Vec<&str> = catalog.zones.iter().map(|zone| zone.id.as_str()).collect();
    assert_eq!(ids, ["center", "residential", "green", "edge"]);
}

#[test]
fn the_wilderness_grows_no_building_and_the_centre_grows_the_mead_hall() {
    let entities = entities();
    let catalog = settlements();
    let index = |id: &str| {
        entities
            .entities
            .iter()
            .position(|blueprint| blueprint.id == id)
            .expect("shipped blueprint")
    };
    for building in ["hut_moss", "mead_hall_x", "stave_temple", "market_stall"] {
        assert_eq!(
            catalog.wilderness.multiplier(index(building)),
            0.0,
            "{building} still grows out in the wild"
        );
    }
    let centre = &catalog.zones[0].profile;
    assert!(centre.multiplier(index("mead_hall_x")) > 0.0);
    assert!(centre.multiplier(index("mead_hall_y")) > 0.0);
    assert_eq!(centre.multiplier(index("hut_moss")), 0.0);
    assert_eq!(centre.greens, 0.0);
}

#[test]
fn only_the_green_and_the_edge_keep_their_trees() {
    let catalog = settlements();
    let greens = |id: &str| {
        catalog
            .zones
            .iter()
            .find(|zone| zone.id == id)
            .map(|zone| zone.profile.greens)
            .expect("shipped zone")
    };
    assert_eq!(greens("center"), 0.0);
    assert!(greens("residential") > 0.0 && greens("residential") < greens("edge"));
    assert!(greens("green") > greens("edge"));
    assert!(catalog.greens.tight < catalog.greens.spacing);
    assert!(catalog.greens.front >= 1);
    assert!(catalog.greens.patio.chance > 0.0 && catalog.greens.patio.min >= 2);
}

#[test]
fn a_village_of_the_shipped_field_grows_a_centre_a_neighbourhood_and_a_green() {
    use std::collections::HashSet;
    let catalog = settlements();
    let field = iso::settlements::WorldSettlements::new(iso::terrain::WORLD_SEED, &catalog);
    let mut settlement = None;
    for y in -400..400 {
        for x in -400..400 {
            if let Some(found) = field.settlement_at(x, y) {
                settlement = Some(found);
                break;
            }
        }
        if settlement.is_some() {
            break;
        }
    }
    let settlement = settlement.expect("the shipped field lays a settlement in 800 columns");
    let reach = settlement.radius.ceil() as i32;
    let mut zones: HashSet<&str> = HashSet::new();
    for dy in -reach..=reach {
        for dx in -reach..=reach {
            if let Some(id) = field.zone_id_at(settlement.center.x + dx, settlement.center.y + dy) {
                zones.insert(id);
            }
        }
    }
    assert!(zones.contains("center"), "no centre: {zones:?}");
    assert!(zones.len() >= 3, "a village of one or two zones: {zones:?}");
}

#[test]
fn the_campfire_grows_in_the_wild_and_not_only_inside_a_village() {
    let entities = entities();
    let catalog = settlements();
    let index = entities
        .entities
        .iter()
        .position(|blueprint| blueprint.id == "campfire")
        .expect("the catalog carries the campfire");
    assert!(catalog.wilderness.multiplier(index) > 0.0);
}
