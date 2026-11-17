use super::*;

/// The shader branches on `normal.z`, so the two kinds have to fall either side of its cut.
#[test]
fn the_two_kinds_of_vertex_fall_either_side_of_the_shaders_cut() {
    const { assert!(SPRITE < 0.5) };
    const { assert!(SHADOW > 0.5) };
}

#[test]
fn a_sprite_vertex_carries_no_shadow_coordinate_and_the_sprite_kind() {
    let v = vertex((10.0, 20.0), (0.25, 0.5), WHITE, (0.0, 0.0), SPRITE);

    assert_eq!(v.position, vec3(10.0, 20.0, 0.0));
    assert_eq!(v.uv, vec2(0.25, 0.5));
    assert_eq!(v.color, [255, 255, 255, 255]);
    assert_eq!(v.normal, vec4(0.0, 0.0, SPRITE, 0.0));
}

#[test]
fn a_shadow_vertex_carries_where_to_read_the_map() {
    let v = vertex(
        (1.0, 2.0),
        (0.5, 0.5),
        Color::new(0.0, 0.0, 0.0, 0.5),
        (0.125, 0.75),
        SHADOW,
    );

    assert_eq!(v.normal, vec4(0.125, 0.75, SHADOW, 0.0));
    assert_eq!(v.color[3], 127);
}

/// The names Macroquad reserves. Passing either as a material texture panics inside
#[test]
fn the_shadow_map_does_not_use_a_reserved_texture_name() {
    assert_ne!(SHADOW_MAP, "Texture");
    assert_ne!(SHADOW_MAP, "_ScreenTexture");
}

/// Both stages have to declare the same varyings, and the fragment stage has to sample the
#[test]
fn the_two_stages_agree_on_what_they_pass_between_them() {
    assert!(VERTEX.contains("varying vec4 data;"));
    assert!(FRAGMENT.contains("varying vec4 data;"));
    assert!(VERTEX.contains("attribute vec4 normal;"));
    assert!(FRAGMENT.contains(&format!("uniform sampler2D {SHADOW_MAP};")));
}

#[test]
fn the_scene_preserves_the_opaque_target_alpha_while_blending_its_colours() {
    assert_eq!(
        scene_pipeline().alpha_blend,
        Some(BlendState::new(
            Equation::Add,
            BlendFactor::Zero,
            BlendFactor::One,
        ))
    );
}

#[test]
fn an_opaque_sprite_wears_no_veil() {
    let none = Veil {
        alpha: 1.0,
        dither: 0.0,
    };
    assert_eq!(Veil::of(1.0, true), none);
    assert_eq!(Veil::of(1.0, false), none);
    assert_eq!(Veil::of(f32::NAN, true), none);

    let plain = vertex((1.0, 2.0), (0.5, 0.5), WHITE, (0.0, 0.0), SPRITE);
    let veiled = none.over(plain);
    assert_eq!(veiled.normal, plain.normal);
    assert_eq!(veiled.color, plain.color);
}

#[test]
fn under_the_scene_material_the_veil_drops_pixels_and_keeps_the_rest_solid() {
    let veil = Veil::of(0.25, true);
    assert_eq!(veil.alpha, 1.0);
    assert_eq!(veil.dither, 0.75);

    let v = veil.over(vertex((0.0, 0.0), (0.0, 0.0), WHITE, (0.0, 0.0), SPRITE));
    assert_eq!(v.normal, vec4(0.0, 0.0, SPRITE, 0.75));
    assert_eq!(v.color[3], 255);
}

#[test]
fn without_the_scene_material_the_veil_is_plain_transparency() {
    let veil = Veil::of(0.5, false);
    assert_eq!(veil.dither, 0.0);

    let v = veil.over(vertex((0.0, 0.0), (0.0, 0.0), WHITE, (0.0, 0.0), SPRITE));
    assert_eq!(v.normal.w, 0.0);
    assert_eq!(v.color[3], 128);
}

/// The dither threshold is read per screen pixel and only on the sprite branch, so a shadow's
/// map coordinate in `data.xy` never meets it.
#[test]
fn the_fragment_stage_drops_pixels_by_screen_position_from_normal_w() {
    assert!(FRAGMENT.contains("bayer4(gl_FragCoord.xy) < data.w"));
    assert!(FRAGMENT.contains("discard;"));
}
