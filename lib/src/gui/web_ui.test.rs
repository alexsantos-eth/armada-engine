//! Tests for the HTML HUD bridge: what the client sends and when.

use super::*;

fn frame(count: u32) -> UiFrame {
    UiFrame {
        visible: true,
        touch: false,
        slots: vec![
            Some(UiStack {
                item: "wood".into(),
                name: "Madera".into(),
                count,
            }),
            None,
        ],
        prompt: None,
        note: None,
    }
}

fn gain() -> UiGain {
    UiGain {
        item: "wood".into(),
        name: "Madera".into(),
        amount: 3,
        x: 0.5,
        y: 0.4,
    }
}

#[test]
fn the_first_frame_is_sent_in_full() {
    let mut bridge = WebUi::default();
    let message = bridge.message(&frame(3), &[]).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&message).unwrap();
    assert_eq!(parsed["frame"]["visible"], true);
    assert_eq!(parsed["frame"]["slots"][0]["item"], "wood");
    assert_eq!(parsed["frame"]["slots"][0]["count"], 3);
    assert!(parsed["frame"]["slots"][1].is_null());
    assert_eq!(parsed["gains"].as_array().unwrap().len(), 0);
}

#[test]
fn an_unchanged_frame_with_no_gains_sends_nothing() {
    let mut bridge = WebUi::default();
    bridge.message(&frame(3), &[]);
    assert_eq!(bridge.message(&frame(3), &[]), None);
}

#[test]
fn a_changed_frame_is_sent_again() {
    let mut bridge = WebUi::default();
    bridge.message(&frame(3), &[]);
    let message = bridge.message(&frame(6), &[]).unwrap();
    assert!(message.contains("\"count\":6"));
}

#[test]
fn gains_go_out_even_when_the_frame_did_not_change() {
    let mut bridge = WebUi::default();
    bridge.message(&frame(3), &[]);
    let message = bridge.message(&frame(3), &[gain()]).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&message).unwrap();
    assert!(parsed.get("frame").is_none());
    assert_eq!(parsed["gains"][0]["amount"], 3);
    assert_eq!(parsed["gains"][0]["name"], "Madera");
}

#[test]
fn the_prompt_carries_its_verb_tool_and_progress() {
    let mut bridge = WebUi::default();
    let mut working = frame(1);
    working.prompt = Some(UiPrompt {
        text: "Madera".into(),
        verb: "Talar",
        tool: "axe",
        progress: Some(0.5),
        blocked: false,
    });
    let parsed: serde_json::Value =
        serde_json::from_str(&bridge.message(&working, &[]).unwrap()).unwrap();
    assert_eq!(parsed["frame"]["prompt"]["verb"], "Talar");
    assert_eq!(parsed["frame"]["prompt"]["tool"], "axe");
    assert_eq!(parsed["frame"]["prompt"]["progress"], 0.5);
    assert_eq!(parsed["frame"]["prompt"]["blocked"], false);
}

#[test]
fn outside_the_browser_the_kit_is_never_active() {
    assert!(!active());
    assert!(!gather_held());
}
