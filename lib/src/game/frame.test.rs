use super::*;

#[test]
fn ticks_pass_through_unchanged_below_the_limit() {
    assert_eq!(frame_ticks(0), 0);
    assert_eq!(frame_ticks(1), 1);
    assert_eq!(frame_ticks(u64::from(u32::MAX)), u32::MAX);
}

#[test]
fn ticks_saturate_instead_of_wrapping() {
    assert_eq!(frame_ticks(u64::from(u32::MAX) + 1), u32::MAX);
    assert_eq!(frame_ticks(u64::MAX), u32::MAX);
}

#[test]
fn autosave_fires_on_quit_with_unsaved_changes() {
    assert!(should_autosave(true, true, 0.0));
}

#[test]
fn autosave_fires_once_the_interval_elapsed() {
    assert!(should_autosave(true, false, AUTOSAVE_SECONDS + 1.0));
}

#[test]
fn autosave_waits_while_everything_is_saved() {
    assert!(!should_autosave(false, true, AUTOSAVE_SECONDS + 1.0));
    assert!(!should_autosave(false, false, f64::INFINITY));
}

#[test]
fn autosave_waits_within_the_interval() {
    assert!(!should_autosave(true, false, 0.0));
    assert!(!should_autosave(true, false, AUTOSAVE_SECONDS));
}
