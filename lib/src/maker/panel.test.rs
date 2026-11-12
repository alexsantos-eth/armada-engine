use super::*;
use iso::entities::{
    EntityAsset, EntityBlueprint, EntityCatalog, EntityLengthAxis, EntityPlacement, EntityShape,
};

const WIDTH: f32 = 960.0;

fn catalog(ids: &[&str]) -> EntityCatalog {
    EntityCatalog {
        schema_version: 1,
        entities: ids
            .iter()
            .map(|id| EntityBlueprint {
                id: (*id).to_owned(),
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
            })
            .collect(),
    }
}

fn offered(brush: &MakerBrush) -> Vec<PanelButton> {
    panel_buttons(
        brush,
        &catalog(&["house", "hotel_x", "hotel_y"]),
        PanelCounts { tints: 5, tops: 9 },
        WIDTH,
    )
}

#[test]
fn every_tool_and_the_two_commands_are_always_offered() {
    let buttons = offered(&MakerBrush::default());
    for tool in MAKER_TOOLS {
        assert!(
            buttons
                .iter()
                .any(|button| button.action == MakerAction::Tool(tool)),
            "{tool:?} is not offered"
        );
    }
    assert!(buttons.iter().any(|b| b.action == MakerAction::Undo));
    assert!(buttons.iter().any(|b| b.action == MakerAction::Turn));
}

#[test]
fn the_tool_in_hand_is_the_only_active_tool() {
    let buttons = offered(&MakerBrush {
        tool: MakerTool::Surface,
        ..MakerBrush::default()
    });
    let active: Vec<_> = buttons
        .iter()
        .filter(|button| button.active)
        .map(|button| button.action)
        .collect();
    assert!(active.contains(&MakerAction::Tool(MakerTool::Surface)));
    assert!(!active.contains(&MakerAction::Tool(MakerTool::Raise)));
}

#[test]
fn only_the_tool_in_hand_offers_its_own_choices() {
    let painting = offered(&MakerBrush {
        tool: MakerTool::Surface,
        ..MakerBrush::default()
    });
    assert_eq!(
        painting
            .iter()
            .filter(|button| matches!(button.action, MakerAction::Surface(_)))
            .count(),
        MAKER_SURFACES.len()
    );
    assert!(
        !painting
            .iter()
            .any(|button| matches!(button.action, MakerAction::Blueprint(_)))
    );
    let placing = offered(&MakerBrush {
        tool: MakerTool::Place,
        ..MakerBrush::default()
    });
    assert_eq!(
        placing
            .iter()
            .filter(|button| matches!(button.action, MakerAction::Blueprint(_)))
            .count(),
        3
    );
}

#[test]
fn the_tint_tool_offers_one_button_per_zone_of_the_palette() {
    let buttons = offered(&MakerBrush {
        tool: MakerTool::Tint,
        tint: 2,
        ..MakerBrush::default()
    });
    let zones: Vec<_> = buttons
        .iter()
        .filter_map(|button| match button.action {
            MakerAction::Tint(zone) => Some((zone, button.active)),
            _ => None,
        })
        .collect();
    assert_eq!(zones.len(), 5);
    assert_eq!(
        zones
            .iter()
            .filter(|(_, active)| *active)
            .map(|(zone, _)| *zone)
            .collect::<Vec<_>>(),
        vec![2]
    );
}

#[test]
fn the_grass_tool_offers_the_plain_block_before_its_tops() {
    let buttons = offered(&MakerBrush {
        tool: MakerTool::Top,
        top: None,
        ..MakerBrush::default()
    });
    let tops: Vec<_> = buttons
        .iter()
        .filter_map(|button| match button.action {
            MakerAction::Top(top) => Some(top),
            _ => None,
        })
        .collect();
    assert_eq!(tops.len(), 10);
    assert_eq!(tops[0], None);
    assert_eq!(tops[9], Some(8));
}

#[test]
fn no_two_buttons_overlap_and_all_of_them_stay_inside_the_panel() {
    for tool in MAKER_TOOLS {
        let buttons = offered(&MakerBrush {
            tool,
            ..MakerBrush::default()
        });
        for button in &buttons {
            assert!(
                button.x >= WIDTH - PANEL_WIDTH - 16.0,
                "{tool:?} spills left"
            );
            assert!(button.x + button.width <= WIDTH, "{tool:?} spills right");
            assert!(button.y >= 0.0, "{tool:?} spills over the top");
        }
        for (index, button) in buttons.iter().enumerate() {
            for other in &buttons[index + 1..] {
                let apart = button.x + button.width <= other.x
                    || other.x + other.width <= button.x
                    || button.y + button.height <= other.y
                    || other.y + other.height <= button.y;
                assert!(apart, "{:?} overlaps {:?}", button.action, other.action);
            }
        }
    }
}

#[test]
fn a_click_inside_a_button_finds_it_and_a_click_beside_it_finds_nothing() {
    let buttons = offered(&MakerBrush::default());
    let button = &buttons[0];
    let inside = button_at(
        &buttons,
        button.x + button.width / 2.0,
        button.y + button.height / 2.0,
    );
    assert_eq!(inside.map(|found| found.action), Some(button.action));
    assert!(button_at(&buttons, 10.0, 10.0).is_none());
}

#[test]
fn an_empty_catalog_offers_no_blueprint() {
    let buttons = panel_buttons(
        &MakerBrush {
            tool: MakerTool::Place,
            ..MakerBrush::default()
        },
        &catalog(&[]),
        PanelCounts { tints: 5, tops: 9 },
        WIDTH,
    );
    assert!(
        !buttons
            .iter()
            .any(|button| matches!(button.action, MakerAction::Blueprint(_)))
    );
}

#[test]
fn the_panel_covers_its_buttons_and_the_backing_around_them() {
    let buttons = offered(&MakerBrush {
        tool: MakerTool::Place,
        ..MakerBrush::default()
    });
    for button in &buttons {
        assert!(
            panel_contains(
                &buttons,
                button.x + button.width / 2.0,
                button.y + button.height / 2.0,
                WIDTH
            ),
            "{:?} falls outside the panel",
            button.action
        );
    }
    let lowest = buttons
        .iter()
        .map(|button| button.y + button.height)
        .fold(0.0, f32::max);
    assert!(panel_contains(&buttons, WIDTH - 20.0, lowest + 10.0, WIDTH));
    assert!(!panel_contains(&buttons, 10.0, 300.0, WIDTH));
    assert!(!panel_contains(&buttons, WIDTH - 20.0, 10.0, WIDTH));
}

#[test]
fn every_tool_and_every_surface_has_a_name_of_its_own() {
    for names in [
        MAKER_TOOLS
            .iter()
            .map(|tool| tool_label(*tool))
            .collect::<Vec<_>>(),
        MAKER_SURFACES
            .iter()
            .map(|material| surface_label(*material))
            .collect::<Vec<_>>(),
    ] {
        let mut unique = names.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), names.len(), "{names:?}");
    }
}
