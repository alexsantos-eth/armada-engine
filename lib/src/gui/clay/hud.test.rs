//! Tests for the native HUD's animation state: bubbles, flights, bumps and counts in the air.

use super::*;
use crate::gui::web_ui::{UiFrame, UiGain, UiStack};

fn frame(wood: u32) -> UiFrame {
    UiFrame {
        visible: true,
        touch: false,
        slots: vec![
            None,
            Some(UiStack {
                item: "wood".into(),
                name: "Madera".into(),
                count: wood,
            }),
            None,
        ],
        prompt: None,
        note: None,
    }
}

fn gain(amount: u32) -> UiGain {
    UiGain {
        item: "wood".into(),
        name: "Madera".into(),
        amount,
        x: 0.5,
        y: 0.5,
    }
}

#[test]
fn a_gain_pops_a_bubble_over_the_player_and_starts_a_flight_to_its_slot() {
    let mut hud = ClayHud::default();
    hud.apply(&frame(6), &[gain(3)], (800.0, 600.0));
    let bubble = hud.bubble.as_ref().unwrap();
    assert_eq!(
        bubble.content,
        BubbleContent::Gain {
            item: "wood".into(),
            name: "Madera".into(),
            amount: 3
        }
    );
    assert_eq!((bubble.x, bubble.y), (400.0, 300.0 - BUBBLE_LIFT));
    assert_eq!(hud.flights.len(), 1);
    assert_eq!(hud.flights[0].slot, 1);
    assert_eq!(hud.flights[0].from, (400.0, 300.0));
}

#[test]
fn a_count_in_the_air_is_not_in_its_slot_until_it_lands() {
    let mut hud = ClayHud::default();
    hud.apply(&frame(6), &[gain(3)], (800.0, 600.0));
    assert_eq!(hud.shown_count("wood", 6), 3);
    hud.advance(motion::FLY_MS + 1.0);
    assert_eq!(hud.shown_count("wood", 6), 6);
    assert!(hud.flights.is_empty());
    assert!(hud.bump_age(1).is_some());
}

#[test]
fn a_new_item_flies_to_the_first_empty_slot() {
    let mut hud = ClayHud::default();
    let mut stone = gain(2);
    stone.item = "stone".into();
    hud.apply(&frame(6), &[stone], (800.0, 600.0));
    assert_eq!(hud.flights[0].slot, 0);
}

#[test]
fn the_bubble_goes_away_once_it_has_left() {
    let mut hud = ClayHud::default();
    hud.apply(&frame(6), &[gain(1)], (800.0, 600.0));
    hud.advance(motion::BUBBLE_HOLD_MS + motion::OUT_MS + 1.0);
    assert!(hud.bubble.is_none());
}

#[test]
fn the_full_inventory_note_pops_a_warning_once_while_it_lasts() {
    let mut hud = ClayHud::default();
    let mut full = frame(6);
    full.note = Some("Inventario lleno".into());
    hud.apply(&full, &[], (800.0, 600.0));
    assert!(
        matches!(&hud.bubble.as_ref().unwrap().content, BubbleContent::Warning(text) if text == "Inventario lleno")
    );
    hud.advance(500.0);
    hud.apply(&full, &[], (800.0, 600.0));
    assert!(
        hud.bubble.as_ref().unwrap().age_ms >= 500.0,
        "the same note does not pop again"
    );
    hud.apply(&frame(6), &[], (800.0, 600.0));
    hud.apply(&full, &[], (800.0, 600.0));
    assert_eq!(
        hud.bubble.as_ref().unwrap().age_ms,
        0.0,
        "a new note pops again"
    );
}
