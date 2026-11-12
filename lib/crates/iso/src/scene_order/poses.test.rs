use super::*;

#[test]
fn backwards_walk_and_pose_limits_follow_sheet_columns() {
    assert_eq!(walk_pose(-0.75, 4, 2.0), 3);
    assert_eq!(walk_pose(2.0, 4, 2.0), 1);
    assert_eq!(climb_pose(-0.1, 4), 0);
    assert_eq!(climb_pose(1.0, 4), 3);
    assert_eq!(idle_pose(2600.0, 4, 2000.0), 1);
}

#[test]
fn ground_has_no_jump_sheet_column() {
    let poses = JumpPoses {
        takeoff: 0,
        rise: 1,
        apex: 2,
        fall: 3,
        landing: 4,
    };
    assert_eq!(jump_pose(JumpPhase::Ground, poses), None);
    assert_eq!(jump_pose(JumpPhase::Takeoff, poses), Some(0));
    assert_eq!(jump_pose(JumpPhase::Rise, poses), Some(1));
    assert_eq!(jump_pose(JumpPhase::Apex, poses), Some(2));
    assert_eq!(jump_pose(JumpPhase::Fall, poses), Some(3));
    assert_eq!(jump_pose(JumpPhase::Landing, poses), Some(4));
}

#[test]
fn the_flip_turns_through_its_columns_once() {
    assert_eq!(flip_pose(0.0, 12), 0);
    assert_eq!(flip_pose(0.5, 12), 6);
    assert_eq!(flip_pose(0.99, 12), 11);
}

#[test]
fn a_flip_past_its_end_stays_on_the_last_column() {
    assert_eq!(flip_pose(1.0, 12), 11);
    assert_eq!(flip_pose(4.0, 12), 11);
    assert_eq!(flip_pose(-1.0, 12), 0);
    assert_eq!(flip_pose(0.5, 0), 0);
}
