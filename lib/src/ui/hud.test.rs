//! Tests for the native HUD's animation state: flights, bumps and counts in the air.

use super::*;
use crate::ui::{HudLayout, UiFrame, UiGain, UiStack};

fn frame() -> UiFrame {
    UiFrame {
        visible: true,
        touch: false,
        slots: vec![
            None,
            Some(UiStack {
                item: "wood".into(),
                name: "Madera".into(),
                count: 6,
            }),
            None,
        ],
        progress: None,
        progress_at: None,
        progress_name: None,
        action: None,
        note: None,
    }
}

fn gain(amount: u32) -> UiGain {
    UiGain {
        slot: 1,
        item: "wood".into(),
        name: "Madera".into(),
        amount,
        x: 0.5,
        y: 0.5,
    }
}

#[test]
fn a_gain_starts_a_flight_to_its_slot() {
    let mut hud = ClayHud::default();
    hud.apply(&frame(), &[gain(3)], (800.0, 600.0));
    assert_eq!(hud.flights.len(), 1);
    assert_eq!(hud.flights[0].slot, 1);
    assert_eq!(hud.flights[0].from, (400.0, 300.0));
}

#[test]
fn a_count_in_the_air_is_not_in_its_slot_until_it_lands() {
    let mut hud = ClayHud::default();
    hud.apply(&frame(), &[gain(3)], (800.0, 600.0));
    assert_eq!(hud.shown_count(1, 6), 3);
    hud.advance(motion::FLY_MS + 1.0);
    assert_eq!(hud.shown_count(1, 6), 6);
    assert!(hud.flights.is_empty());
    assert!(hud.bump_age(1).is_some());
}

#[test]
fn overlapping_flights_update_their_slots_when_each_lands() {
    let mut hud = ClayHud::default();
    let mut overflow = gain(2);
    overflow.slot = 2;
    let size = (800.0, 600.0);
    hud.apply(&frame(), &[gain(3), overflow], size);
    hud.advance(motion::FLY_MS / 2.0);
    hud.apply(&frame(), &[UiGain { slot: 2, ..gain(1) }], size);
    assert_eq!(hud.shown_count(1, 6), 3);
    assert_eq!(hud.shown_count(2, 3), 0);
    hud.advance(motion::FLY_MS / 2.0);
    assert_eq!(hud.shown_count(1, 6), 6);
    assert_eq!(hud.shown_count(2, 3), 2);
    hud.advance(motion::FLY_MS / 2.0);
    assert_eq!(hud.shown_count(2, 3), 3);
}

#[test]
fn a_flight_on_a_desktop_lands_on_its_slot() {
    let mut hud = ClayHud::default();
    let desktop = HudLayout::new(1280.0, 800.0, 4, false);
    hud.apply(&frame(), &[gain(3)], (1280.0, 800.0));
    let slot = desktop.slots[1];
    assert_eq!(
        hud.flights[0].destination(&desktop),
        Some((slot.x + slot.w / 2.0, slot.y + slot.h / 2.0))
    );
}

#[test]
fn a_flight_on_mobile_lands_on_the_backpack_icon() {
    let mut hud = ClayHud::default();
    let mobile = HudLayout::new(390.0, 844.0, 3, true);
    hud.apply(&frame(), &[gain(3)], (390.0, 844.0));
    let backpack = mobile.backpack.unwrap();
    assert_eq!(
        hud.flights[0].destination(&mobile),
        Some((backpack.x + backpack.w / 2.0, backpack.y + backpack.h / 2.0))
    );
}

#[test]
fn the_full_inventory_note_pops_a_warning_once_while_it_lasts() {
    let mut hud = ClayHud::default();
    let mut full = frame();
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
    hud.apply(&frame(), &[], (800.0, 600.0));
    hud.apply(&full, &[], (800.0, 600.0));
    assert_eq!(
        hud.bubble.as_ref().unwrap().age_ms,
        0.0,
        "a new note pops again"
    );
}

#[test]
fn the_backpack_toggles_once_per_new_press_and_emits_the_matching_sound() {
    use iso::services::SoundEvent;
    use macroquad::prelude::{Touch, TouchPhase, vec2};

    let mut hud = ClayHud::default();
    let mobile = HudLayout::new(800.0, 400.0, 6, true);
    let desktop = HudLayout::new(800.0, 400.0, 6, false);
    let backpack = mobile.backpack.unwrap().center();
    let touch = |id, phase, position| Touch {
        id,
        phase,
        position,
    };
    let press = touch(1, TouchPhase::Started, backpack);

    assert!(!hud.inventory_open);
    assert_eq!(
        hud.update_inventory(&desktop, std::slice::from_ref(&press)),
        None
    );
    assert_eq!(
        hud.update_inventory(
            &mobile,
            &[touch(1, TouchPhase::Started, vec2(200.0, 200.0))]
        ),
        None
    );
    assert_eq!(
        hud.update_inventory(&mobile, &[press, touch(2, TouchPhase::Started, backpack)]),
        Some(SoundEvent::InventoryOpen)
    );

    for phase in [
        TouchPhase::Stationary,
        TouchPhase::Moved,
        TouchPhase::Ended,
        TouchPhase::Cancelled,
    ] {
        assert_eq!(
            hud.update_inventory(&mobile, &[touch(1, phase, backpack)]),
            None
        );
        assert!(hud.inventory_open);
    }
    assert_eq!(hud.update_inventory(&mobile, &[]), None);
    assert!(hud.inventory_open);

    assert_eq!(
        hud.update_inventory(&mobile, &[touch(3, TouchPhase::Started, backpack)]),
        Some(SoundEvent::InventoryClose)
    );
    assert!(!hud.inventory_open);
}
