//! Tests for what a blow does to the view: which entity shakes, how, and which bursts are due.

use super::*;
use iso::grid::WorldCoord;
use iso::harvest::HarvestTarget;

fn tree() -> HarvestTarget {
    HarvestTarget {
        id: "tree@1,0".into(),
        anchor: WorldCoord { x: 1, y: 0 },
        blueprint: "tree".into(),
        elevation: 2,
        nearest: WorldCoord { x: 1, y: 0 },
        gap: 0.0,
        in_reach: true,
    }
}

#[test]
fn a_new_blow_shakes_its_target_and_queues_a_burst() {
    let mut impacts = Impacts::default();
    assert_eq!(impacts.notice(0, Some(&tree()), None, Some(0xa0703c)), None);
    assert!(impacts.take_bursts().is_empty());
    assert_eq!(
        impacts.notice(1, Some(&tree()), None, Some(0xa0703c)),
        Some(Blow::Strike)
    );
    let bursts = impacts.take_bursts();
    assert_eq!(bursts.len(), 1);
    assert_eq!(bursts[0].anchor, WorldCoord { x: 1, y: 0 });
    assert_eq!(bursts[0].elevation, 2);
    assert!(!bursts[0].felled);
    assert!(impacts.take_bursts().is_empty());
    assert!(impacts.shake_of("tree@1,0").is_some());
    assert_eq!(impacts.shake_of("rock@0,1"), None);
}

#[test]
fn a_felling_queues_its_own_bigger_burst() {
    let mut impacts = Impacts::default();
    assert_eq!(
        impacts.notice(0, None, Some(&tree()), Some(0xa0703c)),
        Some(Blow::Felled)
    );
    let bursts = impacts.take_bursts();
    assert_eq!(bursts.len(), 1);
    assert!(bursts[0].felled);
}

#[test]
fn a_blow_without_a_target_makes_no_sound() {
    let mut impacts = Impacts::default();
    assert_eq!(impacts.notice(1, None, None, None), None);
    assert_eq!(impacts.notice(1, Some(&tree()), None, None), None);
}

#[test]
fn the_shake_dies_away_and_ends() {
    let mut impacts = Impacts::default();
    impacts.notice(1, Some(&tree()), None, None);
    impacts.advance(SHAKE_MS / 2.0);
    assert!(impacts.shake_of("tree@1,0").is_some());
    impacts.advance(SHAKE_MS);
    assert_eq!(impacts.shake_of("tree@1,0"), None);
}

#[test]
fn the_offset_starts_still_swings_and_fades() {
    assert_eq!(shake_offset(SHAKE_MS), 0.0);
    assert_eq!(shake_offset(0.0), 0.0);
    let peak = (0..=100)
        .map(|step| shake_offset(SHAKE_MS * f64::from(step) / 100.0).abs())
        .fold(0.0, f64::max);
    assert!(peak > 0.0 && peak <= SHAKE_AMPLITUDE);
    let early = shake_offset(SHAKE_MS * 0.9)
        .abs()
        .max(shake_offset(SHAKE_MS * 0.85).abs());
    let late = shake_offset(SHAKE_MS * 0.1)
        .abs()
        .max(shake_offset(SHAKE_MS * 0.15).abs());
    assert!(early > late);
}
