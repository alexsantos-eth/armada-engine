use super::*;

#[test]
fn each_number_key_takes_its_tool_in_hand() {
    let keys = [
        (KeyCode::Key1, MakerTool::Raise),
        (KeyCode::Key2, MakerTool::Lower),
        (KeyCode::Key3, MakerTool::Surface),
        (KeyCode::Key4, MakerTool::Tint),
        (KeyCode::Key5, MakerTool::Top),
        (KeyCode::Key6, MakerTool::Place),
        (KeyCode::Key7, MakerTool::Erase),
    ];
    for (key, tool) in keys {
        assert_eq!(tool_for_key(|pressed| pressed == key), Some(tool));
    }
}

#[test]
fn a_key_that_is_not_a_tool_changes_nothing() {
    assert_eq!(tool_for_key(|pressed| pressed == KeyCode::Key8), None);
    assert_eq!(tool_for_key(|_| false), None);
}

#[test]
fn cycling_an_index_wraps_around_both_ways() {
    assert_eq!(cycled(0, 3, true), 1);
    assert_eq!(cycled(2, 3, true), 0);
    assert_eq!(cycled(0, 3, false), 2);
    assert_eq!(cycled(1, 3, false), 0);
}

#[test]
fn cycling_an_empty_choice_stays_where_it_is() {
    assert_eq!(cycled(0, 0, true), 0);
    assert_eq!(cycled(4, 0, false), 4);
}

#[test]
fn cycling_the_grass_top_walks_through_the_plain_block() {
    assert_eq!(cycled_top(None, 2, true), Some(0));
    assert_eq!(cycled_top(Some(0), 2, true), Some(1));
    assert_eq!(cycled_top(Some(1), 2, true), None);
    assert_eq!(cycled_top(None, 2, false), Some(1));
    assert_eq!(cycled_top(Some(0), 2, false), None);
}

#[test]
fn with_no_tops_the_grass_stays_plain() {
    assert_eq!(cycled_top(None, 0, true), None);
    assert_eq!(cycled_top(Some(0), 0, true), None);
}

#[test]
fn a_stroke_says_what_it_did_and_a_refused_one_says_why() {
    assert_eq!(note_for(MakerStroke::Terrain, MakerTool::Raise), "");
    assert_eq!(note_for(MakerStroke::Dressing, MakerTool::Tint), "");
    assert_eq!(note_for(MakerStroke::Entities, MakerTool::Place), "");
    assert_eq!(
        note_for(MakerStroke::Nothing, MakerTool::Place),
        "Ahi no cabe"
    );
    assert_eq!(note_for(MakerStroke::Nothing, MakerTool::Raise), "");
}

#[test]
fn the_title_names_the_tool_and_its_choice() {
    let catalog = iso::entities::EntityCatalog {
        schema_version: 1,
        entities: Vec::new(),
    };
    assert_eq!(
        brush_title(
            &MakerBrush {
                tool: MakerTool::Surface,
                surface: TerrainMaterial::Path,
                ..MakerBrush::default()
            },
            &catalog
        ),
        "Pintar: Camino"
    );
    assert_eq!(
        brush_title(
            &MakerBrush {
                tool: MakerTool::Tint,
                tint: 2,
                ..MakerBrush::default()
            },
            &catalog
        ),
        "Tinte: zona 3"
    );
    assert_eq!(
        brush_title(
            &MakerBrush {
                tool: MakerTool::Top,
                top: Some(4),
                ..MakerBrush::default()
            },
            &catalog
        ),
        "Hierba: variante 5"
    );
    assert_eq!(
        brush_title(
            &MakerBrush {
                tool: MakerTool::Place,
                ..MakerBrush::default()
            },
            &catalog
        ),
        "Poner: sin catalogo"
    );
    assert_eq!(
        brush_title(&MakerBrush::default(), &catalog),
        "Subir el terreno"
    );
}
