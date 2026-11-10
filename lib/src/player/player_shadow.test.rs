use super::*;

#[test]
fn shadow_stays_at_ground_contact_and_shrinks_in_the_air() {
    let ground = ScreenPoint { x: 420.0, y: 300.0 };
    let grounded = player_shadow(ground, 0.0, 280.0);
    let airborne = player_shadow(ground, 2.0, 280.0);

    assert_eq!(grounded.centre, ground);
    assert_eq!(airborne.centre, ground);
    assert!(airborne.width < grounded.width);
    assert!(airborne.alpha < grounded.alpha);
}

#[test]
fn shadow_uses_an_isometric_flattening() {
    let shadow = player_shadow(ScreenPoint { x: 0.0, y: 0.0 }, 0.0, 280.0);

    assert!(shadow.width > shadow.height);
    assert!(shadow.width < 280.0);
}
